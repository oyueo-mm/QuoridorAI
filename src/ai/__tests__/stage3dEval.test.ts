import { describe, expect, it } from 'vitest';
import { randomMixedOpening } from '../../arena/openings';
import {
  WALL_GRID,
  applyActionUnchecked,
  createInitialState,
  distanceMap,
  distanceMapShared,
  distanceToRow,
  distanceWithExtraWall,
  goalRow,
  legalActions,
  pathCells,
  prepareLayers,
  layeredDistanceWithExtraWall,
  shortestPath,
  shortestPathCells,
  shortestPathMasked,
  rowMasks,
  buildReference,
} from '../../engine';
import type { GameState, Orientation, PlayerId } from '../../engine';
import { createRng } from '../rng';
import { DEFAULT_MINIMAX_SETTINGS, ORIGINAL_SEARCH } from '../minimaxAgent';
import { ALPHA_BETA_EVAL, createDistanceEvaluator, vulnerability, vulnerabilityFast, vulnerabilityReference, withVulnerabilityKernel } from '../search/evaluation';
import { runSearch } from '../search/minimax';

/** Positions from biased random play (many walls) after mixed openings; non-terminal. */
function positions(n: number, seed0: number, wallBias: number): GameState[] {
  const rng = createRng(seed0);
  const out: GameState[] = [createInitialState()];
  for (let seed = seed0; out.length < n; seed++) {
    let s = randomMixedOpening({ seed, plies: 8, wallProbability: 0.5, maxImbalance: 4 }).state;
    for (let i = 0; i < 40 && s.winner === null && out.length < n; i++) {
      out.push(s);
      const acts = legalActions(s);
      const walls = acts.filter((a) => a.type === 'wall');
      const pool = walls.length > 0 && rng() < wallBias ? walls : acts;
      s = applyActionUnchecked(s, pool[Math.floor(rng() * pool.length)]);
    }
  }
  return out.filter((s) => s.winner === null).slice(0, n);
}

const POS = [...positions(120, 5, 0.3), ...positions(120, 500, 0.7)];

/** The same layout with the pawn of `p` moved to an arbitrary cell (vulnerability ignores pawn legality). */
function withPawn(s: GameState, p: PlayerId, row: number, col: number): GameState {
  const pawns = p === 0 ? [{ row, col }, s.pawns[1]] : [s.pawns[0], { row, col }];
  return { ...s, pawns: pawns as unknown as typeof s.pawns };
}

describe('stage 3-D: exact E6 evaluation optimizations', () => {
  it('shortestPathCells returns the path of shortestPathMasked / shortestPath (same tie-breaking)', () => {
    for (const s of POS) {
      for (const p of [0, 1] as const) {
        for (let r = 0; r < 9; r += 2) {
          for (let c = 0; c < 9; c += 2) {
            const start = { row: r, col: c };
            const ref = shortestPath(s, start, goalRow(p));
            const len = shortestPathCells(s, start, goalRow(p));
            expect(len).toBe(ref ? ref.length : -1);
            if (ref) expect(Array.from(pathCells.subarray(0, len))).toEqual(ref.map((x) => x.row * 9 + x.col));
            expect(shortestPathMasked(s, start, goalRow(p))).toEqual(ref);
          }
        }
      }
    }
  });

  it('the wall-driven mask construction equals the cell-by-cell one', () => {
    for (const s of POS) {
      const a = rowMasks(s);
      const b = buildReference(s);
      expect(Array.from(a.east)).toEqual(Array.from(b.east));
      expect(Array.from(a.west)).toEqual(Array.from(b.west));
      expect(Array.from(a.south)).toEqual(Array.from(b.south));
      expect(Array.from(a.north)).toEqual(Array.from(b.north));
    }
  });

  it('memoised goal-row distance maps equal distanceMap and stay valid when asked repeatedly', () => {
    for (const s of POS) {
      for (const row of [0, 8, 4]) {
        const expected = Array.from(distanceMap(s, row));
        expect(Array.from(distanceMapShared(s, row))).toEqual(expected);
        expect(Array.from(distanceMapShared(s, row))).toEqual(expected);
      }
    }
  });

  it('layered extra-wall distance equals distanceWithExtraWall for every wall', () => {
    for (const s of POS.slice(0, 80)) {
      for (const p of [0, 1] as const) {
        const start = s.pawns[p];
        const d = prepareLayers(s, start, goalRow(p));
        expect(d).toBe(distanceToRow(s, start, goalRow(p)));
        for (const o of ['h', 'v'] as Orientation[]) {
          for (let r = 0; r < WALL_GRID; r++) {
            for (let c = 0; c < WALL_GRID; c++) {
              expect(layeredDistanceWithExtraWall(o, r, c)).toBe(distanceWithExtraWall(s, start, goalRow(p), o, r, c));
            }
          }
        }
      }
    }
  });

  it('layered queries stay exact in random order, across layouts and start cells (no stale scratch rows)', () => {
    const rng = createRng(4242);
    let checked = 0;
    for (let round = 0; round < 60; round++) {
      const s = POS[Math.floor(rng() * POS.length)];
      const p = (round % 2) as PlayerId;
      const t = withPawn(s, p, Math.floor(rng() * 9), Math.floor(rng() * 9));
      const start = t.pawns[p];
      prepareLayers(t, start, goalRow(p));
      for (let q = 0; q < 150; q++) {
        const o: Orientation = rng() < 0.5 ? 'h' : 'v';
        const r = Math.floor(rng() * WALL_GRID);
        const c = Math.floor(rng() * WALL_GRID);
        expect(layeredDistanceWithExtraWall(o, r, c)).toBe(distanceWithExtraWall(t, start, goalRow(p), o, r, c));
        checked++;
      }
    }
    expect(checked).toBe(9000);
  });

  it('vulnerabilityFast equals vulnerabilityReference for every position, player and start cell', () => {
    let nonzero = 0;
    for (const s of POS) {
      for (const p of [0, 1] as const) {
        expect(vulnerabilityFast(s, p)).toBe(vulnerabilityReference(s, p));
        const rng = createRng(s.ply * 7 + p);
        for (let k = 0; k < 6; k++) {
          const t = withPawn(s, p, Math.floor(rng() * 9), Math.floor(rng() * 9));
          const a = vulnerabilityFast(t, p);
          expect(a).toBe(vulnerabilityReference(t, p));
          if (a > 0) nonzero++;
        }
      }
    }
    expect(nonzero).toBeGreaterThan(200);
  });

  it('vulnerabilityFast equals the reference on many dense random wall layouts (stress)', () => {
    const dense = positions(900, 9100, 0.85);
    let nonzero = 0;
    let big = 0;
    let checked = 0;
    for (const s of dense) {
      for (const p of [0, 1] as const) {
        const rng = createRng(s.ply * 131 + p + checked);
        for (let k = 0; k < 4; k++) {
          const t = k === 0 ? s : withPawn(s, p, Math.floor(rng() * 9), Math.floor(rng() * 9));
          const a = vulnerabilityFast(t, p);
          expect(a).toBe(vulnerabilityReference(t, p));
          checked++;
          if (a > 0) nonzero++;
          if (a > 2) big++;
        }
      }
    }
    expect(checked).toBe(7200);
    expect(nonzero).toBeGreaterThan(1000);
    expect(big).toBeGreaterThan(100);
  });

  it('the kernel switch changes nothing but the implementation', () => {
    const s = POS[40];
    const slow = withVulnerabilityKernel('reference', () => vulnerability(s, 0));
    const fast = withVulnerabilityKernel('fast', () => vulnerability(s, 0));
    expect(fast).toBe(slow);
    // The wall layout masks were not disturbed by the in-place edge cuts.
    const m = rowMasks(s);
    const copy = [m.east, m.west, m.south, m.north].map((a) => Array.from(a));
    vulnerabilityFast(s, 0);
    vulnerabilityFast(s, 1);
    expect([m.east, m.west, m.south, m.north].map((a) => Array.from(a))).toEqual(copy);
  });

  it('E6 evaluate / explain / childEvaluator are identical with both kernels (cold and warm caches)', () => {
    const ref = createDistanceEvaluator(ALPHA_BETA_EVAL);
    const fast = createDistanceEvaluator(ALPHA_BETA_EVAL);
    for (let round = 0; round < 2; round++) {
      for (const s of POS.slice(0, 150)) {
        for (const p of [0, 1] as const) {
          const a = withVulnerabilityKernel('reference', () => ref.evaluate(s, p));
          const b = withVulnerabilityKernel('fast', () => fast.evaluate(s, p));
          expect(b).toBe(a);
        }
        const acts = legalActions(s).slice(0, 12);
        for (const p of [0, 1] as const) {
          const ra = withVulnerabilityKernel('reference', () => {
            const f = createDistanceEvaluator(ALPHA_BETA_EVAL).childEvaluator!(s, p);
            return acts.map((a) => f(applyActionUnchecked(s, a), a));
          });
          const rb = withVulnerabilityKernel('fast', () => {
            const f = createDistanceEvaluator(ALPHA_BETA_EVAL).childEvaluator!(s, p);
            return acts.map((a) => f(applyActionUnchecked(s, a), a));
          });
          expect(rb).toEqual(ra);
        }
      }
    }
  });

  it('fixed-depth Alpha-Beta (C1 and the original search) gives identical score, best move, PV and node counts', () => {
    const picks = POS.filter((_, i) => i % 24 === 0).slice(0, 10);
    for (const search of [{}, ORIGINAL_SEARCH]) {
      for (const s of picks) {
        const base = { ...DEFAULT_MINIMAX_SETTINGS, ...search, wallFilter: 'opponent-path' as const, evaluation: ALPHA_BETA_EVAL, maxDepth: 3, timeLimitMs: 0 };
        const a = runSearch(s, { ...base, evalKernel: 'reference' }, createDistanceEvaluator(ALPHA_BETA_EVAL));
        const b = runSearch(s, { ...base, evalKernel: 'fast' }, createDistanceEvaluator(ALPHA_BETA_EVAL));
        expect(b.score).toBe(a.score);
        expect(b.bestAction).toEqual(a.bestAction);
        expect(b.pv).toEqual(a.pv);
        expect(b.stats.nodes).toBe(a.stats.nodes);
      }
    }
  });
});
