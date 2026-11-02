import { describe, expect, it } from 'vitest';
import { MultiCancelledError, createMultiEngine, defaultAgentSpec, summarizeTrace, withPreset } from '../../ai/multiAgent';
import type { MultiAiEngine, MultiAiJob, MultiDecision } from '../../ai/multiAgent';
import { decideMulti } from '../../ai/multi/registry';
import { fixedRules, isLegalActionMulti, legalPawnMovesMulti, obstacleRules } from '../../engine';
import type { Action, MultiGameMode } from '../../engine';
import { buildMultiRecord, parseMultiRecord } from '../../match/multiRecord';
import { HUMAN, MultiController, recommendedConfig } from '../MultiController';
import type { MultiConfig, MultiSeatController } from '../MultiController';

const ai = (kind: 'random' | 'greedy' | 'maxn', seed = 1): MultiSeatController => {
  const spec = defaultAgentSpec(kind, seed);
  return { kind: 'ai', agent: kind === 'maxn' ? { ...withPreset(spec, 'easy'), maxn: { ...withPreset(spec, 'easy').maxn, timeMs: 80, maxDepth: 2 } } : spec };
};

const config = (mode: MultiGameMode, controllers: MultiSeatController[], extra: Partial<MultiConfig> = {}): MultiConfig => ({ ...recommendedConfig(mode), controllers, ...extra });

/** Engine whose answers the test releases by hand; `ignoreCancel` simulates a buggy engine that still delivers late results. */
class ManualEngine implements MultiAiEngine {
  readonly mode = 'main-thread' as const;
  jobs: MultiAiJob[] = [];
  cancels = 0;
  disposed = 0;
  private waiting: { resolve: (d: MultiDecision) => void; reject: (e: Error) => void }[] = [];
  constructor(private readonly ignoreCancel = false) {}
  decide(job: MultiAiJob): Promise<MultiDecision> {
    this.jobs.push(job);
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }
  cancel(): void {
    this.cancels++;
    if (!this.ignoreCancel) for (const w of this.waiting) w.reject(new MultiCancelledError()); // settled promises ignore this
  }
  dispose(): void {
    this.disposed++;
    this.cancel();
  }
  /** Answers the oldest pending job with the real decision for its position. */
  answer(index = 0, action?: Action): void {
    const job = this.jobs[index];
    const w = this.waiting[index];
    const decision = decideMulti(job.spec, job.state, { decisionIndex: job.decisionIndex });
    w.resolve(action ? { ...decision, action } : decision);
  }
  fail(index = 0, message = 'boom'): void {
    this.waiting[index].reject(new Error(message));
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Polls until `cond` holds (or 5 s pass). */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
}

function realController(cfg: MultiConfig) {
  const c = new MultiController(cfg, { engineFactory: () => createMultiEngine({ mainThreadOnly: true }) });
  c.activate();
  return c;
}

describe('MultiController with AI seats', () => {
  it('alternates a person and three AIs and records each AI trace', async () => {
    const c = realController(config('four-player', [HUMAN, ai('greedy'), ai('random', 3), ai('maxn')]));
    expect(c.getSnapshot().humanToMove).toBe(true);
    expect(c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] })).toBe(true);
    // a person cannot move for an AI seat
    expect(c.getSnapshot().humanToMove).toBe(false);
    expect(c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] })).toBe(false);
    await c.idle();
    const s = c.getSnapshot();
    expect(s.history).toHaveLength(4);
    expect(s.humanToMove).toBe(true);
    expect(s.history[0].trace).toBeUndefined();
    expect(s.history.slice(1).map((h) => h.trace?.algorithm)).toEqual(['multi-greedy', 'multi-random', 'multi-maxn']); // slots P2, P3, P4 in turn order
    expect(s.history.slice(1).every((h) => h.trace && h.trace.player === h.player)).toBe(true);
    expect(s.thinking).toBeNull();
    c.dispose();
  });

  it.each([2, 3, 4] as const)('plays a game of %i AIs by itself without an illegal move or a move after the end', async (count) => {
    const mode: MultiGameMode = count === 2 ? 'race-2' : count === 3 ? 'three-player' : 'team-2v2';
    const kinds = ['greedy', 'maxn', 'random', 'greedy'] as const;
    const c = realController(config(mode, kinds.slice(0, count).map((k, i) => ai(k, 10 + i))));
    const stop = c.subscribe(() => c.getSnapshot().history.length >= 120 && c.setPaused(true));
    await c.idle();
    stop();
    const s = c.getSnapshot();
    expect(s.allAi).toBe(true);
    // every recorded move was legal in the position it was made
    for (const h of s.history) expect(isLegalActionMulti(h.stateBefore, h.action)).toBe(true);
    if (s.status.kind === 'win') {
      const plies = s.history.length;
      await tick();
      await c.idle();
      expect(c.getSnapshot().history).toHaveLength(plies);
    }
    c.dispose();
  }, 60_000);

  it('cancels the search on restart and ignores a result that still arrives', async () => {
    const engine = new ManualEngine(true);
    const c = new MultiController(config('race-2', [ai('maxn'), ai('maxn')]), { engineFactory: () => engine });
    c.activate();
    await tick();
    expect(c.getSnapshot().thinking?.seat).toBe(engine.jobs[0].state.currentPlayer);
    const gameId = c.getSnapshot().gameId;
    c.restart(config('four-player', [HUMAN, HUMAN, HUMAN, HUMAN]));
    expect(engine.cancels).toBeGreaterThan(0);
    expect(c.getSnapshot().gameId).toBe(gameId + 1);
    engine.answer(0); // late answer of the old game
    await tick();
    expect(c.getSnapshot().history).toHaveLength(0);
    expect(c.getSnapshot().thinking).toBeNull();
  });

  it('does not apply an answer computed for a position that was undone', async () => {
    const engine = new ManualEngine(true);
    const c = new MultiController(config('four-player', [HUMAN, ai('greedy'), HUMAN, HUMAN]), { engineFactory: () => engine });
    c.activate();
    c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] });
    await tick();
    expect(engine.jobs).toHaveLength(1);
    expect(c.undo()).toBe(true); // takes back the human move while the AI thinks
    expect(c.getSnapshot().history).toHaveLength(0);
    engine.answer(0);
    await tick();
    expect(c.getSnapshot().history).toHaveLength(0);
  });

  it('undo returns to the person previous turn, undoing the AI replies with it', async () => {
    const c = realController(config('four-player', [HUMAN, ai('greedy'), ai('greedy'), ai('greedy')]));
    c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] });
    await c.idle();
    c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] });
    await c.idle();
    expect(c.getSnapshot().history).toHaveLength(8);
    expect(c.undo()).toBe(true);
    await c.idle();
    const s = c.getSnapshot();
    expect(s.history).toHaveLength(4);
    expect(s.humanToMove).toBe(true);
    c.dispose();
  });

  it('pauses, steps one move at a time and resumes', async () => {
    const c = new MultiController(config('race-2', [ai('greedy'), ai('greedy')]), { engineFactory: () => createMultiEngine({ mainThreadOnly: true }) });
    c.setPaused(true);
    c.activate();
    await tick();
    await c.idle();
    expect(c.getSnapshot().history).toHaveLength(0);
    expect(c.step()).toBe(true);
    await c.idle();
    expect(c.getSnapshot().history).toHaveLength(1);
    await tick();
    expect(c.getSnapshot().history).toHaveLength(1); // stays paused after the step
    c.setPaused(false);
    await until(() => c.getSnapshot().history.length > 1); // the main-thread engine idles ~40 ms before each decision
    expect(c.getSnapshot().history.length).toBeGreaterThan(1);
    c.dispose();
  });

  it('pausing cancels the running search and resuming asks again', async () => {
    const engine = new ManualEngine();
    const c = new MultiController(config('race-2', [ai('maxn'), HUMAN]), { engineFactory: () => engine });
    c.activate();
    await tick();
    expect(c.getSnapshot().thinking).not.toBeNull();
    c.setPaused(true);
    expect(c.getSnapshot().thinking).toBeNull();
    expect(engine.jobs).toHaveLength(1);
    c.setPaused(false);
    await tick();
    expect(engine.jobs).toHaveLength(2);
    engine.answer(1);
    await tick();
    expect(c.getSnapshot().history).toHaveLength(1);
  });

  it('plays a safe move and reports it when the AI fails or answers illegally', async () => {
    const engine = new ManualEngine();
    const c = new MultiController(config('race-2', [ai('maxn'), HUMAN]), { engineFactory: () => engine });
    c.activate();
    await tick();
    engine.fail(0, 'worker crashed');
    await tick();
    let s = c.getSnapshot();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].trace).toBeUndefined();
    expect(s.notice).toContain('worker crashed');
    expect(isLegalActionMulti(s.history[0].stateBefore, s.history[0].action)).toBe(true);

    const c2 = new MultiController(config('race-2', [ai('greedy'), HUMAN]), { engineFactory: () => (engine2 = new ManualEngine()) });
    let engine2!: ManualEngine;
    c2.activate();
    await tick();
    engine2.answer(0, { type: 'move', to: { row: 0, col: 0 } }); // not a legal move
    await tick();
    s = c2.getSnapshot();
    expect(s.history).toHaveLength(1);
    expect(s.notice).toContain('불법');
    expect(s.humanToMove).toBe(true);
  });

  it('dispose cancels the search and releases the worker', async () => {
    const engine = new ManualEngine();
    const c = new MultiController(config('race-2', [ai('maxn'), HUMAN]), { engineFactory: () => engine });
    c.activate();
    await tick();
    c.dispose();
    expect(engine.disposed).toBe(1);
    expect(c.getSnapshot().thinking).toBeNull();
    expect(c.getSnapshot().history).toHaveLength(0);
  });

  it('keeps hot-seat games without AI exactly as before (no engine is created)', () => {
    let created = 0;
    const c = new MultiController(recommendedConfig('four-player'), { engineFactory: () => (created++, new ManualEngine()) });
    c.activate();
    expect(c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] })).toBe(true);
    expect(created).toBe(0);
    expect(c.getSnapshot().aiPresent).toBe(false);
  });

  it('reuses the obstacle map of the preview only when it matches the settings', () => {
    const cfg = { ...recommendedConfig('obstacle'), obstacle: { players: 2 as const, preset: 'normal' as const, seed: 77 } };
    const map = obstacleRules(2, 'normal', 77);
    const c = new MultiController(config('four-player', []));
    c.restart(cfg, { obstacleMap: map });
    expect(c.getSnapshot().setup.rules).toBe(map);
    c.restart(cfg, { obstacleMap: obstacleRules(2, 'normal', 78) });
    expect(c.getSnapshot().setup.rules.seed).toBe(77);
    expect(c.getSnapshot().setup.rules).not.toBe(map);
  });

  it('names AI seats after their algorithm unless a name was typed', () => {
    const c = new MultiController(config('four-player', [HUMAN, ai('maxn'), ai('greedy'), ai('random')], { names: ['나', '플레이어 2', '직접 이름', ''] }));
    expect(c.getSnapshot().names).toEqual(['나', 'Max-N AI · 쉬움', '직접 이름', 'Random AI']);
  });
});

describe('records with AI seats', () => {
  it('stores the AI settings and a small summary per AI move, and reads them back', async () => {
    const cfg = config('four-player', [HUMAN, ai('greedy'), ai('random', 9), ai('maxn')]);
    const c = realController(cfg);
    c.play({ type: 'move', to: legalPawnMovesMulti(c.getSnapshot().game)[0] });
    await c.idle();
    const s = c.getSnapshot();
    const actions = s.history.map((h) => ({ action: h.action, player: h.player, ...(h.trace ? { ai: summarizeTrace(h.trace) } : {}) }));
    const file = buildMultiRecord(s.setup, actions, { names: s.names, mode: 'four-player', controllers: cfg.controllers });
    const text = JSON.stringify(file);
    expect(text.length).toBeLessThan(20_000); // summaries, never full traces
    const parsed = parseMultiRecord(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.controllers?.map((x) => x.kind)).toEqual(['human', 'ai', 'ai', 'ai']);
    expect(parsed.controllers?.[2]).toMatchObject({ kind: 'ai', agent: { kind: 'random', seed: 9 } });
    expect(parsed.actions[1].ai?.algorithm).toBe('multi-greedy');
    // load: the game continues with the same seats, paused
    const d = new MultiController(cfg);
    d.load(parsed);
    expect(d.getSnapshot().controllers.map((x) => x.kind)).toEqual(['human', 'ai', 'ai', 'ai']);
    expect(d.getSnapshot().paused).toBe(true);
    c.dispose();
  });

  it('still reads records without AI information and rejects unreadable AI settings', () => {
    const rules = fixedRules('race-2')!;
    const setup = { rules, wallsPerPlayer: [10, 10], firstPlayer: 0 };
    const plain = buildMultiRecord(setup, [], { names: ['a', 'b'], mode: 'race-2' });
    const ok = parseMultiRecord(JSON.stringify(plain));
    expect(ok.ok && ok.controllers).toBeFalsy();
    const bad = JSON.parse(JSON.stringify(plain));
    bad.participants[1].controller = { kind: 'ai', agent: { kind: 'skynet' } };
    expect(parseMultiRecord(JSON.stringify(bad)).ok).toBe(false);
  });
});
