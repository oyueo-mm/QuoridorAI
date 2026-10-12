import type { GameState, PlayerId } from '../engine';

/**
 * Match-level status. A *win* is decided by the engine's rules (a pawn reached its goal row).
 * A *halt* is an experimental cut-off imposed from outside (e.g. AI vs AI exceeding a ply
 * budget); it has no winner and must not be counted as a result of the game rules.
 */
export type MatchStatus =
  | { kind: 'playing' }
  | { kind: 'win'; winner: PlayerId }
  | { kind: 'halted'; reason: 'max-plies'; maxPlies: number };

/** Default experimental budget. Real games rarely exceed ~100 plies. */
export const DEFAULT_MAX_PLIES = 400;

export function matchStatus(state: GameState, maxPlies: number | null): MatchStatus {
  if (state.winner !== null) return { kind: 'win', winner: state.winner };
  if (maxPlies !== null && state.ply >= maxPlies) return { kind: 'halted', reason: 'max-plies', maxPlies };
  return { kind: 'playing' };
}

export function isMatchOver(status: MatchStatus): boolean {
  return status.kind !== 'playing';
}
