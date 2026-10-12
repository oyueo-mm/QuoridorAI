"""Performance measurements for the notebook (all numbers are measured, not estimated)."""

from __future__ import annotations

import time
from statistics import median

import numpy as np
import torch

from .engine import create_initial_state, legal_action_indices
from .evaluator import NeuralEvaluator
from .features import encode_state_planes
from .mcts import MctsConfig, Search
from .network import PolicyValueNet, count_parameters
from .selfplay import SelfPlayConfig, play_games
from .train import TrainConfig, make_optimizer, train_step


def _sync(device: torch.device) -> None:
    if device.type == 'cuda':
        torch.cuda.synchronize()


def time_call(fn, repeat: int, device: torch.device) -> float:
    """Median seconds over `repeat` calls (after one warm-up)."""
    fn()
    _sync(device)
    times = []
    for _ in range(repeat):
        t0 = time.perf_counter()
        fn()
        _sync(device)
        times.append(time.perf_counter() - t0)
    return median(times)


def measure(net: PolicyValueNet, device: torch.device, batch_sizes=(1, 32, 256), mcts_simulations: int = 100, selfplay_games: int = 2) -> dict:
    out: dict = {'device': str(device), 'parameters': count_parameters(net)}
    if device.type == 'cuda':
        torch.cuda.reset_peak_memory_stats()
        out['gpu'] = torch.cuda.get_device_name(device)
    net.to(device).eval()
    planes = encode_state_planes(create_initial_state())

    # Inference latency / throughput.
    out['inference'] = {}
    for b in batch_sizes:
        x = torch.from_numpy(np.repeat(planes[None], b, axis=0)).to(device)

        def fwd():
            with torch.inference_mode():
                net(x)

        sec = time_call(fwd, 20, device)
        out['inference'][b] = {'seconds': sec, 'positions_per_second': b / sec}

    # Forward + backward of one training step.
    opt = make_optimizer(net, TrainConfig())
    b = 256
    batch = {
        'planes': np.repeat(planes[None], b, axis=0),
        'policy': np.full((b, 209), 1 / 209, dtype=np.float32),
        'mask': np.ones((b, 209), dtype=bool),
        'value': np.zeros(b, dtype=np.float32),
    }
    out['train_step_seconds_b256'] = time_call(lambda: train_step(net, opt, batch, TrainConfig(), device), 10, device)

    # CPU-side costs.
    s = create_initial_state()
    out['encode_planes_seconds'] = time_call(lambda: encode_state_planes(s), 50, torch.device('cpu'))
    out['legal_actions_seconds'] = time_call(lambda: legal_action_indices(s), 50, torch.device('cpu'))

    # MCTS speed with the network (batch size 1, cache cleared).
    evaluator = NeuralEvaluator(net, device)
    t0 = time.perf_counter()
    Search(s, MctsConfig(num_simulations=mcts_simulations)).run(evaluator)
    sec = time.perf_counter() - t0
    out['mcts'] = {
        'simulations': mcts_simulations,
        'seconds': sec,
        'simulations_per_second': mcts_simulations / sec,
        'nn_share': evaluator.stats.inference_seconds / sec,
        'encode_share': evaluator.stats.encode_seconds / sec,
    }

    # A few self-play games (lockstep batching).
    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=mcts_simulations, root_noise=True), parallel_games=selfplay_games, max_plies=200)
    ev2 = NeuralEvaluator(net, device)
    _, records, stats = play_games(ev2, cfg, selfplay_games, seed=0)
    out['selfplay'] = {
        **stats.to_dict(),
        'nn_seconds': ev2.stats.inference_seconds,
        'encode_seconds': ev2.stats.encode_seconds,
        'mean_batch': float(np.mean(ev2.stats.batch_sizes)) if ev2.stats.batch_sizes else None,
    }
    out['selfplay']['engine_and_tree_share'] = 1 - (ev2.stats.inference_seconds + ev2.stats.encode_seconds) / max(stats.seconds, 1e-9)
    if device.type == 'cuda':
        out['gpu_peak_memory_mb'] = torch.cuda.max_memory_allocated(device) / 2**20
    return out
