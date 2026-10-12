"""Training-stability diagnostics: self-play data balance, memory, learnability.

Everything here only reads results (or trains a throw-away copy of the network), so it can run
inside an experiment without changing it.
"""

from __future__ import annotations

import copy
from typing import Optional

import numpy as np

from .selfplay import GameRecord, SelfPlayStats

# Thresholds for warnings (heuristics for a pilot run, not hard rules).
MAX_DISCARD_FRACTION = 0.5
SIDE_SHARE_RANGE = (0.25, 0.75)
MIN_GAMES_FOR_SIDE_CHECK = 16


def selfplay_report(records: list[GameRecord], stats: SelfPlayStats, halted_policy: str) -> dict:
    """How much data a batch of self-play games produced and whether the halted-game policy
    removes a large or one-sided part of it."""
    games = len(records)
    won = [r for r in records if r.outcome == 'win']
    halted = [r for r in records if r.outcome != 'win']
    positions = sum(r.plies for r in records)
    p0_wins = sum(1 for r in won if r.winner == 0)
    report = {
        'games': games,
        'completed': len(won),
        'halted': len(halted),
        'halted_max_plies': sum(1 for r in halted if r.outcome == 'halted-max-plies'),
        'halted_repetition': sum(1 for r in halted if r.outcome == 'halted-repetition'),
        'abandoned': stats.abandoned,
        'halted_fraction': len(halted) / games if games else None,
        'p0_win_share': p0_wins / len(won) if won else None,
        'plies_completed_mean': float(np.mean([r.plies for r in won])) if won else None,
        'plies_halted_mean': float(np.mean([r.plies for r in halted])) if halted else None,
        'positions': positions,
        'positions_in_halted_games': sum(r.plies for r in halted),
        'samples_kept': stats.samples_kept,
        'samples_discarded': stats.samples_discarded,
        'samples_value_masked': stats.samples_value_masked,
        'discard_fraction': stats.samples_discarded / positions if positions else None,
        'value_labelled_fraction': (stats.samples_kept - stats.samples_value_masked) / positions if positions else None,
        'halted_policy': halted_policy,
    }
    warnings = []
    if report['discard_fraction'] is not None and report['discard_fraction'] > MAX_DISCARD_FRACTION:
        warnings.append(f"{report['discard_fraction']:.0%} of positions discarded (halted games) — consider 'policy-only' or a higher max_plies")
    if len(won) >= MIN_GAMES_FOR_SIDE_CHECK and not SIDE_SHARE_RANGE[0] <= report['p0_win_share'] <= SIDE_SHARE_RANGE[1]:
        warnings.append(f"first player wins {report['p0_win_share']:.0%} of completed games — value targets are one-sided")
    if won and halted and report['plies_halted_mean'] > 2 * report['plies_completed_mean']:
        warnings.append('kept games are much shorter than halted ones — discarding keeps only quick races')
    report['warnings'] = warnings
    return report


def memory_snapshot(device) -> dict:
    """Current / peak CUDA memory in MB (empty on CPU)."""
    import torch

    if getattr(device, 'type', str(device)) != 'cuda' or not torch.cuda.is_available():
        return {}
    return {
        'allocated_mb': torch.cuda.memory_allocated(device) / 2**20,
        'reserved_mb': torch.cuda.memory_reserved(device) / 2**20,
        'peak_allocated_mb': torch.cuda.max_memory_allocated(device) / 2**20,
    }


def memory_growth(rows: list[dict], key: str = 'allocated_mb', tolerance: float = 0.10) -> Optional[dict]:
    """Compares memory after the first and the last iteration (iteration 1 is the warm-up)."""
    values = [r.get('memory', {}).get(key) for r in rows]
    values = [v for v in values if v is not None]
    if len(values) < 3:
        return None
    base = values[1]
    last = values[-1]
    growth = (last - base) / base if base else 0.0
    return {'key': key, 'first': base, 'last': last, 'growth': growth, 'growing': growth > tolerance}


def learning_check(net, buffer, device, steps: int = 200, samples: int = 256, batch_size: int = 64, learning_rate: float = 2e-3, seed: int = 0) -> dict:
    """Can the network fit a fixed slice of the replay buffer? Trains a copy (the real network
    and optimiser are untouched) and reports first / last losses."""
    from .train import TrainConfig, make_optimizer, train_step

    if len(buffer) == 0:
        return {'error': 'replay buffer is empty'}
    rng = np.random.default_rng(seed)
    n = min(samples, len(buffer))
    idx = rng.choice(len(buffer), size=n, replace=False)
    data = {
        'planes': buffer.planes[idx].astype(np.float32),
        'policy': buffer.policy[idx],
        'mask': buffer.mask[idx],
        'value': buffer.value[idx],
        'value_weight': buffer.value_weight[idx],
    }
    model = copy.deepcopy(net).to(device)
    cfg = TrainConfig(batch_size=batch_size, learning_rate=learning_rate, weight_decay=0.0)
    opt = make_optimizer(model, cfg)
    history = []
    for _ in range(steps):
        pick = rng.integers(0, n, size=min(batch_size, n))
        history.append(train_step(model, opt, {k: v[pick] for k, v in data.items()}, cfg, device))
    first = history[: max(1, steps // 10)]
    last = history[-max(1, steps // 10) :]

    def mean(rows, key):
        return float(np.mean([r[key] for r in rows]))

    out = {
        'steps': steps,
        'samples': n,
        'value_labelled': float(np.mean(data['value_weight'] > 0)),
        'policy_loss_first': mean(first, 'policy_loss'),
        'policy_loss_last': mean(last, 'policy_loss'),
        'value_loss_first': mean(first, 'value_loss'),
        'value_loss_last': mean(last, 'value_loss'),
        'grad_norm_max': max(r['grad_norm'] for r in history),
        'non_finite_steps': sum(1 for r in history if not r['finite']),
    }
    out['policy_decreases'] = out['policy_loss_last'] < out['policy_loss_first']
    out['value_decreases'] = out['value_loss_last'] < out['value_loss_first'] or out['value_labelled'] == 0
    return out
