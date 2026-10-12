import type { Coord, PlayerId, WallLayout } from './types';

export const BOARD_SIZE = 9;
/** Number of wall anchor positions per axis. */
export const WALL_GRID = BOARD_SIZE - 1;
export const NUM_CELLS = BOARD_SIZE * BOARD_SIZE;
export const NUM_WALL_SLOTS = WALL_GRID * WALL_GRID;
export const WALLS_PER_PLAYER = 10;

export const START_POSITIONS: readonly [Coord, Coord] = [
  { row: BOARD_SIZE - 1, col: 4 },
  { row: 0, col: 4 },
];

/** Orthogonal directions in a fixed order (up, down, left, right). */
export const DIRECTIONS: readonly Coord[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

export function goalRow(player: PlayerId): number {
  return player === 0 ? 0 : BOARD_SIZE - 1;
}

export function opponentOf(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function isWallAnchorInBounds(row: number, col: number): boolean {
  return row >= 0 && row < WALL_GRID && col >= 0 && col < WALL_GRID;
}

export function cellIndex(row: number, col: number): number {
  return row * BOARD_SIZE + col;
}

export function cellFromIndex(index: number): Coord {
  return { row: Math.floor(index / BOARD_SIZE), col: index % BOARD_SIZE };
}

export function wallIndex(row: number, col: number): number {
  return row * WALL_GRID + col;
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function hasHWall(walls: WallLayout, row: number, col: number): boolean {
  return isWallAnchorInBounds(row, col) && walls.hWalls[wallIndex(row, col)] === 1;
}

export function hasVWall(walls: WallLayout, row: number, col: number): boolean {
  return isWallAnchorInBounds(row, col) && walls.vWalls[wallIndex(row, col)] === 1;
}

/**
 * True if a wall separates (row, col) from its orthogonal neighbour (row + dRow, col + dCol).
 * Does not check whether the neighbour is on the board.
 */
export function isBlocked(
  walls: WallLayout,
  row: number,
  col: number,
  dRow: number,
  dCol: number,
): boolean {
  if (dRow === 1) return hasHWall(walls, row, col) || hasHWall(walls, row, col - 1);
  if (dRow === -1) return hasHWall(walls, row - 1, col) || hasHWall(walls, row - 1, col - 1);
  if (dCol === 1) return hasVWall(walls, row, col) || hasVWall(walls, row - 1, col);
  if (dCol === -1) return hasVWall(walls, row, col - 1) || hasVWall(walls, row - 1, col - 1);
  throw new Error(`Invalid direction (${dRow}, ${dCol})`);
}

/** True if a pawn (ignoring other pawns) can step from (row, col) one cell in the given direction. */
export function canStep(
  walls: WallLayout,
  row: number,
  col: number,
  dRow: number,
  dCol: number,
): boolean {
  return inBounds(row + dRow, col + dCol) && !isBlocked(walls, row, col, dRow, dCol);
}
