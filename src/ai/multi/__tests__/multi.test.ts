import { describe, expect, it } from 'vitest';
import {
  FOUR_PLAYER_RULES,
  TWO_PLAYER_RULES,
  applyActionMulti,
  asymmetricRules,
  createMultiState,
  defaultAsymmetricPlayers,
  fixedRules,
  formatAction,
  isLegalActionMulti,
  legalActionsMulti,
  legalWallPlacementsMulti,
  nextPlayer,
  obstacleRules,
} from '../../../engine';
import type { Action, MultiGameMode, MultiRules, MultiState } from '../../../engine';
import { defaultWalls } from '../../../match/multiRecord';
import { decideMultiGreedy, DEFAULT_MULTI_GREEDY_WEIGHTS } from '../greedy';
import { MAXN_PRESETS, WIN, decideMultiMaxN, resolveMaxNSettings } from '../maxn';
import { decideMultiRandom } from '../random';
import { decideMulti, defaultAgentSpec } from '../registry';

const MODES: MultiGameMode[] = ['four-player', 'race-2', 'race-4', 'three-player', 'team-2v2'];

function initial(rules: MultiRules, walls?: number): MultiState {
  const n = rules.players.length;
  return createMultiState({ rules, wallsPerPlayer: walls ?? (n === 2 ? 10 : 5) });
}

const allRules: [string, MultiRules][] = [
  ...MODES.map((m): [string, MultiRules] => [m, fixedRules(m)!]),
  ['asymmetric', asymmetricRules(defaultAsymmetricPlayers(3))],
  ['obstacle', obstacleRules(3, 'normal', 7)],
];

/** Plays `plies` legal moves chosen by a cheap rule so tests can reach mid-game positions. */
function midgame(rules: MultiRules, plies: number): MultiState {
  let s = initial(rules);
  for (let i = 0; i < plies && s.winner === null; i++) {
    const d = decideMultiGreedy(s, DEFAULT_MULTI_GREEDY_WEIGHTS);
    s = applyActionMulti(s, d.action);
  }
  return s;
}

describe('Multi Random', () => {
  it.each(allRules)('returns a legal action in %s', (_name, rules) => {
    const s = initial(rules);
    for (let i = 0; i < 20; i++) {
      const d = decideMultiRandom(s, 1000 + i, i);
      expect(isLegalActionMulti(s, d.action)).toBe(true);
      expect(d.trace.candidateCount).toBe(legalActionsMulti(s).length);
      expect(d.trace.pawnMoveCount + d.trace.wallCount).toBe(d.trace.candidateCount);
    }
  });

  it('is reproducible for the same state, seed and stream position, and streams are independent', () => {
    const s = initial(FOUR_PLAYER_RULES);
    const a = decideMultiRandom(s, 42, 3);
    const b = decideMultiRandom(s, 42, 3);
    expect(b.action).toEqual(a.action);
    expect(b.trace.roll).toBe(a.trace.roll);
    const rolls = new Set([0, 1, 2, 3, 4, 5].map((i) => decideMultiRandom(s, 42, i).trace.roll));
    expect(rolls.size).toBe(6);
    expect(decideMultiRandom(s, 43, 3).trace.roll).not.toBe(a.trace.roll);
  });

  it('moves a pawn when no wall is left and refuses a finished game', () => {
    const s = createMultiState({ rules: FOUR_PLAYER_RULES, wallsPerPlayer: 0 });
    for (let i = 0; i < 10; i++) expect(decideMultiRandom(s, i).action.type).toBe('move');
    const won = createMultiState({ rules: TWO_PLAYER_RULES, pawns: [{ row: 1, col: 4 }, { row: 0, col: 3 }] });
    const finished = applyActionMulti(won, { type: 'move', to: { row: 0, col: 4 } });
    expect(() => decideMultiRandom(finished, 1)).toThrow();
  });
});

describe('Multi Greedy', () => {
  it.each(allRules)('returns a legal action in %s', (_name, rules) => {
    const s = midgame(rules, 6);
    const d = decideMultiGreedy(s, DEFAULT_MULTI_GREEDY_WEIGHTS);
    expect(isLegalActionMulti(s, d.action)).toBe(true);
    expect(d.trace.candidates[0].rank).toBe(1);
    expect(d.trace.before.distances).toHaveLength(rules.players.length);
  });

  it('takes the winning move', () => {
    const s = createMultiState({ rules: FOUR_PLAYER_RULES, pawns: [{ row: 1, col: 4 }, { row: 0, col: 2 }, { row: 4, col: 0 }, { row: 4, col: 8 }], wallsPerPlayer: 5 });
    const d = decideMultiGreedy(s, DEFAULT_MULTI_GREEDY_WEIGHTS);
    expect(d.action).toEqual({ type: 'move', to: { row: 0, col: 4 } });
    expect(d.trace.candidates[0].immediateWin).toBe(true);
  });

  it('blocks an opponent that would win next move', () => {
    // Seat 1 (top → row 8) stands one step from its goal; seat 0 is far away and holds walls.
    const s = createMultiState({ rules: TWO_PLAYER_RULES, pawns: [{ row: 4, col: 4 }, { row: 7, col: 4 }], wallsPerPlayer: 10 });
    const d = decideMultiGreedy(s, DEFAULT_MULTI_GREEDY_WEIGHTS);
    expect(d.action.type).toBe('wall');
    const after = applyActionMulti(s, d.action);
    expect(after.winner).toBeNull();
    const reply = decideMultiGreedy(after, DEFAULT_MULTI_GREEDY_WEIGHTS);
    expect(reply.trace.candidates[0].immediateWin).toBe(false);
    expect(d.trace.candidates[0].threats).toEqual([]);
    expect(d.trace.rationale.length).toBeGreaterThan(0);
  });

  it('values the wall effect on the shared goal line of a two-player race', () => {
    const s = initial(fixedRules('race-2')!);
    const d = decideMultiGreedy(s, DEFAULT_MULTI_GREEDY_WEIGHTS);
    const wallCandidate = d.trace.candidates.find((c) => c.action.type === 'wall')!;
    expect(wallCandidate.terms.wall).toBeLessThan(0);
    // The opponent's distance after the best wall is at least its distance before.
    expect(wallCandidate.distances[1]).toBeGreaterThanOrEqual(d.trace.before.distances[1]);
  });

  it('counts allies in a team game and not in an individual one', () => {
    const team = initial(fixedRules('team-2v2')!);
    const t = decideMultiGreedy(team, DEFAULT_MULTI_GREEDY_WEIGHTS);
    expect(t.trace.candidates.some((c) => c.terms.ally !== 0)).toBe(true);
    const ffa = decideMultiGreedy(initial(FOUR_PLAYER_RULES), DEFAULT_MULTI_GREEDY_WEIGHTS);
    expect(ffa.trace.candidates.every((c) => c.terms.ally === 0 && !c.allyReady)).toBe(true);
  });

  it('does not wall in its own teammate when a pawn move is as good', () => {
    // Team A = seats 0 (bottom) and 2 (top). Seat 2 is one step from its goal: walls that lengthen its route must not be chosen.
    const rules = fixedRules('team-2v2')!;
    const s = createMultiState({ rules, pawns: [{ row: 5, col: 4 }, { row: 4, col: 0 }, { row: 7, col: 4 }, { row: 3, col: 8 }], wallsPerPlayer: 5 });
    const d = decideMultiGreedy(s, DEFAULT_MULTI_GREEDY_WEIGHTS);
    const after = applyActionMulti(s, d.action);
    const allyDist = d.trace.candidates[0].distances[2];
    expect(allyDist).toBeLessThanOrEqual(d.trace.before.distances[2]);
    expect(after.winner).toBeNull();
  });
});

describe('Multi Max-N', () => {
  const quick = { ...MAXN_PRESETS.normal, maxDepth: 3, timeMs: 5000, maxNodes: 60_000 };

  it.each(allRules)('returns a legal action with a per-seat value vector in %s', (_name, rules) => {
    const s = midgame(rules, 4);
    const d = decideMultiMaxN(s, { ...quick, maxDepth: 2 });
    expect(isLegalActionMulti(s, d.action)).toBe(true);
    expect(d.trace.candidates[0].values).toHaveLength(rules.players.length);
    expect(d.trace.completedDepth).toBeGreaterThanOrEqual(1);
    // every wall candidate it considered is a real legal wall
    const legal = legalWallPlacementsMulti(s);
    for (const c of d.trace.candidates) {
      if (c.action.type === 'wall') expect(legal.some((w) => w.orientation === (c.action as any).orientation && w.row === (c.action as any).row && w.col === (c.action as any).col)).toBe(true);
    }
    expect(d.trace.consideredWalls).toBeLessThanOrEqual(d.trace.legalWalls);
  });

  it('takes an immediate win without searching deeper', () => {
    const s = createMultiState({ rules: FOUR_PLAYER_RULES, pawns: [{ row: 1, col: 4 }, { row: 0, col: 2 }, { row: 4, col: 0 }, { row: 4, col: 8 }], wallsPerPlayer: 5 });
    const d = decideMultiMaxN(s, quick);
    expect(d.action).toEqual({ type: 'move', to: { row: 0, col: 4 } });
    expect(d.trace.stopReason).toBe('forced-win');
    expect(d.trace.candidates[0].values[0]).toBeGreaterThan(WIN - 10);
  });

  it('defends against a loss it can see within the horizon', () => {
    const s = createMultiState({ rules: TWO_PLAYER_RULES, pawns: [{ row: 4, col: 4 }, { row: 7, col: 4 }], wallsPerPlayer: 10 });
    const d = decideMultiMaxN(s, { ...quick, maxDepth: 2 });
    expect(d.action.type).toBe('wall');
    expect(d.trace.completedDepth).toBe(2);
    const best = d.trace.candidates[0];
    const pawn = d.trace.candidates.find((c) => c.action.type === 'move')!;
    expect(best.values[0]).toBeGreaterThan(pawn.values[0]);
    expect(pawn.values[0]).toBeLessThan(-WIN + 10);
  });

  it('follows the real turn order in its principal variation', () => {
    const s = initial(FOUR_PLAYER_RULES); // turn order 0 → 2 → 1 → 3
    const d = decideMultiMaxN(s, { ...quick, maxDepth: 4, maxNodes: 200_000 });
    expect(d.trace.turnOrder).toEqual([0, 2, 1, 3]);
    let cur = s;
    const seen: number[] = [];
    for (const move of d.trace.candidates[0].pv) {
      const action = legalActionsMulti(cur).find((x) => formatAction(x) === move) as Action;
      expect(action, `pv move ${move} must be legal`).toBeDefined();
      seen.push(cur.currentPlayer);
      cur = applyActionMulti(cur, action);
    }
    expect(seen.length).toBeGreaterThan(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBe(nextPlayer(FOUR_PLAYER_RULES, seen[i - 1]));
  });

  it('is deterministic and respects the depth limit', () => {
    const s = midgame(FOUR_PLAYER_RULES, 6);
    const settings = { ...quick, maxDepth: 3, timeMs: 60_000, maxNodes: 1_000_000 };
    const a = decideMultiMaxN(s, settings);
    const b = decideMultiMaxN(s, settings);
    expect(b.action).toEqual(a.action);
    expect(b.trace.nodes).toBe(a.trace.nodes);
    expect(a.trace.completedDepth).toBeLessThanOrEqual(3);
    expect(a.trace.iterations.map((i) => i.depth)).toEqual([1, 2, 3].slice(0, a.trace.iterations.length));
  });

  it('stops within its time budget and still plays a legal action', () => {
    const s = midgame(fixedRules('race-4')!, 8);
    const t = performance.now();
    const d = decideMultiMaxN(s, { ...MAXN_PRESETS.hard, maxDepth: 10, timeMs: 150, maxNodes: 5_000_000 });
    expect(performance.now() - t).toBeLessThan(1500);
    expect(isLegalActionMulti(s, d.action)).toBe(true);
    expect(['time', 'depth', 'nodes']).toContain(d.trace.stopReason);
  });

  it('stops at the node budget', () => {
    const s = midgame(FOUR_PLAYER_RULES, 6);
    const d = decideMultiMaxN(s, { ...quick, maxDepth: 8, timeMs: 60_000, maxNodes: 500 });
    expect(d.trace.stopReason).toBe('nodes');
    expect(isLegalActionMulti(s, d.action)).toBe(true);
  });

  it('can be cancelled between iterations and returns the last completed result', () => {
    const s = midgame(FOUR_PLAYER_RULES, 6);
    const signal = { aborted: false };
    const d = decideMultiMaxN(s, { ...quick, maxDepth: 8, timeMs: 60_000, maxNodes: 5_000_000 }, { signal, onProgress: (p) => { if (p.completedDepth >= 2) signal.aborted = true; } });
    expect(d.trace.stopReason).toBe('cancelled');
    expect(d.trace.completedDepth).toBe(2);
    expect(isLegalActionMulti(s, d.action)).toBe(true);
  });

  it('uses the transposition table and keeps results identical with it off', () => {
    const s = midgame(FOUR_PLAYER_RULES, 6);
    const base = { ...quick, maxDepth: 4, timeMs: 60_000, maxNodes: 2_000_000 };
    const on = decideMultiMaxN(s, base);
    const off = decideMultiMaxN(s, { ...base, transposition: false });
    expect(on.trace.ttStores).toBeGreaterThan(0);
    expect(off.trace.ttStores).toBe(0);
    expect(on.trace.nodes).toBeLessThanOrEqual(off.trace.nodes);
    expect(on.trace.candidates[0].values[on.trace.player]).toBeCloseTo(off.trace.candidates[0].values[off.trace.player], 6);
  });

  it('gives teammates the same value (one utility per team)', () => {
    const s = midgame(fixedRules('team-2v2')!, 4);
    const d = decideMultiMaxN(s, { ...quick, maxDepth: 3 });
    expect(d.trace.mode).toBe('team');
    for (const c of d.trace.candidates) {
      expect(c.values[0]).toBeCloseTo(c.values[2], 9); // team A = seats 0 and 2
      expect(c.values[1]).toBeCloseTo(c.values[3], 9); // team B = seats 1 and 3
      expect(c.values[0]).toBeCloseTo(-c.values[1], 9);
    }
    const ind = decideMultiMaxN(midgame(FOUR_PLAYER_RULES, 4), { ...quick, maxDepth: 2 });
    expect(ind.trace.mode).toBe('individual');
  });

  it('clamps out-of-range settings', () => {
    const r = resolveMaxNSettings({ maxDepth: 999, timeMs: -5, maxNodes: NaN, rootWalls: 1000 });
    expect(r.maxDepth).toBe(10);
    expect(r.timeMs).toBe(20);
    expect(r.maxNodes).toBe(MAXN_PRESETS.normal.maxNodes);
    expect(r.rootWalls).toBe(40);
  });
});

describe('decideMulti', () => {
  it('dispatches on the spec and plays whole games without an illegal action', () => {
    for (const mode of ['four-player', 'team-2v2', 'race-2'] as const) {
      const rules = fixedRules(mode)!;
      const specs = [defaultAgentSpec('random', 5), defaultAgentSpec('greedy'), { ...defaultAgentSpec('maxn'), maxn: { ...MAXN_PRESETS.easy, timeMs: 100 } }];
      let s = createMultiState({ rules, wallsPerPlayer: defaultWalls(mode, rules.players.length) });
      let guard = 0;
      const counts: number[] = rules.players.map(() => 0);
      while (s.winner === null && guard++ < 160) {
        const seat = s.currentPlayer;
        const spec = specs[seat % specs.length];
        const d = decideMulti(spec, s, { decisionIndex: counts[seat]++ });
        expect(isLegalActionMulti(s, d.action)).toBe(true);
        s = applyActionMulti(s, d.action);
      }
      expect(guard).toBeLessThan(160);
    }
  });
});
