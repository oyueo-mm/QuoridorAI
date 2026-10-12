import { BOARD_SIZE, NUM_CELLS, NUM_WALL_SLOTS, WALL_GRID, cellIndex, wallIndex } from './board';
import type { Action } from './types';

/**
 * Fixed action indexing shared with the (future) Python/PyTorch training code.
 * Any change here must be mirrored in training/ and invalidates trained models.
 *
 *   [0, 81)    pawn move to cell (row * 9 + col)
 *   [81, 145)  horizontal wall at anchor (row * 8 + col)
 *   [145, 209) vertical wall at anchor (row * 8 + col)
 *
 * Indices are in absolute board coordinates (no perspective flip). A network that wants
 * a player-relative view can apply the 180° rotation explicitly on both sides.
 */
export const MOVE_ACTION_OFFSET = 0;
export const H_WALL_ACTION_OFFSET = NUM_CELLS;
export const V_WALL_ACTION_OFFSET = NUM_CELLS + NUM_WALL_SLOTS;
export const ACTION_SPACE_SIZE = NUM_CELLS + 2 * NUM_WALL_SLOTS;

export function encodeAction(action: Action): number {
  if (action.type === 'move') return MOVE_ACTION_OFFSET + cellIndex(action.to.row, action.to.col);
  const offset = action.orientation === 'h' ? H_WALL_ACTION_OFFSET : V_WALL_ACTION_OFFSET;
  return offset + wallIndex(action.row, action.col);
}

export function decodeAction(index: number): Action {
  if (!Number.isInteger(index) || index < 0 || index >= ACTION_SPACE_SIZE) {
    throw new RangeError(`Action index out of range: ${index}`);
  }
  if (index < H_WALL_ACTION_OFFSET) {
    const cell = index - MOVE_ACTION_OFFSET;
    return { type: 'move', to: { row: Math.floor(cell / BOARD_SIZE), col: cell % BOARD_SIZE } };
  }
  const orientation = index < V_WALL_ACTION_OFFSET ? 'h' : 'v';
  const slot = index - (orientation === 'h' ? H_WALL_ACTION_OFFSET : V_WALL_ACTION_OFFSET);
  return { type: 'wall', orientation, row: Math.floor(slot / WALL_GRID), col: slot % WALL_GRID };
}
