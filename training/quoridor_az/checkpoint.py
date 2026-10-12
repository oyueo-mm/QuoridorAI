"""Crash-safe checkpoints (local disk or a mounted Google Drive folder).

Layout of a run directory:
    checkpoints/iter_000012.pt     model / optimizer / scheduler / RNG / config / metrics
    latest.json                    pointer + sha256 of the newest checkpoint
    replay.npz                     replay buffer (optional, ReplayBuffer.save)
    metrics.jsonl                  one line per iteration (appended)

Writes go to a temporary file, are fsync'ed and atomically renamed, so a runtime that dies
mid-write never leaves a truncated "latest" checkpoint. Loading verifies the sha256 and falls
back to the previous checkpoint if the newest one is damaged.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import time
from pathlib import Path
from typing import Any, Optional

import numpy as np
import torch

CHECKPOINT_FORMAT = 'qz-checkpoint-v1'


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def _atomic_write_bytes(path: Path, write) -> None:
    tmp = path.with_name(path.name + '.tmp')
    with open(tmp, 'wb') as f:
        write(f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def capture_rng_state(np_rng: Optional[np.random.Generator] = None) -> dict:
    state = {
        'python': random.getstate(),
        'numpy_global': np.random.get_state(),
        'torch': torch.get_rng_state(),
        'cuda': torch.cuda.get_rng_state_all() if torch.cuda.is_available() else None,
    }
    if np_rng is not None:
        state['numpy_generator'] = np_rng.bit_generator.state
    return state


def restore_rng_state(state: dict, np_rng: Optional[np.random.Generator] = None) -> None:
    random.setstate(state['python'])
    np.random.set_state(state['numpy_global'])
    torch.set_rng_state(state['torch'])
    if state.get('cuda') is not None and torch.cuda.is_available():
        torch.cuda.set_rng_state_all(state['cuda'])
    if np_rng is not None and 'numpy_generator' in state:
        np_rng.bit_generator.state = state['numpy_generator']


class CheckpointManager:
    def __init__(self, run_dir: str | os.PathLike, keep: int = 5):
        self.run_dir = Path(run_dir)
        self.ckpt_dir = self.run_dir / 'checkpoints'
        self.ckpt_dir.mkdir(parents=True, exist_ok=True)
        self.keep = keep

    @property
    def latest_pointer(self) -> Path:
        return self.run_dir / 'latest.json'

    def save(self, iteration: int, payload: dict[str, Any]) -> Path:
        path = self.ckpt_dir / f'iter_{iteration:06d}.pt'
        payload = {**payload, 'format': CHECKPOINT_FORMAT, 'iteration': iteration, 'saved_at': time.time()}
        _atomic_write_bytes(path, lambda f: torch.save(payload, f))
        pointer = {'checkpoint': path.name, 'sha256': _sha256(path), 'iteration': iteration, 'saved_at': payload['saved_at']}
        history = self._history()
        history = [h for h in history if h['checkpoint'] != path.name] + [pointer]
        _atomic_write_bytes(self.latest_pointer, lambda f: f.write(json.dumps({'latest': pointer, 'history': history}, indent=1).encode()))
        self._prune(history)
        return path

    def _history(self) -> list[dict]:
        if not self.latest_pointer.exists():
            return []
        try:
            return json.loads(self.latest_pointer.read_text())['history']
        except (json.JSONDecodeError, KeyError):
            return []

    def _prune(self, history: list[dict]) -> None:
        names = [h['checkpoint'] for h in history]
        for old in names[: max(0, len(names) - self.keep)]:
            (self.ckpt_dir / old).unlink(missing_ok=True)
        if len(names) > self.keep:
            kept = history[-self.keep :]
            latest = kept[-1]
            _atomic_write_bytes(self.latest_pointer, lambda f: f.write(json.dumps({'latest': latest, 'history': kept}, indent=1).encode()))

    def load_latest(self, map_location: str | torch.device = 'cpu') -> Optional[dict]:
        """Newest checkpoint whose sha256 matches; older ones are tried if it is damaged."""
        for entry in reversed(self._history()):
            path = self.ckpt_dir / entry['checkpoint']
            if not path.exists() or _sha256(path) != entry['sha256']:
                continue
            data = torch.load(path, map_location=map_location, weights_only=False)
            if data.get('format') == CHECKPOINT_FORMAT:
                return data
        return None

    def append_metrics(self, row: dict) -> None:
        with open(self.run_dir / 'metrics.jsonl', 'a', encoding='utf-8') as f:
            f.write(json.dumps(row) + '\n')

    def read_metrics(self) -> list[dict]:
        p = self.run_dir / 'metrics.jsonl'
        if not p.exists():
            return []
        return [json.loads(line) for line in p.read_text(encoding='utf-8').splitlines() if line.strip()]
