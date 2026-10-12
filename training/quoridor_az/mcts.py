"""Neural MCTS (AlphaZero PUCT).

Tree layout: every expanded node keeps numpy arrays over its legal actions (prior P, visit
count N, value sum W). W is stored from the perspective of the node's player to move (the
chooser), so selection is argmax  Q + c_puct · P · sqrt(ΣN) / (1 + N)  with Q = W / N.
Child positions are created lazily when first selected.

Values: an evaluator returns v for the player to move at the leaf. Backing up, each edge
adds +v if its chooser is that player and -v otherwise. A terminal position (a pawn reached
its goal) is scored +1 for the winner. Search never "plays out" games.

Step API for batching: `select_leaf()` walks to a leaf and either finishes the simulation
itself (terminal) or returns the position to evaluate; `provide(evaluation)` expands and
backs up. `run(evaluator)` is the single-search convenience loop; selfplay.py interleaves
many searches so their leaves share one network batch.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional

import numpy as np

from .engine import ACTION_SPACE_SIZE, GameState, apply_action_unchecked, decode_action
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

    def to_dict(self) -> dict:
        return asdict(self)


class Node:
    __slots__ = ('state', 'to_play', 'actions', 'priors', 'child_n', 'child_w', 'children', 'expanded', 'net_value')

    def __init__(self, state: GameState):
        self.state = state
        self.to_play = state.current_player
        self.actions: Optional[np.ndarray] = None
        self.priors: Optional[np.ndarray] = None
        self.child_n: Optional[np.ndarray] = None
        self.child_w: Optional[np.ndarray] = None
        self.children: list[Optional[Node]] = []
        self.expanded = False
        self.net_value = 0.0

    @property
    def visits(self) -> int:
        return int(self.child_n.sum()) if self.expanded else 0

    def expand(self, ev: Evaluation) -> None:
        self.actions = ev.actions
        self.priors = ev.priors.astype(np.float64)
        self.child_n = np.zeros(len(ev.actions), dtype=np.int64)
        self.child_w = np.zeros(len(ev.actions), dtype=np.float64)
        self.children = [None] * len(ev.actions)
        self.expanded = True
        self.net_value = ev.value


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
        self._pending: Optional[list[tuple[Node, int]]] = None
        self._pending_leaf: Optional[Node] = None

    # ------------------------------------------------------------ selection
    def _select_child(self, node: Node) -> int:
        n = node.child_n
        total = n.sum()
        q = np.where(n > 0, node.child_w / np.maximum(n, 1), self.config.fpu_value)
        u = self.config.c_puct * node.priors * np.sqrt(max(total, 1)) / (1 + n)
        return int(np.argmax(q + u))  # ties -> first legal action in engine order

    def done(self) -> bool:
        return self.simulations >= self.config.num_simulations

    def select_leaf(self) -> Optional[GameState]:
        """Advance one simulation. Returns a position that needs evaluation, or None if the
        simulation already finished (terminal leaf)."""
        if self._pending is not None:
            raise RuntimeError('provide() the previous evaluation first')
        node = self.root
        path: list[tuple[Node, int]] = []
        while node.expanded:
            i = self._select_child(node)
            path.append((node, i))
            child = node.children[i]
            if child is None:
                child = Node(apply_action_unchecked(node.state, decode_action(int(node.actions[i]))))
                node.children[i] = child
            node = child
            if node.state.winner is not None:
                # Terminal: +1 for the winner, no network call.
                self._backup(path, 1.0, node.state.winner)
                self.terminal_hits += 1
                self.simulations += 1
                return None
        self._pending = path
        self._pending_leaf = node
        return node.state

    def provide(self, ev: Evaluation) -> None:
        if self._pending is None or self._pending_leaf is None:
            raise RuntimeError('no pending leaf')
        leaf = self._pending_leaf
        leaf.expand(ev)
        if leaf is self.root and self.config.root_noise:
            self._add_root_noise()
        self._backup(self._pending, ev.value, leaf.to_play)
        self._pending = None
        self._pending_leaf = None
        self.simulations += 1

    def _backup(self, path: list[tuple[Node, int]], value: float, perspective: int) -> None:
        for node, i in path:
            node.child_n[i] += 1
            node.child_w[i] += value if node.to_play == perspective else -value

    def _add_root_noise(self) -> None:
        k = len(self.root.priors)
        if k <= 1:
            return
        noise = self.rng.dirichlet([self.config.dirichlet_alpha] * k)
        eps = self.config.dirichlet_epsilon
        self.root.priors = (1 - eps) * self.root.priors + eps * noise

    # ------------------------------------------------------------ convenience
    def run(self, evaluator: Evaluator) -> 'Search':
        while not self.done():
            leaf = self.select_leaf()
            if leaf is not None:
                self.provide(evaluator.evaluate([leaf])[0])
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
