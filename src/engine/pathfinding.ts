import {
  BOARD_SIZE,
  DIRECTIONS,
  NUM_CELLS,
  canStep,
  cellFromIndex,
  cellIndex,
} from './board';
import type { Coord, WallLayout } from './types';

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
export function shortestPath(walls: WallLayout, start: Coord, targetRow: number): Coord[] | null {
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
export function distanceToRow(walls: WallLayout, start: Coord, targetRow: number): number {
  const path = shortestPath(walls, start, targetRow);
  return path === null ? Infinity : path.length - 1;
}

export function hasPathToRow(walls: WallLayout, start: Coord, targetRow: number): boolean {
  return shortestPath(walls, start, targetRow) !== null;
}

/**
 * Multi-source BFS from every cell of `targetRow`: distance (in steps) from each cell to that row.
 * Indexed by `row * 9 + col`; -1 marks cells that cannot reach the row.
 * Useful for heuristics and for heat-map style visualisation.
 */
export function distanceMap(walls: WallLayout, targetRow: number): Int16Array {
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
