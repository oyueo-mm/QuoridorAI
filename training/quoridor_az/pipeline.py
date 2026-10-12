"""AlphaZero training loop with resumable checkpoints.

One iteration:
    1. self-play with the current network (selfplay.play_games)
    2. add samples to the replay buffer
    3. `steps_per_iteration` optimizer steps on random minibatches
    4. evaluate against the previous iteration's network (and baselines)
    5. save replay buffer -> checkpoint -> metrics row (in that order)

`Trainer.resume()` restores everything from the newest valid checkpoint in `run_dir`, so a new
Colab runtime continues exactly where the old one stopped (same RNG streams).

Failure handling:
- An exception inside an iteration (CUDA error, interrupted cell, Drive hiccup) rolls the
  trainer back to the last checkpoint (or to the fresh initial state) before re-raising, so
  half-finished iterations never leak into the next one.
- The replay file is written before the checkpoint and records its iteration; on resume a
  mismatch (crash between the two writes) is reported in `resume_warnings`.
- metrics.jsonl is reconciled with the checkpoint history on resume (rows of iterations that
  were never checkpointed are dropped, missing rows restored).
"""

from __future__ import annotations

import copy
import json
import os
import platform
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import torch

from .checkpoint import CheckpointManager, capture_rng_state, restore_rng_state
from .diagnostics import memory_snapshot, selfplay_report
from .evaluate import GreedyDistancePlayer, MctsPlayer, play_match
from .evaluator import NeuralEvaluator
from .features import FEATURE_VERSION
from .network import MODEL_FORMAT, NetConfig, PolicyValueNet, count_parameters, pick_device
from .replay import ReplayBuffer
from .selfplay import SelfPlayConfig, play_games
from .train import TrainConfig, make_optimizer, train_step


@dataclass
class EvalConfig:
    pairs: int = 2
    simulations: int = 50
    opening_plies: int = 4
    vs_previous: bool = True
    vs_greedy: bool = True


@dataclass
class RunConfig:
    seed: int = 1
    games_per_iteration: int = 16
    replay_capacity: int = 100_000
    net: NetConfig = field(default_factory=NetConfig)
    selfplay: SelfPlayConfig = field(default_factory=SelfPlayConfig)
    train: TrainConfig = field(default_factory=TrainConfig)
    eval: EvalConfig = field(default_factory=EvalConfig)
    keep_checkpoints: int = 5
    # Self-play inference: 'fp32' | 'fp16' | 'bf16' (autocast, CUDA only).
    inference_precision: str = 'fp32'

    def to_dict(self) -> dict:
        d = asdict(self)
        d['selfplay'] = self.selfplay.to_dict()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> 'RunConfig':
        from .mcts import MctsConfig

        sp = dict(d['selfplay'])
        sp['mcts'] = MctsConfig(**sp['mcts'])
        return cls(
            seed=d['seed'],
            games_per_iteration=d['games_per_iteration'],
            replay_capacity=d['replay_capacity'],
            net=NetConfig(**d['net']),
            selfplay=SelfPlayConfig(**sp),
            train=TrainConfig(**d['train']),
            eval=EvalConfig(**d['eval']),
            keep_checkpoints=d['keep_checkpoints'],
            inference_precision=d.get('inference_precision', 'fp32'),
        )


class Trainer:
    def __init__(self, run_dir: str | Path, config: RunConfig, device: Optional[torch.device] = None):
        self.run_dir = Path(run_dir)
        self.config = config
        self.device = device or pick_device()
        self.ckpt = CheckpointManager(self.run_dir, keep=config.keep_checkpoints)
        self.resume_warnings: list[str] = []
        self._init_fresh()

    def _init_fresh(self) -> None:
        config = self.config
        torch.manual_seed(config.seed)
        np.random.seed(config.seed % (2**32))
        self.rng = np.random.default_rng(config.seed)
        self.net = PolicyValueNet(config.net).to(self.device)
        self.optimizer = make_optimizer(self.net, config.train)
        self.buffer = ReplayBuffer(config.replay_capacity)
        self.iteration = 0
        self.train_steps = 0
        self.history: list[dict] = []

    # ------------------------------------------------------------ persistence
    @property
    def replay_path(self) -> Path:
        return self.run_dir / 'replay.npz'

    def save(self) -> Path:
        self.buffer.iteration = self.iteration
        self.buffer.save(self.replay_path)
        payload = {
            'model': self.net.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'scheduler': None,
            'train_steps': self.train_steps,
            'config': self.config.to_dict(),
            'model_metadata': self.net.metadata(),
            'rng': capture_rng_state(self.rng),
            'history': self.history,
            'replay_iteration': self.iteration,
            'environment': {'torch': torch.__version__, 'python': platform.python_version(), 'device': str(self.device)},
        }
        return self.ckpt.save(self.iteration, payload)

    def resume(self) -> bool:
        data = self.ckpt.load_latest(map_location=self.device)
        if data is None:
            return False
        meta = data['model_metadata']
        if meta['model_format'] != MODEL_FORMAT or meta['feature_version'] != FEATURE_VERSION:
            raise ValueError(f"checkpoint encoding {meta} does not match this code ({MODEL_FORMAT}, {FEATURE_VERSION})")
        self.resume_warnings = []
        self.config = RunConfig.from_dict(data['config'])
        self.net = PolicyValueNet(self.config.net).to(self.device)
        self.net.load_state_dict(data['model'])
        self.optimizer = make_optimizer(self.net, self.config.train)
        self.optimizer.load_state_dict(data['optimizer'])
        self.iteration = data['iteration']
        self.train_steps = data['train_steps']
        self.history = data['history']
        restore_rng_state(data['rng'], self.rng)
        if self.replay_path.exists():
            self.buffer = ReplayBuffer.load(self.replay_path, self.config.replay_capacity)
            if self.buffer.iteration not in (-1, self.iteration):
                self.resume_warnings.append(f'replay buffer is from iteration {self.buffer.iteration}, checkpoint from {self.iteration}')
        else:
            self.buffer = ReplayBuffer(self.config.replay_capacity)
            if self.iteration > 0:
                self.resume_warnings.append('replay buffer file missing — continuing with an empty buffer')
        self._reconcile_metrics()
        return True

    def _reconcile_metrics(self) -> None:
        rows = self.ckpt.read_metrics()
        by_iter = {r.get('iteration'): r for r in rows}
        wanted = [by_iter.get(h['iteration'], h) for h in self.history]
        if [r.get('iteration') for r in rows] == [r['iteration'] for r in wanted]:
            return
        path = self.run_dir / 'metrics.jsonl'
        tmp = path.with_name(path.name + '.tmp')
        with open(tmp, 'w', encoding='utf-8') as f:
            for r in wanted:
                f.write(json.dumps(r) + '\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        self.resume_warnings.append(f'metrics.jsonl reconciled with the checkpoint history ({len(rows)} -> {len(wanted)} rows)')

    def _rollback(self) -> str:
        try:
            if self.resume():
                return f'rolled back to checkpoint iteration {self.iteration}'
        except Exception as e:  # noqa: BLE001 — report and fall through to a fresh state
            return f'rollback failed ({e!r}); trainer state is unreliable — create a new Trainer and resume()'
        self._init_fresh()
        return 'no checkpoint yet — reset to the initial state'

    # ------------------------------------------------------------ one iteration
    def run_iteration(self, log=print) -> dict:
        try:
            return self._run_iteration(log)
        except BaseException as e:
            log(f'[iter {self.iteration + 1}] failed: {e!r} — {self._rollback()}')
            raise

    def _run_iteration(self, log) -> dict:
        cfg = self.config
        previous = copy.deepcopy(self.net).eval()
        row: dict = {'iteration': self.iteration + 1}
        if self.device.type == 'cuda':
            torch.cuda.reset_peak_memory_stats(self.device)

        t0 = time.perf_counter()
        evaluator = NeuralEvaluator(self.net, self.device, precision=cfg.inference_precision)
        samples, records, sp_stats = play_games(evaluator, cfg.selfplay, cfg.games_per_iteration, seed=int(self.rng.integers(2**31)))
        self.buffer.add(samples)
        row['selfplay'] = sp_stats.to_dict()
        row['data'] = selfplay_report(records, sp_stats, cfg.selfplay.halted_policy)
        log(f"[iter {row['iteration']}] self-play: {sp_stats.games} games, {sp_stats.samples_kept} samples kept, {sp_stats.samples_discarded} discarded, {time.perf_counter() - t0:.1f}s")
        for w in row['data']['warnings']:
            log(f"[iter {row['iteration']}] data warning: {w}")

        losses = []
        t_train = time.perf_counter()
        if len(self.buffer) >= cfg.train.batch_size:
            for _ in range(cfg.train.steps_per_iteration):
                batch = self.buffer.sample(cfg.train.batch_size, self.rng)
                losses.append(train_step(self.net, self.optimizer, batch, cfg.train, self.device))
                self.train_steps += 1
        keys = ('loss', 'policy_loss', 'value_loss', 'entropy', 'grad_norm', 'seconds', 'value_labelled')
        row['train'] = {k: float(np.mean([l[k] for l in losses if k in l])) if any(k in l for l in losses) else None for k in keys}
        row['train']['steps'] = len(losses)
        row['train']['grad_norm_max'] = max((l['grad_norm'] for l in losses), default=None)
        row['train']['non_finite_steps'] = sum(1 for l in losses if not l['finite'])
        row['train']['total_seconds'] = time.perf_counter() - t_train
        row['buffer_size'] = len(self.buffer)
        row['buffer_total_added'] = self.buffer.total_added
        log(f"[iter {row['iteration']}] train: {len(losses)} steps, loss {row['train']['loss']}, non-finite {row['train']['non_finite_steps']}")

        evaluation = {}
        current = MctsPlayer('current', NeuralEvaluator(self.net, self.device), cfg.eval.simulations)
        if cfg.eval.vs_previous:
            prev = MctsPlayer('previous', NeuralEvaluator(previous, self.device), cfg.eval.simulations)
            evaluation['vs_previous'] = play_match(current, prev, cfg.eval.pairs, seed=cfg.seed + self.iteration, opening_plies=cfg.eval.opening_plies).to_dict()
        if cfg.eval.vs_greedy:
            evaluation['vs_greedy'] = play_match(current, GreedyDistancePlayer(), cfg.eval.pairs, seed=cfg.seed + 7919 + self.iteration, opening_plies=cfg.eval.opening_plies).to_dict()
        row['eval'] = evaluation
        log(f"[iter {row['iteration']}] eval: {json.dumps(evaluation)}")

        del previous
        row['memory'] = memory_snapshot(self.device)
        self.iteration += 1
        row['seconds'] = time.perf_counter() - t0
        self.history.append(row)
        t_save = time.perf_counter()
        path = self.save()
        row['checkpoint'] = {'file': path.name, 'bytes': path.stat().st_size, 'replay_bytes': self.replay_path.stat().st_size, 'save_seconds': time.perf_counter() - t_save}
        self.ckpt.append_metrics(row)
        return row

    def summary(self) -> dict:
        return {'iteration': self.iteration, 'train_steps': self.train_steps, 'buffer': len(self.buffer), 'parameters': count_parameters(self.net), 'device': str(self.device)}
