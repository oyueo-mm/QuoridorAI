import { describe, expect, it } from 'vitest';
import { agentSettings } from '../../arena/agentSpec';
import { parseMoveList, randomMixedOpening } from '../../arena/openings';
import { applyAction, createInitialState, formatAction, isLegalAction, legalActions } from '../../engine';
import type { GameState } from '../../engine';
import { DEFAULT_MINIMAX_SETTINGS } from '../minimaxAgent';
import { isCandidateLegal, pseudoCandidates, searchCandidates } from '../search/candidates';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator } from '../search/evaluation';
import { runSearch } from '../search/minimax';
import type { MinimaxSettings } from '../types';

const evaluator = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);
const search = (s: GameState, patch: Partial<MinimaxSettings>) =>
  runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, timeLimitMs: 0, ...patch }, evaluator);

/** Positions from short Alpha-Beta self-play after mixed openings (walls on the board); built once. */
let cache: GameState[] = [];
function positions(n: number): GameState[] {
  if (cache.length >= n) return cache.slice(0, n);
  const out: GameState[] = [createInitialState()];
  for (let seed = 1; out.length < n; seed++) {
    let s = randomMixedOpening({ seed, plies: 6, wallProbability: 0.3, maxImbalance: 2 }).state;
    for (let i = 0; i < 24 && s.winner === null; i++) {
      if (i % 4 === 0) out.push(s);
      s = applyAction(s, search(s, { maxDepth: 2 }).bestAction);
    }
  }
  cache = out;
  return out.slice(0, n);
}

/** Stage-1 tactic F4-ab5-vs-ab4/g178/p55: P1 wins in 5 plies only with f1h, e1v or f1v. */
const WIN5 =
  'd1 f9 c1 f8 c2 f7 c3 f6 c4 f5 c5 f4 c6 f3 e2h g3 g2h c6h g3v a6h f3v c5v h4h e6h c5 b4h c2h a4v a1h g4 c6 g5 b6 f5 a6 f4 a5 e4 a4 d4 a3 d3 b3 g6h b4 c3 c4 b3 d4 b2 d5 c2 c1h d2 e5';

describe('stage 2: path kernel inside the search', () => {
  it('masked and reference BFS give node-for-node identical searches', () => {
    for (const s of positions(10)) {
      for (const wallFilter of ['opponent-path', 'path-defense'] as const) {
        const a = search(s, { maxDepth: 4, wallFilter, pathKernel: 'reference' });
        const b = search(s, { maxDepth: 4, wallFilter, pathKernel: 'masked' });
        expect(b.stats.nodes).toBe(a.stats.nodes);
        expect(b.stats.cutoffs).toBe(a.stats.cutoffs);
        expect(b.score).toBe(a.score);
        expect(b.pv.map(formatAction)).toEqual(a.pv.map(formatAction));
      }
    }
  });
});

describe('stage 2: path-defense wall filter', () => {
  it('only produces legal actions and contains every opponent-path candidate', () => {
    for (const s of positions(25)) {
      const legal = new Set(legalActions(s).map(formatAction));
      const narrow = new Set(searchCandidates(s, 'opponent-path').map(formatAction));
      const wide = pseudoCandidates(s, 'path-defense');
      const verified = wide.filter((c) => isCandidateLegal(s, c)).map((c) => formatAction(c.action));
      for (const n of verified) expect(legal.has(n)).toBe(true);
      for (const n of narrow) expect(verified).toContain(n);
      expect(new Set(verified).size).toBe(verified.length); // no duplicates
      // A candidate dropped by the deferred check really is illegal.
      for (const c of wide) if (!isCandidateLegal(s, c)) expect(isLegalAction(s, c.action)).toBe(false);
    }
  });

  it('finds the stage-1 win-in-5 that opponent-path cannot see', () => {
    const s = parseMoveList(WIN5).positions.at(-1)!;
    const old = search(s, { maxDepth: 5, wallFilter: 'opponent-path' });
    expect(old.decided).toBe(false);
    const fixed = search(s, { maxDepth: 5, wallFilter: 'path-defense' });
    expect(fixed.decided).toBe(true);
    expect(fixed.score).toBeGreaterThan(9000);
    expect(['f1h', 'e1v', 'f1v']).toContain(formatAction(fixed.bestAction));
  });
});

describe('stage 2: path-defense limited to the end of the race', () => {
  it('still finds the win-in-5 (side to move is 2 steps from goal) with defenseMaxDistance 3', () => {
    const s = parseMoveList(WIN5).positions.at(-1)!;
    const r = search(s, { maxDepth: 5, wallFilter: 'path-defense', defenseMaxDistance: 3 });
    expect(r.decided).toBe(true);
    expect(['f1h', 'e1v', 'f1v']).toContain(formatAction(r.bestAction));
  });

  it('equals opponent-path while the side to move is farther than the limit', () => {
    for (const s of positions(15)) {
      const near = pseudoCandidates(s, 'path-defense', 3).map((c) => formatAction(c.action));
      const narrow = pseudoCandidates(s, 'opponent-path').map((c) => formatAction(c.action));
      const wide = pseudoCandidates(s, 'path-defense').map((c) => formatAction(c.action));
      expect(near.length).toBeGreaterThanOrEqual(narrow.length);
      expect(near.length).toBeLessThanOrEqual(wide.length);
      for (const n of narrow) expect(near).toContain(n);
    }
    const start = createInitialState(); // 8 steps from goal
    expect(pseudoCandidates(start, 'path-defense', 3)).toEqual(pseudoCandidates(start, 'opponent-path'));
  });
});

describe('stage 2: arena agent overrides', () => {
  it('passes Alpha-Beta overrides through while the budget keeps depth and time', () => {
    const spec = { kind: 'alphabeta' as const, depth: 3, simulations: 0, minimax: { wallFilter: 'path-defense' as const, pathKernel: 'reference' as const }, tag: 'pd' };
    const timed = agentSettings(spec, { mode: 'equal-time', timeMs: 300 }, 1).settings.minimax!;
    expect(timed).toMatchObject({ wallFilter: 'path-defense', pathKernel: 'reference', timeLimitMs: 300, maxDepth: 30, algorithm: 'alphabeta' });
    const fixed = agentSettings(spec, { mode: 'fixed', timeMs: 0 }, 1).settings.minimax!;
    expect(fixed).toMatchObject({ maxDepth: 3, timeLimitMs: 0 });
  });
});
