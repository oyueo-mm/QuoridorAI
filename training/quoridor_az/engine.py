"""Quoridor rules — a line-by-line port of the TypeScript engine (src/engine).

The TypeScript engine is the reference. Coordinates, action order, wall legality reasons
and BFS conventions are identical, and tests replay fixtures produced by the TS engine
(training/fixtures/engine_fixtures.json).

Coordinates: row 0 is the top edge, row 8 the bottom; col 0 the left edge.
Player 0 moves first from (8, 4) towards row 0; player 1 from (0, 4) towards row 8.
A wall anchor (row, col) in 0..7 is the corner shared by cells (row, col), (row, col+1),
(row+1, col) and (row+1, col+1): 'h' lies below row `row` across cols col..col+1,
'v' lies right of col `col` across rows row..row+1.
Walls are stored as 64-bit masks (bit row*8 + col).

Hot paths (reachability, distances, legal moves and walls) run on bitboards with caches keyed
by the wall layout (bitboard.py). reference.py keeps the original straightforward versions;
tests check that both agree exactly, including the order of legal actions.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import NamedTuple, Optional, Union

from . import bitboard as bb

BOARD_SIZE = 9
WALL_GRID = 8
NUM_CELLS = 81
NUM_WALL_SLOTS = 64
WALLS_PER_PLAYER = 10
START_POSITIONS = ((8, 4), (0, 4))
# Fixed neighbour order (up, down, left, right), as in the TS engine.
DIRECTIONS = ((-1, 0), (1, 0), (0, -1), (0, 1))


class Move(NamedTuple):
    row: int
    col: int


class Wall(NamedTuple):
    orientation: str  # 'h' or 'v'
    row: int
    col: int


Action = Union[Move, Wall]
Coord = tuple[int, int]


@dataclass(frozen=True, slots=True)
class GameState:
    pawns: tuple[Coord, Coord]
    h_walls: int
    v_walls: int
    walls_remaining: tuple[int, int]
    current_player: int
    winner: Optional[int]
    ply: int


# ---------------------------------------------------------------- board helpers

def goal_row(player: int) -> int:
    return 0 if player == 0 else BOARD_SIZE - 1


def opponent_of(player: int) -> int:
    return 1 - player


def in_bounds(row: int, col: int) -> bool:
    return 0 <= row < BOARD_SIZE and 0 <= col < BOARD_SIZE


def is_wall_anchor_in_bounds(row: int, col: int) -> bool:
    return 0 <= row < WALL_GRID and 0 <= col < WALL_GRID


def cell_index(row: int, col: int) -> int:
    return row * BOARD_SIZE + col


def wall_index(row: int, col: int) -> int:
    return row * WALL_GRID + col


def has_h_wall(h_walls: int, row: int, col: int) -> bool:
    return is_wall_anchor_in_bounds(row, col) and (h_walls >> wall_index(row, col)) & 1 == 1


def has_v_wall(v_walls: int, row: int, col: int) -> bool:
    return is_wall_anchor_in_bounds(row, col) and (v_walls >> wall_index(row, col)) & 1 == 1


def is_blocked(h_walls: int, v_walls: int, row: int, col: int, d_row: int, d_col: int) -> bool:
    """True if a wall separates (row, col) from its neighbour in direction (d_row, d_col)."""
    if d_row == 1:
        return has_h_wall(h_walls, row, col) or has_h_wall(h_walls, row, col - 1)
    if d_row == -1:
        return has_h_wall(h_walls, row - 1, col) or has_h_wall(h_walls, row - 1, col - 1)
    if d_col == 1:
        return has_v_wall(v_walls, row, col) or has_v_wall(v_walls, row - 1, col)
    if d_col == -1:
        return has_v_wall(v_walls, row, col - 1) or has_v_wall(v_walls, row - 1, col - 1)
    raise ValueError(f"invalid direction ({d_row}, {d_col})")


def can_step(h_walls: int, v_walls: int, row: int, col: int, d_row: int, d_col: int) -> bool:
    return in_bounds(row + d_row, col + d_col) and not is_blocked(h_walls, v_walls, row, col, d_row, d_col)


# ---------------------------------------------------------------- pathfinding (pawns ignored)

def shortest_path(h_walls: int, v_walls: int, start: Coord, target_row: int) -> Optional[list[Coord]]:
    """BFS shortest path to any cell of `target_row` (start and goal included), or None."""
    if start[0] == target_row:
        return [start]
    start_idx = cell_index(*start)
    parent = {start_idx: start_idx}
    queue = deque([start_idx])
    while queue:
        idx = queue.popleft()
        row, col = divmod(idx, BOARD_SIZE)
        for d_row, d_col in DIRECTIONS:
            if not can_step(h_walls, v_walls, row, col, d_row, d_col):
                continue
            nxt = cell_index(row + d_row, col + d_col)
            if nxt in parent:
                continue
            parent[nxt] = idx
            if row + d_row == target_row:
                path = [nxt]
                while path[-1] != start_idx:
                    path.append(parent[path[-1]])
                return [divmod(i, BOARD_SIZE) for i in reversed(path)]
            queue.append(nxt)
    return None


def distance_to_row(h_walls: int, v_walls: int, start: Coord, target_row: int) -> Optional[int]:
    """Steps to `target_row`, or None if unreachable."""
    if start[0] == target_row:
        return 0
    return bb.distance_from_layers(bb.goal_layers(h_walls, v_walls, target_row), cell_index(*start))


def has_path_to_row(h_walls: int, v_walls: int, start: Coord, target_row: int) -> bool:
    return distance_to_row(h_walls, v_walls, start, target_row) is not None


def distance_map(h_walls: int, v_walls: int, target_row: int) -> list[int]:
    """Distance of every cell (row*9 + col) to `target_row`; -1 = unreachable."""
    dist = [-1] * NUM_CELLS
    for k, layer in enumerate(bb.goal_layers(h_walls, v_walls, target_row)):
        for idx in bb.bit_indices(layer):
            dist[idx] = k
    return dist


# ---------------------------------------------------------------- walls

def wall_conflicts(h_walls: int, v_walls: int, orientation: str, row: int, col: int) -> bool:
    """Overlap with a parallel wall or crossing a perpendicular one (touching is allowed)."""
    if orientation == 'h':
        return (
            has_h_wall(h_walls, row, col)
            or has_h_wall(h_walls, row, col - 1)
            or has_h_wall(h_walls, row, col + 1)
            or has_v_wall(v_walls, row, col)
        )
    return (
        has_v_wall(v_walls, row, col)
        or has_v_wall(v_walls, row - 1, col)
        or has_v_wall(v_walls, row + 1, col)
        or has_h_wall(h_walls, row, col)
    )


def with_wall(h_walls: int, v_walls: int, orientation: str, row: int, col: int) -> tuple[int, int]:
    bit = 1 << wall_index(row, col)
    return (h_walls | bit, v_walls) if orientation == 'h' else (h_walls, v_walls | bit)


def check_wall_placement(state: GameState, wall: Wall) -> str:
    """'ok', 'game-over', 'no-walls-left', 'out-of-bounds', 'overlap' or 'blocks-path'."""
    if state.winner is not None:
        return 'game-over'
    if state.walls_remaining[state.current_player] <= 0:
        return 'no-walls-left'
    if not is_wall_anchor_in_bounds(wall.row, wall.col):
        return 'out-of-bounds'
    if wall_conflicts(state.h_walls, state.v_walls, wall.orientation, wall.row, wall.col):
        return 'overlap'
    h, v = with_wall(state.h_walls, state.v_walls, wall.orientation, wall.row, wall.col)
    if not has_path_to_row(h, v, state.pawns[0], goal_row(0)):
        return 'blocks-path'
    if not has_path_to_row(h, v, state.pawns[1], goal_row(1)):
        return 'blocks-path'
    return 'ok'


def _edge_key(a: int, b: int) -> int:
    return a * NUM_CELLS + b if a < b else b * NUM_CELLS + a


def path_edge_set(path: list[Coord]) -> set[int]:
    return {_edge_key(cell_index(*path[i - 1]), cell_index(*path[i])) for i in range(1, len(path))}


def wall_cuts_edges(edges: set[int], orientation: str, row: int, col: int) -> bool:
    if orientation == 'h':
        return (
            _edge_key(cell_index(row, col), cell_index(row + 1, col)) in edges
            or _edge_key(cell_index(row, col + 1), cell_index(row + 1, col + 1)) in edges
        )
    return (
        _edge_key(cell_index(row, col), cell_index(row, col + 1)) in edges
        or _edge_key(cell_index(row + 1, col), cell_index(row + 1, col + 1)) in edges
    )


# ---------------------------------------------------------------- rules

def _can_step_open(open_s: int, open_e: int, row: int, col: int, d_row: int, d_col: int) -> bool:
    """can_step() on the open-edge bitboards of bitboard.open_masks."""
    if d_row == 1:
        return (open_s >> (row * BOARD_SIZE + col)) & 1 == 1
    if d_row == -1:
        return row > 0 and (open_s >> ((row - 1) * BOARD_SIZE + col)) & 1 == 1
    if d_col == 1:
        return (open_e >> (row * BOARD_SIZE + col)) & 1 == 1
    return col > 0 and (open_e >> (row * BOARD_SIZE + col - 1)) & 1 == 1


def legal_pawn_move_cells(state: GameState, player: Optional[int] = None) -> list[int]:
    """Destination cells (row*9 + col) of the legal pawn moves, in the TS engine's order:
    per direction, step / straight jump / diagonals."""
    if state.winner is not None:
        return []
    if player is None:
        player = state.current_player
    open_s, open_e = bb.open_masks(state.h_walls, state.v_walls)
    s_row, s_col = state.pawns[player]
    o_row, o_col = state.pawns[1 - player]
    cells: list[int] = []
    for d_row, d_col in DIRECTIONS:
        if not _can_step_open(open_s, open_e, s_row, s_col, d_row, d_col):
            continue
        n_row = s_row + d_row
        n_col = s_col + d_col
        if n_row != o_row or n_col != o_col:
            cell = n_row * BOARD_SIZE + n_col
            if cell not in cells:
                cells.append(cell)
            continue
        if _can_step_open(open_s, open_e, o_row, o_col, d_row, d_col):
            cell = (o_row + d_row) * BOARD_SIZE + o_col + d_col
            if cell not in cells:
                cells.append(cell)
            continue
        sides = ((-1, 0), (1, 0)) if d_row == 0 else ((0, -1), (0, 1))
        for side_row, side_col in sides:
            if _can_step_open(open_s, open_e, o_row, o_col, side_row, side_col):
                cell = (o_row + side_row) * BOARD_SIZE + o_col + side_col
                if cell not in cells:
                    cells.append(cell)
    return cells


def legal_pawn_moves(state: GameState, player: Optional[int] = None) -> list[Move]:
    """Same order as the TS engine: per direction, step / straight jump / diagonals."""
    return [MOVES[c] for c in legal_pawn_move_cells(state, player)]


def legal_wall_indices(state: GameState) -> list[int]:
    """Action indices of all legal walls, 'h' first, row-major (the TS engine's order).

    legal = geometrically free and not disconnecting either player. Both parts depend only on
    the walls (and one pawn each), so they are memoised in bitboard.py."""
    if state.winner is not None or state.walls_remaining[state.current_player] <= 0:
        return []
    h, v = state.h_walls, state.v_walls
    free_h, free_v = bb.free_wall_slots(h, v)
    (r0, c0), (r1, c1) = state.pawns
    b0h, b0v = bb.disconnecting_walls(h, v, r0 * BOARD_SIZE + c0, goal_row(0))
    b1h, b1v = bb.disconnecting_walls(h, v, r1 * BOARD_SIZE + c1, goal_row(1))
    return bb.bit_indices(free_h & ~(b0h | b1h), H_WALL_ACTION_OFFSET) + bb.bit_indices(free_v & ~(b0v | b1v), V_WALL_ACTION_OFFSET)


def legal_wall_placements(state: GameState) -> list[Wall]:
    """All legal walls, 'h' first, row-major."""
    return [ACTIONS[i] for i in legal_wall_indices(state)]


def legal_wall_placements_brute_force(state: GameState) -> list[Wall]:
    if state.winner is not None or state.walls_remaining[state.current_player] <= 0:
        return []
    return [
        Wall(o, r, c)
        for o in ('h', 'v')
        for r in range(WALL_GRID)
        for c in range(WALL_GRID)
        if check_wall_placement(state, Wall(o, r, c)) == 'ok'
    ]


def legal_actions(state: GameState) -> list[Action]:
    """Pawn moves first, then walls — the TS engine's order."""
    return [ACTIONS[i] for i in legal_action_indices(state)]


def is_legal_action(state: GameState, action: Action) -> bool:
    if state.winner is not None:
        return False
    if isinstance(action, Move):
        return action in legal_pawn_moves(state)
    return check_wall_placement(state, action) == 'ok'


class IllegalActionError(ValueError):
    pass


def apply_action(state: GameState, action: Action) -> GameState:
    if not is_legal_action(state, action):
        raise IllegalActionError(f"illegal action {action!r}")
    return apply_action_unchecked(state, action)


def apply_action_unchecked(state: GameState, action: Action) -> GameState:
    """Transition without the legality check (only for engine-generated actions)."""
    player = state.current_player
    if isinstance(action, Move):
        cell = (action.row, action.col)
        pawns = (cell, state.pawns[1]) if player == 0 else (state.pawns[0], cell)
        if action.row == goal_row(player):
            return GameState(pawns, state.h_walls, state.v_walls, state.walls_remaining, player, player, state.ply + 1)
        return GameState(pawns, state.h_walls, state.v_walls, state.walls_remaining, 1 - player, None, state.ply + 1)
    h, v = with_wall(state.h_walls, state.v_walls, action.orientation, action.row, action.col)
    w0, w1 = state.walls_remaining
    remaining = (w0 - 1, w1) if player == 0 else (w0, w1 - 1)
    return GameState(state.pawns, h, v, remaining, 1 - player, None, state.ply + 1)


def create_initial_state() -> GameState:
    return GameState(START_POSITIONS, 0, 0, (WALLS_PER_PLAYER, WALLS_PER_PLAYER), 0, None, 0)


def create_state(
    pawns: tuple[Coord, Coord] = START_POSITIONS,
    walls: tuple[tuple[str, int, int], ...] = (),
    walls_remaining: tuple[int, int] = (WALLS_PER_PLAYER, WALLS_PER_PLAYER),
    current_player: int = 0,
    ply: int = 0,
) -> GameState:
    """Builds a rule-consistent position (same validation as the TS createState)."""
    for p in pawns:
        if not in_bounds(*p):
            raise ValueError(f"pawn off board: {p}")
    if pawns[0] == pawns[1]:
        raise ValueError("pawns cannot share a cell")
    h = v = 0
    for orientation, row, col in walls:
        if not is_wall_anchor_in_bounds(row, col):
            raise ValueError(f"wall off board: {(orientation, row, col)}")
        if wall_conflicts(h, v, orientation, row, col):
            raise ValueError(f"wall conflicts: {(orientation, row, col)}")
        h, v = with_wall(h, v, orientation, row, col)
    for player in (0, 1):
        if not has_path_to_row(h, v, pawns[player], goal_row(player)):
            raise ValueError(f"player {player} has no path to the goal")
    reached0 = pawns[0][0] == goal_row(0)
    reached1 = pawns[1][0] == goal_row(1)
    if reached0 and reached1:
        raise ValueError("both players cannot be on their goal rows")
    winner = 0 if reached0 else 1 if reached1 else None
    return GameState((tuple(pawns[0]), tuple(pawns[1])), h, v, tuple(walls_remaining), current_player, winner, ply)


# ---------------------------------------------------------------- action encoding (209)

MOVE_ACTION_OFFSET = 0
H_WALL_ACTION_OFFSET = NUM_CELLS
V_WALL_ACTION_OFFSET = NUM_CELLS + NUM_WALL_SLOTS
ACTION_SPACE_SIZE = NUM_CELLS + 2 * NUM_WALL_SLOTS


def encode_action(action: Action) -> int:
    """Same layout as src/engine/encoding.ts: [0,81) moves, [81,145) h walls, [145,209) v walls."""
    if isinstance(action, Move):
        return MOVE_ACTION_OFFSET + cell_index(action.row, action.col)
    offset = H_WALL_ACTION_OFFSET if action.orientation == 'h' else V_WALL_ACTION_OFFSET
    return offset + wall_index(action.row, action.col)


def _decode_action(index: int) -> Action:
    if index < H_WALL_ACTION_OFFSET:
        return Move(*divmod(index - MOVE_ACTION_OFFSET, BOARD_SIZE))
    orientation = 'h' if index < V_WALL_ACTION_OFFSET else 'v'
    slot = index - (H_WALL_ACTION_OFFSET if orientation == 'h' else V_WALL_ACTION_OFFSET)
    return Wall(orientation, *divmod(slot, WALL_GRID))


# Every action object, by index (actions are immutable, so they are shared).
ACTIONS: tuple[Action, ...] = tuple(_decode_action(i) for i in range(ACTION_SPACE_SIZE))
MOVES: tuple[Move, ...] = ACTIONS[MOVE_ACTION_OFFSET:H_WALL_ACTION_OFFSET]


def decode_action(index: int) -> Action:
    if not 0 <= index < ACTION_SPACE_SIZE:
        raise ValueError(f"action index out of range: {index}")
    return ACTIONS[index]


def legal_action_indices(state: GameState) -> list[int]:
    """Engine order: pawn moves first, then walls."""
    if state.winner is not None:
        return []
    return [MOVE_ACTION_OFFSET + c for c in legal_pawn_move_cells(state)] + legal_wall_indices(state)


# ---------------------------------------------------------------- notation

FILES = 'abcdefghi'


def format_coord(row: int, col: int) -> str:
    return f"{FILES[col]}{BOARD_SIZE - row}"


def format_action(action: Action) -> str:
    if isinstance(action, Move):
        return format_coord(action.row, action.col)
    return f"{format_coord(action.row + 1, action.col)}{action.orientation}"


def parse_action(state: GameState, notation: str) -> Optional[Action]:
    n = notation.strip().lower()
    return next((a for a in legal_actions(state) if format_action(a) == n), None)


# ---------------------------------------------------------------- serialization (fixture format)

def state_to_dict(state: GameState) -> dict:
    return {
        'pawns': [list(state.pawns[0]), list(state.pawns[1])],
        'h': [i for i in range(NUM_WALL_SLOTS) if (state.h_walls >> i) & 1],
        'v': [i for i in range(NUM_WALL_SLOTS) if (state.v_walls >> i) & 1],
        'walls': list(state.walls_remaining),
        'player': state.current_player,
        'winner': state.winner,
        'ply': state.ply,
    }


def state_from_dict(d: dict) -> GameState:
    h = sum(1 << i for i in d['h'])
    v = sum(1 << i for i in d['v'])
    pawns = (tuple(d['pawns'][0]), tuple(d['pawns'][1]))
    return GameState(pawns, h, v, (d['walls'][0], d['walls'][1]), d['player'], d['winner'], d['ply'])
