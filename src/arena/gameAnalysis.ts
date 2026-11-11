import {
  applyAction,
  applyActionUnchecked,
  distanceToRow,
  goalRow,
  hashState,
  legalActions,
  legalPawnMoves,
  opponentOf,
  parseAction,
} from '../engine';
import type { GameState, PlayerId } from '../engine';

/**
 * Post-game analysis of one recorded game (two-player standard rules), computed by replaying
 * the move list from the start position. Only facts that the rules decide exactly are
 * classified as errors:
 *  - a missed win: the mover had a pawn move onto its goal row and played something else;
 *  - an allowed win: after the move the opponent can reach its goal row with its next pawn
 *    move, although some legal action would have prevented that.
 * Everything else (wall timing, distance changes, shuffling) is descriptive.
 */

export interface SideAnalysis {
  moves: number;
  pawnMoves: number;
  walls: number;
  /** Plies (from the start position, 0-based) at which this side placed walls. */
  wallPlies: number[];
  wallsLeftAtEnd: number;
  /** Σ opponent shortest-path increase caused by this side's walls. */
  wallOppGain: number;
  /** Σ own shortest-path increase caused by this side's walls. */
  wallSelfCost: number;
  /** Walls that did not lengthen the opponent's path at all. */
  wallsWithoutGain: number;
  /** Walls that lengthened the own path more than the opponent's. */
  selfHarmWalls: number;
  /** Pawn moves that increased the own shortest path (retreats/detours). */
  pawnMovesAway: number;
  /** Pawn moves back to the cell this pawn occupied before its previous move. */
  backtracks: number;
  winIn1Available: number;
  missedWinIn1: number;
  /** Positions where the opponent threatened to win next move (if not answered). */
  threatsFaced: number;
  /** Moves after which the opponent can win at once, although that was avoidable. */
  allowedWinIn1Avoidable: number;
  /** Same, but every legal action allowed it (the position was already lost in 2 plies). */
  allowedWinIn1Forced: number;
}

export interface GameAnalysis {
  /** Indexed by seat (0 = moved first from the start position). */
  seats: [SideAnalysis, SideAnalysis];
  /** Positions that occurred at least twice (pawns, walls, walls in hand, side to move). */
  repeatedPositions: number;
  maxRepetitions: number;
  /** Shortest-path lengths of [seat 0, seat 1] before each ply and after the last one. */
  distances: [number[], number[]];
  /** Index of the first move that could not be replayed (corrupt record), else null. */
  error: number | null;
}

const emptySide = (): SideAnalysis => ({
  moves: 0,
  pawnMoves: 0,
  walls: 0,
  wallPlies: [],
  wallsLeftAtEnd: 0,
  wallOppGain: 0,
  wallSelfCost: 0,
  wallsWithoutGain: 0,
  selfHarmWalls: 0,
  pawnMovesAway: 0,
  backtracks: 0,
  winIn1Available: 0,
  missedWinIn1: 0,
  threatsFaced: 0,
  allowedWinIn1Avoidable: 0,
  allowedWinIn1Forced: 0,
});

const dist = (s: GameState, p: PlayerId) => distanceToRow(s, s.pawns[p], goalRow(p));

/** True if `player` (not necessarily to move) has a pawn move onto its goal row in `state`. */
export function hasWinningPawnMove(state: GameState, player: PlayerId): boolean {
  if (state.winner !== null) return false;
  return legalPawnMoves(state, player).some((c) => c.row === goalRow(player));
}

/** True if the side to move has some legal action after which the opponent cannot win at once. */
export function canPreventImmediateWin(state: GameState): boolean {
  const me = state.currentPlayer;
  const opp = opponentOf(me);
  for (const a of legalActions(state)) {
    const next = applyActionUnchecked(state, a);
    if (next.winner === me || !hasWinningPawnMove(next, opp)) return true;
  }
  return false;
}

export function analyzeGame(start: GameState, moves: readonly string[]): GameAnalysis {
  const seats: [SideAnalysis, SideAnalysis] = [emptySide(), emptySide()];
  const distances: [number[], number[]] = [[], []];
  const seen = new Map<string, number>();
  const prevCells: [string[], string[]] = [[], []];
  let state = start;
  let error: number | null = null;

  const visit = (s: GameState) => {
    const h = hashState(s);
    const key = `${h.key}:${h.check}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  };
  visit(state);
  for (const p of [0, 1] as const) prevCells[p].push(`${state.pawns[p].row},${state.pawns[p].col}`);

  for (let i = 0; i < moves.length && state.winner === null; i++) {
    const action = parseAction(state, moves[i]);
    if (!action) {
      error = i;
      break;
    }
    const me = state.currentPlayer;
    const opp = opponentOf(me);
    const side = seats[me];
    const dSelf = dist(state, me);
    const dOpp = dist(state, opp);
    distances[0].push(me === 0 ? dSelf : dOpp);
    distances[1].push(me === 1 ? dSelf : dOpp);

    const winAvailable = hasWinningPawnMove(state, me);
    const threatened = hasWinningPawnMove(state, opp);
    const next = applyAction(state, action);

    side.moves++;
    if (winAvailable) {
      side.winIn1Available++;
      if (next.winner !== me) side.missedWinIn1++;
    }
    if (threatened) side.threatsFaced++;
    if (next.winner === null && hasWinningPawnMove(next, opp)) {
      if (canPreventImmediateWin(state)) side.allowedWinIn1Avoidable++;
      else side.allowedWinIn1Forced++;
    }

    if (action.type === 'wall') {
      side.walls++;
      side.wallPlies.push(i);
      const oppGain = dist(next, opp) - dOpp;
      const selfCost = dist(next, me) - dSelf;
      side.wallOppGain += oppGain;
      side.wallSelfCost += selfCost;
      if (oppGain <= 0) side.wallsWithoutGain++;
      if (selfCost > oppGain) side.selfHarmWalls++;
    } else {
      side.pawnMoves++;
      if (next.winner !== me && dist(next, me) > dSelf) side.pawnMovesAway++;
      const cell = `${action.to.row},${action.to.col}`;
      const history = prevCells[me];
      if (history.length >= 2 && history[history.length - 2] === cell) side.backtracks++;
      history.push(cell);
    }
    state = next;
    visit(state);
  }
  distances[0].push(dist(state, 0));
  distances[1].push(dist(state, 1));
  seats[0].wallsLeftAtEnd = state.wallsRemaining[0];
  seats[1].wallsLeftAtEnd = state.wallsRemaining[1];

  let repeatedPositions = 0;
  let maxRepetitions = 1;
  for (const n of seen.values()) {
    if (n >= 2) repeatedPositions++;
    if (n > maxRepetitions) maxRepetitions = n;
  }
  return { seats, repeatedPositions, maxRepetitions, distances, error };
}

/** Sums side analyses (e.g. every game of one agent). Arrays are concatenated. */
export function mergeSides(sides: readonly SideAnalysis[]): SideAnalysis {
  const out = emptySide();
  for (const s of sides) {
    for (const k of Object.keys(out) as (keyof SideAnalysis)[]) {
      if (k === 'wallPlies') out.wallPlies.push(...s.wallPlies);
      else (out[k] as number) += s[k] as number;
    }
  }
  return out;
}
