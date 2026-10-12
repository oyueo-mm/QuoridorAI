import {
  NUM_WALL_SLOTS,
  START_POSITIONS,
  WALLS_PER_PLAYER,
  goalRow,
  inBounds,
  isWallAnchorInBounds,
  opponentOf,
  sameCoord,
  wallIndex,
} from './board';
import { hasPathToRow } from './pathfinding';
import { isLegalAction } from './rules';
import { wallConflicts, withWall } from './walls';
import type { Action, Coord, GameState, Orientation, PlayerId, WallLayout } from './types';

export class IllegalActionError extends Error {
  readonly action: Action;
  constructor(action: Action, reason = 'Illegal action') {
    super(`${reason}: ${JSON.stringify(action)}`);
    this.name = 'IllegalActionError';
    this.action = action;
  }
}

export function createInitialState(): GameState {
  return {
    pawns: [START_POSITIONS[0], START_POSITIONS[1]],
    wallsRemaining: [WALLS_PER_PLAYER, WALLS_PER_PLAYER],
    hWalls: new Uint8Array(NUM_WALL_SLOTS),
    vWalls: new Uint8Array(NUM_WALL_SLOTS),
    currentPlayer: 0,
    winner: null,
    ply: 0,
  };
}

export interface StateSetup {
  pawns?: readonly [Coord, Coord];
  walls?: ReadonlyArray<{ orientation: Orientation; row: number; col: number }>;
  wallsRemaining?: readonly [number, number];
  currentPlayer?: PlayerId;
  ply?: number;
}

/**
 * Builds an arbitrary (but rule-consistent) position, e.g. for tests, puzzles or
 * comparing several AIs on the same state. Throws if the setup is not a reachable-looking
 * position: pawns overlapping or off-board, conflicting walls, or a player with no path.
 */
export function createState(setup: StateSetup = {}): GameState {
  const base = createInitialState();
  const pawns = setup.pawns ?? base.pawns;
  for (const p of pawns) {
    if (!inBounds(p.row, p.col)) throw new Error(`Pawn off board: ${JSON.stringify(p)}`);
  }
  if (sameCoord(pawns[0], pawns[1])) throw new Error('Pawns cannot share a cell');

  let layout: WallLayout = base;
  for (const w of setup.walls ?? []) {
    if (!isWallAnchorInBounds(w.row, w.col)) throw new Error(`Wall off board: ${JSON.stringify(w)}`);
    if (wallConflicts(layout, w.orientation, w.row, w.col)) {
      throw new Error(`Wall conflicts with an existing wall: ${JSON.stringify(w)}`);
    }
    layout = withWall(layout, w.orientation, w.row, w.col);
  }
  for (const player of [0, 1] as const) {
    if (!hasPathToRow(layout, pawns[player], goalRow(player))) {
      throw new Error(`Player ${player} has no path to the goal`);
    }
  }

  const reached0 = pawns[0].row === goalRow(0);
  const reached1 = pawns[1].row === goalRow(1);
  if (reached0 && reached1) throw new Error('Both players cannot be on their goal rows');

  return {
    pawns: [pawns[0], pawns[1]],
    wallsRemaining: setup.wallsRemaining ?? base.wallsRemaining,
    hWalls: layout.hWalls,
    vWalls: layout.vWalls,
    currentPlayer: setup.currentPlayer ?? 0,
    winner: reached0 ? 0 : reached1 ? 1 : null,
    ply: setup.ply ?? 0,
  };
}

/** Applies a legal action and returns the next state. Throws IllegalActionError otherwise. */
export function applyAction(state: GameState, action: Action): GameState {
  if (!isLegalAction(state, action)) throw new IllegalActionError(action);
  const player = state.currentPlayer;

  if (action.type === 'move') {
    const pawns: [Coord, Coord] = [state.pawns[0], state.pawns[1]];
    pawns[player] = { row: action.to.row, col: action.to.col };
    const won = action.to.row === goalRow(player);
    return {
      ...state,
      pawns,
      currentPlayer: won ? player : opponentOf(player),
      winner: won ? player : null,
      ply: state.ply + 1,
    };
  }

  const hWalls = action.orientation === 'h' ? state.hWalls.slice() : state.hWalls;
  const vWalls = action.orientation === 'v' ? state.vWalls.slice() : state.vWalls;
  (action.orientation === 'h' ? hWalls : vWalls)[wallIndex(action.row, action.col)] = 1;
  const wallsRemaining: [number, number] = [state.wallsRemaining[0], state.wallsRemaining[1]];
  wallsRemaining[player] -= 1;
  return {
    ...state,
    hWalls,
    vWalls,
    wallsRemaining,
    currentPlayer: opponentOf(player),
    ply: state.ply + 1,
  };
}

export function isTerminal(state: GameState): boolean {
  return state.winner !== null;
}
