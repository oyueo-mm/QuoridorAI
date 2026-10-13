import { isLegalAction } from '../engine';
import type { Action, GameState } from '../engine';
import type { GameLine } from '../match/gameRecord';
import type { RecordedAction } from '../match/wallOwners';

/**
 * The move line of Compare's analysis board.
 *
 *   base    the loaded record (a copy — the sender's game is never changed)
 *   line    the moves currently explored (starts as base; may branch from it)
 *   cursor  number of moves of `line` applied to the board (0..line.length)
 *
 * Playing a move before the end of the line replaces everything after the cursor (a new
 * variation); undo / redo / goto only move the cursor, so redo restores the moves that were
 * taken back. `branchAt` = first index where line differs from base (line.length if none).
 */
export interface AnalysisLine {
  base: readonly RecordedAction[];
  line: readonly RecordedAction[];
  cursor: number;
}

export function loadLine(source: GameLine): AnalysisLine {
  const actions = source.actions.map((a) => ({ ...a }));
  return { base: actions, line: actions, cursor: Math.max(0, Math.min(source.ply, actions.length)) };
}

/** Plays `action` in `state` (the position at the cursor). Illegal actions change nothing. */
export function playMove(a: AnalysisLine, state: GameState, action: Action): AnalysisLine {
  if (state.winner !== null || !isLegalAction(state, action)) return a;
  const next = a.line[a.cursor];
  // Same move as the existing continuation: just step forward (keeps the rest of the line).
  if (next && sameAction(next.action, action)) return { ...a, cursor: a.cursor + 1 };
  return { ...a, line: [...a.line.slice(0, a.cursor), { action, player: state.currentPlayer }], cursor: a.cursor + 1 };
}

export const undoMove = (a: AnalysisLine): AnalysisLine => (a.cursor > 0 ? { ...a, cursor: a.cursor - 1 } : a);
export const redoMove = (a: AnalysisLine): AnalysisLine => (a.cursor < a.line.length ? { ...a, cursor: a.cursor + 1 } : a);
export const gotoPly = (a: AnalysisLine, ply: number): AnalysisLine => ({ ...a, cursor: Math.max(0, Math.min(ply, a.line.length)) });
export const resetToBase = (a: AnalysisLine): AnalysisLine => ({ ...a, line: a.base, cursor: Math.min(a.cursor, a.base.length) });

export function branchAt(a: AnalysisLine): number {
  const n = Math.min(a.base.length, a.line.length);
  for (let i = 0; i < n; i++) if (!sameAction(a.base[i].action, a.line[i].action)) return i;
  return n;
}

export function sameAction(x: Action, y: Action): boolean {
  if (x.type === 'move' && y.type === 'move') return x.to.row === y.to.row && x.to.col === y.to.col;
  if (x.type === 'wall' && y.type === 'wall') return x.orientation === y.orientation && x.row === y.row && x.col === y.col;
  return false;
}
