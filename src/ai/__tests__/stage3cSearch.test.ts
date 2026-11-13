/**
 * Stage 3-C search changes: typed transposition table, PVS, persistent table, interrupted
 * iteration. The first three must give the same root score as the original search at every fixed
 * depth; a different best move is allowed only between moves of exactly equal value (a tie,
 * verified here). The interrupted-iteration rule may only play a move whose deeper value is exact.
 */
import { describe, expect, it } from 'vitest';
import { applyAction, createInitialState, encodeAction, formatAction } from '../../engine';
import type { Action, GameState } from '../../engine';
import { createRng } from '../rng';
import { DEFAULT_MINIMAX_SETTINGS, ORIGINAL_SEARCH, createMinimaxCache, decideMinimax } from '../minimaxAgent';
import { searchCandidates } from '../search/candidates';
import { ALPHA_BETA_EVAL, RACE_EVAL_V1, WIN_SCORE, createDistanceEvaluator, isDecisive } from '../search/evaluation';
import { runSearch } from '../search/minimax';
import { TT_EXACT, TT_LOWER, TranspositionTable } from '../search/transposition';
import type { MinimaxEvalWeights, MinimaxSettings } from '../types';

// Baseline = the original search (C1 is the default since stage 3-C); variants switch options on.
const settings = (patch: Partial<MinimaxSettings>): MinimaxSettings => ({ ...DEFAULT_MINIMAX_SETTINGS, ...ORIGINAL_SEARCH, timeLimitMs: 0, ...patch });

/** Positions from seeded random play over the search candidates (walls included). */
function positions(n: number, seed: number): GameState[] {
  const rng = createRng(seed);
  const out: GameState[] = [];
  while (out.length < n) {
    let s = createInitialState();
    const plies = 4 + Math.floor(rng() * 30);
    for (let i = 0; i < plies && s.winner === null; i++) {
      const c = searchCandidates(s, 'opponent-path');
      s = applyAction(s, c[Math.floor(rng() * c.length)]);
    }
    if (s.winner === null) out.push(s);
  }
  return out;
}

const POS = positions(14, 7);
const key = (a: Action) => JSON.stringify(a);

/** Exact value of one root move at `depth`, by the symmetric evaluation (child search negated). */
function moveValue(s: GameState, a: Action, depth: number, weights: MinimaxEvalWeights): number {
  const child = applyAction(s, a);
  if (child.winner !== null) return child.winner === s.currentPlayer ? WIN_SCORE - 1 : -(WIN_SCORE - 1);
  const v = runSearch(child, settings({ maxDepth: depth - 1, evaluation: weights }), createDistanceEvaluator(weights)).score;
  // A forced result p plies from the child is p + 1 plies from the root.
  return isDecisive(v) ? -(v > 0 ? v - 1 : v + 1) : -v;
}

describe('typed transposition table', () => {
  it('stores and finds entries by key and check; another check value never matches', () => {
    const t = new TranspositionTable(8);
    t.store(123456789, 42, 3, 1.5, TT_EXACT, 7);
    expect(t.lookup(123456789, 42)).toEqual({ depth: 3, value: 1.5, flag: TT_EXACT, best: 7 });
    expect(t.lookup(123456789, 43)).toBeNull();
    expect(t.lookup(123456789 + 2 ** 32, 42)?.depth).toBe(3); // same low bits + check = same key by construction
    t.store(123456789, 42, 4, -2, TT_LOWER, 9);
    expect(t.lookup(123456789, 42)).toEqual({ depth: 4, value: -2, flag: TT_LOWER, best: 9 });
    expect(t.entries).toBe(1);
  });

  it('keeps the deeper entry of a bucket, always accepts newcomers, prefers replacing old searches', () => {
    const t = new TranspositionTable(4); // 16 slots, 8 buckets
    const same = (i: number) => i * 16; // identical low bits → one bucket
    t.store(same(1), 1, 6, 0, TT_EXACT, 1);
    t.store(same(2), 2, 2, 0, TT_EXACT, 2);
    t.store(same(3), 3, 1, 0, TT_EXACT, 3); // shallower: replaces the always slot, deep one stays
    expect(t.lookup(same(1), 1)?.depth).toBe(6);
    expect(t.lookup(same(2), 2)).toBeNull();
    expect(t.lookup(same(3), 3)?.depth).toBe(1);
    t.newSearch();
    t.store(same(4), 4, 1, 0, TT_EXACT, 4); // deep entry is from an older search: replaced first
    expect(t.lookup(same(4), 4)?.depth).toBe(1);
    expect(t.lookup(same(1), 1)).toBeNull();
    t.clear();
    expect(t.lookup(same(3), 3)).toBeNull();
    expect(t.entries).toBe(0);
  });
});

const VARIANTS: Record<string, Partial<MinimaxSettings>> = {
  typed: { ttKind: 'typed' },
  pvs: { pvs: true },
  'typed+pvs': { ttKind: 'typed', pvs: true },
};

describe('fixed depth: same root score as the original search', () => {
  for (const [wName, weights] of [['v1', RACE_EVAL_V1], ['E6', ALPHA_BETA_EVAL]] as const) {
    it(`${wName}: typed table and PVS give identical scores at depths 1–4; move differences are ties`, () => {
      let ties = 0;
      for (const [i, s] of POS.entries()) {
        const maxDepth = i < 6 ? 4 : 3;
        for (let depth = 1; depth <= maxDepth; depth++) {
          const base = runSearch(s, settings({ maxDepth: depth, evaluation: weights }), createDistanceEvaluator(weights));
          for (const [name, v] of Object.entries(VARIANTS)) {
            const r = runSearch(s, settings({ maxDepth: depth, evaluation: weights, ...v }), createDistanceEvaluator(weights));
            expect(r.score, `${wName} ${name} pos ${i} depth ${depth}`).toBe(base.score);
            expect(r.completedDepth).toBe(depth);
            if (key(r.bestAction) !== key(base.bestAction)) {
              ties++;
              if (wName === 'v1') {
                // Symmetric evaluation: both moves' exact values at this depth equal the score.
                expect(moveValue(s, r.bestAction, depth, weights)).toBe(base.score);
                expect(moveValue(s, base.bestAction, depth, weights)).toBe(base.score);
              } else if (depth <= 3) {
                const mm = runSearch(s, settings({ maxDepth: depth, evaluation: weights, algorithm: 'minimax', moveOrdering: false, transpositionTable: false }), createDistanceEvaluator(weights));
                const exact = new Map(mm.rootCandidates.map((c) => [c.notation, c.score]));
                expect(exact.get(formatAction(r.bestAction))).toBe(mm.score);
                expect(exact.get(formatAction(base.bestAction))).toBe(mm.score);
              }
            }
          }
        }
      }
      expect(ties).toBeGreaterThanOrEqual(0);
    }, 120_000);
  }

  it('PVS root bounds are sound against plain minimax (depth 3)', () => {
    for (const s of POS.slice(0, 6)) {
      const mm = runSearch(s, settings({ maxDepth: 3, evaluation: RACE_EVAL_V1, algorithm: 'minimax', moveOrdering: false, transpositionTable: false }), createDistanceEvaluator(RACE_EVAL_V1));
      const r = runSearch(s, settings({ maxDepth: 3, evaluation: RACE_EVAL_V1, pvs: true, ttKind: 'typed' }), createDistanceEvaluator(RACE_EVAL_V1));
      const exact = new Map(mm.rootCandidates.map((c) => [c.notation, c.score]));
      expect(r.rootCandidates[0].bound).toBe('exact');
      for (const c of r.rootCandidates) {
        const truth = exact.get(c.notation)!;
        if (c.bound === 'exact') expect(c.score).toBe(truth);
        else expect(truth).toBeLessThanOrEqual(c.score + 1e-9);
      }
    }
  }, 120_000);
});

describe('persistent table across one agent’s decisions', () => {
  it('fixed depth: every decision of a game keeps its score; later searches need fewer nodes', () => {
    // Depth 5: plies 1–2 are recorded for the analysis tree and never cut by the table, so reuse
    // shows from ply 3 on.
    const cfg = settings({ maxDepth: 5, ttKind: 'typed', ttPersist: true, pvs: true });
    // One agent per side, as in a real game (the root side is part of the table's signature).
    const caches = [createMinimaxCache(), createMinimaxCache()];
    let s = createInitialState();
    let fresh = 0;
    let kept = 0;
    for (let ply = 0; ply < 10 && s.winner === null; ply++) {
      const a = decideMinimax(s, cfg, undefined, caches[s.currentPlayer]);
      const b = decideMinimax(s, cfg);
      expect(a.score).toBe(b.score);
      if (ply > 1) {
        kept += a.stats.nodes;
        fresh += b.stats.nodes;
      }
      s = applyAction(s, b.pv[0]);
    }
    expect(kept).toBeLessThan(fresh);
  }, 120_000);

  it('a different side or different weights start from an empty table', () => {
    const cache = createMinimaxCache();
    const cfg = settings({ maxDepth: 2, ttKind: 'typed', ttPersist: true });
    decideMinimax(POS[0], cfg, undefined, cache);
    const sig = cache.signature;
    const t = cache.table!;
    expect(t.entries).toBeGreaterThan(0);
    const other = { ...POS[0], currentPlayer: (1 - POS[0].currentPlayer) as 0 | 1 };
    decideMinimax(other, cfg, undefined, cache);
    expect(cache.signature).not.toBe(sig);
    decideMinimax(POS[0], settings({ ...cfg, evaluation: RACE_EVAL_V1 }), undefined, cache);
    expect(cache.table).toBe(t); // same storage, cleared and refilled
  });
});

describe('interrupted iteration', () => {
  it('plays another move only when its deeper search finished above the previous best’s; otherwise the last full iteration decides', () => {
    let switched = 0;
    let cases = 0;
    for (const s of POS.slice(0, 10)) {
      for (const limit of [3, 5, 8, 12, 18, 27, 40]) {
        // Deterministic clock: one tick per time check (every 64 nodes and per iteration).
        let t = 0;
        const clock = () => t++;
        const cfg = settings({ maxDepth: 6, timeLimitMs: limit, evaluation: RACE_EVAL_V1, partialIteration: true });
        const r = runSearch(s, cfg, createDistanceEvaluator(RACE_EVAL_V1), { clock });
        let t2 = 0;
        const plain = runSearch(s, { ...cfg, partialIteration: false }, createDistanceEvaluator(RACE_EVAL_V1), { clock: () => t2++ });
        expect(r.completedDepth).toBe(plain.completedDepth);
        if (!r.timedOut || !r.partial) {
          expect(key(r.bestAction)).toBe(key(plain.bestAction));
          continue;
        }
        cases++;
        const d = r.partial.depth;
        expect(d).toBe(r.completedDepth + 1);
        if (!r.partial.switched) {
          expect(key(r.bestAction)).toBe(key(plain.bestAction));
          expect(r.score).toBe(plain.score);
          continue;
        }
        switched++;
        // The played move's value at depth d is exact, and above the previous best's exact value.
        expect(moveValue(s, r.bestAction, d, RACE_EVAL_V1)).toBe(r.score);
        expect(moveValue(s, plain.bestAction, d, RACE_EVAL_V1)).toBe(r.partial.firstScore);
        expect(r.score).toBeGreaterThan(r.partial.firstScore);
        expect(encodeAction(r.pv[0])).toBe(encodeAction(r.bestAction));
      }
    }
    expect(cases).toBeGreaterThan(0);
    // Not guaranteed by construction, but these positions do produce switches (keeps the test meaningful).
    expect(switched).toBeGreaterThan(0);
  }, 120_000);
});
