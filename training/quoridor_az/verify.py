"""Hardware verification report (Stage 6B-1).

    report = run_verification(out_dir, device)

Runs on whatever device it is given and labels every result with it. `gpu_verified` is True
only when the device is CUDA and every step succeeded — a CPU run is a CPU measurement and is
never presented as a GPU result. The JSON goes to out_dir/verification_<device>_<time>.json
(and verification_latest_<device>.json), e.g. in Google Drive so it survives the runtime.

Steps (each records 'ok' or its error, so one failure does not hide the others):
    environment        GPU name, VRAM, compute capability, driver, torch / CUDA / cuDNN versions
    forward_backward   finite outputs and gradients, agreement with the CPU
    inference          forward throughput per batch size (fp32; fp16 / bf16 autocast on CUDA)
    train_step         optimizer step time per batch size
    cpu_costs          rule + encoding cost per position
    mcts               single-search speed, 1 and 8 leaves per network call
    selfplay           progressive sweep over parallel games (2, 8, 16, 32) × leaves per game
    checkpoint         save -> reload -> identical outputs (in out_dir, i.e. on Drive)
"""

from __future__ import annotations

import json
import os
import time
import traceback
from pathlib import Path
from typing import Optional

import torch

from . import bench
from .network import NetConfig, PolicyValueNet, count_parameters, pick_device

VERIFICATION_FORMAT = 'qz-verification-v1'


def _write_json(path: Path, data: dict) -> None:
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, default=str)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def run_verification(out_dir: str | Path, device: Optional[torch.device] = None, net_config: Optional[NetConfig] = None, quick: bool = False, parallel=(2, 8, 16, 32), leaves=(1, 4), selfplay_simulations: int = 32, selfplay_seconds: Optional[float] = None, log=print) -> dict:
    device = device or pick_device()
    net_config = net_config or NetConfig()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime('%Y%m%d-%H%M%S')
    seconds = selfplay_seconds or (20.0 if quick else 45.0)
    report: dict = {
        'format': VERIFICATION_FORMAT,
        'created': stamp,
        'measured_on': device.type,
        'quick': quick,
        'net_config': net_config.__dict__,
        'status': {},
    }
    torch.manual_seed(0)
    net = PolicyValueNet(net_config).to(device).eval()
    report['parameters'] = count_parameters(net)

    def step(name: str, fn) -> None:
        log(f'[verify] {name} ...')
        t0 = time.perf_counter()
        try:
            report[name] = fn()
            report['status'][name] = 'ok'
        except Exception as e:  # noqa: BLE001 — recorded in the report
            report['status'][name] = f'error: {e!r}'
            report[f'{name}_traceback'] = traceback.format_exc()[-3000:]
            if device.type == 'cuda':
                torch.cuda.empty_cache()
        log(f"[verify] {name}: {report['status'][name]} ({time.perf_counter() - t0:.1f}s)")

    step('environment', lambda: bench.environment(device))
    step('forward_backward', lambda: bench.forward_backward_check(net_config, device))
    if report['status'].get('forward_backward') == 'ok' and not report['forward_backward']['ok']:
        report['status']['forward_backward'] = 'error: check failed (see values)'

    def inference():
        sizes = (1, 8, 32, 64, 128, 256) if quick else (1, 8, 32, 64, 128, 256, 512, 1024)
        rows = bench.inference_sweep(net, device, sizes, 'fp32')
        if device.type == 'cuda':
            rows += bench.inference_sweep(net, device, sizes, 'fp16')
            if torch.cuda.is_bf16_supported():
                rows += bench.inference_sweep(net, device, sizes, 'bf16')
        return rows

    step('inference', inference)
    step('train_step', lambda: bench.train_step_sweep(net_config, device, (128, 256) if quick else (128, 256, 512, 1024)))
    step('cpu_costs', bench.cpu_costs)
    step('mcts', lambda: bench.mcts_speed(net, device, 100 if quick else 200, (1, 8)))
    step('selfplay', lambda: bench.selfplay_sweep(net, device, parallel, (1,) if quick else leaves, selfplay_simulations, seconds, log=log))
    step('checkpoint', lambda: bench.checkpoint_roundtrip(net_config, device, out_dir / 'checkpoint_check'))
    if device.type == 'cuda':
        report['peak_memory_mb'] = torch.cuda.max_memory_allocated(device) / 2**20
    report['gpu_verified'] = device.type == 'cuda' and all(v == 'ok' for v in report['status'].values())
    path = out_dir / f'verification_{device.type}_{stamp}.json'
    _write_json(path, report)
    _write_json(out_dir / f'verification_latest_{device.type}.json', report)
    report['path'] = str(path)
    log(f"[verify] saved {path} | gpu_verified={report['gpu_verified']}")
    return report


def load_latest(out_dir: str | Path, device_type: str = 'cuda') -> Optional[dict]:
    path = Path(out_dir) / f'verification_latest_{device_type}.json'
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding='utf-8'))
