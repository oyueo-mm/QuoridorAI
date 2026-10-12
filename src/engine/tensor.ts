import { BOARD_SIZE, NUM_CELLS, NUM_WALL_SLOTS, WALL_GRID, cellIndex, isBlocked, opponentOf, wallIndex } from './board';
import { H_WALL_ACTION_OFFSET, V_WALL_ACTION_OFFSET } from './encoding';
import { distanceMap } from './pathfinding';
import type { GameState, PlayerId, WallLayout } from './types';

/**
 * Neural-network state encoding shared with training/quoridor_az/features.py.
 * Any change here must be mirrored in Python, bumps FEATURE_VERSION and invalidates models.
 *
 * Canonical view: the board is always seen from the player to move ("me"). For player 0 the
 * view equals the board; for player 1 it is rotated by 180° (cell (r, c) → (8−r, 8−c), wall
 * anchor (r, c) → (7−r, 7−c), orientation unchanged). In the view "me" always heads for
 * row 0 and the opponent for row 8.
 *
 * Planes (each 9×9, float32, index = plane·81 + row·9 + col, view coordinates):
 *   0  my pawn (one-hot)
 *   1  opponent pawn (one-hot)
 *   2  horizontal wall anchors (anchor (r, c) at [r][c]; row 8 and col 8 always 0)
 *   3  vertical wall anchors
 *   4  south edge of the cell blocked by a wall (row 8 always 0)
 *   5  east edge of the cell blocked by a wall (col 8 always 0)
 *   6  my walls in hand / 10 (constant plane)
 *   7  opponent walls in hand / 10 (constant plane)
 *   8  my BFS distance to my goal row / 80; unreachable cells = 1
 *   9  opponent BFS distance to its goal row / 80; unreachable cells = 1
 *  10  ones (marks the board area for zero-padded convolutions)
 *
 * Actions use the same 209-index layout as encoding.ts, but in view coordinates. The view
 * transform of an action index is an involution: canonicalActionIndex(i, p) maps engine →
 * view and view → engine.
 */
export const FEATURE_VERSION = 'qz-features-v1';
export const NUM_FEATURE_PLANES = 11;
export const PLANE_SIZE = NUM_CELLS;
export const DISTANCE_SCALE = 80;

export function canonicalActionIndex(index: number, player: PlayerId): number {
  if (player === 0) return index;
  if (index < H_WALL_ACTION_OFFSET) return NUM_CELLS - 1 - index;
  if (index < V_WALL_ACTION_OFFSET) return H_WALL_ACTION_OFFSET + (NUM_WALL_SLOTS - 1 - (index - H_WALL_ACTION_OFFSET));
  return V_WALL_ACTION_OFFSET + (NUM_WALL_SLOTS - 1 - (index - V_WALL_ACTION_OFFSET));
}

/** The position as seen by the player to move (rotated by 180° for player 1). */
export function canonicalView(state: GameState): { walls: WallLayout; me: { row: number; col: number }; opp: { row: number; col: number }; myWalls: number; oppWalls: number } {
  const p = state.currentPlayer;
  const o = opponentOf(p);
  if (p === 0) {
    return { walls: state, me: state.pawns[0], opp: state.pawns[1], myWalls: state.wallsRemaining[0], oppWalls: state.wallsRemaining[1] };
  }
  const hWalls = new Uint8Array(NUM_WALL_SLOTS);
  const vWalls = new Uint8Array(NUM_WALL_SLOTS);
  for (let i = 0; i < NUM_WALL_SLOTS; i++) {
    hWalls[NUM_WALL_SLOTS - 1 - i] = state.hWalls[i];
    vWalls[NUM_WALL_SLOTS - 1 - i] = state.vWalls[i];
  }
  const rot = (c: { row: number; col: number }) => ({ row: BOARD_SIZE - 1 - c.row, col: BOARD_SIZE - 1 - c.col });
  return { walls: { hWalls, vWalls }, me: rot(state.pawns[p]), opp: rot(state.pawns[o]), myWalls: state.wallsRemaining[p], oppWalls: state.wallsRemaining[o] };
}

export function encodeStatePlanes(state: GameState): Float32Array {
  const v = canonicalView(state);
  const out = new Float32Array(NUM_FEATURE_PLANES * PLANE_SIZE);
  const at = (plane: number, row: number, col: number) => plane * PLANE_SIZE + row * BOARD_SIZE + col;
  out[at(0, v.me.row, v.me.col)] = 1;
  out[at(1, v.opp.row, v.opp.col)] = 1;
  for (let r = 0; r < WALL_GRID; r++) {
    for (let c = 0; c < WALL_GRID; c++) {
      if (v.walls.hWalls[wallIndex(r, c)]) out[at(2, r, c)] = 1;
      if (v.walls.vWalls[wallIndex(r, c)]) out[at(3, r, c)] = 1;
    }
  }
  const myDist = distanceMap(v.walls, 0);
  const oppDist = distanceMap(v.walls, BOARD_SIZE - 1);
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (r < BOARD_SIZE - 1 && isBlocked(v.walls, r, c, 1, 0)) out[at(4, r, c)] = 1;
      if (c < BOARD_SIZE - 1 && isBlocked(v.walls, r, c, 0, 1)) out[at(5, r, c)] = 1;
      out[at(6, r, c)] = v.myWalls / 10;
      out[at(7, r, c)] = v.oppWalls / 10;
      const dm = myDist[cellIndex(r, c)];
      const dob = oppDist[cellIndex(r, c)];
      out[at(8, r, c)] = dm < 0 ? 1 : Math.min(dm, DISTANCE_SCALE) / DISTANCE_SCALE;
      out[at(9, r, c)] = dob < 0 ? 1 : Math.min(dob, DISTANCE_SCALE) / DISTANCE_SCALE;
      out[at(10, r, c)] = 1;
    }
  }
  return out;
}
