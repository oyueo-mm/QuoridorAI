import { describe, expect, it } from 'vitest';
import {
  applyAction,
  applyActionUnchecked,
  createInitialState,
  distanceToRow,
  goalRow,
  hashState,
  legalActions,
  legalWallPlacements,
  legalWallPlacementsBruteForce,
  shortestPath,
} from '..';
import type { Action, GameState } from '..';

/** States from seeded uniform random playouts (wall-heavy, varied geometry). */
function* randomStates(games: number, seedBase: number): Generator<GameState> {
  for (let g = 0; g < games; g++) {
    let a = (seedBase + g * 7919) >>> 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let s = createInitialState();
    for (let ply = 0; ply < 60 && s.winner === null; ply++) {
      yield s;
      const actions = legalActions(s);
      // Favour pawn moves half the time so pawns travel and paths change shape.
      const moves = actions.filter((x) => x.type === 'move');
      const pool = rand() < 0.5 ? moves : actions;
      s = applyAction(s, pool[Math.floor(rand() * pool.length)]);
    }
  }
}

describe('engine optimisations are exact', () => {
  it('optimised legalWallPlacements equals the brute-force reference', () => {
    let checked = 0;
    for (const s of randomStates(12, 1)) {
      expect(legalWallPlacements(s)).toEqual(legalWallPlacementsBruteForce(s));
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('fast distanceToRow equals the shortest path length', () => {
    for (const s of randomStates(6, 2)) {
      for (const p of [0, 1] as const) {
        const path = shortestPath(s, s.pawns[p], goalRow(p));
        expect(distanceToRow(s, s.pawns[p], goalRow(p))).toBe(path ? path.length - 1 : Infinity);
      }
    }
  });

  it('applyActionUnchecked equals applyAction for legal actions', () => {
    for (const s of randomStates(3, 3)) {
      for (const a of legalActions(s).slice(0, 20)) {
        expect(applyActionUnchecked(s, a)).toEqual(applyAction(s, a));
      }
    }
  });
});

describe('Zobrist hash', () => {
  const m = (row: number, col: number): Action => ({ type: 'move', to: { row, col } });
  const w = (orientation: 'h' | 'v', row: number, col: number): Action => ({ type: 'wall', orientation, row, col });

  it('is equal for transpositions and differs for different positions', () => {
    const s0 = createInitialState();
    // Same set of moves in different order → same position.
    const a = [m(7, 4), w('h', 2, 2), m(6, 4), w('v', 5, 5)].reduce(applyAction, s0);
    const b = [m(7, 4), w('v', 5, 5), m(6, 4), w('h', 2, 2)].reduce(applyAction, s0);
    expect(hashState(a)).toEqual(hashState(b));
    expect(hashState(applyAction(s0, m(7, 4)))).not.toEqual(hashState(s0));
    // Side to move is part of the key.
    expect(hashState({ ...s0, currentPlayer: 1 })).not.toEqual(hashState(s0));
    // Walls remaining are part of the key.
    expect(hashState({ ...s0, wallsRemaining: [9, 10] })).not.toEqual(hashState(s0));
    expect(Number.isSafeInteger(hashState(a).key)).toBe(true);
  });

  it('has no key collisions across many distinct positions', () => {
    const seen = new Map<number, string>();
    for (const s of randomStates(10, 4)) {
      const { key } = hashState(s);
      const sig = JSON.stringify([s.pawns, [...s.hWalls], [...s.vWalls], s.wallsRemaining, s.currentPlayer]);
      const prev = seen.get(key);
      if (prev !== undefined) expect(prev).toBe(sig);
      seen.set(key, sig);
    }
  });
});
