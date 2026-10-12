import { describe, expect, it } from 'vitest';
import type { Agent, DecisionTrace } from '../../ai/types';
import { applyAction, createInitialState, legalPawnMoves, parseAction } from '../../engine';
import type { Action, GameState } from '../../engine';
import { agentLabel, agentSettings, defaultSpec, deriveSeed, inProcessFactory } from '../agentSpec';
import type { AgentFactory, Budget } from '../agentSpec';
import { tournamentToCsv, tournamentToJson } from '../exportResults';
import { MatchSession } from '../MatchSession';
import type { ArenaConfig } from '../MatchSession';
import { parseMoveList, randomOpening } from '../openings';
import { median, wilson } from '../stats';
import { TournamentRunner, playScheduledGame, schedule, summarize } from '../tournament';
import type { TournamentConfig, TournamentGame } from '../tournament';

const fixed: Budget = { mode: 'fixed', timeMs: 300 };
const timed: Budget = { mode: 'equal-time', timeMs: 150 };

const randomTrace = (state: GameState, action: Action): DecisionTrace => ({
  algorithm: 'random', player: state.currentPlayer, ply: state.ply, elapsedMs: 0, seed: 0, decisionIndex: 0,
  candidateCount: 1, pawnMoveCount: 1, wallCount: 0, roll: 0, chosenIndex: 0, chosenAction: action,
});

/** Agent that steps sideways and back forever (forces repetition halts). */
function shuffler(): Agent {
  return {
    id: 'shuffler',
    decide: async (state) => {
      const p = state.pawns[state.currentPlayer];
      const moves = legalPawnMoves(state).filter((m) => m.row === p.row).sort((a, b) => a.col - b.col);
      const action: Action = { type: 'move', to: moves[0] };
      return { action, trace: randomTrace(state, action) };
    },
  };
}

describe('statistics', () => {
  it('Wilson interval matches known values and handles edge cases', () => {
    const w = wilson(5, 10)!;
    expect(w.low).toBeCloseTo(0.2366, 3);
    expect(w.high).toBeCloseTo(0.7634, 3);
    expect(wilson(0, 6)!.low).toBe(0);
    expect(wilson(0, 6)!.high).toBeGreaterThan(0.3);
    expect(wilson(6, 6)!.high).toBe(1);
    expect(wilson(0, 0)).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('openings and move lists', () => {
  it('random openings are reproducible pawn-only sequences', () => {
    const a = randomOpening({ seed: 7, plies: 6 });
    expect(randomOpening({ seed: 7, plies: 6 }).moves).toEqual(a.moves);
    expect(a.state.ply).toBe(6);
    expect(a.state.wallsRemaining).toEqual([10, 10]);
    expect(randomOpening({ seed: 0, plies: 0 }).state).toEqual(createInitialState());
  });

  it('parses a move list and reports the first illegal move', () => {
    const ok = parseMoveList('1. e2 e8 2. e3h, e7');
    expect(ok.error).toBeUndefined();
    expect(ok.moves).toEqual(['e2', 'e8', 'e3h', 'e7']);
    expect(ok.positions).toHaveLength(5);
    const bad = parseMoveList('e2 e8 e2');
    expect(bad.error).toEqual({ index: 2, notation: 'e2' });
    expect(bad.positions).toHaveLength(3);
  });
});

describe('budgets', () => {
  it('equal-time and fixed budgets map to different, non-mixed settings', () => {
    const ab = defaultSpec('alphabeta');
    expect(agentSettings(ab, timed, 1).settings.minimax).toMatchObject({ algorithm: 'alphabeta', timeLimitMs: 150, maxDepth: 30 });
    expect(agentSettings(ab, fixed, 1).settings.minimax).toMatchObject({ algorithm: 'alphabeta', timeLimitMs: 0, maxDepth: 4 });
    expect(agentSettings(defaultSpec('minimax'), fixed, 1).settings.minimax).toMatchObject({ algorithm: 'minimax', moveOrdering: false });
    const g = defaultSpec('mcts-guided');
    expect(agentSettings(g, timed, 1).settings.mctsGuided).toMatchObject({ timeLimitMs: 150, iterations: 1e9 });
    expect(agentSettings(g, fixed, 1).settings.mctsGuided).toMatchObject({ timeLimitMs: 0, iterations: 3000 });
    expect(agentLabel(ab, timed)).toBe('Alpha-Beta (150 ms)');
    expect(agentLabel(ab, fixed)).toBe('Alpha-Beta (깊이 4)');
    expect(agentLabel(defaultSpec('bfs'), timed)).toBe('BFS');
    expect(deriveSeed(1, 2)).not.toBe(deriveSeed(2, 1));
  });
});

const tconfig = (patch: Partial<TournamentConfig> = {}): TournamentConfig => ({
  agents: [defaultSpec('bfs'), defaultSpec('random')],
  budget: fixed,
  pairs: 2,
  seed: 42,
  openingPlies: 2,
  maxPlies: 200,
  repetitionLimit: 3,
  maxGameMs: null,
  ...patch,
});

describe('tournament', () => {
  it('schedules paired games: same opening, seats swapped', () => {
    const games = schedule(tconfig({ pairs: 3 }));
    expect(games).toHaveLength(6);
    for (let p = 0; p < 3; p++) {
      const [x, y] = games.filter((g) => g.pair === p);
      expect(x.opening).toEqual(y.opening);
      expect([x.aSeat, y.aSeat]).toEqual([0, 1]);
    }
    expect(new Set(games.map((g) => g.opening.seed)).size).toBe(3);
  });

  it('plays, aggregates and reproduces a small fixed-budget tournament', async () => {
    const run = async () => {
      const runner = new TournamentRunner(tconfig(), inProcessFactory, { concurrency: 2 });
      runner.start();
      await runner.idle();
      return runner.getSnapshot();
    };
    const a = await run();
    expect(a.status).toBe('finished');
    expect(a.games).toHaveLength(4);
    const s = summarize(a.config, a.games);
    const halts = Object.values(s.halted).reduce((x, y) => x + y, 0);
    expect(s.decisive + halts).toBe(4);
    expect(s.agents[0].wins + s.agents[1].wins).toBe(s.decisive);
    expect(s.agents[0].winsAsFirst + s.agents[0].winsAsSecond).toBe(s.agents[0].wins);
    expect(s.aWinRate?.trials).toBe(s.decisive);
    expect(s.budgetMode).toBe('fixed');
    for (const g of a.games) {
      // Every recorded move list replays legally from the opening.
      let st = randomOpening(g.opening).state;
      for (const m of g.moves) {
        const action = parseAction(st, m);
        expect(action).not.toBeNull();
        st = applyAction(st, action!);
      }
    }
    const b = await run();
    expect(b.games.map((g) => [g.outcome, g.moves.join(' ')])).toEqual(a.games.map((g) => [g.outcome, g.moves.join(' ')]));
  });

  it('records halts separately and excludes them from the win rate', async () => {
    const factory: AgentFactory = () => shuffler();
    const runner = new TournamentRunner(tconfig({ pairs: 1 }), factory);
    runner.start();
    await runner.idle();
    const { games, config } = runner.getSnapshot();
    expect(games.map((g) => g.outcome)).toEqual(['halted-repetition', 'halted-repetition']);
    const s = summarize(config, games);
    expect(s.decisive).toBe(0);
    expect(s.halted.repetition).toBe(2);
    expect(s.aWinRate).toBeNull();
    expect(s.agents[0].wins + s.agents[1].wins).toBe(0);
  });

  it('stop aborts the running game as user-stopped and schedules nothing else', async () => {
    let release: () => void = () => {};
    const slow: Agent = {
      id: 'slow',
      decide: (state, ctx) =>
        new Promise((resolve, reject) => {
          ctx?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          release = () => {
            const action: Action = { type: 'move', to: legalPawnMoves(state)[0] };
            resolve({ action, trace: randomTrace(state, action) });
          };
        }),
    };
    const runner = new TournamentRunner(tconfig({ pairs: 3 }), () => slow);
    runner.start();
    await new Promise((r) => setTimeout(r, 10));
    runner.stop();
    await runner.idle();
    release();
    const snap = runner.getSnapshot();
    expect(snap.status).toBe('stopped');
    expect(snap.games).toHaveLength(1);
    expect(snap.games[0].outcome).toBe('halted-user-stopped');
  });

  it('exports JSON and CSV with settings, seeds and every game', async () => {
    const config = tconfig({ pairs: 1 });
    const games: TournamentGame[] = [];
    for (const g of schedule(config)) games.push(await playScheduledGame(config, g, inProcessFactory));
    const json = JSON.parse(tournamentToJson(config, games, { note: 'test' }));
    expect(json.format).toBe('quoridor-ai-tournament/1');
    expect(json.config.seed).toBe(42);
    expect(json.games).toHaveLength(2);
    expect(json.summary.games).toBe(2);
    const csv = tournamentToCsv(config, games).trim().split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[0]).toContain('budget_mode');
    expect(csv[1]).toContain('fixed');
  });
});

// ---------------------------------------------------------------- live match session

const arenaConfig = (patch: Partial<ArenaConfig> = {}): ArenaConfig => ({
  agents: [defaultSpec('bfs'), defaultSpec('random')],
  budget: fixed,
  seed: 5,
  opening: { seed: 0, plies: 0 },
  maxPlies: 200,
  repetitionLimit: 3,
  maxComputeMs: null,
  ...patch,
});
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 2000 && !cond(); i++) await new Promise((r) => setTimeout(r, 1));
};

describe('MatchSession (Arena)', () => {
  it('step plays exactly one move with its trace; play runs to a rules result', async () => {
    const m = new MatchSession(arenaConfig(), inProcessFactory, 0);
    m.step();
    await until(() => m.getSnapshot().moves.length === 1 && !m.getSnapshot().thinking);
    let s = m.getSnapshot();
    expect(s.moves).toHaveLength(1);
    expect(s.phase).toBe('paused');
    expect(s.moves[0].trace.algorithm).toBe('bfs');
    expect(s.moves[0].stateBefore).toBe(s.start);
    m.play();
    await until(() => m.getSnapshot().phase === 'finished');
    s = m.getSnapshot();
    expect(['win', 'halted']).toContain(s.status.kind);
    expect(s.moves.length).toBeGreaterThan(1);
    m.dispose();
  });

  it('pause stops after the current move; stop is recorded as user-stopped', async () => {
    const m = new MatchSession(arenaConfig(), inProcessFactory, 5);
    m.play();
    await until(() => m.getSnapshot().moves.length >= 3);
    m.pause();
    await until(() => !m.getSnapshot().thinking);
    const n = m.getSnapshot().moves.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(m.getSnapshot().moves.length).toBe(n);
    m.stop();
    expect(m.getSnapshot().status).toEqual({ kind: 'halted', reason: 'user-stopped' });
    expect(m.getSnapshot().phase).toBe('finished');
    m.dispose();
  });

  it('restart while an agent is thinking ignores the stale decision', async () => {
    let release: () => void = () => {};
    let calls = 0;
    const factory: AgentFactory = (spec, budget, seed) => {
      if (spec.kind !== 'random') return inProcessFactory(spec, budget, seed);
      return {
        id: 'slow-random',
        decide: (state) =>
          new Promise((resolve) => {
            calls++;
            release = () => {
              const action: Action = { type: 'move', to: legalPawnMoves(state)[0] };
              resolve({ action, trace: randomTrace(state, action) });
            };
          }),
      };
    };
    const m = new MatchSession(arenaConfig({ agents: [defaultSpec('random'), defaultSpec('bfs')] }), factory, 0);
    m.play();
    await until(() => calls === 1);
    m.restart(arenaConfig({ agents: [defaultSpec('bfs'), defaultSpec('bfs')] }));
    release();
    await new Promise((r) => setTimeout(r, 20));
    const s = m.getSnapshot();
    expect(s.matchId).toBe(1);
    expect(s.moves).toHaveLength(0);
    expect(s.phase).toBe('idle');
    m.dispose();
  });

  it('halts on repetition and on the thinking-time limit, separately from wins', async () => {
    const rep = new MatchSession(arenaConfig(), () => shuffler(), 0);
    rep.play();
    await until(() => rep.getSnapshot().phase === 'finished');
    expect(rep.getSnapshot().status).toMatchObject({ kind: 'halted', reason: 'repetition' });

    const slowFactory: AgentFactory = () => ({
      id: 'sleepy',
      decide: async (state) => {
        await new Promise((r) => setTimeout(r, 15));
        const action: Action = { type: 'move', to: legalPawnMoves(state)[0] };
        return { action, trace: randomTrace(state, action) };
      },
    });
    const t = new MatchSession(arenaConfig({ maxComputeMs: 40, repetitionLimit: null }), slowFactory, 0);
    t.play();
    await until(() => t.getSnapshot().phase === 'finished');
    expect(t.getSnapshot().status).toMatchObject({ kind: 'halted', reason: 'time-limit' });
  });

  it('starts from a move list opening', () => {
    const m = new MatchSession(arenaConfig({ opening: { moves: 'e2 e8 e3h' } }), inProcessFactory, 0);
    expect(m.getSnapshot().start.ply).toBe(3);
    expect(m.getSnapshot().start.wallsRemaining).toEqual([9, 10]);
    m.dispose();
  });
});
