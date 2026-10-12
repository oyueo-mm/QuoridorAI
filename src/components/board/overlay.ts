import type { Action, Coord, GameState, PlayerId } from '../../engine';

/** A path to draw on the board, taken from an AI's DecisionTrace. */
export interface BoardPath {
  player: PlayerId;
  path: Coord[];
}

/** An action drawn on the board, optionally numbered (e.g. a step of a principal variation). */
export interface BoardMark {
  action: Action;
  player: PlayerId;
  label?: string;
}

/**
 * Read-only "what-if" view drawn instead of the live position, e.g. the position after a
 * candidate action an AI evaluated, together with the paths that AI computed for it.
 */
export interface BoardOverlay {
  state: GameState;
  title: string;
  /** Main action (solid outline). */
  highlight?: BoardMark;
  /** Additional numbered actions (dashed), e.g. earlier PV steps or an expected reply. */
  marks?: BoardMark[];
  paths: BoardPath[];
}
