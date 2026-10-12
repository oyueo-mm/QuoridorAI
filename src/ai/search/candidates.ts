import {
  goalRow,
  hasPathToRow,
  legalActions,
  legalPawnMoves,
  opponentOf,
  pathEdgeSet,
  shortestPath,
  wallConflicts,
  wallCutsEdges,
  wallsCuttingPath,
  withWall,
} from '../../engine';
import type { Action, GameState } from '../../engine';
import type { MinimaxSettings } from '../types';

/** Reachability checks still owed by a pseudo-legal candidate (bit flags). */
export const CHECK_OPPONENT = 1;
export const CHECK_SELF = 2;

export interface PseudoCandidate {
  action: Action;
  /** 0 = known legal; otherwise CHECK_* flags that must pass before the action is legal. */
  check: number;
}

/**
 * Candidates for a search node with deferred path checks. Pawn moves are legal; walls are
 * free of overlaps/crossings, and only the reachability BFS a wall could break is left to
 * `isCandidateLegal` (a wall can only disconnect a player whose shortest path it cuts).
 * The search verifies a wall only when it is about to search it, so pruned walls never
 * pay for the BFS.
 *
 * Filters: 'all' = every legal wall; 'opponent-path' = only walls cutting the opponent's
 * current shortest path (the only walls that can lengthen it immediately).
 */
export function pseudoCandidates(state: GameState, wallFilter: MinimaxSettings['wallFilter']): PseudoCandidate[] {
  if (state.winner !== null) return [];
  if (wallFilter === 'all') return legalActions(state).map((action) => ({ action, check: 0 }));

  const me = state.currentPlayer;
  const opp = opponentOf(me);
  const out: PseudoCandidate[] = legalPawnMoves(state).map((to) => ({ action: { type: 'move', to }, check: 0 }));
  if (state.wallsRemaining[me] <= 0) return out;

  const oppPath = shortestPath(state, state.pawns[opp], goalRow(opp));
  const myPath = shortestPath(state, state.pawns[me], goalRow(me));
  if (!oppPath || !myPath) return legalActions(state).map((action) => ({ action, check: 0 }));
  const myEdges = pathEdgeSet(myPath);

  for (const w of wallsCuttingPath(oppPath)) {
    if (wallConflicts(state, w.orientation, w.row, w.col)) continue;
    const check = CHECK_OPPONENT | (wallCutsEdges(myEdges, w.orientation, w.row, w.col) ? CHECK_SELF : 0);
    out.push({ action: { type: 'wall', ...w }, check });
  }
  return out;
}

/** Completes the deferred checks. `child` is the state after the action (optional). */
export function isCandidateLegal(state: GameState, c: PseudoCandidate, child?: GameState): boolean {
  if (c.check === 0 || c.action.type !== 'wall') return true;
  const next = child ?? withWall(state, c.action.orientation, c.action.row, c.action.col);
  const me = state.currentPlayer;
  const opp = opponentOf(me);
  if (c.check & CHECK_OPPONENT && !hasPathToRow(next, state.pawns[opp], goalRow(opp))) return false;
  if (c.check & CHECK_SELF && !hasPathToRow(next, state.pawns[me], goalRow(me))) return false;
  return true;
}

/** Fully verified candidate list (same set the search explores). */
export function searchCandidates(state: GameState, wallFilter: MinimaxSettings['wallFilter']): Action[] {
  return pseudoCandidates(state, wallFilter)
    .filter((c) => isCandidateLegal(state, c))
    .map((c) => c.action);
}
