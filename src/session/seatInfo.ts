import { BOARD_SIZE, formatCoord } from '../engine';
import type { Coord, Goal, MultiRules, PlayerSpec } from '../engine';

/** Wording of where a seat starts and where it must go (cards, setup form, rules tab). */

/** The board side a cell lies on, or null for an interior cell. */
export function sideOfStart(c: Coord): string | null {
  if (c.row === BOARD_SIZE - 1) return '아래';
  if (c.row === 0) return '위';
  if (c.col === 0) return '왼쪽';
  if (c.col === BOARD_SIZE - 1) return '오른쪽';
  return null;
}

export const sideOfGoal = (g: Goal): string => (g.axis === 'row' ? (g.index === 0 ? '위쪽' : g.index === BOARD_SIZE - 1 ? '아래쪽' : `${BOARD_SIZE - g.index}번째 줄`) : g.index === 0 ? '왼쪽' : g.index === BOARD_SIZE - 1 ? '오른쪽' : `${String.fromCharCode(97 + g.index)}열`);

/** "아래 d1" for an edge cell, "e5" for an interior one. */
export const startText = (c: Coord): string => {
  const side = sideOfStart(c);
  return side ? `${side} ${formatCoord(c)}` : formatCoord(c);
};

export const seatText = (p: PlayerSpec): string => `${startText(p.start)}에서 시작 → ${sideOfGoal(p.goal)} 도착`;

/** One line per seat, in seat order (which is the turn order in every variant). */
export const seatTexts = (rules: MultiRules): string[] => rules.players.map(seatText);
