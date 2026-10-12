import type { Action, Orientation, PlayerId } from '../engine';

/**
 * Who placed which wall. The rules engine stores walls by position and orientation only, so
 * ownership is reconstructed from the game record (the sequence of actions and the player who
 * made each), not guessed from the board. A wall without an entry has no known owner and is
 * drawn neutral.
 */
export type WallOwners = ReadonlyMap<string, PlayerId>;

export const NO_WALL_OWNERS: WallOwners = new Map();

export function wallKey(orientation: Orientation, row: number, col: number): string {
  return `${orientation}${row},${col}`;
}

/** One entry of a game record. */
export interface RecordedAction {
  action: Action;
  player: PlayerId;
}

/**
 * Owners of the walls placed by `moves` (in order), on top of `base` (owners already known
 * for the start position, e.g. from an opening move list). Walls are permanent and a slot can
 * be used once, so the map is valid for every position along the record.
 */
export function wallOwnersFromMoves(moves: readonly RecordedAction[], base: WallOwners = NO_WALL_OWNERS): WallOwners {
  let owners: Map<string, PlayerId> | null = null;
  for (const { action, player } of moves) {
    if (action.type !== 'wall') continue;
    owners ??= new Map(base);
    owners.set(wallKey(action.orientation, action.row, action.col), player);
  }
  return owners ?? base;
}
