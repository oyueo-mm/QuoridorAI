import type { GameState, PlayerId } from '../engine';

/**
 * Match-level status. A *win* is decided by the engine's rules (a pawn reached its goal row).
 * A *halt* is an experimental cut-off imposed from outside — a ply budget, a wall-clock
 * budget for the whole game, or a repeated position (not an official Quoridor rule). Halts
 * have no winner and must not be counted as a result of the game rules.
 */
export type HaltReason =
  | { reason: 'max-plies'; maxPlies: number }
  | { reason: 'time-limit'; limitMs: number }
  | { reason: 'repetition'; repeats: number }
  | { reason: 'user-stopped' };

export type MatchStatus = { kind: 'playing' } | { kind: 'win'; winner: PlayerId } | ({ kind: 'halted' } & HaltReason);

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

export function describeHalt(status: { kind: 'halted' } & HaltReason): string {
  switch (status.reason) {
    case 'max-plies':
      return `최대 ${status.maxPlies} ply 도달`;
    case 'time-limit':
      return `대국 시간 제한 ${Math.round(status.limitMs / 1000)}초 초과`;
    case 'repetition':
      return `같은 포지션 ${status.repeats}회 반복`;
    case 'user-stopped':
      return '사용자 중단';
  }
}
