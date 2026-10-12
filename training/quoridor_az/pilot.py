"""Small pilot training run (Stage 6B-1): exercises the whole loop on the GPU before Stage 6B-2.

    report = run_pilot(run_dir, pilot_config(...), iterations=3, device=cuda, verification=gpu_report)

The pilot validates the pipeline, it does not try to make a strong player. By default it only
starts after a GPU verification report with gpu_verified=True (verify.py); `require_gpu=False`
allows a CPU dry run of the same code path, which the report labels as such.

pilot_report.json (in run_dir) records the configuration that actually ran and, per iteration,
self-play results and data yield, training losses / gradient norms / non-finite steps, memory,
checkpoint sizes and timings; plus three checks after the last iteration:
    learning   a copy of the network can fit a slice of the replay buffer (losses decrease)
    resume     a fresh Trainer restored from the checkpoint matches the running one exactly
    memory     allocated GPU memory does not keep growing across iterations
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

import numpy as np
import torch

from .diagnostics import learning_check, memory_growth
from .features import encode_state_planes
from .engine import create_initial_state
from .mcts import MctsConfig
from .network import NetConfig
from .pipeline import EvalConfig, RunConfig, Trainer
from .selfplay import SelfPlayConfig
from .train import TrainConfig


def pilot_config(parallel_games: int = 8, leaves_per_game: int = 1, batch_size: int = 256, games_per_iteration: int = 8, simulations: int = 32, steps_per_iteration: int = 40, halted_policy: str = 'policy-only', max_plies: int = 200, inference_precision: str = 'fp32', seed: int = 1) -> RunConfig:
    return RunConfig(
        seed=seed,
        games_per_iteration=games_per_iteration,
        replay_capacity=50_000,
        net=NetConfig(channels=64, blocks=4),
        selfplay=SelfPlayConfig(mcts=MctsConfig(num_simulations=simulations, root_noise=True), max_plies=max_plies, parallel_games=parallel_games, leaves_per_game=leaves_per_game, halted_policy=halted_policy),
        train=TrainConfig(batch_size=batch_size, steps_per_iteration=steps_per_iteration),
        eval=EvalConfig(pairs=1, simulations=16, opening_plies=4),
        keep_checkpoints=3,
        inference_precision=inference_precision,
    )


def resume_check(trainer: Trainer) -> dict:
    """Restores the newest checkpoint into a fresh Trainer and compares it with `trainer`."""
    fresh = Trainer(trainer.run_dir, trainer.config, trainer.device)
    ok = fresh.resume()
    probe = torch.from_numpy(encode_state_planes(create_initial_state())[None]).to(trainer.device)
    trainer.net.eval()
    fresh.net.eval()
    with torch.no_grad():
        a = trainer.net(probe)
        b = fresh.net(probe)
    return {
        'restored': ok,
        'iteration_matches': fresh.iteration == trainer.iteration,
        'train_steps_match': fresh.train_steps == trainer.train_steps,
        'buffer_matches': len(fresh.buffer) == len(trainer.buffer) and np.array_equal(fresh.buffer.value[: len(fresh.buffer)], trainer.buffer.value[: len(trainer.buffer)]),
        'outputs_identical': bool(torch.equal(a[0], b[0]) and torch.equal(a[1], b[1])),
        'rng_matches': fresh.rng.bit_generator.state == trainer.rng.bit_generator.state,
        'warnings': fresh.resume_warnings,
    }


def _iteration_summary(row: dict) -> dict:
    sp = row['selfplay']
    data = row.get('data', {})
    tr = row['train']
    return {
        'iteration': row['iteration'],
        'games': sp['games'],
        'wins': sp['wins'],
        'avg_plies': sp.get('avg_plies'),
        'halted': data.get('halted'),
        'samples_kept': sp['samples_kept'],
        'samples_value_masked': sp.get('samples_value_masked', 0),
        'samples_discarded': sp['samples_discarded'],
        'selfplay_seconds': sp['seconds'],
        'simulations_per_second': sp['simulations_per_second'],
        'mean_batch': sp.get('evaluator', {}).get('mean_batch'),
        'samples_per_second': sp.get('samples_per_second'),
        'train_steps': tr['steps'],
        'loss': tr['loss'],
        'policy_loss': tr['policy_loss'],
        'value_loss': tr['value_loss'],
        'grad_norm_mean': tr['grad_norm'],
        'grad_norm_max': tr['grad_norm_max'],
        'non_finite_steps': tr['non_finite_steps'],
        'train_seconds': tr['total_seconds'],
        'buffer_size': row['buffer_size'],
        'memory': row.get('memory', {}),
        'checkpoint': row.get('checkpoint', {}),
        'iteration_seconds': row['seconds'],
        'eval': row['eval'],
        'data_warnings': data.get('warnings', []),
    }


def run_pilot(run_dir: str | Path, config: RunConfig, iterations: int, device: torch.device, verification: Optional[dict] = None, require_gpu: bool = True, log=print) -> dict:
    if require_gpu:
        if device.type != 'cuda':
            raise RuntimeError('the pilot needs a CUDA device (require_gpu=False runs a CPU dry run)')
        if not verification or not verification.get('gpu_verified'):
            raise RuntimeError('run the GPU verification first (verify.run_verification) — no report with gpu_verified=True was given')
    run_dir = Path(run_dir)
    t0 = time.perf_counter()
    trainer = Trainer(run_dir, config, device)
    resumed = trainer.resume()
    if resumed:
        log(f'resumed at iteration {trainer.iteration} (configuration from the checkpoint)' + (f' — warnings: {trainer.resume_warnings}' if trainer.resume_warnings else ''))
    rows = []
    while trainer.iteration < iterations:
        rows.append(trainer.run_iteration(log))
    checks = {
        'learning': learning_check(trainer.net, trainer.buffer, device),
        'resume': resume_check(trainer),
        'memory': memory_growth(trainer.history),
    }
    report = {
        'created': time.strftime('%Y-%m-%d %H:%M:%S'),
        'device': str(device),
        'dry_run_on_cpu': device.type != 'cuda',
        'gpu': verification.get('environment', {}).get('gpu_name') if verification else None,
        'config': trainer.config.to_dict(),
        'iterations': [_iteration_summary(r) for r in trainer.history],
        'ran_this_session': [r['iteration'] for r in rows],
        'resumed': resumed,
        'checks': checks,
        'seconds_this_session': time.perf_counter() - t0,
    }
    report['ok'] = bool(
        checks['learning'].get('policy_decreases')
        and checks['resume']['restored']
        and checks['resume']['outputs_identical']
        and all(it['non_finite_steps'] == 0 for it in report['iterations'])
        and not (checks['memory'] or {}).get('growing', False)
    )
    path = run_dir / 'pilot_report.json'
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=1, default=str)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    log(f"pilot report: {path} | ok={report['ok']}")
    return report
