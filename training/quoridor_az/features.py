"""Neural-network state encoding — mirrors src/engine/tensor.ts (version FEATURE_VERSION).

Canonical view: the board is seen from the player to move ("me"). Player 1's view is the
board rotated by 180° (cell (r, c) -> (8-r, 8-c), wall anchor (r, c) -> (7-r, 7-c)), so "me"
always heads for row 0 and the opponent for row 8.

Planes (11 x 9 x 9, float32, view coordinates):
    0  my pawn                      6  my walls in hand / 10
    1  opponent pawn                7  opponent walls in hand / 10
    2  horizontal wall anchors      8  my BFS distance to my goal row / 80 (unreachable = 1)
    3  vertical wall anchors        9  opponent BFS distance / 80 (unreachable = 1)
    4  south edge blocked          10  ones
    5  east edge blocked

Actions: the 209-index layout of encoding.ts in view coordinates. canonical_action_index is an
involution (engine -> view and view -> engine).
"""

from __future__ import annotations

import numpy as np

from .engine import (
    ACTION_SPACE_SIZE,
    BOARD_SIZE,
    H_WALL_ACTION_OFFSET,
    NUM_CELLS,
    NUM_WALL_SLOTS,
    V_WALL_ACTION_OFFSET,
    WALL_GRID,
    GameState,
    distance_map,
    is_blocked,
    legal_action_indices,
)

FEATURE_VERSION = 'qz-features-v1'
NUM_FEATURE_PLANES = 11
DISTANCE_SCALE = 80


def canonical_action_index(index: int, player: int) -> int:
    if player == 0:
        return index
    if index < H_WALL_ACTION_OFFSET:
        return NUM_CELLS - 1 - index
    if index < V_WALL_ACTION_OFFSET:
        return H_WALL_ACTION_OFFSET + (NUM_WALL_SLOTS - 1 - (index - H_WALL_ACTION_OFFSET))
    return V_WALL_ACTION_OFFSET + (NUM_WALL_SLOTS - 1 - (index - V_WALL_ACTION_OFFSET))


# Permutation tables: VIEW_TO_ENGINE[player][view_index] = engine_index (and vice versa, same table).
_PERMUTATIONS = [np.arange(ACTION_SPACE_SIZE), np.array([canonical_action_index(i, 1) for i in range(ACTION_SPACE_SIZE)])]


def action_permutation(player: int) -> np.ndarray:
    return _PERMUTATIONS[player]


def _reverse_mask(mask: int) -> int:
    out = 0
    for i in range(NUM_WALL_SLOTS):
        if (mask >> i) & 1:
            out |= 1 << (NUM_WALL_SLOTS - 1 - i)
    return out


def canonical_view(state: GameState) -> tuple[int, int, tuple[int, int], tuple[int, int], int, int]:
    """(h_walls, v_walls, my_pawn, opponent_pawn, my_walls, opponent_walls) in view coordinates."""
    p = state.current_player
    o = 1 - p
    if p == 0:
        return state.h_walls, state.v_walls, state.pawns[0], state.pawns[1], state.walls_remaining[0], state.walls_remaining[1]
    rot = lambda c: (BOARD_SIZE - 1 - c[0], BOARD_SIZE - 1 - c[1])  # noqa: E731
    return (
        _reverse_mask(state.h_walls),
        _reverse_mask(state.v_walls),
        rot(state.pawns[p]),
        rot(state.pawns[o]),
        state.walls_remaining[p],
        state.walls_remaining[o],
    )


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


def legal_mask(state: GameState) -> np.ndarray:
    """Boolean mask over engine action indices."""
    mask = np.zeros(ACTION_SPACE_SIZE, dtype=bool)
    mask[legal_action_indices(state)] = True
    return mask


def canonical_legal_mask(state: GameState) -> np.ndarray:
    """Mask over view action indices (what the policy head predicts)."""
    return legal_mask(state)[action_permutation(state.current_player)]


def view_policy_to_engine(policy_view: np.ndarray, player: int) -> np.ndarray:
    """Re-index a policy over view actions into engine action order."""
    return policy_view[action_permutation(player)]


def engine_policy_to_view(policy_engine: np.ndarray, player: int) -> np.ndarray:
    return policy_engine[action_permutation(player)]
