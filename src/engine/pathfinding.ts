import {
  BOARD_SIZE,
  DIRECTIONS,
  NUM_CELLS,
  canStep,
  cellFromIndex,
  cellIndex,
} from './board';
import { distanceMapMasked, distanceToRowMasked, hasPathToRowMasked, shortestPathMasked } from './rowMasks';
import type { Coord, Goal, WallLayout } from './types';

/**
 * Two interchangeable implementations of the row-goal functions with identical results:
 * 'masked' (row-mask bitboards, rowMasks.ts — the default) and 'reference' (the original
 * cell-by-cell BFS below). The switch exists for equivalence tests and A/B benchmarks.
 */
export type PathKernel = 'masked' | 'reference';
let kernel: PathKernel = 'masked';

export function getPathKernel(): PathKernel {
  return kernel;
}

export function setPathKernel(k: PathKernel): void {
  kernel = k;
}

/** Runs `fn` with `k` as the active kernel (synchronous code only) and restores the previous one. */
export function withPathKernel<T>(k: PathKernel, fn: () => T): T {
  const prev = kernel;
  kernel = k;
  try {
    return fn();
  } finally {
    kernel = prev;
  }
}

export function shortestPath(walls: WallLayout, start: Coord, targetRow: number): Coord[] | null {
  return kernel === 'masked' ? shortestPathMasked(walls, start, targetRow) : shortestPathReference(walls, start, targetRow);
}

export function distanceToRow(walls: WallLayout, start: Coord, targetRow: number): number {
  return kernel === 'masked' ? distanceToRowMasked(walls, start, targetRow) : distanceToRowReference(walls, start, targetRow);
}

export function hasPathToRow(walls: WallLayout, start: Coord, targetRow: number): boolean {
  return kernel === 'masked' ? hasPathToRowMasked(walls, start, targetRow) : distanceToRowReference(walls, start, targetRow) !== Infinity;
}

export function distanceMap(walls: WallLayout, targetRow: number): Int16Array {
  return kernel === 'masked' ? distanceMapMasked(walls, targetRow) : distanceMapReference(walls, targetRow);
}

/**
 * Pathfinding ignores pawns: in Quoridor a pawn never permanently blocks a route,
 * so the "path to goal" rule and distance heuristics only consider walls.
 */

const UNREACHABLE = -1;

/**
 * BFS shortest path from `start` to any cell on `targetRow`.
 * Returns the cells visited in order (including `start` and the goal cell), or null if unreachable.
 * Neighbours are expanded in the fixed DIRECTIONS order, so the result is deterministic.
 */
export function shortestPathReference(walls: WallLayout, start: Coord, targetRow: number): Coord[] | null {
  if (start.row === targetRow) return [start];

  const parent = new Int16Array(NUM_CELLS).fill(UNREACHABLE);
  const startIdx = cellIndex(start.row, start.col);
  parent[startIdx] = startIdx;
  const queue = new Int16Array(NUM_CELLS);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++];
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    for (const d of DIRECTIONS) {
      if (!canStep(walls, row, col, d.row, d.col)) continue;
      const next = cellIndex(row + d.row, col + d.col);
      if (parent[next] !== UNREACHABLE) continue;
      parent[next] = idx;
      if (row + d.row === targetRow) return reconstruct(parent, next, startIdx);
      queue[tail++] = next;
    }
  }
  return null;
}

function reconstruct(parent: Int16Array, end: number, startIdx: number): Coord[] {
  const path: Coord[] = [];
  let cur = end;
  while (cur !== startIdx) {
    path.push(cellFromIndex(cur));
    cur = parent[cur];
  }
  path.push(cellFromIndex(startIdx));
  return path.reverse();
}

/** Number of steps on the shortest route to `targetRow`, or Infinity if none exists. */
export function distanceToRowReference(walls: WallLayout, start: Coord, targetRow: number): number {
  if (start.row === targetRow) return 0;
  // Hot path for search evaluation: reuse module-level buffers, no path reconstruction.
  const dist = scratchDist.fill(UNREACHABLE);
  const queue = scratchQueue;
  let head = 0;
  let tail = 0;
  const startIdx = cellIndex(start.row, start.col);
  dist[startIdx] = 0;
  queue[tail++] = startIdx;
  while (head < tail) {
    const idx = queue[head++];
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    for (const d of DIRECTIONS) {
      if (!canStep(walls, row, col, d.row, d.col)) continue;
      const next = idx + d.row * BOARD_SIZE + d.col;
      if (dist[next] !== UNREACHABLE) continue;
      dist[next] = dist[idx] + 1;
      if (row + d.row === targetRow) return dist[next];
      queue[tail++] = next;
    }
  }
  return Infinity;
}

const scratchDist = new Int16Array(NUM_CELLS);
const scratchQueue = new Int16Array(NUM_CELLS);

/**
 * Multi-source BFS from every cell of `targetRow`: distance (in steps) from each cell to that row.
 * Indexed by `row * 9 + col`; -1 marks cells that cannot reach the row.
 * Useful for heuristics and for heat-map style visualisation.
 */
export function distanceMapReference(walls: WallLayout, targetRow: number): Int16Array {
  const dist = new Int16Array(NUM_CELLS).fill(UNREACHABLE);
  const queue = new Int16Array(NUM_CELLS);
  let head = 0;
  let tail = 0;
  for (let col = 0; col < BOARD_SIZE; col++) {
    const idx = cellIndex(targetRow, col);
    dist[idx] = 0;
    queue[tail++] = idx;
  }
  while (head < tail) {
    const idx = queue[head++];
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    for (const d of DIRECTIONS) {
      // Walls block symmetrically, so stepping outward from the goal row is equivalent.
      if (!canStep(walls, row, col, d.row, d.col)) continue;
      const next = cellIndex(row + d.row, col + d.col);
      if (dist[next] !== UNREACHABLE) continue;
      dist[next] = dist[idx] + 1;
      queue[tail++] = next;
    }
  }
  return dist;
}

// ---------------------------------------------------------------- goal lines (any side)

/** True if `cell` lies on the goal line. */
export function onGoal(cell: Coord, goal: Goal): boolean {
  return (goal.axis === 'row' ? cell.row : cell.col) === goal.index;
}

/**
 * BFS shortest path to any cell of `goal` (a row or a column), pawns ignored like everywhere
 * else in this module. Same contract as shortestPath, which is the row-goal special case.
 */
export function shortestPathToGoal(walls: WallLayout, start: Coord, goal: Goal): Coord[] | null {
  if (onGoal(start, goal)) return [start];
  const parent = new Int16Array(NUM_CELLS).fill(UNREACHABLE);
  const startIdx = cellIndex(start.row, start.col);
  parent[startIdx] = startIdx;
  const queue = new Int16Array(NUM_CELLS);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;
  while (head < tail) {
    const idx = queue[head++];
    const row = Math.floor(idx / BOARD_SIZE);
    const col = idx % BOARD_SIZE;
    for (const d of DIRECTIONS) {
      if (!canStep(walls, row, col, d.row, d.col)) continue;
      const next = cellIndex(row + d.row, col + d.col);
      if (parent[next] !== UNREACHABLE) continue;
      parent[next] = idx;
      if (onGoal({ row: row + d.row, col: col + d.col }, goal)) return reconstruct(parent, next, startIdx);
      queue[tail++] = next;
    }
  }
  return null;
}

/** Steps on the shortest route to `goal`, or Infinity if there is none. */
export function distanceToGoal(walls: WallLayout, start: Coord, goal: Goal): number {
  if (goal.axis === 'row') return distanceToRow(walls, start, goal.index);
  const path = shortestPathToGoal(walls, start, goal);
  return path === null ? Infinity : path.length - 1;
}

export function hasPathToGoal(walls: WallLayout, start: Coord, goal: Goal): boolean {
  return distanceToGoal(walls, start, goal) !== Infinity;
}
