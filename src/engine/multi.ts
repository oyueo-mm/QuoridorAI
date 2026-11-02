import {
  NUM_WALL_SLOTS,
  WALL_GRID,
  BOARD_SIZE,
  WALLS_PER_PLAYER,
  inBounds,
  isWallAnchorInBounds,
  sameCoord,
  wallIndex,
} from './board';
import { distanceToGoal, hasPathToGoal, onGoal, shortestPathToGoal } from './pathfinding';
import { pawnMovesAmong } from './rules';
import { pathEdgeSet, wallConflicts, wallCutsEdges, withWall } from './walls';
import type { Action, Coord, Goal, Orientation, WallAction, WallLayout, WallPlacementResult } from './types';

/**
 * Variable-player Quoridor (2–4 players), built on the same wall, pathfinding and jump rules as
 * the two-player engine (`GameState` and everything the AIs and the trainer use stay unchanged).
 *
 * What differs per game lives in `MultiRules` — start cells, goal lines and the turn order —
 * and the number of walls per player in the state, so further variants (three players, unequal
 * walls, other goals or starts) are new rule sets rather than new engines. Players are seats
 * 0..n-1; seats 0 and 1 keep the two-player meaning (0 starts at the bottom and heads for row 0,
 * 1 starts at the top and heads for row 8).
 *
 * Like GameState, a MultiState is immutable; Uint8Arrays and arrays must not be mutated.
 */

export interface PlayerSpec {
  readonly start: Coord;
  readonly goal: Goal;
}

/** A wall given by position, e.g. a neutral obstacle placed before the first move. */
export interface WallSpec {
  readonly orientation: Orientation;
  readonly row: number;
  readonly col: number;
}

export interface MultiRules {
  /** Indexed by seat. */
  readonly players: readonly PlayerSpec[];
  /** Seats in the order they play, repeated cyclically. Every seat appears exactly once. */
  readonly turnOrder: readonly number[];
  /** Variant id (see variants.ts); absent = a plain rule set (tests, official games). */
  readonly mode?: string;
  /**
   * Team of every seat (0..k-1, at least two teams). When present the game is a team game: a
   * pawn reaching its own goal line wins for its whole team. Absent = every seat plays for itself.
   */
  readonly teams?: readonly number[];
  /**
   * Neutral walls on the board before the first move. They belong to nobody, are never counted in
   * anyone's walls and are part of the rules (a replay starts with them).
   */
  readonly neutralWalls?: readonly WallSpec[];
  /** Seed the neutral walls were generated from (documentation only; the walls are explicit). */
  readonly seed?: number;
  /** Name of the obstacle preset the walls came from (documentation only). */
  readonly preset?: string;
}

export interface MultiState extends WallLayout {
  readonly rules: MultiRules;
  readonly pawns: readonly Coord[];
  readonly wallsRemaining: readonly number[];
  /** Seat to move. Once the game is over it stays on the seat that made the winning move. */
  readonly currentPlayer: number;
  readonly winner: number | null;
  readonly ply: number;
}

const mid = (BOARD_SIZE - 1) / 2;
const last = BOARD_SIZE - 1;

/** The standard two-player game expressed as rules (equivalent to createInitialState). */
export const TWO_PLAYER_RULES: MultiRules = {
  players: [
    { start: { row: last, col: mid }, goal: { axis: 'row', index: 0 } },
    { start: { row: 0, col: mid }, goal: { axis: 'row', index: last } },
  ],
  turnOrder: [0, 1],
};

/**
 * Official four-player game: pawns on the middle of each side, each heading for the opposite
 * side. Seat 0 bottom, 1 top, 2 left, 3 right. Play goes clockwise as seen on the board:
 * bottom → left → top → right.
 */
export const FOUR_PLAYER_RULES: MultiRules = {
  players: [
    { start: { row: last, col: mid }, goal: { axis: 'row', index: 0 } },
    { start: { row: 0, col: mid }, goal: { axis: 'row', index: last } },
    { start: { row: mid, col: 0 }, goal: { axis: 'col', index: last } },
    { start: { row: mid, col: last }, goal: { axis: 'col', index: 0 } },
  ],
  turnOrder: [0, 2, 1, 3],
};

/** Official walls per player: 10 with two players, 5 with four. */
export const OFFICIAL_WALLS: Record<number, number> = { 2: WALLS_PER_PLAYER, 3: 6, 4: 5 };

export interface MultiSetup {
  rules?: MultiRules;
  /** One number for everybody or one per seat. Default: the official count. */
  wallsPerPlayer?: number | readonly number[];
  /** Seat that moves first (default: first in the turn order). */
  firstPlayer?: number;
  /** Positions for tests / puzzles: any of these may be given (defaults = start position). */
  pawns?: readonly Coord[];
  walls?: ReadonlyArray<{ orientation: Orientation; row: number; col: number }>;
  wallsRemaining?: readonly number[];
  ply?: number;
}

export function validateRules(rules: MultiRules): void {
  const n = rules.players.length;
  if (n < 2 || n > 4) throw new Error(`Unsupported player count: ${n}`);
  const order = [...rules.turnOrder].sort((a, b) => a - b);
  if (order.length !== n || order.some((seat, i) => seat !== i)) throw new Error('turnOrder must list every seat exactly once');
  for (const p of rules.players) {
    if (!inBounds(p.start.row, p.start.col)) throw new Error(`Pawn off board: ${JSON.stringify(p.start)}`);
    if ((p.goal.axis !== 'row' && p.goal.axis !== 'col') || !Number.isInteger(p.goal.index) || p.goal.index < 0 || p.goal.index >= BOARD_SIZE) {
      throw new Error(`Invalid goal line: ${JSON.stringify(p.goal)}`);
    }
  }
  if (rules.teams) {
    const t = rules.teams;
    if (t.length !== n || t.some((x) => !Number.isInteger(x) || x < 0 || x >= n)) throw new Error('teams must give a team number for every seat');
    const used = [...new Set(t)].sort((a, b) => a - b);
    if (used.length < 2 || used.some((x, i) => x !== i)) throw new Error('teams must be numbered 0..k-1 with at least two teams');
  }
  for (const w of rules.neutralWalls ?? []) {
    if ((w.orientation !== 'h' && w.orientation !== 'v') || !Number.isInteger(w.row) || !Number.isInteger(w.col) || !isWallAnchorInBounds(w.row, w.col)) {
      throw new Error(`Wall off board: ${JSON.stringify(w)}`);
    }
  }
}

/** Team of `seat` (the seat itself when the game has no teams). */
export function teamOf(rules: MultiRules, seat: number): number {
  return rules.teams ? rules.teams[seat] : seat;
}

/** Seats playing for the same side as `seat` (just `seat` in a game without teams). */
export function teamSeats(rules: MultiRules, seat: number): number[] {
  const team = teamOf(rules, seat);
  return rules.players.flatMap((_, s) => (teamOf(rules, s) === team ? [s] : []));
}

/** Seats that won the game (the whole team of the pawn that arrived), or [] while it is running. */
export function winningSeats(state: MultiState): number[] {
  return state.winner === null ? [] : teamSeats(state.rules, state.winner);
}

export function createMultiState(setup: MultiSetup = {}): MultiState {
  const rules = setup.rules ?? FOUR_PLAYER_RULES;
  validateRules(rules);
  const n = rules.players.length;
  const pawns = setup.pawns ?? rules.players.map((p) => p.start);
  if (pawns.length !== n) throw new Error('One pawn per player required');
  pawns.forEach((p, i) => {
    if (!inBounds(p.row, p.col)) throw new Error(`Pawn off board: ${JSON.stringify(p)}`);
    for (let j = 0; j < i; j++) if (sameCoord(p, pawns[j])) throw new Error('Pawns cannot share a cell');
  });

  let layout: WallLayout = { hWalls: new Uint8Array(NUM_WALL_SLOTS), vWalls: new Uint8Array(NUM_WALL_SLOTS) };
  for (const w of [...(rules.neutralWalls ?? []), ...(setup.walls ?? [])]) {
    if (!isWallAnchorInBounds(w.row, w.col)) throw new Error(`Wall off board: ${JSON.stringify(w)}`);
    if (wallConflicts(layout, w.orientation, w.row, w.col)) throw new Error(`Wall conflicts with an existing wall: ${JSON.stringify(w)}`);
    layout = withWall(layout, w.orientation, w.row, w.col);
  }
  pawns.forEach((p, i) => {
    if (!hasPathToGoal(layout, p, rules.players[i].goal)) throw new Error(`Player ${i} has no path to the goal`);
  });

  const walls = setup.wallsRemaining ?? (
    typeof setup.wallsPerPlayer === 'number'
      ? Array.from({ length: n }, () => setup.wallsPerPlayer as number)
      : setup.wallsPerPlayer ?? Array.from({ length: n }, () => OFFICIAL_WALLS[n])
  );
  if (walls.length !== n) throw new Error('One wall count per player required');

  const onGoalSeats = pawns.flatMap((p, i) => (onGoal(p, rules.players[i].goal) ? [i] : []));
  if (onGoalSeats.length > 1) throw new Error('More than one player cannot be on its goal line');
  const first = setup.firstPlayer ?? rules.turnOrder[0];
  if (!Number.isInteger(first) || first < 0 || first >= n) throw new Error(`Invalid first player: ${first}`);

  return {
    rules,
    pawns: pawns.map((p) => ({ row: p.row, col: p.col })),
    wallsRemaining: [...walls],
    hWalls: layout.hWalls,
    vWalls: layout.vWalls,
    currentPlayer: first,
    winner: onGoalSeats.length === 1 ? onGoalSeats[0] : null,
    ply: setup.ply ?? 0,
  };
}

export function playerCount(state: MultiState): number {
  return state.rules.players.length;
}

export function goalOf(state: MultiState, player: number): Goal {
  return state.rules.players[player].goal;
}

/** Seat that moves after `player`. */
export function nextPlayer(rules: MultiRules, player: number): number {
  const order = rules.turnOrder;
  return order[(order.indexOf(player) + 1) % order.length];
}

/** Seat that moved before `player` (inverse of nextPlayer). */
export function previousPlayer(rules: MultiRules, player: number): number {
  const order = rules.turnOrder;
  return order[(order.indexOf(player) + order.length - 1) % order.length];
}

/**
 * Position of `seat` in the turn order (0..n-1): what players see as "P1…Pn" and which colour
 * and wall texture the seat gets. Equals the seat itself in the two-player game.
 */
export function seatSlot(rules: MultiRules, seat: number): number {
  return rules.turnOrder.indexOf(seat);
}

/** Cells held by every pawn except `player`'s. */
function othersOf(state: MultiState, player: number): Coord[] {
  return state.pawns.filter((_, i) => i !== player);
}

/** Legal destinations of `player` (default: the seat to move). */
export function legalPawnMovesMulti(state: MultiState, player: number = state.currentPlayer): Coord[] {
  if (state.winner !== null) return [];
  return pawnMovesAmong(state, state.pawns[player], othersOf(state, player));
}

/**
 * Why `wall` cannot be placed by the seat to move, or 'ok'. Every player must keep a route to
 * its goal line; pawns never count as obstacles for that (they move away).
 */
export function checkWallMulti(state: MultiState, wall: WallAction): WallPlacementResult {
  if (state.winner !== null) return 'game-over';
  if (state.wallsRemaining[state.currentPlayer] <= 0) return 'no-walls-left';
  if (!isWallAnchorInBounds(wall.row, wall.col)) return 'out-of-bounds';
  if (wallConflicts(state, wall.orientation, wall.row, wall.col)) return 'overlap';
  const next = withWall(state, wall.orientation, wall.row, wall.col);
  for (let p = 0; p < playerCount(state); p++) {
    if (!hasPathToGoal(next, state.pawns[p], goalOf(state, p))) return 'blocks-path';
  }
  return 'ok';
}

/**
 * All legal wall placements for the seat to move (horizontal first, row-major). A wall can only
 * disconnect a player whose current shortest path it cuts, so full reachability checks run only
 * for those players. Equivalent to the brute force check (verified by tests).
 */
export function legalWallPlacementsMulti(state: MultiState): WallAction[] {
  if (state.winner !== null || state.wallsRemaining[state.currentPlayer] <= 0) return [];
  const n = playerCount(state);
  const edges: Set<number>[] = [];
  for (let p = 0; p < n; p++) {
    const path = shortestPathToGoal(state, state.pawns[p], goalOf(state, p));
    if (path === null) return legalWallPlacementsMultiBruteForce(state);
    edges.push(pathEdgeSet(path));
  }
  const result: WallAction[] = [];
  for (const orientation of ['h', 'v'] as const) {
    for (let row = 0; row < WALL_GRID; row++) {
      for (let col = 0; col < WALL_GRID; col++) {
        if (wallConflicts(state, orientation, row, col)) continue;
        let next: WallLayout | null = null;
        let ok = true;
        for (let p = 0; p < n && ok; p++) {
          if (!wallCutsEdges(edges[p], orientation, row, col)) continue;
          next ??= withWall(state, orientation, row, col);
          ok = hasPathToGoal(next, state.pawns[p], goalOf(state, p));
        }
        if (ok) result.push({ type: 'wall', orientation, row, col });
      }
    }
  }
  return result;
}

export function legalWallPlacementsMultiBruteForce(state: MultiState): WallAction[] {
  if (state.winner !== null || state.wallsRemaining[state.currentPlayer] <= 0) return [];
  const result: WallAction[] = [];
  for (const orientation of ['h', 'v'] as const) {
    for (let row = 0; row < WALL_GRID; row++) {
      for (let col = 0; col < WALL_GRID; col++) {
        const wall: WallAction = { type: 'wall', orientation, row, col };
        if (checkWallMulti(state, wall) === 'ok') result.push(wall);
      }
    }
  }
  return result;
}

/** Every legal action for the seat to move: pawn moves first, then walls. */
export function legalActionsMulti(state: MultiState): Action[] {
  if (state.winner !== null) return [];
  const moves: Action[] = legalPawnMovesMulti(state).map((to) => ({ type: 'move', to }));
  return moves.concat(legalWallPlacementsMulti(state));
}

export function isLegalActionMulti(state: MultiState, action: Action): boolean {
  if (state.winner !== null) return false;
  if (action.type === 'move') return legalPawnMovesMulti(state).some((c) => sameCoord(c, action.to));
  return checkWallMulti(state, action) === 'ok';
}

export class IllegalMultiActionError extends Error {
  readonly action: Action;
  constructor(action: Action) {
    super(`Illegal action: ${JSON.stringify(action)}`);
    this.name = 'IllegalMultiActionError';
    this.action = action;
  }
}

/** Applies a legal action for the seat to move. Throws IllegalMultiActionError otherwise. */
export function applyActionMulti(state: MultiState, action: Action): MultiState {
  if (!isLegalActionMulti(state, action)) throw new IllegalMultiActionError(action);
  return applyActionMultiUnchecked(state, action);
}

export function applyActionMultiUnchecked(state: MultiState, action: Action): MultiState {
  const player = state.currentPlayer;
  if (action.type === 'move') {
    const pawns = state.pawns.slice();
    pawns[player] = { row: action.to.row, col: action.to.col };
    const won = onGoal(action.to, goalOf(state, player));
    return {
      ...state,
      pawns,
      currentPlayer: won ? player : nextPlayer(state.rules, player),
      winner: won ? player : null,
      ply: state.ply + 1,
    };
  }
  const hWalls = action.orientation === 'h' ? state.hWalls.slice() : state.hWalls;
  const vWalls = action.orientation === 'v' ? state.vWalls.slice() : state.vWalls;
  (action.orientation === 'h' ? hWalls : vWalls)[wallIndex(action.row, action.col)] = 1;
  const wallsRemaining = state.wallsRemaining.slice();
  wallsRemaining[player] -= 1;
  return { ...state, hWalls, vWalls, wallsRemaining, currentPlayer: nextPlayer(state.rules, player), ply: state.ply + 1 };
}

export function isTerminalMulti(state: MultiState): boolean {
  return state.winner !== null;
}

/** Shortest route of `player` to its goal line (cells incl. start), or null. */
export function goalPathMulti(state: MultiState, player: number): Coord[] | null {
  return shortestPathToGoal(state, state.pawns[player], goalOf(state, player));
}

/** Steps `player` still needs to reach its goal line. */
export function goalDistanceMulti(state: MultiState, player: number): number {
  return distanceToGoal(state, state.pawns[player], goalOf(state, player));
}
