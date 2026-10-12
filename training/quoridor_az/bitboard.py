"""Bitboard primitives for the fast rule paths (pure Python integers, no extra dependencies).

Cells are bits of an 81-bit integer (bit row*9 + col), wall anchors bits of a 64-bit integer
(bit row*8 + col), exactly as in engine.GameState. A flood fill advances a whole BFS layer with
a handful of shifts and masks, so reachability and distance maps cost microseconds instead of
a Python-level BFS over cells.

Everything here is a pure function of integers. The functions that depend only on the wall
layout are memoised: during a search most positions differ from their parent only by a pawn
move, so the wall-dependent work (open edges, free wall slots, distance maps, which walls
would cut a player off) is shared by many positions.

engine.py and features.py build on these helpers; reference.py keeps the original
(Stage 6A) implementations, and tests check that both give identical results.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

BOARD_SIZE = 9
WALL_GRID = 8
NUM_CELLS = 81
FULL = (1 << NUM_CELLS) - 1
WALL_ALL = (1 << 64) - 1
ROW_MASKS = tuple(((1 << BOARD_SIZE) - 1) << (BOARD_SIZE * r) for r in range(BOARD_SIZE))
LAST_COL = sum(1 << (BOARD_SIZE * r + BOARD_SIZE - 1) for r in range(BOARD_SIZE))
NOT_LAST_COL = FULL & ~LAST_COL
NOT_LAST_ROW = FULL & ~ROW_MASKS[BOARD_SIZE - 1]
WALL_COL0 = sum(1 << (WALL_GRID * r) for r in range(WALL_GRID))
WALL_COL7 = sum(1 << (WALL_GRID * r + WALL_GRID - 1) for r in range(WALL_GRID))

# Bit positions set in each byte value, for fast iteration over set bits.
_BYTE_BITS = tuple(tuple(i for i in range(8) if (b >> i) & 1) for b in range(256))

CACHE_SIZE = 1 << 16


def bit_indices(mask: int, offset: int = 0) -> list[int]:
    """Positions of the set bits of a non-negative integer, ascending, plus `offset`."""
    out: list[int] = []
    base = offset
    while mask:
        byte = mask & 0xFF
        if byte:
            out.extend(base + i for i in _BYTE_BITS[byte])
        mask >>= 8
        base += 8
    return out


def spread_walls(mask64: int) -> int:
    """Maps wall bit (r*8 + c) to cell bit (r*9 + c)."""
    out = 0
    for r in range(WALL_GRID):
        out |= ((mask64 >> (WALL_GRID * r)) & 0xFF) << (BOARD_SIZE * r)
    return out


@lru_cache(maxsize=CACHE_SIZE)
def blocked_masks(h_walls: int, v_walls: int) -> tuple[int, int]:
    """(south_blocked, east_blocked): cells whose south / east edge is crossed by a wall."""
    sh = spread_walls(h_walls)
    sv = spread_walls(v_walls)
    return sh | (sh << 1), sv | (sv << BOARD_SIZE)


@lru_cache(maxsize=CACHE_SIZE)
def open_masks(h_walls: int, v_walls: int) -> tuple[int, int]:
    """(open_south, open_east): cells that can step south / east (board edges excluded)."""
    south, east = blocked_masks(h_walls, v_walls)
    return NOT_LAST_ROW & ~south, NOT_LAST_COL & ~east


def expand(cells: int, open_s: int, open_e: int) -> int:
    """All cells one legal step away from `cells` (in any direction)."""
    return ((cells & open_s) << BOARD_SIZE) | ((cells >> BOARD_SIZE) & open_s) | ((cells & open_e) << 1) | ((cells >> 1) & open_e)


def connects(start: int, target: int, open_s: int, open_e: int) -> bool:
    """True if some cell of `start` can walk to some cell of `target`."""
    reach = start
    frontier = start
    while frontier:
        if reach & target:
            return True
        frontier = expand(frontier, open_s, open_e) & ~reach
        reach |= frontier
    return False


def bfs_layers(start: int, open_s: int, open_e: int) -> list[int]:
    """BFS layers from the cells of `start`: layers[k] = cells at distance exactly k."""
    layers = [start]
    reach = start
    frontier = start
    while True:
        frontier = expand(frontier, open_s, open_e) & ~reach
        if not frontier:
            return layers
        reach |= frontier
        layers.append(frontier)


@lru_cache(maxsize=CACHE_SIZE)
def goal_layers(h_walls: int, v_walls: int, target_row: int) -> tuple[int, ...]:
    """BFS layers from the whole of `target_row` (distance of every cell to that row)."""
    open_s, open_e = open_masks(h_walls, v_walls)
    return tuple(bfs_layers(ROW_MASKS[target_row], open_s, open_e))


def distance_from_layers(layers: tuple[int, ...], cell: int) -> Optional[int]:
    bit = 1 << cell
    for k, layer in enumerate(layers):
        if layer & bit:
            return k
    return None


@lru_cache(maxsize=CACHE_SIZE)
def free_wall_slots(h_walls: int, v_walls: int) -> tuple[int, int]:
    """(free_h, free_v): anchors where a wall would neither overlap nor cross an existing wall."""
    occupied_h = h_walls | ((h_walls << 1) & ~WALL_COL0) | ((h_walls >> 1) & ~WALL_COL7) | v_walls
    occupied_v = v_walls | (v_walls << WALL_GRID) | (v_walls >> WALL_GRID) | h_walls
    return WALL_ALL & ~occupied_h, WALL_ALL & ~occupied_v


def _path_edges(layers: tuple[int, ...], cell: int, open_s: int, open_e: int) -> Optional[list[tuple[int, int]]]:
    """Edges (lower cell, higher cell) of one shortest path from `cell` to the goal row of
    `layers`; None if the cell cannot reach it."""
    depth = distance_from_layers(layers, cell)
    if depth is None:
        return None
    edges = []
    cur = 1 << cell
    for k in range(depth, 0, -1):
        choices = expand(cur, open_s, open_e) & layers[k - 1]
        nxt = choices & -choices  # any neighbour one step closer
        a = cur.bit_length() - 1
        b = nxt.bit_length() - 1
        edges.append((a, b) if a < b else (b, a))
        cur = nxt
    return edges


def _cut_walls(edges: list[tuple[int, int]]) -> tuple[dict[int, list], dict[int, list]]:
    """Wall slots crossing the given edges: ({h slot: [edges]}, {v slot: [edges]})."""
    cut_h: dict[int, list] = {}
    cut_v: dict[int, list] = {}
    for lo, hi in edges:
        row, col = divmod(lo, BOARD_SIZE)
        if hi - lo == BOARD_SIZE:
            # Vertical step (row, col)-(row+1, col): h walls at (row, col-1) and (row, col).
            if col < WALL_GRID:
                cut_h.setdefault(row * WALL_GRID + col, []).append((lo, hi))
            if col > 0:
                cut_h.setdefault(row * WALL_GRID + col - 1, []).append((lo, hi))
        else:
            # Horizontal step (row, col)-(row, col+1): v walls at (row-1, col) and (row, col).
            if row < WALL_GRID:
                cut_v.setdefault(row * WALL_GRID + col, []).append((lo, hi))
            if row > 0:
                cut_v.setdefault((row - 1) * WALL_GRID + col, []).append((lo, hi))
    return cut_h, cut_v


# A detour around one wall end needs at most 5 steps; a few more cover neighbouring walls.
LOCAL_DETOUR_STEPS = 8


def _reaches_within(start: int, target: int, open_s: int, open_e: int, steps: int) -> bool:
    reach = start
    frontier = start
    for _ in range(steps):
        frontier = expand(frontier, open_s, open_e) & ~reach
        if frontier & target:
            return True
        if not frontier:
            return False
        reach |= frontier
    return False


def _still_connected(edges: list[tuple[int, int]], start: int, goal: int, open_s: int, open_e: int) -> bool:
    """Exact: if both ends of every cut path edge are joined by a short detour, the path can be
    repaired; otherwise decide with a full flood fill from the pawn."""
    for lo, hi in edges:
        if not _reaches_within(1 << lo, 1 << hi, open_s, open_e, LOCAL_DETOUR_STEPS):
            return connects(start, goal, open_s, open_e)
    return True


@lru_cache(maxsize=CACHE_SIZE * 2)
def disconnecting_walls(h_walls: int, v_walls: int, cell: int, target_row: int) -> tuple[int, int]:
    """(h mask, v mask) of free wall slots that would cut `cell` off from `target_row`.

    Only walls crossing one shortest path can do that (any other wall leaves that path intact),
    so only those are tested."""
    free_h, free_v = free_wall_slots(h_walls, v_walls)
    open_s, open_e = open_masks(h_walls, v_walls)
    edges = _path_edges(goal_layers(h_walls, v_walls, target_row), cell, open_s, open_e)
    if edges is None:
        return free_h, free_v  # already cut off: every wall "blocks" (no wall is legal)
    cut_h, cut_v = _cut_walls(edges)
    goal = ROW_MASKS[target_row]
    start = 1 << cell
    block_h = 0
    block_v = 0
    for slot, cut in cut_h.items():
        if not (free_h >> slot) & 1:
            continue
        row, col = divmod(slot, WALL_GRID)
        base = row * BOARD_SIZE + col
        if not _still_connected(cut, start, goal, open_s & ~((1 << base) | (1 << (base + 1))), open_e):
            block_h |= 1 << slot
    for slot, cut in cut_v.items():
        if not (free_v >> slot) & 1:
            continue
        row, col = divmod(slot, WALL_GRID)
        base = row * BOARD_SIZE + col
        if not _still_connected(cut, start, goal, open_s, open_e & ~((1 << base) | (1 << (base + BOARD_SIZE)))):
            block_v |= 1 << slot
    return block_h, block_v


def clear_caches() -> None:
    for fn in (blocked_masks, open_masks, goal_layers, free_wall_slots, disconnecting_walls):
        fn.cache_clear()


def cache_info() -> dict[str, dict]:
    return {fn.__name__: fn.cache_info()._asdict() for fn in (blocked_masks, open_masks, goal_layers, free_wall_slots, disconnecting_walls)}
