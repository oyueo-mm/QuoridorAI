import {
  NUM_CELLS,
  NUM_WALL_SLOTS,
  cellIndex,
  goalRow,
  hasHWall,
  hasVWall,
  isWallAnchorInBounds,
  wallIndex,
} from './board';
import { hasPathToRow } from './pathfinding';
import type { Coord, GameState, Orientation, WallAction, WallLayout, WallPlacementResult } from './types';

/**
 * True if a new wall would overlap an existing parallel wall or cross a perpendicular one.
 * Two walls that merely touch end-to-end or form a "T" are allowed.
 */
export function wallConflicts(
  walls: WallLayout,
  orientation: Orientation,
  row: number,
  col: number,
): boolean {
  if (orientation === 'h') {
    return (
      hasHWall(walls, row, col) ||
      hasHWall(walls, row, col - 1) ||
      hasHWall(walls, row, col + 1) ||
      hasVWall(walls, row, col)
    );
  }
  return (
    hasVWall(walls, row, col) ||
    hasVWall(walls, row - 1, col) ||
    hasVWall(walls, row + 1, col) ||
    hasHWall(walls, row, col)
  );
}

/** Returns a copy of the layout with one additional wall. Does not validate. */
export function withWall(
  walls: WallLayout,
  orientation: Orientation,
  row: number,
  col: number,
): WallLayout {
  const hWalls = walls.hWalls.slice();
  const vWalls = walls.vWalls.slice();
  (orientation === 'h' ? hWalls : vWalls)[wallIndex(row, col)] = 1;
  return { hWalls, vWalls };
}

/** Full legality check for a wall placement by the current player, with the reason if illegal. */
export function checkWallPlacement(state: GameState, wall: WallAction): WallPlacementResult {
  if (state.winner !== null) return 'game-over';
  if (state.wallsRemaining[state.currentPlayer] <= 0) return 'no-walls-left';
  if (!isWallAnchorInBounds(wall.row, wall.col)) return 'out-of-bounds';
  if (wallConflicts(state, wall.orientation, wall.row, wall.col)) return 'overlap';

  const next = withWall(state, wall.orientation, wall.row, wall.col);
  if (!hasPathToRow(next, state.pawns[0], goalRow(0))) return 'blocks-path';
  if (!hasPathToRow(next, state.pawns[1], goalRow(1))) return 'blocks-path';
  return 'ok';
}

// ---------------------------------------------------------------- path / wall geometry

/** Key of the board edge between two orthogonally adjacent cells (order-independent). */
function edgeKey(a: number, b: number): number {
  return a < b ? a * NUM_CELLS + b : b * NUM_CELLS + a;
}

/** Set of edges traversed by a path (consecutive cells). */
export function pathEdgeSet(path: readonly Coord[]): Set<number> {
  const edges = new Set<number>();
  for (let i = 1; i < path.length; i++) {
    edges.add(edgeKey(cellIndex(path[i - 1].row, path[i - 1].col), cellIndex(path[i].row, path[i].col)));
  }
  return edges;
}

/** True if the wall would cut at least one edge in `edges`. */
export function wallCutsEdges(edges: Set<number>, orientation: Orientation, row: number, col: number): boolean {
  if (orientation === 'h') {
    return (
      edges.has(edgeKey(cellIndex(row, col), cellIndex(row + 1, col))) ||
      edges.has(edgeKey(cellIndex(row, col + 1), cellIndex(row + 1, col + 1)))
    );
  }
  return (
    edges.has(edgeKey(cellIndex(row, col), cellIndex(row, col + 1))) ||
    edges.has(edgeKey(cellIndex(row + 1, col), cellIndex(row + 1, col + 1)))
  );
}

/** Wall anchors (deduplicated, possibly illegal) that would cut some edge of `path`. */
export function wallsCuttingPath(path: readonly Coord[]): { orientation: Orientation; row: number; col: number }[] {
  const seen = new Set<number>();
  const out: { orientation: Orientation; row: number; col: number }[] = [];
  const add = (orientation: Orientation, row: number, col: number) => {
    if (!isWallAnchorInBounds(row, col)) return;
    const key = (orientation === 'h' ? 0 : NUM_WALL_SLOTS) + wallIndex(row, col);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ orientation, row, col });
  };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.col === b.col) {
      const r = Math.min(a.row, b.row);
      add('h', r, a.col);
      add('h', r, a.col - 1);
    } else {
      const c = Math.min(a.col, b.col);
      add('v', a.row, c);
      add('v', a.row - 1, c);
    }
  }
  return out;
}
