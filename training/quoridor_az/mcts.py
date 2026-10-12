"""Neural MCTS (AlphaZero PUCT).

Tree layout: every expanded node keeps numpy arrays over its legal actions (prior P, visit
count N, value sum W, mean value Q). W is stored from the perspective of the node's player to
move (the chooser), so selection is argmax  Q + c_puct · P · sqrt(ΣN) / (1 + N)  with Q = W / N
(fpu_value for unvisited children). Child positions are created lazily when first selected.

Values: an evaluator returns v for the player to move at the leaf. Backing up, each edge
adds +v if its chooser is that player and -v otherwise. A terminal position (a pawn reached
its goal) is scored +1 for the winner. Search never "plays out" games.

Step API for batching:
    select_leaves(k)   walks to up to k leaves and returns the positions that need the network
                       (terminal leaves are finished immediately);
    provide_many(evs)  expands those leaves and backs up, in the same order.
selfplay.py interleaves many searches so all their leaves share one network batch.
select_leaf() / provide() are the single-leaf forms, run(evaluator) the plain loop.

Virtual loss (k > 1): while a leaf is waiting for the network, every edge on its path counts
`virtual_loss` extra visits, each scored as a loss for that edge's chooser. Further descents
in the same round therefore spread over other branches. The virtual counts live in separate
arrays and are removed exactly before the real backup, so N, W and Q only ever hold real
results. If a descent reaches a leaf that is already waiting (collision), the round stops
for that search instead of evaluating it twice. With k = 1 no virtual loss is applied and the
search is bit-for-bit the Stage 6A search.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Optional

import numpy as np

from .engine import ACTION_SPACE_SIZE, ACTIONS, GameState, apply_action_unchecked
from .evaluator import Evaluation, Evaluator


@dataclass
class MctsConfig:
    num_simulations: int = 100
    c_puct: float = 1.5
    # Q of unvisited children (AlphaGo Zero uses 0).
    fpu_value: float = 0.0
    dirichlet_alpha: float = 0.3
    dirichlet_epsilon: float = 0.25
    # Add Dirichlet noise to the root priors (self-play only).
    root_noise: bool = False
    # Virtual visits per pending leaf when several leaves are collected per round.
    virtual_loss: float = 1.0

    def to_dict(self) -> dict:
        return asdict(self)


class Node:
    __slots__ = ('state', 'to_play', 'actions', 'priors', 'cp_priors', 'child_n', 'child_w', 'child_q', 'total', 'children', 'expanded', 'net_value', 'vl', 'inflight', 'pending')

    def __init__(self, state: GameState):
        self.state = state
        self.to_play = state.current_player
        self.actions: Optional[np.ndarray] = None
        self.priors: Optional[np.ndarray] = None
        self.cp_priors: Optional[np.ndarray] = None
        self.child_n: Optional[np.ndarray] = None
        self.child_w: Optional[np.ndarray] = None
        self.child_q: Optional[np.ndarray] = None
        self.total = 0
        self.children: list[Optional[Node]] = []
        self.expanded = False
        self.net_value = 0.0
        self.vl: Optional[np.ndarray] = None  # virtual visits per child (allocated on first use)
        self.inflight = 0  # sum of vl
        self.pending = False  # this leaf is waiting for the network

    @property
    def visits(self) -> int:
        return self.total

    def expand(self, ev: Evaluation, c_puct: float, fpu_value: float) -> None:
        k = len(ev.actions)
        self.actions = ev.actions
        self.set_priors(ev.priors.astype(np.float64), c_puct)
        self.child_n = np.zeros(k, dtype=np.int64)
        self.child_w = np.zeros(k, dtype=np.float64)
        self.child_q = np.full(k, fpu_value, dtype=np.float64)
        self.children = [None] * k
        self.expanded = True
        self.net_value = ev.value

    def set_priors(self, priors: np.ndarray, c_puct: float) -> None:
        self.priors = priors
        self.cp_priors = c_puct * priors


class Search:
    """One MCTS from `root_state`. Not thread-safe; use one per game."""

    def __init__(self, root_state: GameState, config: MctsConfig, rng: Optional[np.random.Generator] = None):
        if root_state.winner is not None:
            raise ValueError('cannot search a finished game')
        self.config = config
        self.rng = rng or np.random.default_rng(0)
        self.root = Node(root_state)
        self.simulations = 0
        self.terminal_hits = 0
        self.collisions = 0
        self._pending: list[tuple[list[tuple[Node, int]], Node, bool]] = []

    # ------------------------------------------------------------ selection
    def _select_child(self, node: Node) -> int:
        n = node.child_n
        if node.inflight:
            vl = node.vl
            n_eff = n + vl
            q = np.where(n_eff > 0, (node.child_w - self.config.virtual_loss * vl) / np.maximum(n_eff, 1), self.config.fpu_value)
            u = node.cp_priors * math.sqrt(max(node.total + node.inflight, 1)) / (1 + n_eff)
        else:
            q = node.child_q
            u = node.cp_priors * math.sqrt(max(node.total, 1)) / (1 + n)
        return int(np.argmax(q + u))  # ties -> first legal action in engine order

    def done(self) -> bool:
        return self.simulations >= self.config.num_simulations

    @property
    def pending_count(self) -> int:
        return len(self._pending)

    def _descend(self) -> tuple[list[tuple[Node, int]], Node]:
        node = self.root
        path: list[tuple[Node, int]] = []
        while node.expanded:
            i = self._select_child(node)
            path.append((node, i))
            child = node.children[i]
            if child is None:
                child = Node(apply_action_unchecked(node.state, ACTIONS[int(node.actions[i])]))
                node.children[i] = child
            node = child
            if node.state.winner is not None:
                break
        return path, node

    def select_leaves(self, max_leaves: int = 1) -> list[GameState]:
        """Makes up to `max_leaves` descents and returns the positions that need the network.

        A descent ending in a terminal position is backed up at once (and uses up its slot);
        a collision with a waiting leaf or an exhausted simulation budget ends the call early."""
        use_vl = max_leaves > 1
        out: list[GameState] = []
        for _ in range(max_leaves):
            if self.simulations + len(self._pending) >= self.config.num_simulations:
                break
            path, leaf = self._descend()
            if leaf.state.winner is not None:
                # Terminal: +1 for the winner, no network call.
                self._backup(path, 1.0, leaf.state.winner)
                self.terminal_hits += 1
                self.simulations += 1
                continue
            if leaf.pending:
                self.collisions += 1
                break
            leaf.pending = True
            if use_vl:
                self._add_virtual_loss(path, 1)
            self._pending.append((path, leaf, use_vl))
            out.append(leaf.state)
        return out

    def select_leaf(self) -> Optional[GameState]:
        """Advance one simulation. Returns a position that needs evaluation, or None if the
        simulation already finished (terminal leaf)."""
        if self._pending:
            raise RuntimeError('provide() the previous evaluation first')
        before = self.simulations
        leaves = self.select_leaves(1)
        if leaves:
            return leaves[0]
        if self.simulations == before:
            raise RuntimeError('simulation budget exhausted')
        return None

    def provide_many(self, evaluations: list[Evaluation]) -> None:
        if len(evaluations) != len(self._pending):
            raise RuntimeError(f'{len(self._pending)} leaves pending, got {len(evaluations)} evaluations')
        pending = self._pending
        self._pending = []
        for (path, leaf, used_vl), ev in zip(pending, evaluations):
            if used_vl:
                self._add_virtual_loss(path, -1)
            leaf.pending = False
            leaf.expand(ev, self.config.c_puct, self.config.fpu_value)
            if leaf is self.root and self.config.root_noise:
                self._add_root_noise()
            self._backup(path, ev.value, leaf.to_play)
            self.simulations += 1

    def provide(self, ev: Evaluation) -> None:
        if len(self._pending) != 1:
            raise RuntimeError('no pending leaf')
        self.provide_many([ev])

    def cancel_pending(self) -> None:
        """Drops waiting leaves (e.g. after a failed network call); the tree stays consistent."""
        for path, leaf, used_vl in self._pending:
            if used_vl:
                self._add_virtual_loss(path, -1)
            leaf.pending = False
        self._pending = []

    def _add_virtual_loss(self, path: list[tuple[Node, int]], sign: int) -> None:
        for node, i in path:
            if node.vl is None:
                node.vl = np.zeros(len(node.actions), dtype=np.int64)
            node.vl[i] += sign
            node.inflight += sign

    def _backup(self, path: list[tuple[Node, int]], value: float, perspective: int) -> None:
        for node, i in path:
            node.child_n[i] += 1
            node.child_w[i] += value if node.to_play == perspective else -value
            node.child_q[i] = node.child_w[i] / node.child_n[i]
            node.total += 1

    def _add_root_noise(self) -> None:
        k = len(self.root.priors)
        if k <= 1:
            return
        noise = self.rng.dirichlet([self.config.dirichlet_alpha] * k)
        eps = self.config.dirichlet_epsilon
        self.root.set_priors((1 - eps) * self.root.priors + eps * noise, self.config.c_puct)

    # ------------------------------------------------------------ convenience
    def run(self, evaluator: Evaluator, leaves_per_batch: int = 1) -> 'Search':
        while not self.done():
            leaves = self.select_leaves(leaves_per_batch)
            if leaves:
                self.provide_many(evaluator.evaluate(leaves))
        return self

    # ------------------------------------------------------------ results
    def visit_policy(self) -> np.ndarray:
        """Root visit distribution over all 209 engine actions (the policy target)."""
        pi = np.zeros(ACTION_SPACE_SIZE, dtype=np.float64)
        if self.root.expanded and self.root.child_n.sum() > 0:
            pi[self.root.actions] = self.root.child_n / self.root.child_n.sum()
        return pi

    def choose_action(self, temperature: float) -> int:
        """temperature 0 = most visited (ties -> first in engine order): deterministic."""
        n = self.root.child_n.astype(np.float64)
        if temperature <= 1e-6:
            return int(self.root.actions[int(np.argmax(n))])
        p = n ** (1.0 / temperature)
        p /= p.sum()
        return int(self.root.actions[self.rng.choice(len(p), p=p)])

    def root_value(self) -> float:
        """Mean value of the root from the root player's perspective."""
        n = self.root.child_n
        return float(self.root.child_w.sum() / n.sum()) if n.sum() else self.root.net_value

    def summary(self, top_k: int = 8) -> dict:
        """Numbers a DecisionTrace can show (actions are engine indices)."""
        r = self.root
        order = np.argsort(-r.child_n, kind='stable')[:top_k]
        return {
            'simulations': self.simulations,
            'terminal_hits': self.terminal_hits,
            'collisions': self.collisions,
            'root_value': self.root_value(),
            'net_value': r.net_value,
            'candidates': [
                {
                    'action': int(r.actions[i]),
                    'visits': int(r.child_n[i]),
                    'q': float(r.child_w[i] / r.child_n[i]) if r.child_n[i] else None,
                    'prior': float(r.priors[i]),
                }
                for i in order
            ],
        }
