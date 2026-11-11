import { describe, expect, it } from 'vitest';
import type { DecisionTrace } from '../../ai/types';
import { createState, hashState, legalWallPlacements } from '../../engine';
import { analyzeGame, canPreventImmediateWin, hasWinningPawnMove, mergeSides } from '../gameAnalysis';
import { parseMoveList, randomMixedOpening } from '../openings';
import { eloEstimate, eloFromScore, formatElo, meanInterval, percentile } from '../stats';
import { openingState, schedule, summarize, traceWork } from '../tournament';
import type { TournamentConfig, TournamentGame } from '../tournament';

describe('extended statistics', () => {
  it('percentile interpolates and handles edge cases', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8, 10);
    expect(percentile([5, 1, 4, 2, 3], 1)).toBe(5);
    expect(percentile([10, 20], 0.25)).toBe(12.5);
  });

  it('Elo follows the logistic model and stays unbounded where the data is', () => {
    expect(eloFromScore(0.5)).toBeCloseTo(0, 10);
    expect(eloFromScore(0.75)).toBeCloseTo(190.85, 1);
    expect(eloFromScore(0.25)).toBeCloseTo(-190.85, 1);
    expect(eloFromScore(1)).toBe(Infinity);
    const e = eloEstimate(75, 100)!;
    expect(e.elo).toBeCloseTo(190.85, 1);
    expect(e.low!).toBeLessThan(e.elo!);
    expect(e.high!).toBeGreaterThan(e.elo!);
    const perfect = eloEstimate(10, 10)!;
    expect(perfect.elo).toBeNull();
    expect(perfect.high).toBeNull();
    expect(perfect.low!).toBeGreaterThan(0);
    expect(formatElo(perfect)).toContain('+∞');
    expect(eloEstimate(0, 0)).toBeNull();
  });

  it('pair-level mean interval', () => {
    const m = meanInterval([1, 1, 0.5, 0, 1, 0.5, 1, 1])!;
    expect(m.mean).toBeCloseTo(0.75, 10);
    expect(m.low).toBeLessThan(0.75);
    expect(m.high).toBeLessThanOrEqual(1);
    expect(meanInterval([])).toBeNull();
    expect(meanInterval([1])!.low).toBe(0);
  });
});

describe('openings for batch runs', () => {
  it('mixed openings are reproducible, legal, balanced and contain walls', () => {
    let withWalls = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = randomMixedOpening({ seed, plies: 6, wallProbability: 0.25, maxImbalance: 2 });
      const b = randomMixedOpening({ seed, plies: 6, wallProbability: 0.25, maxImbalance: 2 });
      expect(b.moves).toEqual(a.moves);
      const replay = parseMoveList(a.moves.join(' '));
      expect(replay.error).toBeUndefined();
      expect(hashState(replay.positions.at(-1)!)).toEqual(hashState(a.state));
      if (a.moves.some((m) => /[hv]$/.test(m))) withWalls++;
    }
    expect(withWalls).toBeGreaterThan(10);
  });

  const base: TournamentConfig = {
    agents: [{ kind: 'bfs', depth: 0, simulations: 0 }, { kind: 'random', depth: 0, simulations: 0 }],
    budget: { mode: 'fixed', timeMs: 0 },
    pairs: 100,
    seed: 42,
    openingPlies: 4,
    maxPlies: 200,
    repetitionLimit: 3,
    maxGameMs: null,
  };
  const distinct = (cfg: TournamentConfig, max?: number) => {
    const s = schedule(cfg, max);
    return new Set(s.filter((g) => g.aSeat === 0).map((g) => JSON.stringify(hashState(openingState(g.opening))))).size;
  };

  it('the original pawn openings repeat; mixed unique openings do not', () => {
    // Documents the problem: 100 pairs of 4-ply pawn openings reuse a few dozen positions,
    // and only a few dozen such positions exist at all, so uniqueness cannot fix pawn mode.
    const pawn = distinct(base);
    expect(pawn).toBeLessThan(60);
    expect(distinct({ ...base, uniqueOpenings: true })).toBeGreaterThanOrEqual(pawn);
    expect(distinct({ ...base, uniqueOpenings: true })).toBeLessThan(60);
    expect(distinct({ ...base, openingMode: 'mixed', openingPlies: 6, uniqueOpenings: true })).toBe(100);
  });

  it('keeps the original schedule when the new options are absent', () => {
    const s = schedule(base);
    expect(s[0].opening.mode).toBeUndefined();
    expect(s).toHaveLength(200);
    expect(schedule({ ...base, pairs: 300 })).toHaveLength(200);
    expect(schedule({ ...base, pairs: 300 }, 1000)).toHaveLength(600);
  });

  it('book openings are replayed and cycled', () => {
    const s = schedule({ ...base, pairs: 3, openingMode: 'book', openingBook: ['e2 e8', 'e2 e8 e3h'] });
    expect(s.map((g) => g.opening.moves.join(' '))).toEqual(['e2 e8', 'e2 e8', 'e2 e8 e3h', 'e2 e8 e3h', 'e2 e8', 'e2 e8']);
    expect(openingState(s[2].opening).wallsRemaining).toEqual([9, 10]);
  });
});

describe('summary extensions', () => {
  const cfg: TournamentConfig = {
    agents: [{ kind: 'alphabeta', depth: 2, simulations: 0 }, { kind: 'bfs', depth: 0, simulations: 0 }],
    budget: { mode: 'fixed', timeMs: 0 },
    pairs: 3,
    seed: 1,
    openingPlies: 0,
    maxPlies: 200,
    repetitionLimit: 3,
    maxGameMs: null,
  };
  const move = (ms: number, nodes: number, probes: number, hits: number) => ({
    ms, nodes, simulations: null, depth: 2, detail: { ttProbes: probes, ttHits: hits, cutoffs: 3, timedOut: false },
  });
  const game = (index: number, outcome: TournamentGame['outcome'], moves: string[]): TournamentGame => ({
    index,
    pair: Math.floor(index / 2),
    aSeat: (index % 2) as 0 | 1,
    opening: { seed: 1, plies: 0, moves: [] },
    agentSeeds: [1, 2],
    outcome,
    plies: 10,
    durationMs: 5,
    agents: [
      { moves: [move(10, 100, 10, 5), move(30, 300, 10, 0)], wallsUsed: 1 },
      { moves: [{ ms: 1, nodes: 5, simulations: null, depth: 1 }], wallsUsed: 0 },
    ],
    moves,
  });

  it('computes rates, pair scores, seat split, Elo and duplicates', () => {
    const games = [
      game(0, 'a-win', ['e2']),
      game(1, 'a-win', ['e8']),
      game(2, 'a-win', ['e2']),
      game(3, 'b-win', ['e8']),
      game(4, 'a-win', ['e2']),
      game(5, 'halted-repetition', ['e8']),
    ];
    const s = summarize(cfg, games);
    expect(s.agents[0].nodesPerSecond).toBeCloseTo((400 * 1000) / 40, 6);
    expect(s.agents[0].ttHitRate).toBeCloseTo(5 / 20, 10);
    expect(s.agents[0].decisionMsP95).toBeCloseTo(30, 0);
    expect(s.agents[0].timedOutShare).toBe(0);
    expect(s.agents[1].ttHitRate).toBeNull();
    // Pairs: (W,W)=1, (W,L)=0.5, third pair has a halt → excluded.
    expect(s.aPairScore!.n).toBe(2);
    expect(s.aPairScore!.mean).toBeCloseTo(0.75, 10);
    expect(s.aWinRateAsFirst!.trials).toBe(3);
    expect(s.aWinRateAsSecond!.trials).toBe(2);
    expect(s.aElo!.n).toBe(5);
    // Same seat, same opening, same moves → duplicates of games 0 and 1.
    expect(s.duplicateGames).toBe(4);
    expect(s.uniqueOpenings).toBe(1);
  });

  it('traceWork records search details', () => {
    const w = traceWork(
      {
        algorithm: 'mcts',
        candidates: [{ visits: 30 }, { visits: 10 }],
        treeNodes: 41,
        simulations: 40,
        maxTreeDepth: 5,
        legalActionCount: 100,
        searchedActionCount: 20,
        stopReason: 'iterations',
      } as unknown as DecisionTrace,
      12,
    );
    expect(w.detail!.topShare).toBeCloseTo(0.75, 10);
    expect(w.detail!.entropyBits).toBeCloseTo(-(0.75 * Math.log2(0.75) + 0.25 * Math.log2(0.25)), 10);
    expect(w.detail!.decided).toBe(false);
  });
});

describe('game analysis', () => {
  it('detects a missed win and an avoidable allowed win', () => {
    // P0 at e8 (row 1) can step to row 0; P1 at a2 (row 7) can step to row 8.
    const start = createState({ pawns: [{ row: 1, col: 4 }, { row: 7, col: 0 }], currentPlayer: 0 });
    expect(hasWinningPawnMove(start, 0)).toBe(true);
    expect(hasWinningPawnMove(start, 1)).toBe(true);
    // P0 plays sideways (d8): misses its win, and lets P1 win although a wall could stop it.
    const a = analyzeGame(start, ['d8', 'a1']);
    expect(a.error).toBeNull();
    expect(a.seats[0].winIn1Available).toBe(1);
    expect(a.seats[0].missedWinIn1).toBe(1);
    expect(a.seats[0].threatsFaced).toBe(1);
    expect(a.seats[0].allowedWinIn1Avoidable).toBe(1);
    expect(a.seats[1].moves).toBe(1);
    expect(canPreventImmediateWin(start)).toBe(true);
  });

  it('counts walls, their effect, backtracks and repetitions', () => {
    const start = createState();
    const moves = ['e2', 'e8', 'd2', 'd8', 'e2', 'e8', 'd2', 'd8', 'e7h'];
    const a = analyzeGame(start, moves);
    expect(a.seats[0].walls).toBe(1);
    expect(a.seats[0].wallPlies).toEqual([8]);
    expect(a.seats[0].wallOppGain).toBeGreaterThanOrEqual(0);
    // e2 → d2 → e2 → d2: the 3rd and 4th pawn moves return to the cell held two moves earlier.
    expect(a.seats[0].backtracks).toBe(2);
    expect(a.seats[1].backtracks).toBe(2);
    expect(a.repeatedPositions).toBeGreaterThan(0);
    expect(a.distances[0]).toHaveLength(moves.length + 1);
    const merged = mergeSides(a.seats);
    expect(merged.moves).toBe(9);
    expect(merged.wallPlies).toEqual([8]);
  });

  it('reports a corrupt record instead of throwing', () => {
    const a = analyzeGame(createState(), ['e2', 'z9']);
    expect(a.error).toBe(1);
  });

  it('an unavoidable threat is classified as forced', () => {
    // P1 one step from its goal on an open file and P0 without walls: nothing prevents it.
    const s = createState({ pawns: [{ row: 4, col: 4 }, { row: 7, col: 0 }], wallsRemaining: [0, 10], currentPlayer: 0 });
    expect(legalWallPlacements(s)).toHaveLength(0);
    const a = analyzeGame(s, ['e4']);
    expect(a.seats[0].allowedWinIn1Forced).toBe(1);
    expect(a.seats[0].allowedWinIn1Avoidable).toBe(0);
  });
});
