"""Self-play with neural MCTS.

Several games run in lockstep: every round each unfinished game advances its search by one
simulation, and all leaves that need the network are evaluated in a single batch. This keeps
the GPU busy without threads (more parallel games -> larger batches).

Samples store the canonical-view planes, the root visit distribution re-indexed to the
canonical view (= the policy head's output space), the legal mask in that view, the player
to move and the value target from that player's perspective.

Halted games (ply limit or repeated position) have no winner. What happens to their samples
is an explicit policy (SelfPlayConfig.halted_policy):
    'discard'    drop them (default — no fabricated labels)
    'draw'       value target 0
    'adjudicate' value target 0.5 * tanh(race margin / 3) from the BFS distances (weak label)
The counts are reported in SelfPlayStats either way.
"""

from __future__ import annotations

import math
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

import numpy as np

from .engine import (
    GameState,
    apply_action_unchecked,
    create_initial_state,
    decode_action,
    distance_to_row,
    format_action,
    goal_row,
    legal_pawn_moves,
)
from .evaluator import Evaluator
from .features import canonical_legal_mask, encode_state_planes, engine_policy_to_view
from .mcts import MctsConfig, Search


@dataclass
class SelfPlayConfig:
    mcts: MctsConfig = field(default_factory=lambda: MctsConfig(num_simulations=100, root_noise=True))
    # Plies played with temperature 1 (proportional to visits); afterwards the most visited move.
    temperature_moves: int = 12
    max_plies: int = 200
    repetition_limit: int = 3
    halted_policy: str = 'discard'
    parallel_games: int = 8
    # Random pawn plies before recording starts (diverse openings); 0 = standard start.
    opening_plies: int = 0

    def to_dict(self) -> dict:
        d = asdict(self)
        d['mcts'] = self.mcts.to_dict()
        return d


@dataclass
class Sample:
    planes: np.ndarray  # (11, 9, 9) float32, canonical view
    policy: np.ndarray  # (209,) float32, canonical view
    mask: np.ndarray  # (209,) bool, canonical view
    value: float  # target from `player`'s perspective
    player: int


@dataclass
class GameRecord:
    moves: list[str]
    outcome: str  # 'win' | 'halted-max-plies' | 'halted-repetition'
    winner: Optional[int]
    plies: int
    seconds: float
    samples_kept: int


@dataclass
class SelfPlayStats:
    games: int = 0
    wins: list[int] = field(default_factory=lambda: [0, 0])
    halted_max_plies: int = 0
    halted_repetition: int = 0
    samples_kept: int = 0
    samples_discarded: int = 0
    plies: list[int] = field(default_factory=list)
    seconds: float = 0.0
    simulations: int = 0
    nn_positions: int = 0

    def to_dict(self) -> dict:
        d = asdict(self)
        d['avg_plies'] = float(np.mean(self.plies)) if self.plies else None
        d['seconds_per_game'] = self.seconds / self.games if self.games else None
        d['simulations_per_second'] = self.simulations / self.seconds if self.seconds else None
        return d


def random_opening(rng: np.random.Generator, plies: int) -> GameState:
    s = create_initial_state()
    for _ in range(plies):
        moves = legal_pawn_moves(s)
        s = apply_action_unchecked(s, moves[int(rng.integers(len(moves)))])
    return s


def _adjudicated_value(state: GameState, player: int) -> float:
    d0 = distance_to_row(state.h_walls, state.v_walls, state.pawns[0], goal_row(0))
    d1 = distance_to_row(state.h_walls, state.v_walls, state.pawns[1], goal_row(1))
    margin = (d1 - d0) + (0.5 if state.current_player == 0 else -0.5)
    v0 = 0.5 * math.tanh(margin / 3)
    return v0 if player == 0 else -v0


class _Game:
    def __init__(self, start: GameState, config: SelfPlayConfig, rng: np.random.Generator):
        self.state = start
        self.config = config
        self.rng = rng
        self.history: list[tuple[GameState, np.ndarray]] = []
        self.moves: list[str] = []
        self.seen: dict[GameState, int] = {start: 1}
        self.search: Optional[Search] = None
        self.outcome: Optional[str] = None
        self.t0 = time.perf_counter()

    def new_search(self) -> None:
        self.search = Search(self.state, self.config.mcts, self.rng)

    def play(self) -> None:
        """Choose and apply a move once the search is complete."""
        search = self.search
        plies_played = len(self.moves)
        temperature = 1.0 if plies_played < self.config.temperature_moves else 0.0
        self.history.append((self.state, search.visit_policy()))
        action = search.choose_action(temperature)
        a = decode_action(action)
        self.moves.append(format_action(a))
        self.state = apply_action_unchecked(self.state, a)
        self.search = None
        if self.state.winner is not None:
            self.outcome = 'win'
            return
        if plies_played + 1 >= self.config.max_plies:
            self.outcome = 'halted-max-plies'
            return
        self.seen[self.state] = self.seen.get(self.state, 0) + 1
        if self.seen[self.state] >= self.config.repetition_limit:
            self.outcome = 'halted-repetition'


def _samples_for(game: _Game, halted_policy: str) -> tuple[list[Sample], int]:
    winner = game.state.winner
    samples: list[Sample] = []
    for state, pi in game.history:
        p = state.current_player
        if winner is not None:
            z = 1.0 if winner == p else -1.0
        elif halted_policy == 'discard':
            return [], len(game.history)
        elif halted_policy == 'draw':
            z = 0.0
        elif halted_policy == 'adjudicate':
            z = _adjudicated_value(game.state, p)
        else:
            raise ValueError(f'unknown halted_policy {halted_policy!r}')
        samples.append(
            Sample(
                planes=encode_state_planes(state),
                policy=engine_policy_to_view(pi, p).astype(np.float32),
                mask=canonical_legal_mask(state),
                value=z,
                player=p,
            )
        )
    return samples, 0


def play_games(evaluator: Evaluator, config: SelfPlayConfig, num_games: int, seed: int) -> tuple[list[Sample], list[GameRecord], SelfPlayStats]:
    """Plays `num_games` self-play games, `config.parallel_games` at a time, batching leaves."""
    rng = np.random.default_rng(seed)
    stats = SelfPlayStats()
    samples: list[Sample] = []
    records: list[GameRecord] = []
    started = 0
    active: list[_Game] = []
    t_start = time.perf_counter()

    def start_game() -> _Game:
        game_rng = np.random.default_rng(rng.integers(2**63))
        return _Game(random_opening(game_rng, config.opening_plies), config, game_rng)

    while started < num_games or active:
        while started < num_games and len(active) < config.parallel_games:
            active.append(start_game())
            started += 1
        for g in active:
            if g.search is None:
                g.new_search()
        # One simulation per game; leaves needing the network are evaluated together.
        waiting: list[tuple[_Game, GameState]] = []
        for g in active:
            if not g.search.done():
                leaf = g.search.select_leaf()
                if leaf is not None:
                    waiting.append((g, leaf))
        if waiting:
            evals = evaluator.evaluate([leaf for _, leaf in waiting])
            stats.nn_positions += len(waiting)
            for (g, _), ev in zip(waiting, evals):
                g.search.provide(ev)
        still: list[_Game] = []
        for g in active:
            if g.search.done():
                stats.simulations += g.search.simulations
                g.play()
            if g.outcome is None:
                still.append(g)
                continue
            kept, discarded = _samples_for(g, config.halted_policy)
            samples.extend(kept)
            stats.games += 1
            stats.samples_kept += len(kept)
            stats.samples_discarded += discarded
            stats.plies.append(len(g.moves))
            if g.outcome == 'win':
                stats.wins[g.state.winner] += 1
            elif g.outcome == 'halted-max-plies':
                stats.halted_max_plies += 1
            else:
                stats.halted_repetition += 1
            records.append(GameRecord(g.moves, g.outcome, g.state.winner, len(g.moves), time.perf_counter() - g.t0, len(kept)))
        active = still
    stats.seconds = time.perf_counter() - t_start
    return samples, records, stats
