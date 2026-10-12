"""AlphaZero training loop with resumable checkpoints.

One iteration:
    1. self-play with the current network (selfplay.play_games)
    2. add samples to the replay buffer
    3. `steps_per_iteration` optimizer steps on random minibatches
    4. evaluate against the previous iteration's network (and baselines)
    5. save checkpoint + replay buffer + metrics row

`Trainer.resume()` restores everything from the newest valid checkpoint in `run_dir`, so a new
Colab runtime continues exactly where the old one stopped (same RNG streams).
"""

from __future__ import annotations

import copy
import json
import platform
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
import torch

from .checkpoint import CheckpointManager, capture_rng_state, restore_rng_state
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
        )


class Trainer:
    def __init__(self, run_dir: str | Path, config: RunConfig, device: Optional[torch.device] = None):
        self.run_dir = Path(run_dir)
        self.config = config
        self.device = device or pick_device()
        torch.manual_seed(config.seed)
        np.random.seed(config.seed % (2**32))
        self.rng = np.random.default_rng(config.seed)
        self.net = PolicyValueNet(config.net).to(self.device)
        self.optimizer = make_optimizer(self.net, config.train)
        self.buffer = ReplayBuffer(config.replay_capacity)
        self.ckpt = CheckpointManager(self.run_dir, keep=config.keep_checkpoints)
        self.iteration = 0
        self.train_steps = 0
        self.history: list[dict] = []

    # ------------------------------------------------------------ persistence
    def save(self) -> Path:
        payload = {
            'model': self.net.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'scheduler': None,
            'train_steps': self.train_steps,
            'config': self.config.to_dict(),
            'model_metadata': self.net.metadata(),
            'rng': capture_rng_state(self.rng),
            'history': self.history,
            'environment': {'torch': torch.__version__, 'python': platform.python_version(), 'device': str(self.device)},
        }
        path = self.ckpt.save(self.iteration, payload)
        self.buffer.save(self.run_dir / 'replay.npz')
        return path

    def resume(self) -> bool:
        data = self.ckpt.load_latest(map_location=self.device)
        if data is None:
            return False
        meta = data['model_metadata']
        if meta['model_format'] != MODEL_FORMAT or meta['feature_version'] != FEATURE_VERSION:
            raise ValueError(f"checkpoint encoding {meta} does not match this code ({MODEL_FORMAT}, {FEATURE_VERSION})")
        self.config = RunConfig.from_dict(data['config'])
        self.net = PolicyValueNet(self.config.net).to(self.device)
        self.net.load_state_dict(data['model'])
        self.optimizer = make_optimizer(self.net, self.config.train)
        self.optimizer.load_state_dict(data['optimizer'])
        self.iteration = data['iteration']
        self.train_steps = data['train_steps']
        self.history = data['history']
        restore_rng_state(data['rng'], self.rng)
        replay = self.run_dir / 'replay.npz'
        self.buffer = ReplayBuffer.load(replay, self.config.replay_capacity) if replay.exists() else ReplayBuffer(self.config.replay_capacity)
        return True

    # ------------------------------------------------------------ one iteration
    def run_iteration(self, log=print) -> dict:
        cfg = self.config
        previous = copy.deepcopy(self.net).eval()
        row: dict = {'iteration': self.iteration + 1}

        t0 = time.perf_counter()
        evaluator = NeuralEvaluator(self.net, self.device)
        samples, records, sp_stats = play_games(evaluator, cfg.selfplay, cfg.games_per_iteration, seed=int(self.rng.integers(2**31)))
        self.buffer.add(samples)
        row['selfplay'] = sp_stats.to_dict()
        row['selfplay']['eval_cache_hits'] = evaluator.stats.cache_hits
        row['selfplay']['nn_seconds'] = evaluator.stats.inference_seconds
        row['selfplay']['encode_seconds'] = evaluator.stats.encode_seconds
        log(f"[iter {row['iteration']}] self-play: {sp_stats.games} games, {sp_stats.samples_kept} samples kept, {sp_stats.samples_discarded} discarded, {time.perf_counter() - t0:.1f}s")

        losses = []
        if len(self.buffer) >= cfg.train.batch_size:
            for _ in range(cfg.train.steps_per_iteration):
                batch = self.buffer.sample(cfg.train.batch_size, self.rng)
                losses.append(train_step(self.net, self.optimizer, batch, cfg.train, self.device))
                self.train_steps += 1
        row['train'] = {
            k: float(np.mean([l[k] for l in losses])) if losses else None for k in ('loss', 'policy_loss', 'value_loss', 'entropy', 'grad_norm', 'seconds')
        }
        row['train']['steps'] = len(losses)
        row['train']['non_finite_steps'] = sum(1 for l in losses if not l['finite'])
        row['buffer_size'] = len(self.buffer)
        log(f"[iter {row['iteration']}] train: {len(losses)} steps, loss {row['train']['loss']}")

        evaluation = {}
        current = MctsPlayer('current', NeuralEvaluator(self.net, self.device), cfg.eval.simulations)
        if cfg.eval.vs_previous:
            prev = MctsPlayer('previous', NeuralEvaluator(previous, self.device), cfg.eval.simulations)
            evaluation['vs_previous'] = play_match(current, prev, cfg.eval.pairs, seed=cfg.seed + self.iteration, opening_plies=cfg.eval.opening_plies).to_dict()
        if cfg.eval.vs_greedy:
            evaluation['vs_greedy'] = play_match(current, GreedyDistancePlayer(), cfg.eval.pairs, seed=cfg.seed + 7919 + self.iteration, opening_plies=cfg.eval.opening_plies).to_dict()
        row['eval'] = evaluation
        log(f"[iter {row['iteration']}] eval: {json.dumps(evaluation)}")

        self.iteration += 1
        row['seconds'] = time.perf_counter() - t0
        self.history.append(row)
        self.ckpt.append_metrics(row)
        self.save()
        return row

    def summary(self) -> dict:
        return {'iteration': self.iteration, 'train_steps': self.train_steps, 'buffer': len(self.buffer), 'parameters': count_parameters(self.net), 'device': str(self.device)}
