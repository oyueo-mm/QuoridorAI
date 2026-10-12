import { BOARD_SIZE } from './board';
import type { Action, Coord } from './types';

/**
 * Human-readable notation. Files a–i run left to right, ranks 1–9 run bottom to top
 * (rank 1 is Player 0's starting row).
 *   - Pawn move: destination square, e.g. "e2".
 *   - Wall: the square south-west of the wall's center plus orientation, e.g. "e3h".
 */
const FILES = 'abcdefghi';

export function formatCoord(c: Coord): string {
  return `${FILES[c.col]}${BOARD_SIZE - c.row}`;
}

export function formatAction(action: Action): string {
  if (action.type === 'move') return formatCoord(action.to);
  return `${formatCoord({ row: action.row + 1, col: action.col })}${action.orientation}`;
}
