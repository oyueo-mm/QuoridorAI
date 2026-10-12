"""Batched position evaluation for MCTS.

An evaluator turns a list of positions into (priors over legal engine actions, value for the
player to move). NeuralEvaluator batches all positions into one tensor transfer and one
forward pass, and caches results per position (positions are hashable), which removes
duplicate evaluations across simulations and across parallel self-play games.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np

from .engine import GameState, legal_action_indices
from .features import action_permutation, encode_state_planes


@dataclass
class Evaluation:
    actions: np.ndarray  # legal engine action indices (engine order)
    priors: np.ndarray  # prior probability per entry of `actions` (sums to 1)
    value: float  # from the perspective of state.current_player, in [-1, 1]


class Evaluator(Protocol):
    def evaluate(self, states: list[GameState]) -> list[Evaluation]: ...


@dataclass
class EvalStats:
    calls: int = 0
    positions: int = 0
    cache_hits: int = 0
    encode_seconds: float = 0.0
    inference_seconds: float = 0.0
    batch_sizes: list[int] = field(default_factory=list)

    def reset(self) -> None:
        self.calls = self.positions = self.cache_hits = 0
        self.encode_seconds = self.inference_seconds = 0.0
        self.batch_sizes.clear()


class UniformEvaluator:
    """No network: uniform priors and value 0 (useful for tests and as a baseline)."""

    def __init__(self) -> None:
        self.stats = EvalStats()

    def evaluate(self, states: list[GameState]) -> list[Evaluation]:
        out = []
        for s in states:
            actions = np.array(legal_action_indices(s), dtype=np.int64)
            out.append(Evaluation(actions, np.full(len(actions), 1.0 / max(1, len(actions))), 0.0))
        self.stats.positions += len(states)
        return out


class NeuralEvaluator:
    """Policy-value network evaluator with an LRU cache keyed by position."""

    def __init__(self, net, device=None, cache_size: int = 200_000) -> None:
        import torch

        from .network import pick_device

        self.torch = torch
        self.net = net
        self.device = device or pick_device()
        self.net.to(self.device)
        self.cache: OrderedDict[GameState, Evaluation] = OrderedDict()
        self.cache_size = cache_size
        self.stats = EvalStats()

    def clear_cache(self) -> None:
        self.cache.clear()

    def evaluate(self, states: list[GameState]) -> list[Evaluation]:
        torch = self.torch
        self.stats.calls += 1
        self.stats.positions += len(states)
        results: list[Evaluation | None] = [None] * len(states)
        todo: list[int] = []
        for i, s in enumerate(states):
            hit = self.cache.get(s)
            if hit is not None:
                self.cache.move_to_end(s)
                results[i] = hit
                self.stats.cache_hits += 1
            else:
                todo.append(i)
        if todo:
            t0 = time.perf_counter()
            # Duplicate positions inside one batch are evaluated once.
            unique: dict[GameState, int] = {}
            for i in todo:
                unique.setdefault(states[i], len(unique))
            uniq_states = list(unique)
            planes = np.stack([encode_state_planes(s) for s in uniq_states])
            legal = [np.array(legal_action_indices(s), dtype=np.int64) for s in uniq_states]
            t1 = time.perf_counter()
            self.net.eval()
            with torch.inference_mode():
                x = torch.from_numpy(planes).to(self.device, non_blocking=True)
                logits, values = self.net(x)
                logits = logits.float().cpu().numpy()
                values = values.float().cpu().numpy()
            t2 = time.perf_counter()
            self.stats.encode_seconds += t1 - t0
            self.stats.inference_seconds += t2 - t1
            self.stats.batch_sizes.append(len(uniq_states))
            for j, s in enumerate(uniq_states):
                # Network logits are in the canonical view: view index for each legal engine action.
                view_idx = action_permutation(s.current_player)[legal[j]]
                z = logits[j][view_idx]
                z = z - z.max()
                p = np.exp(z)
                p /= p.sum()
                ev = Evaluation(legal[j], p, float(values[j]))
                self.cache[s] = ev
                if len(self.cache) > self.cache_size:
                    self.cache.popitem(last=False)
            for i in todo:
                results[i] = self.cache[states[i]]
        return results  # type: ignore[return-value]
