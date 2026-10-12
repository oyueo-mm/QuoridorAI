import type { Action, Coord, GameState, PlayerId } from '../../engine';

/** A path to draw on the board, taken from an AI's DecisionTrace. */
export interface BoardPath {
  player: PlayerId;
  path: Coord[];
}

/**
 * Read-only "what-if" view drawn instead of the live position, e.g. the position after a
 * candidate action an AI evaluated, together with the paths that AI computed for it.
 */
export interface BoardOverlay {
  state: GameState;
  title: string;
  highlight?: { action: Action; player: PlayerId };
  paths: BoardPath[];
}
