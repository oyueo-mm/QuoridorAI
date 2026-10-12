import { goalRow, hasHWall, hasVWall, isWallAnchorInBounds, wallIndex } from './board';
import { hasPathToRow } from './pathfinding';
import type { GameState, Orientation, WallAction, WallLayout, WallPlacementResult } from './types';

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
