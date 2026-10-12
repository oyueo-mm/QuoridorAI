"""Model evaluation: paired matches between two players (seats swapped per opening).

A player is anything with `choose(state) -> engine action index`. MctsPlayer runs a
deterministic search (no root noise, temperature 0) so repeated evaluations are reproducible.
Halts (ply limit, repetition) are reported separately and never counted as wins; the win rate
is computed over decisive games with a Wilson 95 % interval (same rules as the web Arena).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional, Protocol

import numpy as np

from .engine import (
    GameState,
    Wall,
    apply_action_unchecked,
    decode_action,
    distance_to_row,
    encode_action,
    goal_row,
    legal_actions,
)
from .evaluator import Evaluator
from .mcts import MctsConfig, Search
from .selfplay import random_opening


class Player(Protocol):
    name: str

    def choose(self, state: GameState) -> int: ...


class MctsPlayer:
    def __init__(self, name: str, evaluator: Evaluator, simulations: int):
        self.name = name
        self.evaluator = evaluator
        self.config = MctsConfig(num_simulations=simulations, root_noise=False)

    def choose(self, state: GameState) -> int:
        return Search(state, self.config).run(self.evaluator).choose_action(0.0)


class RandomPlayer:
    def __init__(self, seed: int = 0):
        self.name = 'random'
        self.rng = np.random.default_rng(seed)

    def choose(self, state: GameState) -> int:
        actions = legal_actions(state)
        return encode_action(actions[int(self.rng.integers(len(actions)))])


class GreedyDistancePlayer:
    """Python baseline (not the web BFS AI): 1-ply, maximise opponent distance − own distance."""

    name = 'greedy-distance'

    def choose(self, state: GameState) -> int:
        me = state.current_player
        best, best_score = None, -math.inf
        for a in legal_actions(state):
            nxt = apply_action_unchecked(state, a)
            if nxt.winner == me:
                return encode_action(a)
            d_me = distance_to_row(nxt.h_walls, nxt.v_walls, nxt.pawns[me], goal_row(me))
            d_op = distance_to_row(nxt.h_walls, nxt.v_walls, nxt.pawns[1 - me], goal_row(1 - me))
            score = d_op - d_me - (0.5 if isinstance(a, Wall) else 0.0)
            if score > best_score:
                best, best_score = a, score
        return encode_action(best)


@dataclass
class MatchResult:
    games: int = 0
    a_wins: int = 0
    b_wins: int = 0
    halted: int = 0
    plies: list[int] = field(default_factory=list)
    records: list[dict] = field(default_factory=list)

    @property
    def decisive(self) -> int:
        return self.a_wins + self.b_wins

    def a_win_rate(self) -> Optional[dict]:
        return wilson(self.a_wins, self.decisive)

    def to_dict(self) -> dict:
        return {
            'games': self.games,
            'a_wins': self.a_wins,
            'b_wins': self.b_wins,
            'halted': self.halted,
            'a_win_rate': self.a_win_rate(),
            'avg_plies': float(np.mean(self.plies)) if self.plies else None,
        }


def wilson(k: int, n: int, z: float = 1.959964) -> Optional[dict]:
    if n == 0:
        return None
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return {'p': p, 'low': max(0.0, center - half), 'high': min(1.0, center + half), 'k': k, 'n': n}


def play_match(a: Player, b: Player, pairs: int, seed: int, opening_plies: int = 4, max_plies: int = 200, repetition_limit: int = 3) -> MatchResult:
    """`pairs` openings, each played twice with seats swapped."""
    rng = np.random.default_rng(seed)
    result = MatchResult()
    for pair in range(pairs):
        start = random_opening(np.random.default_rng(rng.integers(2**63)), opening_plies)
        for a_seat in (0, 1):
            players = (a, b) if a_seat == 0 else (b, a)
            s = start
            seen = {s: 1}
            moves = []
            outcome = 'halted-max-plies'
            for _ in range(max_plies):
                action = players[s.current_player].choose(s)
                moves.append(action)
                s = apply_action_unchecked(s, decode_action(action))
                if s.winner is not None:
                    outcome = 'win'
                    break
                seen[s] = seen.get(s, 0) + 1
                if seen[s] >= repetition_limit:
                    outcome = 'halted-repetition'
                    break
            result.games += 1
            result.plies.append(len(moves))
            if outcome == 'win':
                if s.winner == a_seat:
                    result.a_wins += 1
                else:
                    result.b_wins += 1
            else:
                result.halted += 1
            result.records.append({'pair': pair, 'a_seat': a_seat, 'outcome': outcome, 'winner': s.winner, 'moves': moves})
    return result
