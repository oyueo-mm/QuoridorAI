import {
  FOUR_PLAYER_RULES,
  checkWallMulti,
  checkWallPlacement,
  goalPathMulti,
  goalRow,
  legalPawnMoves,
  legalPawnMovesMulti,
  seatSlot,
  shortestPath,
} from '../../engine';
import type { Coord, GameState, Goal, MultiRules, MultiState, WallAction, WallLayout, WallPlacementResult } from '../../engine';

/** What the board needs to know about a position — satisfied by GameState and MultiState. */
export interface BoardPosition extends WallLayout {
  readonly pawns: readonly Coord[];
  readonly currentPlayer: number;
  readonly winner: number | null;
}

/**
 * Rules the board applies for a game type: which pawns exist, where they head, what a click may
 * do. The board itself stays the same for two and four players.
 */
export interface BoardRules {
  readonly playerCount: number;
  /** Goal line of every seat. */
  readonly goals: readonly Goal[];
  /** Colour / label slot of a seat (turn-order position; the seat itself with two players). */
  slot(seat: number): number;
  legalMoves(state: BoardPosition): Coord[];
  checkWall(state: BoardPosition, wall: WallAction): WallPlacementResult;
  /** Shortest path of every player that has one. */
  paths(state: BoardPosition): { player: number; path: Coord[] }[];
}

export const TWO_PLAYER_BOARD: BoardRules = {
  playerCount: 2,
  goals: [{ axis: 'row', index: goalRow(0) }, { axis: 'row', index: goalRow(1) }],
  slot: (seat) => seat,
  legalMoves: (s) => legalPawnMoves(s as GameState),
  checkWall: (s, w) => checkWallPlacement(s as GameState, w),
  paths: (s) =>
    [0, 1].flatMap((p) => {
      const path = shortestPath(s, s.pawns[p], goalRow(p as 0 | 1));
      return path ? [{ player: p, path }] : [];
    }),
};

export function multiBoardRules(rules: MultiRules): BoardRules {
  return {
    playerCount: rules.players.length,
    goals: rules.players.map((p) => p.goal),
    slot: (seat) => seatSlot(rules, seat),
    legalMoves: (s) => legalPawnMovesMulti(s as MultiState),
    checkWall: (s, w) => checkWallMulti(s as MultiState, w),
    paths: (s) =>
      rules.players.flatMap((_, p) => {
        const path = goalPathMulti(s as MultiState, p);
        return path ? [{ player: p, path }] : [];
      }),
  };
}

export const FOUR_PLAYER_BOARD: BoardRules = multiBoardRules(FOUR_PLAYER_RULES);
