"""Batched position evaluation for MCTS.

An evaluator turns a list of positions into (priors over legal engine actions, value for the
player to move). NeuralEvaluator batches all positions into one tensor transfer and one
forward pass, and caches results per position (positions are hashable), which removes
duplicate evaluations across simulations and across parallel self-play games.

Timing is split into encoding (input planes), legal-action generation, inference (host->device
copy, forward pass and device->host copy, synchronised) and post-processing (per-position
softmax over the legal actions), so a profile shows where time goes.

Failure handling: a CUDA out-of-memory error during a forward pass empties the allocator cache
and retries the batch in two halves (recursively); `max_batch` caps the size of one forward
pass. Other exceptions propagate unchanged, and nothing is cached for a failed batch.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from typing import Optional, Protocol

import numpy as np

from .engine import GameState, legal_action_indices
from .features import action_permutation, encode_batch

PRECISIONS = ('fp32', 'fp16', 'bf16')


@dataclass
class Evaluation:
    actions: np.ndarray  # legal engine action indices (engine order)
    priors: np.ndarray  # prior probability per entry of `actions` (sums to 1)
    value: float  # from the perspective of state.current_player, in [-1, 1]


class Evaluator(Protocol):
    def evaluate(self, states: list[GameState]) -> list[Evaluation]: ...


@dataclass
class EvalStats:
    calls: int = 0  # evaluate() calls
    nn_calls: int = 0  # forward passes (after the cache; OOM splits count each part)
    positions: int = 0  # positions requested
    cache_hits: int = 0
    duplicates: int = 0  # repeated positions inside one batch (evaluated once)
    encode_seconds: float = 0.0
    legal_seconds: float = 0.0
    inference_seconds: float = 0.0
    post_seconds: float = 0.0
    oom_splits: int = 0
    batch_sizes: list[int] = field(default_factory=list)  # unique positions per evaluate() that reached the net

    def reset(self) -> None:
        fresh = EvalStats()
        for k, v in asdict(fresh).items():
            setattr(self, k, v)

    @property
    def evaluated(self) -> int:
        return int(sum(self.batch_sizes))

    def summary(self) -> dict:
        b = np.array(self.batch_sizes) if self.batch_sizes else np.zeros(0)
        return {
            'calls': self.calls,
            'nn_calls': self.nn_calls,
            'positions': self.positions,
            'evaluated': self.evaluated,
            'cache_hits': self.cache_hits,
            'cache_hit_rate': self.cache_hits / self.positions if self.positions else None,
            'duplicates': self.duplicates,
            'mean_batch': float(b.mean()) if len(b) else None,
            'p50_batch': float(np.percentile(b, 50)) if len(b) else None,
            'max_batch': int(b.max()) if len(b) else None,
            'encode_seconds': self.encode_seconds,
            'legal_seconds': self.legal_seconds,
            'inference_seconds': self.inference_seconds,
            'post_seconds': self.post_seconds,
            'oom_splits': self.oom_splits,
        }


class UniformEvaluator:
    """No network: uniform priors and value 0 (useful for tests and as a baseline)."""

    def __init__(self) -> None:
        self.stats = EvalStats()

    def evaluate(self, states: list[GameState]) -> list[Evaluation]:
        out = []
        for s in states:
            actions = np.array(legal_action_indices(s), dtype=np.int64)
            out.append(Evaluation(actions, np.full(len(actions), 1.0 / max(1, len(actions))), 0.0))
        self.stats.calls += 1
        self.stats.positions += len(states)
        return out


class NeuralEvaluator:
    """Policy-value network evaluator with an LRU cache keyed by position.

    precision: 'fp32' (default, bit-for-bit reproducible), or 'fp16' / 'bf16' autocast on CUDA
    (faster on tensor-core GPUs; outputs differ slightly). Ignored on CPU."""

    def __init__(self, net, device=None, cache_size: int = 200_000, precision: str = 'fp32', max_batch: Optional[int] = None) -> None:
        import torch

        from .network import pick_device

        if precision not in PRECISIONS:
            raise ValueError(f'precision must be one of {PRECISIONS}')
        self.torch = torch
        self.net = net
        self.device = device or pick_device()
        self.net.to(self.device)
        self.net.eval()
        self.cache: OrderedDict[GameState, Evaluation] = OrderedDict()
        self.cache_size = cache_size
        self.precision = precision
        self.max_batch = max_batch
        self.stats = EvalStats()
        self._pinned = None  # reusable page-locked input buffer (CUDA only)

    def clear_cache(self) -> None:
        self.cache.clear()

    # ------------------------------------------------------------ forward
    def _input_tensor(self, planes: np.ndarray):
        torch = self.torch
        x = torch.from_numpy(planes)
        if self.device.type != 'cuda':
            return x
        n = len(planes)
        if self._pinned is None or self._pinned.shape[0] < n:
            size = 1 << max(0, (n - 1).bit_length())
            self._pinned = torch.empty((size, *planes.shape[1:]), dtype=torch.float32).pin_memory()
        buf = self._pinned[:n]
        buf.copy_(x)
        return buf.to(self.device, non_blocking=True)

    def _forward_once(self, planes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        torch = self.torch
        self.stats.nn_calls += 1
        with torch.inference_mode():
            x = self._input_tensor(planes)
            if self.precision != 'fp32' and self.device.type == 'cuda':
                dtype = torch.float16 if self.precision == 'fp16' else torch.bfloat16
                with torch.autocast('cuda', dtype=dtype):
                    logits, values = self.net(x)
            else:
                logits, values = self.net(x)
            return logits.float().cpu().numpy(), values.float().cpu().numpy()

    def _forward(self, planes: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        torch = self.torch
        n = len(planes)
        if self.max_batch and n > self.max_batch:
            parts = [self._forward(planes[i : i + self.max_batch]) for i in range(0, n, self.max_batch)]
            return np.concatenate([p[0] for p in parts]), np.concatenate([p[1] for p in parts])
        try:
            return self._forward_once(planes)
        except torch.cuda.OutOfMemoryError:
            if n == 1:
                raise
            torch.cuda.empty_cache()
            self.stats.oom_splits += 1
            half = n // 2
            a = self._forward(planes[:half])
            b = self._forward(planes[half:])
            return np.concatenate([a[0], b[0]]), np.concatenate([a[1], b[1]])

    # ------------------------------------------------------------ evaluate
    def evaluate(self, states: list[GameState]) -> list[Evaluation]:
        self.stats.calls += 1
        self.stats.positions += len(states)
        results: list[Optional[Evaluation]] = [None] * len(states)
        todo: list[int] = []
        for i, s in enumerate(states):
            hit = self.cache.get(s)
            if hit is not None:
                self.cache.move_to_end(s)
                results[i] = hit
                self.stats.cache_hits += 1
            else:
                todo.append(i)
        if not todo:
            return results  # type: ignore[return-value]
        if self.net.training:
            self.net.eval()
        t0 = time.perf_counter()
        # Duplicate positions inside one batch are evaluated once.
        unique: dict[GameState, int] = {}
        for i in todo:
            unique.setdefault(states[i], len(unique))
        self.stats.duplicates += len(todo) - len(unique)
        uniq_states = list(unique)
        planes = encode_batch(uniq_states)
        t1 = time.perf_counter()
        legal = [np.array(legal_action_indices(s), dtype=np.int64) for s in uniq_states]
        t2 = time.perf_counter()
        logits, values = self._forward(planes)
        t3 = time.perf_counter()
        fresh: dict[GameState, Evaluation] = {}
        for j, s in enumerate(uniq_states):
            # Network logits are in the canonical view: view index for each legal engine action.
            view_idx = action_permutation(s.current_player)[legal[j]]
            z = logits[j][view_idx]
            z = z - z.max()
            p = np.exp(z)
            p /= p.sum()
            fresh[s] = Evaluation(legal[j], p, float(values[j]))
        for s, ev in fresh.items():
            self.cache[s] = ev
            if len(self.cache) > self.cache_size:
                self.cache.popitem(last=False)
        for i in todo:
            results[i] = fresh[states[i]]
        t4 = time.perf_counter()
        self.stats.encode_seconds += t1 - t0
        self.stats.legal_seconds += t2 - t1
        self.stats.inference_seconds += t3 - t2
        self.stats.post_seconds += t4 - t3
        self.stats.batch_sizes.append(len(uniq_states))
        return results  # type: ignore[return-value]
