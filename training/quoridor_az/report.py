"""Summaries, setting recommendations and resource estimates from measured reports.

Estimates are arithmetic on measured throughput (and on assumptions that are passed in and
returned with the result, e.g. the average game length). Nothing here invents a hardware
number: if a needed measurement is missing the function says so instead of guessing.
"""

from __future__ import annotations

from typing import Optional


def _ok_rows(rows: Optional[list[dict]]) -> list[dict]:
    return [r for r in (rows or []) if 'error' not in r]


def recommend_selfplay(rows: list[dict], memory_total_mb: Optional[float] = None, tolerance: float = 0.10, memory_fraction: float = 0.8) -> Optional[dict]:
    """Smallest setting (parallel games × leaves) within `tolerance` of the best measured
    simulations/s whose peak memory stays under `memory_fraction` of the GPU memory.
    Smaller settings finish games sooner and need less memory for the same throughput."""
    rows = _ok_rows(rows)
    if memory_total_mb:
        rows = [r for r in rows if (r.get('peak_memory_mb') or 0) < memory_fraction * memory_total_mb]
    rows = [r for r in rows if r.get('simulations_per_second')]
    if not rows:
        return None
    best = max(r['simulations_per_second'] for r in rows)
    good = [r for r in rows if r['simulations_per_second'] >= (1 - tolerance) * best]
    pick = min(good, key=lambda r: (r['parallel_games'] * r['leaves_per_game'], r['leaves_per_game']))
    return {
        'parallel_games': pick['parallel_games'],
        'leaves_per_game': pick['leaves_per_game'],
        'simulations_per_second': pick['simulations_per_second'],
        'mean_batch': pick.get('mean_batch'),
        'best_simulations_per_second': best,
        'reason': f"smallest measured setting within {tolerance:.0%} of the best throughput ({best:.0f} sims/s)",
    }


def recommend_train_batch(rows: list[dict], minimum: int = 256, tolerance: float = 0.10) -> Optional[dict]:
    """Smallest batch (>= minimum) whose samples/s is within `tolerance` of the best measured."""
    rows = [r for r in _ok_rows(rows) if r['batch'] >= minimum]
    if not rows:
        return None
    best = max(r['samples_per_second'] for r in rows)
    pick = min((r for r in rows if r['samples_per_second'] >= (1 - tolerance) * best), key=lambda r: r['batch'])
    return {'batch_size': pick['batch'], 'seconds_per_step': pick['seconds'], 'samples_per_second': pick['samples_per_second'], 'best_samples_per_second': best}


def estimate_resources(simulations_per_second: float, train_step_seconds: float, plan: dict, checkpoint_bytes: Optional[int] = None, replay_bytes_per_sample: float = 2836.0) -> dict:
    """Wall-time and storage for a training plan from measured throughput.

    plan keys: iterations, games_per_iteration, simulations, avg_plies (an assumption — take it
    from a pilot run), train_steps_per_iteration, keep_checkpoints, replay_capacity,
    eval_overhead (fraction added for evaluation games, default 0.1)."""
    games = plan['iterations'] * plan['games_per_iteration']
    positions = games * plan['avg_plies']
    sims = positions * plan['simulations']
    selfplay_h = sims / simulations_per_second / 3600
    train_h = plan['iterations'] * plan['train_steps_per_iteration'] * train_step_seconds / 3600
    total_h = (selfplay_h + train_h) * (1 + plan.get('eval_overhead', 0.1))
    out = {
        'inputs': {'simulations_per_second': simulations_per_second, 'train_step_seconds': train_step_seconds, 'checkpoint_bytes': checkpoint_bytes, **plan},
        'games': games,
        'positions': positions,
        'simulations': sims,
        'selfplay_hours': selfplay_h,
        'train_hours': train_h,
        'total_hours_with_eval': total_h,
        # In-memory size (float16 planes + float32 policy + bool mask + value, weight, player).
        'replay_buffer_memory_gb': min(plan.get('replay_capacity', positions), positions) * replay_bytes_per_sample / 1e9,
    }
    if checkpoint_bytes:
        out['checkpoints_gb'] = plan.get('keep_checkpoints', 5) * checkpoint_bytes / 1e9
    return out


def markdown_summary(report: dict) -> str:
    """Tables for a verification report (as written by verify.run_verification)."""
    lines = [f"### Verification on `{report.get('measured_on')}` ({report.get('created')}) — gpu_verified: {report.get('gpu_verified')}", '']
    env = report.get('environment', {})
    if env:
        keys = ('gpu_name', 'gpu_memory_total_mb', 'gpu_capability', 'torch', 'torch_cuda_build', 'cudnn', 'cpu_count')
        lines += ['| item | value |', '|---|---|', *[f'| {k} | {env[k]} |' for k in keys if k in env], '']
    lines += ['| step | status |', '|---|---|', *[f'| {k} | {v} |' for k, v in report.get('status', {}).items()], '']
    inf = _ok_rows(report.get('inference'))
    if inf:
        lines += ['| precision | batch | ms | positions/s | peak MB |', '|---|---:|---:|---:|---:|']
        lines += [f"| {r['precision']} | {r['batch']} | {r['ms']:.2f} | {r['positions_per_second']:.0f} | {r['peak_memory_mb'] or '-'} |" for r in inf]
        lines.append('')
    tr = _ok_rows(report.get('train_step'))
    if tr:
        lines += ['| train batch | s/step | samples/s |', '|---:|---:|---:|', *[f"| {r['batch']} | {r['seconds']:.3f} | {r['samples_per_second']:.0f} |" for r in tr], '']
    sp = _ok_rows(report.get('selfplay'))
    if sp:
        lines += ['| parallel | leaves | sims/s | moves/s | mean batch | inference share | leaf wait ms | GPU util % | peak MB |', '|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
        for r in sp:
            util = r.get('utilisation', {}).get('gpu_util_mean')
            lines.append(f"| {r['parallel_games']} | {r['leaves_per_game']} | {r['simulations_per_second']:.0f} | {r['moves_per_second']:.1f} | {r['mean_batch'] or 0:.1f} | {r['time_split']['inference']:.0%} | {r['mean_leaf_wait_ms'] or 0:.1f} | {'-' if util is None else f'{util:.0f}'} | {r['peak_memory_mb'] or '-'} |")
        lines.append('')
    return '\n'.join(lines)
