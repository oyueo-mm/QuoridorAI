"""Before/after comparison of two versions of the quoridor_az package (CPU).

    python tools/ab_compare.py --baseline <dir containing quoridor_az> [--repeats 2] [--out results/stage6b1]

Each version runs the same workload in its own process; runs alternate (A B A B ...) so slow
drifts of the machine (thermal or power state) affect both sides alike. The workload uses only
APIs that both versions share, and every part also records a hash of its results, so the
comparison checks that the optimised code returns exactly the same legal actions, input planes,
search visit counts and self-play games:

    positions   random games (walls placed with probability 0.4), every non-terminal position
    legal       legal_action_indices over all positions (first pass, then again)
    encode      encode_state_planes over all positions (first pass, then again)
    mcts        200-simulation searches from 3 positions with a fixed random-weight network
    selfplay    2 self-play games in lockstep, 32 simulations per move, seed 0

On Windows the run asks the OS not to sleep while it is active (Modern Standby otherwise
suspends long runs).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve()
TRAINING = HERE.parents[1]


def keep_awake() -> None:
    if sys.platform == 'win32':
        import ctypes

        ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED


# ---------------------------------------------------------------- worker (one version)

def worker(threads: int) -> dict:
    import numpy as np
    import torch

    from quoridor_az import engine as E
    from quoridor_az.evaluator import NeuralEvaluator
    from quoridor_az.features import encode_state_planes
    from quoridor_az.mcts import MctsConfig, Search
    from quoridor_az.network import NetConfig, PolicyValueNet
    from quoridor_az.selfplay import SelfPlayConfig, play_games

    torch.set_num_threads(threads)
    out: dict = {'package': str(Path(E.__file__).parent)}

    rng = np.random.default_rng(1)
    positions = []
    for _ in range(8):
        s = E.create_initial_state()
        for _ in range(120):
            if s.winner is not None:
                break
            positions.append(s)
            actions = E.legal_actions(s)
            walls = [a for a in actions if isinstance(a, E.Wall)]
            moves = [a for a in actions if isinstance(a, E.Move)]
            pool = walls if walls and rng.random() < 0.4 else moves
            s = E.apply_action_unchecked(s, pool[int(rng.integers(len(pool)))])
    out['positions'] = len(positions)
    # Versions with memoised wall computations start the first pass with empty caches.
    from quoridor_az import features

    clear = getattr(features, 'clear_caches', None)
    if clear is not None:
        clear()

    def timed_pass(fn):
        t0 = time.perf_counter()
        res = [fn(p) for p in positions]
        return (time.perf_counter() - t0) / len(positions) * 1e6, res

    legal_first, legal = timed_pass(E.legal_action_indices)
    legal_second, _ = timed_pass(E.legal_action_indices)
    out['legal_us'] = {'first_pass': legal_first, 'second_pass': legal_second}
    out['legal_hash'] = hashlib.sha256(json.dumps(legal).encode()).hexdigest()[:16]
    if clear is not None:
        clear()
    enc_first, planes = timed_pass(encode_state_planes)
    enc_second, _ = timed_pass(encode_state_planes)
    out['encode_us'] = {'first_pass': enc_first, 'second_pass': enc_second}
    out['planes_hash'] = hashlib.sha256(b''.join(p.tobytes() for p in planes)).hexdigest()[:16]

    torch.manual_seed(0)
    net = PolicyValueNet(NetConfig()).eval()
    starts = [positions[0], positions[len(positions) // 2], positions[-1]]
    visits = []
    t0 = time.perf_counter()
    for s in starts:
        search = Search(s, MctsConfig(num_simulations=200)).run(NeuralEvaluator(net, torch.device('cpu')))
        visits.append(search.root.child_n.tolist())
    sec = time.perf_counter() - t0
    out['mcts'] = {'simulations': 600, 'seconds': sec, 'simulations_per_second': 600 / sec}
    out['mcts_hash'] = hashlib.sha256(json.dumps(visits).encode()).hexdigest()[:16]

    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=32, root_noise=True), parallel_games=2, max_plies=200)
    t0 = time.perf_counter()
    samples, records, stats = play_games(NeuralEvaluator(net, torch.device('cpu')), cfg, 2, seed=0)
    sec = time.perf_counter() - t0
    out['selfplay'] = {
        'games': len(records),
        'plies': [r.plies for r in records],
        'outcomes': [r.outcome for r in records],
        'seconds': sec,
        'seconds_per_game': sec / len(records),
        'simulations_per_second': stats.simulations / sec,
        'samples': len(samples),
    }
    out['selfplay_hash'] = hashlib.sha256(json.dumps([r.moves for r in records]).encode()).hexdigest()[:16]
    return out


# ---------------------------------------------------------------- driver

def run_version(src: Path, threads: int) -> dict:
    code = f'import sys, json; sys.path.insert(0, {str(src)!r}); sys.path.insert(1, {str(HERE.parent)!r}); import ab_compare; print("@@" + json.dumps(ab_compare.worker({threads})))'
    proc = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, cwd=str(src))
    if proc.returncode != 0:
        raise RuntimeError(f'{src}: {proc.stderr[-2000:]}')
    line = next(l for l in proc.stdout.splitlines() if l.startswith('@@'))
    return json.loads(line[2:])


def median_of(runs: list[dict], *path: str) -> float:
    vals = []
    for r in runs:
        v = r
        for p in path:
            v = v[p]
        vals.append(v)
    return statistics.median(vals)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--baseline', required=True, type=Path, help='directory that contains the baseline quoridor_az package')
    ap.add_argument('--candidate', type=Path, default=TRAINING, help='directory that contains the new quoridor_az package')
    ap.add_argument('--repeats', type=int, default=2)
    ap.add_argument('--threads', type=int, default=4)
    ap.add_argument('--out', type=Path, default=None, help='directory for ab_compare.json / ab_compare.md')
    args = ap.parse_args()
    keep_awake()
    sys.stdout.reconfigure(encoding='utf-8')

    runs: dict[str, list[dict]] = {'baseline': [], 'candidate': []}
    for i in range(args.repeats):
        for name, src in (('baseline', args.baseline), ('candidate', args.candidate)):
            t0 = time.perf_counter()
            runs[name].append(run_version(src.resolve(), args.threads))
            print(f'run {i + 1}/{args.repeats} {name}: {time.perf_counter() - t0:.0f}s', flush=True)

    hashes = ('legal_hash', 'planes_hash', 'mcts_hash', 'selfplay_hash')
    identical = {h: len({r[h] for r in runs['baseline'] + runs['candidate']}) == 1 for h in hashes}
    metrics = [
        ('legal_action_indices, first pass, empty caches (µs/position)', ('legal_us', 'first_pass'), False),
        ('legal_action_indices, second pass (µs/position)', ('legal_us', 'second_pass'), False),
        ('encode_state_planes, first pass, empty caches (µs/position)', ('encode_us', 'first_pass'), False),
        ('encode_state_planes, second pass (µs/position)', ('encode_us', 'second_pass'), False),
        ('MCTS simulations/s (batch 1, CPU network)', ('mcts', 'simulations_per_second'), True),
        ('self-play seconds per game (32 sims, 2 games)', ('selfplay', 'seconds_per_game'), False),
        ('self-play simulations/s', ('selfplay', 'simulations_per_second'), True),
    ]
    table = []
    for label, path, higher_better in metrics:
        a = median_of(runs['baseline'], *path)
        b = median_of(runs['candidate'], *path)
        speedup = (b / a) if higher_better else (a / b)
        table.append({'metric': label, 'baseline': a, 'candidate': b, 'speedup': speedup})

    result = {
        'created': time.strftime('%Y-%m-%d %H:%M:%S'),
        'machine': {'platform': platform.platform(), 'python': platform.python_version(), 'processor': platform.processor(), 'torch_threads': args.threads},
        'repeats': args.repeats,
        'identical_results': identical,
        'positions': runs['candidate'][0]['positions'],
        'selfplay_games': runs['candidate'][0]['selfplay'],
        'table': table,
        'runs': runs,
    }
    lines = [
        '| metric | 6A (baseline) | 6B-1 | speed-up |',
        '|---|---:|---:|---:|',
        *[f"| {r['metric']} | {r['baseline']:.1f} | {r['candidate']:.1f} | {r['speedup']:.1f}× |" for r in table],
        '',
        'Identical results (hash of legal actions / planes / MCTS visit counts / self-play moves): ' + ', '.join(f'{k}={v}' for k, v in identical.items()),
    ]
    print('\n'.join(lines))
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / 'ab_compare.json').write_text(json.dumps(result, indent=1), encoding='utf-8')
        header = f"# 6A vs 6B-1 (CPU, measured {result['created']})\n\n{result['machine']['platform']}, Python {result['machine']['python']}, torch threads {args.threads}, median of {args.repeats} alternating runs, {result['positions']} positions.\n\n"
        (args.out / 'ab_compare.md').write_text(header + '\n'.join(lines) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
