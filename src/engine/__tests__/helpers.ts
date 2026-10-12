import type { Coord, WallAction } from '../types';

export const at = (row: number, col: number): Coord => ({ row, col });

export const hWall = (row: number, col: number): WallAction => ({ type: 'wall', orientation: 'h', row, col });
export const vWall = (row: number, col: number): WallAction => ({ type: 'wall', orientation: 'v', row, col });

/** Sorted "row,col" keys so move lists can be compared regardless of generation order. */
export function keys(coords: readonly Coord[]): string[] {
  return coords.map((c) => `${c.row},${c.col}`).sort();
}
