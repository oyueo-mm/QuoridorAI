"""Performance measurement primitives. Every number is measured on the device the code runs on;
nothing here estimates or extrapolates (see report.py for estimates derived from measurements).

Used by verify.py (full GPU verification report) and by the notebook.
"""

from __future__ import annotations

import copy
import os
import platform
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from statistics import median
from typing import Optional

import numpy as np
import torch

from .engine import ACTIONS, apply_action_unchecked, create_initial_state, legal_action_indices
from .evaluator import NeuralEvaluator
from .features import clear_caches, encode_state_planes
from .mcts import MctsConfig, Search
from .network import NetConfig, PolicyValueNet, count_parameters
from .selfplay import SelfPlayConfig, play_games
from .train import TrainConfig, make_optimizer, train_step


def sync(device: torch.device) -> None:
    if device.type == 'cuda':
        torch.cuda.synchronize(device)


def time_call(fn, repeat: int, device: torch.device, warmup: int = 2) -> float:
    """Median seconds over `repeat` calls after `warmup` calls (synchronised on CUDA)."""
    for _ in range(warmup):
        fn()
    sync(device)
    times = []
    for _ in range(repeat):
        t0 = time.perf_counter()
        fn()
        sync(device)
        times.append(time.perf_counter() - t0)
    return median(times)


# ---------------------------------------------------------------- environment / utilisation

def _nvidia_smi(query: str) -> Optional[list[str]]:
    exe = shutil.which('nvidia-smi')
    if exe is None:
        return None
    try:
        out = subprocess.run([exe, f'--query-gpu={query}', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    return [x.strip() for x in out.stdout.strip().splitlines()[0].split(',')]


def environment(device: torch.device) -> dict:
    env = {
        'device': str(device),
        'python': platform.python_version(),
        'platform': platform.platform(),
        'cpu_count': os.cpu_count(),
        'torch': torch.__version__,
        'torch_cuda_build': torch.version.cuda,
        'cuda_available': torch.cuda.is_available(),
        'numpy': np.__version__,
        'torch_threads': torch.get_num_threads(),
    }
    if device.type == 'cuda':
        props = torch.cuda.get_device_properties(device)
        env.update(
            gpu_name=props.name,
            gpu_memory_total_mb=props.total_memory / 2**20,
            gpu_capability=f'{props.major}.{props.minor}',
            gpu_multiprocessors=props.multi_processor_count,
            cudnn=torch.backends.cudnn.version(),
            bf16_supported=torch.cuda.is_bf16_supported(),
        )
        smi = _nvidia_smi('name,driver_version,memory.total')
        if smi:
            env['nvidia_smi'] = {'name': smi[0], 'driver': smi[1], 'memory_total_mb': float(smi[2])}
    return env


class UtilisationSampler:
    """Context manager: samples GPU utilisation / memory via nvidia-smi in a background thread
    (if available) and measures this process's CPU time against wall time."""

    def __init__(self, interval: float = 0.5):
        self.interval = interval
        self.gpu_util: list[float] = []
        self.gpu_mem: list[float] = []
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.available = shutil.which('nvidia-smi') is not None

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            row = _nvidia_smi('utilization.gpu,memory.used')
            if row:
                self.gpu_util.append(float(row[0]))
                self.gpu_mem.append(float(row[1]))

    def __enter__(self) -> 'UtilisationSampler':
        self.t0 = time.perf_counter()
        self.cpu0 = time.process_time()
        if self.available:
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self.wall = time.perf_counter() - self.t0
        self.cpu = time.process_time() - self.cpu0
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=15)

    def summary(self) -> dict:
        out = {'wall_seconds': self.wall, 'process_cpu_seconds': self.cpu, 'process_cpu_utilisation': self.cpu / self.wall if self.wall else None, 'cpu_count': os.cpu_count()}
        if self.gpu_util:
            out.update(gpu_util_mean=float(np.mean(self.gpu_util)), gpu_util_max=float(np.max(self.gpu_util)), gpu_mem_used_max_mb=float(np.max(self.gpu_mem)), gpu_samples=len(self.gpu_util))
        return out


def _reset_peak(device: torch.device) -> None:
    if device.type == 'cuda':
        torch.cuda.reset_peak_memory_stats(device)


def _peak_mb(device: torch.device) -> Optional[float]:
    return torch.cuda.max_memory_allocated(device) / 2**20 if device.type == 'cuda' else None


def _is_oom(e: BaseException) -> bool:
    return isinstance(e, torch.cuda.OutOfMemoryError) or 'out of memory' in str(e).lower()


# ---------------------------------------------------------------- network

def forward_backward_check(net_config: NetConfig, device: torch.device, seed: int = 0) -> dict:
    """Forward / backward on `device`: finite outputs and gradients, value range, and agreement
    with the same weights on the CPU."""
    torch.manual_seed(seed)
    net = PolicyValueNet(net_config)
    states = [create_initial_state()]
    s = states[0]
    for _ in range(7):
        s = apply_action_unchecked(s, ACTIONS[legal_action_indices(s)[-1]])
        states.append(s)
    x = torch.from_numpy(np.stack([encode_state_planes(t) for t in states]))
    net_cpu = copy.deepcopy(net).eval()
    with torch.no_grad():
        ref_logits, ref_value = net_cpu(x)
    net_dev = copy.deepcopy(net).to(device).eval()
    with torch.no_grad():
        logits, value = net_dev(x.to(device))
    out = {
        'device': str(device),
        'logits_finite': bool(torch.isfinite(logits).all().item()),
        'value_in_range': bool((value.abs() <= 1).all().item()),
        'max_abs_diff_logits_vs_cpu': float((logits.cpu() - ref_logits).abs().max().item()),
        'max_abs_diff_value_vs_cpu': float((value.cpu() - ref_value).abs().max().item()),
    }
    net_dev.train()
    logits, value = net_dev(x.to(device))
    loss = logits.logsumexp(dim=1).mean() + (value ** 2).mean()
    loss.backward()
    grads = [p.grad for p in net_dev.parameters() if p.grad is not None]
    out['grad_tensors'] = len(grads)
    out['grads_finite'] = all(bool(torch.isfinite(g).all().item()) for g in grads)
    out['grad_norm'] = float(torch.norm(torch.stack([g.norm() for g in grads])).item())
    out['ok'] = out['logits_finite'] and out['value_in_range'] and out['grads_finite'] and out['max_abs_diff_logits_vs_cpu'] < 1e-2
    return out


def inference_sweep(net: PolicyValueNet, device: torch.device, batch_sizes=(1, 8, 32, 64, 128, 256, 512, 1024), precision: str = 'fp32', repeat: int = 20) -> list[dict]:
    """Forward pass incl. host->device and device->host copies, per batch size (as in MCTS)."""
    ev = NeuralEvaluator(net, device, precision=precision)
    planes = encode_state_planes(create_initial_state())
    rows = []
    for b in batch_sizes:
        x = np.ascontiguousarray(np.repeat(planes[None], b, axis=0))
        _reset_peak(device)
        try:
            sec = time_call(lambda: ev._forward_once(x), repeat, device)
        except RuntimeError as e:
            if not _is_oom(e):
                raise
            torch.cuda.empty_cache()
            rows.append({'batch': b, 'precision': precision, 'error': 'out of memory'})
            break
        rows.append({'batch': b, 'precision': precision, 'ms': sec * 1000, 'positions_per_second': b / sec, 'peak_memory_mb': _peak_mb(device)})
    return rows


def train_step_sweep(net_config: NetConfig, device: torch.device, batch_sizes=(128, 256, 512, 1024), repeat: int = 8) -> list[dict]:
    """Optimizer step time on random-target batches (a throw-away network)."""
    planes = encode_state_planes(create_initial_state())
    rows = []
    for b in batch_sizes:
        torch.manual_seed(0)
        net = PolicyValueNet(net_config).to(device)
        cfg = TrainConfig(batch_size=b)
        opt = make_optimizer(net, cfg)
        batch = {
            'planes': np.repeat(planes[None], b, axis=0),
            'policy': np.full((b, 209), 1 / 209, dtype=np.float32),
            'mask': np.ones((b, 209), dtype=bool),
            'value': np.zeros(b, dtype=np.float32),
            'value_weight': np.ones(b, dtype=np.float32),
        }
        _reset_peak(device)
        try:
            sec = time_call(lambda: train_step(net, opt, batch, cfg, device), repeat, device)
        except RuntimeError as e:
            if not _is_oom(e):
                raise
            torch.cuda.empty_cache()
            rows.append({'batch': b, 'error': 'out of memory'})
            break
        rows.append({'batch': b, 'seconds': sec, 'samples_per_second': b / sec, 'peak_memory_mb': _peak_mb(device)})
        del net, opt
    return rows


# ---------------------------------------------------------------- search / self-play

def cpu_costs(samples: int = 200) -> dict:
    """Per-position CPU costs of the rule and encoding paths (empty caches, then warm)."""
    s = create_initial_state()
    clear_caches()
    t0 = time.perf_counter()
    legal_action_indices(s)
    encode_state_planes(s)
    cold = time.perf_counter() - t0
    return {
        'start_position_cold_us': cold * 1e6,
        'legal_actions_warm_us': time_call(lambda: legal_action_indices(s), samples, torch.device('cpu')) * 1e6,
        'encode_planes_warm_us': time_call(lambda: encode_state_planes(s), samples, torch.device('cpu')) * 1e6,
    }


def mcts_speed(net: PolicyValueNet, device: torch.device, simulations: int = 200, leaves_per_batch=(1, 8)) -> list[dict]:
    """One search from the start position (empty caches each time)."""
    rows = []
    for k in leaves_per_batch:
        clear_caches()
        ev = NeuralEvaluator(net, device)
        t0 = time.perf_counter()
        search = Search(create_initial_state(), MctsConfig(num_simulations=simulations)).run(ev, leaves_per_batch=k)
        sec = time.perf_counter() - t0
        st = ev.stats
        rows.append({
            'leaves_per_batch': k,
            'simulations': simulations,
            'seconds': sec,
            'simulations_per_second': simulations / sec,
            'nn_calls': st.nn_calls,
            'mean_batch': float(np.mean(st.batch_sizes)) if st.batch_sizes else None,
            'inference_share': st.inference_seconds / sec,
            'encode_share': st.encode_seconds / sec,
            'legal_share': st.legal_seconds / sec,
            'collisions': search.collisions,
        })
    return rows


def selfplay_point(net: PolicyValueNet, device: torch.device, parallel: int, leaves: int, simulations: int, seconds: float, precision: str = 'fp32', seed: int = 0, max_plies: int = 200) -> dict:
    """Self-play throughput for one setting, measured over a fixed time budget."""
    clear_caches()
    ev = NeuralEvaluator(net, device, precision=precision)
    cfg = SelfPlayConfig(mcts=MctsConfig(num_simulations=simulations, root_noise=True), parallel_games=parallel, leaves_per_game=leaves, max_plies=max_plies)
    _reset_peak(device)
    with UtilisationSampler() as util:
        samples, records, stats = play_games(ev, cfg, num_games=parallel * 1000, seed=seed, time_budget=seconds)
    d = stats.to_dict()
    ev_d = d['evaluator']
    row = {
        'parallel_games': parallel,
        'leaves_per_game': leaves,
        'simulations': simulations,
        'precision': precision,
        'seconds': stats.seconds,
        'simulations_per_second': d['simulations_per_second'],
        'moves_per_second': d['moves_per_second'],
        'finished_games': stats.games,
        'samples_per_second': d['samples_per_second'],
        'mean_batch': ev_d.get('mean_batch'),
        'max_batch': ev_d.get('max_batch'),
        'nn_calls': ev_d.get('nn_calls'),
        'cache_hit_rate': ev_d.get('cache_hit_rate'),
        'collisions': stats.collisions,
        'mean_leaf_wait_ms': d['mean_leaf_wait_ms'],
        'time_split': {
            'select': stats.select_seconds / stats.seconds,
            'encode': ev_d.get('encode_seconds', 0) / stats.seconds,
            'legal': ev_d.get('legal_seconds', 0) / stats.seconds,
            'inference': ev_d.get('inference_seconds', 0) / stats.seconds,
            'post': ev_d.get('post_seconds', 0) / stats.seconds,
            'backup': stats.backup_seconds / stats.seconds,
            'moves_and_samples': stats.move_seconds / stats.seconds,
        },
        'peak_memory_mb': _peak_mb(device),
        'utilisation': util.summary(),
    }
    # Everything except the network (tree, rules, encoding, bookkeeping) per simulation, and the
    # throughput limit it implies for one process however fast the network runs.
    cpu_side = stats.seconds - ev_d.get('inference_seconds', 0)
    if stats.simulations:
        row['cpu_side_us_per_simulation'] = 1e6 * cpu_side / stats.simulations
        row['cpu_side_limit_simulations_per_second'] = stats.simulations / cpu_side if cpu_side > 0 else None
    return row


def selfplay_sweep(net: PolicyValueNet, device: torch.device, parallel=(2, 8, 16, 32), leaves=(1,), simulations: int = 32, seconds: float = 45.0, precision: str = 'fp32', log=None) -> list[dict]:
    """Progressive sweep: settings run in the given order (small first) so a problem shows up
    before the large settings run."""
    rows = []
    for p in parallel:
        for k in leaves:
            row = selfplay_point(net, device, p, k, simulations, seconds, precision)
            rows.append(row)
            if log:
                log(f"  parallel {p:3d} × leaves {k}: {row['simulations_per_second']:8.0f} sims/s, mean batch {row['mean_batch'] or 0:6.1f}, inference {row['time_split']['inference']:.0%}, peak {row['peak_memory_mb'] or 0:.0f} MB")
    return rows


# ---------------------------------------------------------------- checkpoints

def checkpoint_roundtrip(net_config: NetConfig, device: torch.device, directory: Optional[Path] = None) -> dict:
    """Saves and reloads a checkpoint (model + optimizer state after one step) with
    CheckpointManager and checks that the reloaded network gives identical outputs."""
    from .checkpoint import CheckpointManager, capture_rng_state

    tmp = None
    if directory is None:
        tmp = tempfile.mkdtemp(prefix='qz-ckpt-')
        directory = Path(tmp)
    try:
        torch.manual_seed(0)
        net = PolicyValueNet(net_config).to(device)
        cfg = TrainConfig(batch_size=32)
        opt = make_optimizer(net, cfg)
        planes = encode_state_planes(create_initial_state())
        batch = {'planes': np.repeat(planes[None], 32, axis=0), 'policy': np.full((32, 209), 1 / 209, dtype=np.float32), 'mask': np.ones((32, 209), dtype=bool), 'value': np.zeros(32, dtype=np.float32)}
        train_step(net, opt, batch, cfg, device)
        mgr = CheckpointManager(directory, keep=2)
        t0 = time.perf_counter()
        path = mgr.save(1, {'model': net.state_dict(), 'optimizer': opt.state_dict(), 'rng': capture_rng_state(), 'model_metadata': net.metadata()})
        save_s = time.perf_counter() - t0
        t0 = time.perf_counter()
        data = mgr.load_latest(map_location=device)
        load_s = time.perf_counter() - t0
        net2 = PolicyValueNet(net_config).to(device)
        net2.load_state_dict(data['model'])
        x = torch.from_numpy(planes[None]).to(device)
        net.eval()
        net2.eval()
        with torch.no_grad():
            a = net(x)
            b = net2(x)
        return {
            'directory': str(directory),
            'checkpoint_bytes': path.stat().st_size,
            'save_seconds': save_s,
            'load_seconds': load_s,
            'identical_outputs': bool(torch.equal(a[0], b[0]) and torch.equal(a[1], b[1])),
            'parameters': count_parameters(net),
        }
    finally:
        if tmp is not None:
            shutil.rmtree(tmp, ignore_errors=True)
