import {
  goalRow,
  hasPathToRow,
  isWallAnchorInBounds,
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
import type { Action, GameState, Orientation } from '../../engine';
import type { MinimaxSettings } from '../types';

/** Reachability checks still owed by a pseudo-legal candidate (bit flags). */
export const CHECK_OPPONENT = 1;
export const CHECK_SELF = 2;

export interface PseudoCandidate {
  action: Action;
  /** 0 = known legal; otherwise CHECK_* flags that must pass before the action is legal. */
  check: number;
}

const slotKey = (o: Orientation, row: number, col: number) => (o === 'h' ? 0 : 64) + row * 8 + col;

/** Walls (other than the slot itself) that overlap or cross the wall slot (o, row, col). */
function blockersOf(o: Orientation, row: number, col: number): { orientation: Orientation; row: number; col: number }[] {
  return o === 'h'
    ? [{ orientation: 'h', row, col: col - 1 }, { orientation: 'h', row, col: col + 1 }, { orientation: 'v', row, col }]
    : [{ orientation: 'v', row: row - 1, col }, { orientation: 'v', row: row + 1, col }, { orientation: 'h', row, col }];
}

/**
 * Candidates for a search node with deferred path checks. Pawn moves are legal; walls are
 * free of overlaps/crossings, and only the reachability BFS a wall could break is left to
 * `isCandidateLegal` (a wall can only disconnect a player whose shortest path it cuts).
 * The search verifies a wall only when it is about to search it, so pruned walls never
 * pay for the BFS.
 *
 * Filters: 'all' = every legal wall; 'opponent-path' = only walls cutting the opponent's
 * current shortest path (the only walls that can lengthen it immediately); 'path-defense' =
 * 'opponent-path' plus protective walls (see below) while the opponent still has walls.
 */
export function pseudoCandidates(
  state: GameState,
  wallFilter: MinimaxSettings['wallFilter'],
  defenseMaxDistance: number = Infinity,
): PseudoCandidate[] {
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

  const seen = new Set<number>();
  for (const w of wallsCuttingPath(oppPath)) {
    if (wallConflicts(state, w.orientation, w.row, w.col)) continue;
    seen.add(slotKey(w.orientation, w.row, w.col));
    const check = CHECK_OPPONENT | (wallCutsEdges(myEdges, w.orientation, w.row, w.col) ? CHECK_SELF : 0);
    out.push({ action: { type: 'wall', ...w }, check });
  }
  // Only while the opponent can still place walls, and (optionally) only near the end of my race.
  if (wallFilter !== 'path-defense' || state.wallsRemaining[opp] <= 0 || myPath.length - 1 > defenseMaxDistance) return out;

  // Protective walls: walls that make a slot the opponent could use to cut my current
  // shortest path illegal (by overlapping or crossing it), without occupying that slot myself.
  // They lengthen no path now, so 'opponent-path' never sees them, yet they can decide races
  // (stage-1 tactics: every winning move of a proven win-in-5 was such a wall).
  const oppEdges = pathEdgeSet(oppPath);
  for (const t of wallsCuttingPath(myPath)) {
    if (wallConflicts(state, t.orientation, t.row, t.col)) continue; // slot already unusable
    for (const d of blockersOf(t.orientation, t.row, t.col)) {
      const key = slotKey(d.orientation, d.row, d.col);
      if (seen.has(key) || !isWallAnchorInBounds(d.row, d.col) || wallConflicts(state, d.orientation, d.row, d.col)) continue;
      seen.add(key);
      const check =
        (wallCutsEdges(oppEdges, d.orientation, d.row, d.col) ? CHECK_OPPONENT : 0) |
        (wallCutsEdges(myEdges, d.orientation, d.row, d.col) ? CHECK_SELF : 0);
      out.push({ action: { type: 'wall', ...d }, check });
    }
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
export function searchCandidates(state: GameState, wallFilter: MinimaxSettings['wallFilter'], defenseMaxDistance?: number): Action[] {
  return pseudoCandidates(state, wallFilter, defenseMaxDistance)
    .filter((c) => isCandidateLegal(state, c))
    .map((c) => c.action);
}
