import { BOARD_SIZE, WALL_GRID } from '../../engine';
import type { Coord, Orientation } from '../../engine';

/** SVG layout constants (user units; the SVG scales to its container). */
export const CELL = 56;
export const GAP = 12;
export const PITCH = CELL + GAP;
export const PAD = 28;
export const BOARD_PX = BOARD_SIZE * CELL + (BOARD_SIZE - 1) * GAP;
export const VIEW_PX = BOARD_PX + PAD * 2;

/**
 * "View" coordinates are what is drawn on screen. When the board is flipped (user plays
 * Player 1 and should sit at the bottom) view = engine rotated by 180°.
 */
export function cellToView(c: Coord, flipped: boolean): Coord {
  return flipped ? { row: BOARD_SIZE - 1 - c.row, col: BOARD_SIZE - 1 - c.col } : c;
}
export const cellFromView = cellToView; // rotation by 180° is its own inverse

export function wallAnchorToView(row: number, col: number, flipped: boolean): Coord {
  return flipped ? { row: WALL_GRID - 1 - row, col: WALL_GRID - 1 - col } : { row, col };
}
export const wallAnchorFromView = wallAnchorToView;

export function cellRect(view: Coord) {
  return { x: view.col * PITCH, y: view.row * PITCH, width: CELL, height: CELL };
}

export function cellCenter(view: Coord) {
  return { x: view.col * PITCH + CELL / 2, y: view.row * PITCH + CELL / 2 };
}

export function wallRect(orientation: Orientation, view: Coord) {
  const span = 2 * CELL + GAP;
  return orientation === 'h'
    ? { x: view.col * PITCH, y: (view.row + 1) * PITCH - GAP, width: span, height: GAP }
    : { x: (view.col + 1) * PITCH - GAP, y: view.row * PITCH, width: GAP, height: span };
}

export type HitTarget =
  | { kind: 'cell'; view: Coord }
  | { kind: 'wall'; orientation: Orientation; view: Coord };

/** Distance (from a gap's center line) within which the pointer targets a wall slot. */
const WALL_ZONE = GAP / 2 + CELL * 0.2;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Index (0..7) of the interior gap / intersection whose center line is nearest to `p`. */
function nearestGap(p: number): number {
  return clamp(Math.round((p - (PITCH - GAP / 2)) / PITCH), 0, WALL_GRID - 1);
}
const gapCenter = (i: number) => (i + 1) * PITCH - GAP / 2;

/**
 * Maps a point in board space (origin at the top-left cell corner) to a cell or a wall slot.
 * Points close to a gap line target the wall slot centered on the nearest intersection;
 * points well inside a cell target the cell.
 */
export function hitTest(x: number, y: number): HitTarget | null {
  if (x < 0 || y < 0 || x > BOARD_PX || y > BOARD_PX) return null;
  const gx = nearestGap(x);
  const gy = nearestGap(y);
  const dx = Math.abs(x - gapCenter(gx));
  const dy = Math.abs(y - gapCenter(gy));

  if (Math.min(dx, dy) <= WALL_ZONE) {
    return dy <= dx
      ? { kind: 'wall', orientation: 'h', view: { row: gy, col: gx } }
      : { kind: 'wall', orientation: 'v', view: { row: gy, col: gx } };
  }
  const col = Math.floor(x / PITCH);
  const row = Math.floor(y / PITCH);
  if (row < 0 || col < 0 || row >= BOARD_SIZE || col >= BOARD_SIZE) return null;
  return { kind: 'cell', view: { row, col } };
}
