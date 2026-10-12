"""Self-play with neural MCTS.

Several games run in lockstep. Every round each unfinished game descends its search tree up to
`leaves_per_game` times (virtual loss keeps those descents apart, see mcts.py), and all leaves
of all games are evaluated in one network batch. Batch size per round is therefore about
parallel_games × leaves_per_game (minus cache hits, duplicates and terminal leaves).

Samples store the canonical-view planes, the root visit distribution re-indexed to the
canonical view (= the policy head's output space), the legal mask in that view, the player
to move and the value target from that player's perspective.

Halted games (ply limit or repeated position) have no winner. What happens to their samples
is an explicit policy (SelfPlayConfig.halted_policy):
    'discard'      drop them (default — no fabricated labels)
    'policy-only'  keep them for the policy loss only (value_weight 0, no value label invented)
    'draw'         value target 0
    'adjudicate'   value target 0.5 * tanh(race margin / 3) from the BFS distances (weak label)
The counts are reported in SelfPlayStats either way.

Instrumentation: SelfPlayStats splits wall time into selection (tree descent), evaluation
(encoding + legal actions + network, see EvalStats), backup and move/sample handling, records
how long leaves wait for their batch, and the process CPU time. A failed or interrupted call
releases the pending leaves and re-raises; it returns no partial samples, so the caller's
state (replay buffer, checkpoint) is unchanged.
"""

from __future__ import annotations

import math
import time
from dataclasses import asdict, dataclass, field
from typing import Optional

import numpy as np

from .engine import (
    ACTIONS,
    GameState,
    apply_action_unchecked,
    create_initial_state,
    distance_to_row,
    format_action,
    goal_row,
    legal_pawn_moves,
)
from .evaluator import Evaluator
from .features import canonical_legal_mask, encode_state_planes, engine_policy_to_view
from .mcts import MctsConfig, Search

HALTED_POLICIES = ('discard', 'policy-only', 'draw', 'adjudicate')


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
    # Leaves collected per game per round (virtual loss when > 1).
    leaves_per_game: int = 1

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
    value_weight: float = 1.0  # 0 = no value label (policy-only samples)


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
    abandoned: int = 0  # unfinished games dropped at the time budget
    samples_kept: int = 0
    samples_discarded: int = 0
    samples_value_masked: int = 0  # kept for the policy only
    plies: list[int] = field(default_factory=list)
    seconds: float = 0.0
    cpu_seconds: float = 0.0
    simulations: int = 0
    moves: int = 0  # plies played, including games abandoned at the time budget
    nn_positions: int = 0  # leaves sent to the evaluator
    rounds: int = 0
    collisions: int = 0
    select_seconds: float = 0.0
    eval_seconds: float = 0.0
    backup_seconds: float = 0.0
    move_seconds: float = 0.0
    leaf_wait_seconds: float = 0.0  # summed over leaves: selection -> start of their batch
    evaluator: dict = field(default_factory=dict)  # EvalStats changes during this call

    def to_dict(self) -> dict:
        d = asdict(self)
        d['avg_plies'] = float(np.mean(self.plies)) if self.plies else None
        d['seconds_per_game'] = self.seconds / self.games if self.games else None
        d['simulations_per_second'] = self.simulations / self.seconds if self.seconds else None
        d['samples_per_second'] = self.samples_kept / self.seconds if self.seconds else None
        d['moves_per_second'] = self.moves / self.seconds if self.seconds else None
        d['leaves_per_round'] = self.nn_positions / self.rounds if self.rounds else None
        d['mean_leaf_wait_ms'] = 1000 * self.leaf_wait_seconds / self.nn_positions if self.nn_positions else None
        d['cpu_utilisation'] = self.cpu_seconds / self.seconds if self.seconds else None
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
        a = ACTIONS[search.choose_action(temperature)]
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
    """(samples, number of discarded positions)."""
    if halted_policy not in HALTED_POLICIES:
        raise ValueError(f'unknown halted_policy {halted_policy!r}')
    winner = game.state.winner
    if winner is None and halted_policy == 'discard':
        return [], len(game.history)
    samples: list[Sample] = []
    for state, pi in game.history:
        p = state.current_player
        weight = 1.0
        if winner is not None:
            z = 1.0 if winner == p else -1.0
        elif halted_policy == 'policy-only':
            z = 0.0
            weight = 0.0
        elif halted_policy == 'draw':
            z = 0.0
        else:
            z = _adjudicated_value(game.state, p)
        samples.append(Sample(planes=encode_state_planes(state), policy=engine_policy_to_view(pi, p).astype(np.float32), mask=canonical_legal_mask(state), value=z, player=p, value_weight=weight))
    return samples, 0


_EVAL_COUNTERS = ('calls', 'nn_calls', 'positions', 'cache_hits', 'duplicates', 'encode_seconds', 'legal_seconds', 'inference_seconds', 'post_seconds', 'oom_splits')


def _eval_snapshot(evaluator) -> Optional[tuple[dict, int]]:
    st = getattr(evaluator, 'stats', None)
    if st is None:
        return None
    return {k: getattr(st, k, 0) for k in _EVAL_COUNTERS}, len(getattr(st, 'batch_sizes', []))


def _eval_delta(evaluator, before: Optional[tuple[dict, int]]) -> dict:
    if before is None:
        return {}
    st = evaluator.stats
    out = {k: getattr(st, k, 0) - v for k, v in before[0].items()}
    batches = list(getattr(st, 'batch_sizes', []))[before[1] :]
    out['evaluated'] = int(sum(batches))
    out['batches'] = len(batches)
    out['mean_batch'] = float(np.mean(batches)) if batches else None
    out['max_batch'] = int(max(batches)) if batches else None
    out['cache_hit_rate'] = out['cache_hits'] / out['positions'] if out.get('positions') else None
    return out


def play_games(evaluator: Evaluator, config: SelfPlayConfig, num_games: int, seed: int, time_budget: Optional[float] = None) -> tuple[list[Sample], list[GameRecord], SelfPlayStats]:
    """Plays `num_games` self-play games, `config.parallel_games` at a time, batching leaves.

    time_budget (seconds): stop starting games once exceeded and drop the unfinished ones
    (counted as `abandoned`, no samples) — for bounded measurements and notebook cells."""
    if config.halted_policy not in HALTED_POLICIES:
        raise ValueError(f'unknown halted_policy {config.halted_policy!r}')
    rng = np.random.default_rng(seed)
    stats = SelfPlayStats()
    samples: list[Sample] = []
    records: list[GameRecord] = []
    started = 0
    active: list[_Game] = []
    k = max(1, config.leaves_per_game)
    eval_before = _eval_snapshot(evaluator)
    t_start = time.perf_counter()
    cpu_start = time.process_time()

    def start_game() -> _Game:
        game_rng = np.random.default_rng(rng.integers(2**63))
        return _Game(random_opening(game_rng, config.opening_plies), config, game_rng)

    try:
        while started < num_games or active:
            if time_budget is not None and time.perf_counter() - t_start > time_budget:
                stats.abandoned += len(active) + (num_games - started)
                break
            while started < num_games and len(active) < config.parallel_games:
                active.append(start_game())
                started += 1
            t0 = time.perf_counter()
            for g in active:
                if g.search is None:
                    g.new_search()
            # Up to k descents per game; leaves needing the network are evaluated together.
            batch: list[GameState] = []
            owners: list[tuple[_Game, int]] = []
            marks: list[tuple[float, int]] = []
            for g in active:
                if not g.search.done():
                    leaves = g.search.select_leaves(k)
                    if leaves:
                        batch.extend(leaves)
                        owners.append((g, len(leaves)))
                        marks.append((time.perf_counter(), len(leaves)))
            t1 = time.perf_counter()
            if batch:
                evals = evaluator.evaluate(batch)
                stats.leaf_wait_seconds += sum(n * (t1 - t) for t, n in marks)
                stats.nn_positions += len(batch)
            t2 = time.perf_counter()
            if batch:
                pos = 0
                for g, n in owners:
                    g.search.provide_many(evals[pos : pos + n])
                    pos += n
            t3 = time.perf_counter()
            still: list[_Game] = []
            for g in active:
                if g.search.done():
                    stats.simulations += g.search.simulations
                    stats.collisions += g.search.collisions
                    stats.moves += 1
                    g.play()
                if g.outcome is None:
                    still.append(g)
                    continue
                kept, discarded = _samples_for(g, config.halted_policy)
                samples.extend(kept)
                stats.games += 1
                stats.samples_kept += len(kept)
                stats.samples_discarded += discarded
                stats.samples_value_masked += sum(1 for s in kept if s.value_weight == 0.0)
                stats.plies.append(len(g.moves))
                if g.outcome == 'win':
                    stats.wins[g.state.winner] += 1
                elif g.outcome == 'halted-max-plies':
                    stats.halted_max_plies += 1
                else:
                    stats.halted_repetition += 1
                records.append(GameRecord(g.moves, g.outcome, g.state.winner, len(g.moves), time.perf_counter() - g.t0, len(kept)))
            active = still
            t4 = time.perf_counter()
            stats.rounds += 1
            stats.select_seconds += t1 - t0
            stats.eval_seconds += t2 - t1
            stats.backup_seconds += t3 - t2
            stats.move_seconds += t4 - t3
    except BaseException:
        for g in active:
            if g.search is not None:
                g.search.cancel_pending()
        raise
    stats.seconds = time.perf_counter() - t_start
    stats.cpu_seconds = time.process_time() - cpu_start
    stats.evaluator = _eval_delta(evaluator, eval_before)
    return samples, records, stats
