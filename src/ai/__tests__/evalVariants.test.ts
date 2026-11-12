import { describe, expect, it } from 'vitest';
import { mirrorState, randomMixedOpening } from '../../arena/openings';
import {
  NUM_WALL_SLOTS,
  WALL_GRID,
  applyActionUnchecked,
  createInitialState,
  distanceToRow,
  distanceWithExtraWall,
  goalRow,
  legalActions,
  opponentOf,
  prepareExtraWallDistances,
  preparedDistanceWithExtraWall,
  wallConflicts,
  withWall,
} from '../../engine';
import type { GameState, Orientation, PlayerId } from '../../engine';
import { createRng } from '../rng';
import { RACE_EVAL_V1, createDistanceEvaluator, vulnerability } from '../search/evaluation';
import { runSearch } from '../search/minimax';
import { DEFAULT_MINIMAX_SETTINGS } from '../minimaxAgent';
import type { MinimaxEvalWeights } from '../types';

export const VARIANTS: Record<string, MinimaxEvalWeights> = {
  base: RACE_EVAL_V1,
  e1: { ...RACE_EVAL_V1, wallDecay: 0.85, wallPhaseSum: 10 },
  e2: { ...RACE_EVAL_V1, distanceCurve: 6 },
  e3: { ...RACE_EVAL_V1, vulnerability: 0.5 },
  e4: { ...RACE_EVAL_V1, vulnerabilityThreat: 0.5 },
  all: { ...RACE_EVAL_V1, wallDecay: 0.85, wallPhaseSum: 10, distanceCurve: 6, vulnerability: 0.5, vulnerabilityThreat: 0.5 },
};

/** Positions with walls from random play after mixed openings (non-terminal). */
function positions(n: number): GameState[] {
  const rng = createRng(31);
  const out: GameState[] = [createInitialState()];
  for (let seed = 1; out.length < n; seed++) {
    let s = randomMixedOpening({ seed, plies: 8, wallProbability: 0.5, maxImbalance: 4 }).state;
    for (let i = 0; i < 30 && s.winner === null && out.length < n; i++) {
      out.push(s);
      const acts = legalActions(s);
      s = applyActionUnchecked(s, acts[Math.floor(rng() * acts.length)]);
    }
  }
  return out.filter((s) => s.winner === null).slice(0, n);
}
const POS = positions(60);

describe('stage 3-B evaluation variants', () => {
  it('default weights give exactly the original formula', () => {
    const ev = createDistanceEvaluator(RACE_EVAL_V1);
    for (const s of POS) {
      for (const p of [0, 1] as const) {
        const o = opponentOf(p);
        const expected =
          distanceToRow(s, s.pawns[o], goalRow(o)) - distanceToRow(s, s.pawns[p], goalRow(p)) +
          (s.wallsRemaining[p] - s.wallsRemaining[o]) + (s.currentPlayer === p ? 0.5 : -0.5);
        expect(ev.evaluate(s, p)).toBe(expected);
        expect(ev.explain(s, p).score).toBe(expected);
        expect(ev.explain(s, p).terms.extra).toBeUndefined();
      }
    }
  });

  for (const [name, w] of Object.entries(VARIANTS)) {
    it(`${name}: childEvaluator = evaluate, mirror-invariant, zero-sum, explain consistent`, () => {
      const ev = createDistanceEvaluator(w);
      for (const s of POS.slice(0, 12)) {
        for (const p of [0, 1] as const) {
          const v = ev.evaluate(s, p);
          expect(Number.isFinite(v)).toBe(true);
          expect(ev.evaluate(mirrorState(s), p)).toBeCloseTo(v, 9);
          expect(ev.evaluate(s, opponentOf(p) as PlayerId)).toBeCloseTo(-v, 9);
          expect(ev.explain(s, p).score).toBeCloseTo(v, 9);
          const child = ev.childEvaluator!(s, p);
          for (const a of legalActions(s)) {
            const c = applyActionUnchecked(s, a);
            if (c.winner !== null) continue;
            expect(child(c, a)).toBeCloseTo(ev.evaluate(c, p), 9);
          }
        }
      }
    });
  }

  it('variants change the evaluation (they are not no-ops)', () => {
    const base = createDistanceEvaluator(RACE_EVAL_V1);
    for (const name of ['e1', 'e2', 'e3', 'e4']) {
      const ev = createDistanceEvaluator(VARIANTS[name]);
      expect(POS.some((s) => Math.abs(ev.evaluate(s, 0) - base.evaluate(s, 0)) > 1e-6)).toBe(true);
    }
  });

  it('search with each variant is deterministic', () => {
    for (const w of Object.values(VARIANTS)) {
      const ev = createDistanceEvaluator(w);
      const s = POS[25];
      const a = runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: 3, timeLimitMs: 0, evaluation: w }, ev);
      const b = runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: 3, timeLimitMs: 0, evaluation: w }, createDistanceEvaluator(w));
      expect(b.stats.nodes).toBe(a.stats.nodes);
      expect(b.score).toBe(a.score);
    }
  });
});

describe('path vulnerability', () => {
  it('equals a brute force over every non-overlapping wall', () => {
    for (const s of POS.slice(0, 25)) {
      for (const p of [0, 1] as const) {
        const goal = goalRow(p);
        const d = distanceToRow(s, s.pawns[p], goal);
        let worst = 0;
        for (const o of ['h', 'v'] as Orientation[]) {
          for (let r = 0; r < WALL_GRID; r++) {
            for (let c = 0; c < WALL_GRID; c++) {
              if (wallConflicts(s, o, r, c)) continue;
              const d2 = distanceToRow(withWall(s, o, r, c), s.pawns[p], goal);
              if (Number.isFinite(d2)) worst = Math.max(worst, d2 - d);
            }
          }
        }
        expect(vulnerability(s, p)).toBe(worst);
      }
    }
    expect(vulnerability(createInitialState(), 0)).toBe(1);
  });

  it('distanceWithExtraWall equals placing the wall for real', () => {
    const rng = createRng(77);
    for (const s of POS.slice(0, 50)) {
      for (let k = 0; k < 20; k++) {
        const o: Orientation = rng() < 0.5 ? 'h' : 'v';
        const r = Math.floor(rng() * WALL_GRID);
        const c = Math.floor(rng() * WALL_GRID);
        if (wallConflicts(s, o, r, c)) continue;
        const p = (k % 2) as PlayerId;
        expect(distanceWithExtraWall(s, s.pawns[p], goalRow(p), o, r, c)).toBe(distanceToRow(withWall(s, o, r, c), s.pawns[p], goalRow(p)));
      }
    }
    expect(NUM_WALL_SLOTS).toBe(64);
  });

  it('prepared (resumed-BFS) extra-wall distance equals distanceWithExtraWall for every wall', () => {
    for (const s of POS.slice(0, 40)) {
      for (const p of [0, 1] as const) {
        const d = prepareExtraWallDistances(s, s.pawns[p], goalRow(p));
        expect(d).toBe(distanceToRow(s, s.pawns[p], goalRow(p)));
        for (const o of ['h', 'v'] as Orientation[]) {
          for (let r = 0; r < WALL_GRID; r++) {
            for (let c = 0; c < WALL_GRID; c++) {
              expect(preparedDistanceWithExtraWall(o, r, c)).toBe(distanceWithExtraWall(s, s.pawns[p], goalRow(p), o, r, c));
            }
          }
        }
      }
    }
  });

  it('the vulnerability cache gives the same scores warm as cold (exact layout keys)', () => {
    for (const w of [VARIANTS.e3, VARIANTS.e4]) {
      const shared = createDistanceEvaluator(w);
      for (let round = 0; round < 2; round++) {
        for (const s of POS) {
          for (const p of [0, 1] as const) expect(shared.evaluate(s, p)).toBe(createDistanceEvaluator(w).evaluate(s, p));
        }
      }
    }
  });
});
