/**
 * Core types for the Quoridor engine.
 *
 * Coordinate system (shared by the web UI, every AI and the future Python trainer):
 *   - row 0 is the top edge, row 8 the bottom edge; col 0 is the left edge.
 *   - Player 0 moves first, starts at (8, 4) and must reach row 0.
 *   - Player 1 moves second, starts at (0, 4) and must reach row 8.
 *
 * Walls are anchored on the 8x8 grid of interior intersections. A wall with anchor
 * (row, col) has its center at the corner shared by cells (row, col), (row, col+1),
 * (row+1, col) and (row+1, col+1):
 *   - 'h' (horizontal): lies below row `row`, spanning columns `col` and `col + 1`.
 *   - 'v' (vertical):   lies right of col `col`, spanning rows `row` and `row + 1`.
 */

export type PlayerId = 0 | 1;

export interface Coord {
  readonly row: number;
  readonly col: number;
}

export type Orientation = 'h' | 'v';

export interface MoveAction {
  readonly type: 'move';
  readonly to: Coord;
}

export interface WallAction {
  readonly type: 'wall';
  readonly orientation: Orientation;
  readonly row: number;
  readonly col: number;
}

export type Action = MoveAction | WallAction;

/** Wall occupancy, indexed by `row * 8 + col` (1 = wall present). */
export interface WallLayout {
  readonly hWalls: Uint8Array;
  readonly vWalls: Uint8Array;
}

/**
 * Immutable game state. Engine functions never mutate a state; they return a new one.
 * The Uint8Arrays must be treated as read-only.
 */
export interface GameState extends WallLayout {
  readonly pawns: readonly [Coord, Coord];
  readonly wallsRemaining: readonly [number, number];
  /** Player to move. Once the game is over this stays on the player who made the winning move. */
  readonly currentPlayer: PlayerId;
  readonly winner: PlayerId | null;
  /** Number of actions applied since the initial position. */
  readonly ply: number;
}

export type WallPlacementResult =
  | 'ok'
  | 'game-over'
  | 'no-walls-left'
  | 'out-of-bounds'
  | 'overlap'
  | 'blocks-path';
