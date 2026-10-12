import { describe, expect, it } from 'vitest';
import {
  WALLS_PER_PLAYER,
  applyAction,
  createInitialState,
  goalRow,
  hasPathToRow,
  isLegalAction,
  legalActions,
  sameCoord,
} from '..';
import type { GameState } from '..';

/** Small deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function countWalls(s: GameState): number {
  return s.hWalls.reduce((a, b) => a + b, 0) + s.vWalls.reduce((a, b) => a + b, 0);
}

function checkInvariants(s: GameState) {
  expect(sameCoord(s.pawns[0], s.pawns[1])).toBe(false);
  expect(hasPathToRow(s, s.pawns[0], goalRow(0))).toBe(true);
  expect(hasPathToRow(s, s.pawns[1], goalRow(1))).toBe(true);
  const used = 2 * WALLS_PER_PLAYER - s.wallsRemaining[0] - s.wallsRemaining[1];
  expect(countWalls(s)).toBe(used);
  for (let i = 0; i < 64; i++) {
    // A horizontal and vertical wall can never share a center.
    expect(s.hWalls[i] + s.vWalls[i]).toBeLessThanOrEqual(1);
  }
}

describe('random playouts', () => {
  it('preserve engine invariants', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rand = rng(seed);
      let s = createInitialState();
      for (let ply = 0; ply < 300 && s.winner === null; ply++) {
        const actions = legalActions(s);
        expect(actions.length).toBeGreaterThan(0);
        // 128 wall slots vs ≤5 pawn moves, so uniform sampling exhausts walls quickly.
        const action = actions[Math.floor(rand() * actions.length)];
        expect(isLegalAction(s, action)).toBe(true);
        s = applyAction(s, action);
        checkInvariants(s);
      }
    }
  });
});
