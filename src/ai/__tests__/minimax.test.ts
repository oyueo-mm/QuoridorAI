import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  createState,
  goalRow,
  isLegalAction,
  legalActions,
  legalPawnMoves,
  opponentOf,
  pathEdgeSet,
  shortestPath,
  wallCutsEdges,
} from '../../engine';
import type { Action, Coord, GameState } from '../../engine';
import { DEFAULT_MINIMAX_SETTINGS, createMinimaxAgent, decideMinimax } from '../minimaxAgent';
import { createRandomAgent } from '../randomAgent';
import { searchCandidates } from '../search/candidates';
import { DEFAULT_MINIMAX_EVAL, WIN_SCORE, createDistanceEvaluator } from '../search/evaluation';
import { runSearch } from '../search/minimax';
import type { MinimaxSettings } from '../types';

const at = (row: number, col: number): Coord => ({ row, col });
const move = (row: number, col: number): Action => ({ type: 'move', to: at(row, col) });
const evaluator = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);

const settings = (patch: Partial<MinimaxSettings>): MinimaxSettings => ({
  ...DEFAULT_MINIMAX_SETTINGS,
  timeLimitMs: 0,
  ...patch,
});

const CONFIGS: Record<string, Partial<MinimaxSettings>> = {
  minimax: { algorithm: 'minimax', moveOrdering: false, transpositionTable: false },
  alphabeta: { algorithm: 'alphabeta', moveOrdering: false, transpositionTable: false },
  'alphabeta+ordering': { algorithm: 'alphabeta', moveOrdering: true, transpositionTable: false },
  'alphabeta+ordering+tt': { algorithm: 'alphabeta', moveOrdering: true, transpositionTable: true },
};

/** Deterministic positions reached by seeded random play (Random agent). */
async function randomPosition(seed: number, plies: number): Promise<GameState> {
  const agent = createRandomAgent({ seed });
  let s = createInitialState();
  for (let i = 0; i < plies && s.winner === null; i++) s = applyAction(s, (await agent.decide(s)).action);
  return s;
}

async function testPositions(): Promise<GameState[]> {
  const opening = applyAction(applyAction(createInitialState(), move(7, 4)), move(1, 4));
  return [
    opening,
    createState({
      pawns: [at(5, 3), at(3, 5)],
      walls: [
        { orientation: 'h', row: 3, col: 4 },
        { orientation: 'v', row: 5, col: 2 },
        { orientation: 'h', row: 5, col: 5 },
      ],
      wallsRemaining: [8, 9],
      currentPlayer: 1,
    }),
    await randomPosition(3, 8),
    await randomPosition(11, 14),
  ];
}

describe('search candidates', () => {
  it('opponent-path filter keeps every pawn move and only legal walls cutting the opponent path', async () => {
    for (const s of await testPositions()) {
      const legal = legalActions(s).map((a) => JSON.stringify(a));
      const filtered = searchCandidates(s, 'opponent-path');
      const opp = opponentOf(s.currentPlayer);
      const oppEdges = pathEdgeSet(shortestPath(s, s.pawns[opp], goalRow(opp))!);
      for (const a of filtered) {
        expect(legal).toContain(JSON.stringify(a));
        if (a.type === 'wall') expect(wallCutsEdges(oppEdges, a.orientation, a.row, a.col)).toBe(true);
      }
      expect(filtered.filter((a) => a.type === 'move')).toHaveLength(legalPawnMoves(s).length);
      // Every legal wall that cuts the opponent's path is included.
      const expectedWalls = legalActions(s).filter(
        (a) => a.type === 'wall' && wallCutsEdges(oppEdges, a.orientation, a.row, a.col),
      );
      expect(filtered.filter((a) => a.type === 'wall')).toHaveLength(expectedWalls.length);
      expect(searchCandidates(s, 'all')).toEqual(legalActions(s));
    }
  });

  it('incremental child evaluation equals full evaluation', async () => {
    for (const s of await testPositions()) {
      for (const perspective of [0, 1] as const) {
        const fast = evaluator.childEvaluator!(s, perspective);
        for (const a of searchCandidates(s, 'all')) {
          const child = applyAction(s, a);
          if (child.winner !== null) continue;
          expect(fast(child, a)).toBeCloseTo(evaluator.evaluate(child, perspective), 12);
        }
      }
    }
  });

  it('lazy legality explores exactly the eager candidate set (same results, same nodes)', async () => {
    for (const s of await testPositions()) {
      const cfg = settings({ maxDepth: 3 });
      const lazy = runSearch(s, cfg, evaluator);
      const eager = runSearch(s, cfg, evaluator, { disableLazyLegality: true, disableIncrementalEval: true });
      expect(lazy.score).toBeCloseTo(eager.score, 12);
      expect(lazy.stats.nodes).toBe(eager.stats.nodes);
      expect(lazy.pv).toEqual(eager.pv);
    }
  });
});

describe('Minimax vs Alpha-Beta equivalence', () => {
  it('returns identical root scores for every configuration at depths 1–3', async () => {
    for (const s of await testPositions()) {
      for (let depth = 1; depth <= 3; depth++) {
        const scores = Object.entries(CONFIGS).map(([name, cfg]) => {
          const r = runSearch(s, settings({ ...cfg, maxDepth: depth }), evaluator);
          return { name, score: r.score, nodes: r.stats.nodes };
        });
        for (const x of scores) expect(x.score, `${x.name} depth ${depth}`).toBeCloseTo(scores[0].score, 9);
      }
    }
  });

  it('also agrees with all walls as candidates (depth 2)', async () => {
    const [s] = await testPositions();
    const ref = runSearch(s, settings({ ...CONFIGS.minimax, maxDepth: 2, wallFilter: 'all' }), evaluator);
    const ab = runSearch(s, settings({ ...CONFIGS['alphabeta+ordering+tt'], maxDepth: 2, wallFilter: 'all' }), evaluator);
    expect(ab.score).toBeCloseTo(ref.score, 9);
    expect(ab.stats.nodes).toBeLessThan(ref.stats.nodes);
  });

  it('agrees at depth 4 on the opening position', async () => {
    const [s] = await testPositions();
    const ref = runSearch(s, settings({ ...CONFIGS.minimax, maxDepth: 4 }), evaluator);
    const ab = runSearch(s, settings({ ...CONFIGS['alphabeta+ordering+tt'], maxDepth: 4 }), evaluator);
    expect(ab.score).toBeCloseTo(ref.score, 9);
    expect(ab.stats.nodes * 5).toBeLessThan(ref.stats.nodes);
  }, 60_000);

  it('alpha-beta bounds are sound: every pruned candidate is really no better than its bound', async () => {
    for (const s of await testPositions()) {
      const ref = runSearch(s, settings({ ...CONFIGS.minimax, maxDepth: 3 }), evaluator);
      const ab = runSearch(s, settings({ ...CONFIGS['alphabeta+ordering+tt'], maxDepth: 3 }), evaluator);
      const exact = new Map(ref.rootCandidates.map((c) => [c.notation, c.score]));
      expect(ref.rootCandidates.every((c) => c.bound === 'exact')).toBe(true);
      expect(ab.rootCandidates[0].bound).toBe('exact');
      for (const c of ab.rootCandidates) {
        const truth = exact.get(c.notation)!;
        if (c.bound === 'exact') expect(c.score).toBeCloseTo(truth, 9);
        else expect(truth).toBeLessThanOrEqual(c.score + 1e-9);
      }
      // The chosen move's true minimax value equals the best value.
      expect(exact.get(ab.rootCandidates[0].notation)).toBeCloseTo(ref.score, 9);
    }
  });

  it('alpha-beta visits far fewer nodes than minimax', async () => {
    // Ordering/TT gains vary by position (see bench/); pruning itself always helps here.
    for (const s of await testPositions()) {
      const nodes = Object.fromEntries(
        Object.entries(CONFIGS).map(([name, cfg]) => [name, runSearch(s, settings({ ...cfg, maxDepth: 3 }), evaluator).stats.nodes]),
      );
      expect(nodes.alphabeta).toBeLessThan(nodes.minimax);
      expect(nodes['alphabeta+ordering+tt'] * 2).toBeLessThan(nodes.minimax);
    }
  });
});

describe('Minimax agent decisions', () => {
  it('always returns a legal action', async () => {
    for (const cfg of [CONFIGS.minimax, CONFIGS['alphabeta+ordering+tt']]) {
      const agent = createMinimaxAgent({ ...cfg, maxDepth: 2, timeLimitMs: 0 });
      const rnd = createRandomAgent({ seed: 42 });
      let s = createInitialState();
      for (let i = 0; i < 40 && s.winner === null; i++) {
        const { action, trace } = await (i % 2 === 0 ? agent : rnd).decide(s);
        expect(isLegalAction(s, action)).toBe(true);
        if (trace.algorithm === 'minimax') expect(trace.pv[0]).toEqual(action);
        s = applyAction(s, action);
      }
    }
  });

  it('takes an immediate win', () => {
    const s = createState({ pawns: [at(1, 2), at(7, 6)], currentPlayer: 0 });
    const trace = decideMinimax(s, settings({ maxDepth: 4 }));
    expect(trace.pv[0]).toEqual(move(0, 2));
    expect(trace.score).toBe(WIN_SCORE - 1);
    expect(trace.decided).toBe(true);
    expect(trace.completedDepth).toBe(1);
  });

  it('blocks an opponent that would otherwise win next move', () => {
    // P2 at (7,4) is one step from row 8; P1 is far away and must spend a wall.
    const s = createState({ pawns: [at(6, 0), at(7, 4)], currentPlayer: 0 });
    for (const cfg of Object.values(CONFIGS)) {
      const trace = decideMinimax(s, settings({ ...cfg, maxDepth: 2 }));
      const next = applyAction(s, trace.pv[0]);
      const p2Wins = legalPawnMoves(next, 1).some((c) => c.row === 8);
      expect(p2Wins).toBe(false);
      expect(trace.pv[0].type).toBe('wall');
    }
  });

  it('recognises a lost position and still returns a legal move', () => {
    // P2 has no walls; P1 has none either and is far behind: P2 wins in 1 after any P1 move.
    const s = createState({ pawns: [at(8, 0), at(7, 4)], currentPlayer: 0, wallsRemaining: [0, 0] });
    const trace = decideMinimax(s, settings({ maxDepth: 3 }));
    expect(isLegalAction(s, trace.pv[0])).toBe(true);
    expect(trace.score).toBe(-(WIN_SCORE - 2));
    expect(trace.decided).toBe(true);
  });

  it('finds a forced win in 3 plies and prefers the fastest win', () => {
    // P1 two steps from goal, P2 cannot place walls and is far away.
    const s = createState({ pawns: [at(2, 0), at(6, 8)], currentPlayer: 0, wallsRemaining: [10, 0] });
    const trace = decideMinimax(s, settings({ maxDepth: 5 }));
    expect(trace.score).toBe(WIN_SCORE - 3);
    expect(trace.pv[0]).toEqual(move(1, 0));
    expect(trace.decided).toBe(true);
  });

  it('reports PV, expected reply and a consistent PV-leaf evaluation', async () => {
    const [s] = await testPositions();
    const trace = decideMinimax(s, settings({ ...CONFIGS.minimax, maxDepth: 3 }));
    expect(trace.pv).toHaveLength(3);
    expect(trace.pvComplete).toBe(true);
    expect(trace.pvLeaf.matchesScore).toBe(true);
    expect(trace.rootCandidates[0].replyNotation).toBe(trace.pvNotation[1]);
    expect(trace.iterations.map((i) => i.depth)).toEqual([1, 2, 3]);
    expect(trace.rationale.length).toBeGreaterThan(1);
  });

  it('records a trimmed tree with the chosen move first', async () => {
    const [s] = await testPositions();
    const trace = decideMinimax(s, settings({ maxDepth: 3 }));
    const root = trace.tree;
    expect(root.children!.length).toBeGreaterThan(0);
    expect(root.children![0].notation).toBe(trace.pvNotation[0]);
    expect(root.children![0].score).toBeCloseTo(trace.score, 9);
    const grand = root.children![0].children!;
    expect(grand.length).toBeGreaterThan(0);
    // Opponent nodes are sorted best-for-opponent (lowest score for us) first.
    for (let i = 1; i < grand.length; i++) expect(grand[i].score).toBeGreaterThanOrEqual(grand[i - 1].score);
    expect(grand[0].notation).toBe(trace.pvNotation[1]);
  });
});

describe('time limit and cancellation', () => {
  it('stops at the time limit and returns the last completed depth', async () => {
    const s = (await testPositions())[3];
    const trace = decideMinimax(s, settings({ maxDepth: 12, timeLimitMs: 60, wallFilter: 'all' }));
    expect(trace.timedOut).toBe(true);
    expect(trace.completedDepth).toBeGreaterThanOrEqual(1);
    expect(trace.completedDepth).toBeLessThan(12);
    expect(trace.iterations).toHaveLength(trace.completedDepth);
    expect(trace.pvNotation[0]).toBe(trace.iterations.at(-1)!.best);
    expect(isLegalAction(s, trace.pv[0])).toBe(true);
    expect(trace.stats.elapsedMs).toBeLessThan(60 + 1500);
  });

  it('always completes depth 1 even with an already expired budget (deterministic clock)', async () => {
    const s = (await testPositions())[2];
    let t = 0;
    const r = runSearch(s, settings({ maxDepth: 6, timeLimitMs: 1 }), evaluator, { clock: () => (t += 5) });
    expect(r.completedDepth).toBe(1);
    expect(r.timedOut).toBe(true);
    expect(isLegalAction(s, r.bestAction)).toBe(true);
  });

  it('aborts on signal', async () => {
    const s = (await testPositions())[1];
    const controller = new AbortController();
    controller.abort();
    await expect(createMinimaxAgent().decide(s, { signal: controller.signal })).rejects.toThrow(/abort/i);

    const mid = new AbortController();
    expect(() =>
      runSearch(s, settings({ maxDepth: 8, wallFilter: 'all' }), evaluator, {
        signal: mid.signal,
        onProgress: (p) => {
          if (p.completedDepth >= 1) mid.abort();
        },
      }),
    ).toThrow(/abort/i);
  });

  it('reports progress with increasing node counts', async () => {
    const s = (await testPositions())[0];
    const seen: number[] = [];
    runSearch(s, settings({ maxDepth: 4 }), evaluator, { onProgress: (p) => seen.push(p.nodes) });
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
});
