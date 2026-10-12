"""How much self-play data does each halted-game policy keep, and is it one-sided?

    python tools/halted_analysis.py [--games 32] [--simulations 32] [--out results/stage6b1]

Plays self-play games with an untrained (random-weight) 64x4 network — the situation of the
first training iterations — for each max_plies setting, then evaluates every halted-game
policy on the same games (the policy only changes how positions are labelled, not the games):

    discard      positions of completed games only
    policy-only  all positions train the policy; only completed games carry a value label
    draw / adjudicate   all positions, with an invented value label for halted games

Reported per setting: halted fraction by reason, first-player share of the wins, game lengths
of completed vs halted games, and the data yield of each policy.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quoridor_az.diagnostics import selfplay_report  # noqa: E402
from quoridor_az.evaluator import NeuralEvaluator  # noqa: E402
from quoridor_az.mcts import MctsConfig  # noqa: E402
from quoridor_az.network import NetConfig, PolicyValueNet  # noqa: E402
from quoridor_az.selfplay import SelfPlayConfig, play_games  # noqa: E402


def analyse(games: int, simulations: int, max_plies: int, seed: int, threads: int) -> dict:
    torch.set_num_threads(threads)
    torch.manual_seed(0)
    net = PolicyValueNet(NetConfig()).eval()
    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=simulations, root_noise=True), max_plies=max_plies, parallel_games=min(16, games), halted_policy='policy-only')
    t0 = time.perf_counter()
    samples, records, stats = play_games(NeuralEvaluator(net, torch.device('cpu')), cfg, games, seed=seed)
    sec = time.perf_counter() - t0
    report = selfplay_report(records, stats, 'policy-only')
    positions = report['positions']
    completed_positions = positions - report['positions_in_halted_games']
    yields = {
        'discard': {'policy_samples': completed_positions, 'value_samples': completed_positions},
        'policy-only': {'policy_samples': positions, 'value_samples': completed_positions},
        'draw': {'policy_samples': positions, 'value_samples': positions, 'invented_value_labels': report['positions_in_halted_games']},
        'adjudicate': {'policy_samples': positions, 'value_samples': positions, 'invented_value_labels': report['positions_in_halted_games']},
    }
    won = [r for r in records if r.outcome == 'win']
    return {
        'max_plies': max_plies,
        'games': games,
        'simulations': simulations,
        'seconds': sec,
        'report': report,
        'yield': yields,
        'plies_completed': sorted(r.plies for r in won),
        'plies_halted': sorted(r.plies for r in records if r.outcome != 'win'),
        'value_target_mean_completed': float(np.mean([s.value for s in samples if s.value_weight > 0])) if won else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--games', type=int, default=32)
    ap.add_argument('--simulations', type=int, default=32)
    ap.add_argument('--max-plies', type=int, nargs='+', default=[200, 300])
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--out', type=Path, default=None)
    args = ap.parse_args()
    if sys.platform == 'win32':
        import ctypes

        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)
    results = []
    for mp in args.max_plies:
        r = analyse(args.games, args.simulations, mp, args.seed, args.threads)
        rep = r['report']
        print(f"max_plies {mp}: {rep['completed']}/{rep['games']} completed, halted {rep['halted_fraction']:.0%} (max-plies {rep['halted_max_plies']}, repetition {rep['halted_repetition']}), P0 share {rep['p0_win_share']}, discard keeps {r['yield']['discard']['policy_samples']}/{rep['positions']} positions, {r['seconds']:.0f}s", flush=True)
        results.append(r)
    out = {'created': time.strftime('%Y-%m-%d %H:%M:%S'), 'network': 'untrained 64x4 (torch.manual_seed(0))', 'device': 'cpu', 'results': results}
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / 'halted_analysis.json').write_text(json.dumps(out, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
