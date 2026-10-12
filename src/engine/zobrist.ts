import { NUM_CELLS, NUM_WALL_SLOTS, WALLS_PER_PLAYER, cellIndex } from './board';
import type { GameState } from './types';

/**
 * Zobrist hashing for transposition tables. Two independent 32-bit hashes are combined
 * into one safe integer key (52 bits) plus a 32-bit check value, so accidental collisions
 * are negligible. Tables are generated from a fixed seed: keys are stable across runs.
 */

function makeTable(seed: number, size: number): Uint32Array {
  // xorshift32 — deterministic, no dependency on the AI RNG module.
  let x = seed >>> 0 || 1;
  const table = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    table[i] = x >>> 0;
  }
  return table;
}

// Layout: pawn0[81] pawn1[81] h[64] v[64] walls0[11] walls1[11] side[1]
const PAWN0 = 0;
const PAWN1 = PAWN0 + NUM_CELLS;
const HWALL = PAWN1 + NUM_CELLS;
const VWALL = HWALL + NUM_WALL_SLOTS;
const WALLS0 = VWALL + NUM_WALL_SLOTS;
const WALLS1 = WALLS0 + WALLS_PER_PLAYER + 1;
const SIDE = WALLS1 + WALLS_PER_PLAYER + 1;
const SIZE = SIDE + 1;

const TABLE_A = makeTable(0x9e3779b9, SIZE);
const TABLE_B = makeTable(0x85ebca6b, SIZE);

export interface StateHash {
  /** 52-bit key, safe to use as a Map key. */
  key: number;
  /** Independent 32-bit value to detect key collisions. */
  check: number;
}

export function hashState(state: GameState): StateHash {
  let a = 0;
  let b = 0;
  const mix = (i: number) => {
    a ^= TABLE_A[i];
    b ^= TABLE_B[i];
  };
  mix(PAWN0 + cellIndex(state.pawns[0].row, state.pawns[0].col));
  mix(PAWN1 + cellIndex(state.pawns[1].row, state.pawns[1].col));
  for (let i = 0; i < NUM_WALL_SLOTS; i++) {
    if (state.hWalls[i]) mix(HWALL + i);
    if (state.vWalls[i]) mix(VWALL + i);
  }
  mix(WALLS0 + state.wallsRemaining[0]);
  mix(WALLS1 + state.wallsRemaining[1]);
  if (state.currentPlayer === 1) mix(SIDE);
  const hi = a >>> 12; // 20 bits
  return { key: hi * 4294967296 + (b >>> 0), check: a >>> 0 };
}
