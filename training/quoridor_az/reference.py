"""Stage 6A implementations of the hot rule / encoding paths, kept unchanged as a reference.

engine.py and features.py now use the bitboard and caching fast paths (bitboard.py). These
originals are the straightforward ports of the TypeScript engine; tests require the fast paths
to return identical results (same values, same order), and benchmarks compare both.
Do not optimise this module.
"""

from __future__ import annotations

from collections import deque
from typing import Optional

import numpy as np

from .engine import (
    BOARD_SIZE,
    DIRECTIONS,
    NUM_CELLS,
    NUM_WALL_SLOTS,
    WALL_GRID,
    Coord,
    GameState,
    Move,
    Wall,
    can_step,
    cell_index,
    encode_action,
    goal_row,
    is_blocked,
    opponent_of,
    path_edge_set,
    shortest_path,
    wall_conflicts,
    wall_cuts_edges,
    with_wall,
)
from .features import DISTANCE_SCALE, NUM_FEATURE_PLANES


def distance_to_row(h_walls: int, v_walls: int, start: Coord, target_row: int) -> Optional[int]:
    if start[0] == target_row:
        return 0
    start_idx = cell_index(*start)
    dist = {start_idx: 0}
    queue = deque([start_idx])
    while queue:
        idx = queue.popleft()
        row, col = divmod(idx, BOARD_SIZE)
        for d_row, d_col in DIRECTIONS:
            if not can_step(h_walls, v_walls, row, col, d_row, d_col):
                continue
            nxt = cell_index(row + d_row, col + d_col)
            if nxt in dist:
                continue
            dist[nxt] = dist[idx] + 1
            if row + d_row == target_row:
                return dist[nxt]
            queue.append(nxt)
    return None


def has_path_to_row(h_walls: int, v_walls: int, start: Coord, target_row: int) -> bool:
    return distance_to_row(h_walls, v_walls, start, target_row) is not None


def distance_map(h_walls: int, v_walls: int, target_row: int) -> list[int]:
    dist = [-1] * NUM_CELLS
    queue = deque()
    for col in range(BOARD_SIZE):
        idx = cell_index(target_row, col)
        dist[idx] = 0
        queue.append(idx)
    while queue:
        idx = queue.popleft()
        row, col = divmod(idx, BOARD_SIZE)
        for d_row, d_col in DIRECTIONS:
            if not can_step(h_walls, v_walls, row, col, d_row, d_col):
                continue
            nxt = cell_index(row + d_row, col + d_col)
            if dist[nxt] != -1:
                continue
            dist[nxt] = dist[idx] + 1
            queue.append(nxt)
    return dist


def check_wall_placement(state: GameState, wall: Wall) -> str:
    if state.winner is not None:
        return 'game-over'
    if state.walls_remaining[state.current_player] <= 0:
        return 'no-walls-left'
    if not (0 <= wall.row < WALL_GRID and 0 <= wall.col < WALL_GRID):
        return 'out-of-bounds'
    if wall_conflicts(state.h_walls, state.v_walls, wall.orientation, wall.row, wall.col):
        return 'overlap'
    h, v = with_wall(state.h_walls, state.v_walls, wall.orientation, wall.row, wall.col)
    if not has_path_to_row(h, v, state.pawns[0], goal_row(0)):
        return 'blocks-path'
    if not has_path_to_row(h, v, state.pawns[1], goal_row(1)):
        return 'blocks-path'
    return 'ok'


def legal_pawn_moves(state: GameState, player: Optional[int] = None) -> list[Move]:
    if state.winner is not None:
        return []
    if player is None:
        player = state.current_player
    h, v = state.h_walls, state.v_walls
    s_row, s_col = state.pawns[player]
    other = state.pawns[opponent_of(player)]
    moves: list[Move] = []
    seen: set[Coord] = set()

    def add(row: int, col: int) -> None:
        if (row, col) not in seen:
            seen.add((row, col))
            moves.append(Move(row, col))

    for d_row, d_col in DIRECTIONS:
        if not can_step(h, v, s_row, s_col, d_row, d_col):
            continue
        nxt = (s_row + d_row, s_col + d_col)
        if nxt != other:
            add(*nxt)
            continue
        if can_step(h, v, other[0], other[1], d_row, d_col):
            add(other[0] + d_row, other[1] + d_col)
            continue
        sides = ((-1, 0), (1, 0)) if d_row == 0 else ((0, -1), (0, 1))
        for side_row, side_col in sides:
            if can_step(h, v, other[0], other[1], side_row, side_col):
                add(other[0] + side_row, other[1] + side_col)
    return moves


def legal_wall_placements_brute_force(state: GameState) -> list[Wall]:
    if state.winner is not None or state.walls_remaining[state.current_player] <= 0:
        return []
    return [Wall(o, r, c) for o in ('h', 'v') for r in range(WALL_GRID) for c in range(WALL_GRID) if check_wall_placement(state, Wall(o, r, c)) == 'ok']


def legal_wall_placements(state: GameState) -> list[Wall]:
    if state.winner is not None or state.walls_remaining[state.current_player] <= 0:
        return []
    h, v = state.h_walls, state.v_walls
    paths = [shortest_path(h, v, state.pawns[p], goal_row(p)) for p in (0, 1)]
    if paths[0] is None or paths[1] is None:
        return legal_wall_placements_brute_force(state)
    edges = [path_edge_set(paths[0]), path_edge_set(paths[1])]
    result: list[Wall] = []
    for orientation in ('h', 'v'):
        for row in range(WALL_GRID):
            for col in range(WALL_GRID):
                if wall_conflicts(h, v, orientation, row, col):
                    continue
                cuts0 = wall_cuts_edges(edges[0], orientation, row, col)
                cuts1 = wall_cuts_edges(edges[1], orientation, row, col)
                if cuts0 or cuts1:
                    nh, nv = with_wall(h, v, orientation, row, col)
                    if cuts0 and not has_path_to_row(nh, nv, state.pawns[0], goal_row(0)):
                        continue
                    if cuts1 and not has_path_to_row(nh, nv, state.pawns[1], goal_row(1)):
                        continue
                result.append(Wall(orientation, row, col))
    return result


def legal_actions(state: GameState) -> list:
    if state.winner is not None:
        return []
    return [*legal_pawn_moves(state), *legal_wall_placements(state)]


def legal_action_indices(state: GameState) -> list[int]:
    return [encode_action(a) for a in legal_actions(state)]


def _reverse_mask(mask: int) -> int:
    out = 0
    for i in range(NUM_WALL_SLOTS):
        if (mask >> i) & 1:
            out |= 1 << (NUM_WALL_SLOTS - 1 - i)
    return out


def canonical_view(state: GameState) -> tuple[int, int, tuple[int, int], tuple[int, int], int, int]:
    p = state.current_player
    o = 1 - p
    if p == 0:
        return state.h_walls, state.v_walls, state.pawns[0], state.pawns[1], state.walls_remaining[0], state.walls_remaining[1]
    rot = lambda c: (BOARD_SIZE - 1 - c[0], BOARD_SIZE - 1 - c[1])  # noqa: E731
    return (_reverse_mask(state.h_walls), _reverse_mask(state.v_walls), rot(state.pawns[p]), rot(state.pawns[o]), state.walls_remaining[p], state.walls_remaining[o])


def encode_state_planes(state: GameState) -> np.ndarray:
    h, v, me, opp, my_walls, opp_walls = canonical_view(state)
    planes = np.zeros((NUM_FEATURE_PLANES, BOARD_SIZE, BOARD_SIZE), dtype=np.float32)
    planes[0, me[0], me[1]] = 1.0
    planes[1, opp[0], opp[1]] = 1.0
    for r in range(WALL_GRID):
        for c in range(WALL_GRID):
            bit = r * WALL_GRID + c
            if (h >> bit) & 1:
                planes[2, r, c] = 1.0
            if (v >> bit) & 1:
                planes[3, r, c] = 1.0
    my_dist = distance_map(h, v, 0)
    opp_dist = distance_map(h, v, BOARD_SIZE - 1)
    for r in range(BOARD_SIZE):
        for c in range(BOARD_SIZE):
            if r < BOARD_SIZE - 1 and is_blocked(h, v, r, c, 1, 0):
                planes[4, r, c] = 1.0
            if c < BOARD_SIZE - 1 and is_blocked(h, v, r, c, 0, 1):
                planes[5, r, c] = 1.0
            dm = my_dist[r * BOARD_SIZE + c]
            do = opp_dist[r * BOARD_SIZE + c]
            planes[8, r, c] = 1.0 if dm < 0 else min(dm, DISTANCE_SCALE) / DISTANCE_SCALE
            planes[9, r, c] = 1.0 if do < 0 else min(do, DISTANCE_SCALE) / DISTANCE_SCALE
    planes[6] = my_walls / 10.0
    planes[7] = opp_walls / 10.0
    planes[10] = 1.0
    return planes
