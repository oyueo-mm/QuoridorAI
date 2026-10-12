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

Speed: planes 2-5, 8 and 9 depend only on the walls (in view coordinates), so they are built
once per wall layout from bitboards and cached (wall_planes); a position then only adds its
pawns and wall counts. reference.encode_state_planes is the original cell-by-cell version and
tests require identical arrays.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from . import bitboard as bb
from .engine import (
    ACTION_SPACE_SIZE,
    BOARD_SIZE,
    H_WALL_ACTION_OFFSET,
    NUM_CELLS,
    NUM_WALL_SLOTS,
    V_WALL_ACTION_OFFSET,
    GameState,
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
    """Bit i -> bit 63 - i (the 180° rotation of the wall grid)."""
    return int(format(mask, '064b')[::-1], 2)


def canonical_view(state: GameState) -> tuple[int, int, tuple[int, int], tuple[int, int], int, int]:
    """(h_walls, v_walls, my_pawn, opponent_pawn, my_walls, opponent_walls) in view coordinates."""
    p = state.current_player
    if p == 0:
        return state.h_walls, state.v_walls, state.pawns[0], state.pawns[1], state.walls_remaining[0], state.walls_remaining[1]
    (r1, c1), (r0, c0) = state.pawns[1], state.pawns[0]
    last = BOARD_SIZE - 1
    return _reverse_mask(state.h_walls), _reverse_mask(state.v_walls), (last - r1, last - c1), (last - r0, last - c0), state.walls_remaining[1], state.walls_remaining[0]


def _bits(mask: int, nbytes: int, n: int) -> np.ndarray:
    return np.unpackbits(np.frombuffer(mask.to_bytes(nbytes, 'little'), dtype=np.uint8), bitorder='little')[:n]


def _distance_plane(layers: tuple[int, ...]) -> np.ndarray:
    """min(d, 80) / 80 per cell from BFS layers; unreachable cells = 1."""
    buf = b''.join(layer.to_bytes(11, 'little') for layer in layers)
    bits = np.unpackbits(np.frombuffer(buf, dtype=np.uint8), bitorder='little').reshape(len(layers), 88)[:, :NUM_CELLS]
    dist = (bits * np.arange(len(layers))[:, None]).sum(axis=0)
    return np.where(bits.any(axis=0), np.minimum(dist, DISTANCE_SCALE) / DISTANCE_SCALE, 1.0).reshape(BOARD_SIZE, BOARD_SIZE)


WALL_PLANE_CACHE_SIZE = 1 << 14  # about 2 KB per entry


@lru_cache(maxsize=WALL_PLANE_CACHE_SIZE)
def wall_planes(h_walls: int, v_walls: int) -> np.ndarray:
    """Planes 2, 3, 4, 5, 8, 9 (in that order) for a wall layout in view coordinates. Read-only."""
    out = np.zeros((6, BOARD_SIZE, BOARD_SIZE), dtype=np.float32)
    out[0, :8, :8] = _bits(h_walls, 8, 64).reshape(8, 8)
    out[1, :8, :8] = _bits(v_walls, 8, 64).reshape(8, 8)
    south, east = bb.blocked_masks(h_walls, v_walls)
    out[2] = _bits(south, 11, NUM_CELLS).reshape(BOARD_SIZE, BOARD_SIZE)
    out[3] = _bits(east, 11, NUM_CELLS).reshape(BOARD_SIZE, BOARD_SIZE)
    out[4] = _distance_plane(bb.goal_layers(h_walls, v_walls, 0))
    out[5] = _distance_plane(bb.goal_layers(h_walls, v_walls, BOARD_SIZE - 1))
    out.setflags(write=False)
    return out


def encode_into(state: GameState, out: np.ndarray) -> None:
    """Writes the planes of `state` into a zero-filled (11, 9, 9) float32 array."""
    h, v, me, opp, my_walls, opp_walls = canonical_view(state)
    static = wall_planes(h, v)
    out[0, me[0], me[1]] = 1.0
    out[1, opp[0], opp[1]] = 1.0
    out[2:6] = static[0:4]
    out[6] = my_walls / 10.0
    out[7] = opp_walls / 10.0
    out[8:10] = static[4:6]
    out[10] = 1.0


def encode_state_planes(state: GameState) -> np.ndarray:
    planes = np.zeros((NUM_FEATURE_PLANES, BOARD_SIZE, BOARD_SIZE), dtype=np.float32)
    encode_into(state, planes)
    return planes


def encode_batch(states: list[GameState]) -> np.ndarray:
    """(B, 11, 9, 9) float32 — one allocation for the whole batch."""
    planes = np.zeros((len(states), NUM_FEATURE_PLANES, BOARD_SIZE, BOARD_SIZE), dtype=np.float32)
    for i, s in enumerate(states):
        encode_into(s, planes[i])
    return planes


def clear_caches() -> None:
    wall_planes.cache_clear()
    bb.clear_caches()


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
