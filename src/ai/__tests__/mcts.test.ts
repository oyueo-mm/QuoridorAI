import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  createState,
  isLegalAction,
  legalActions,
  legalPawnMoves,
} from '../../engine';
import type { Coord, GameState } from '../../engine';
import { createMctsAgent, decideMcts, decisionSeed, resolveMctsSettings } from '../mctsAgent';
import { balancedAction, createRolloutEvaluator, cutoffValue, heuristicAction, randomLegalWall, uniformAction } from '../mcts/rollout';
import { createRandomAgent } from '../randomAgent';
import { createRng } from '../rng';
import type { MctsSettings, RolloutPolicy } from '../types';
import { handleWorkerRequest } from '../worker/handler';
import type { WorkerResponse } from '../worker/protocol';

const at = (row: number, col: number): Coord => ({ row, col });
const fixed = (patch: Partial<MctsSettings> = {}) => resolveMctsSettings({ iterations: 300, timeLimitMs: 0, ...patch });
const POLICIES: RolloutPolicy[] = ['uniform', 'balanced', 'heuristic'];

async function positions(): Promise<GameState[]> {
  const out: GameState[] = [createInitialState()];
  for (const seed of [3, 9]) {
    const agent = createRandomAgent({ seed });
    let s = createInitialState();
    for (let i = 0; i < 10 && s.winner === null; i++) s = applyAction(s, (await agent.decide(s)).action);
    out.push(s);
  }
  return out;
}

describe('rollout policies', () => {
  it('only produce legal actions', async () => {
    const rng = createRng(5);
    for (const s of await positions()) {
      for (let i = 0; i < 40; i++) {
        expect(isLegalAction(s, uniformAction(s, rng))).toBe(true);
        expect(isLegalAction(s, balancedAction(s, rng, 0.5))).toBe(true);
        expect(isLegalAction(s, heuristicAction(s, rng))).toBe(true);
        const w = randomLegalWall(s, rng);
        if (w) expect(isLegalAction(s, w)).toBe(true);
      }
    }
  });

  it('uniform is dominated by walls while balanced splits moves and walls', () => {
    const s = createInitialState();
    const rng = createRng(11);
    const n = 3000;
    let uniformWalls = 0;
    let balancedWalls = 0;
    for (let i = 0; i < n; i++) {
      if (uniformAction(s, rng).type === 'wall') uniformWalls++;
      if (balancedAction(s, rng, 0.5).type === 'wall') balancedWalls++;
    }
    // 128 legal walls vs 3 pawn moves → ≈ 97.7 % walls.
    expect(uniformWalls / n).toBeGreaterThan(0.95);
    expect(Math.abs(balancedWalls / n - 0.5)).toBeLessThan(0.05);
  });

  it('separates real game ends from truncated rollouts', () => {
    const s = createInitialState();
    for (const policy of POLICIES) {
      const truncated = createRolloutEvaluator(fixed({ rollout: policy, rolloutMaxPlies: 2 }))(s, createRng(1));
      expect(truncated.truncated).toBe(true);
      expect(Math.abs(truncated.value)).toBeLessThan(1);
      const draw = createRolloutEvaluator(fixed({ rollout: policy, rolloutMaxPlies: 2, rolloutCutoff: 'draw' }))(s, createRng(1));
      expect(draw.value).toBe(0);
    }
    // Heuristic rollouts play the race out to a real result.
    const full = createRolloutEvaluator(fixed({ rollout: 'heuristic', rolloutMaxPlies: 400 }))(s, createRng(2));
    expect(full.truncated).toBe(false);
    expect(Math.abs(full.value)).toBe(1);
    // Distance cutoff favours the player that is ahead.
    expect(cutoffValue(createState({ pawns: [at(2, 4), at(1, 4)] }))).toBeGreaterThan(0);
  });
});

describe('MCTS agent on Quoridor', () => {
  it('always returns a legal action, for every rollout policy', async () => {
    for (const s of await positions()) {
      for (const rollout of POLICIES) {
        const t = decideMcts(s, fixed({ rollout, iterations: 150 }), 7);
        expect(isLegalAction(s, t.candidates[0].action)).toBe(true);
        for (const c of t.candidates) {
          expect(isLegalAction(s, c.action)).toBe(true);
          expect(c.q).toBeGreaterThanOrEqual(-1);
          expect(c.q).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('is reproducible for the same seed and budget', () => {
    const s = createInitialState();
    const a = decideMcts(s, fixed(), 42);
    const b = decideMcts(s, fixed(), 42);
    expect(b.candidates.map((c) => [c.notation, c.visits])).toEqual(a.candidates.map((c) => [c.notation, c.visits]));
    expect(b.seed).toBe(decisionSeed(42, 0));
    const c = decideMcts(s, fixed(), 43);
    expect(c.seed).not.toBe(a.seed);
  });

  it('accumulates visits: candidates sum to the number of simulations', async () => {
    for (const s of await positions()) {
      const t = decideMcts(s, fixed({ iterations: 400 }), 3);
      if (t.stopReason !== 'iterations') continue;
      expect(t.simulations).toBe(400);
      expect(t.candidates.reduce((sum, c) => sum + c.visits, 0)).toBe(400);
      expect(t.rollouts.count + t.rollouts.treeTerminal).toBe(400);
      expect(t.rollouts.terminal + t.rollouts.truncated).toBe(t.rollouts.count);
      // Most visited non-lost move is chosen.
      const open = t.candidates.filter((c) => c.proven !== 'loss');
      expect(t.candidates[0].visits).toBe(Math.max(...open.map((c) => c.visits)));
      expect(t.snapshots.length).toBeGreaterThan(0);
      expect(t.snapshots.length).toBeLessThanOrEqual(65);
      expect(t.snapshots.at(-1)!.simulations).toBe(400);
    }
  });

  it('takes an immediate win', () => {
    const s = createState({ pawns: [at(1, 2), at(7, 6)], currentPlayer: 0 });
    const t = decideMcts(s, fixed(), 1);
    expect(t.candidates[0].action).toEqual({ type: 'move', to: at(0, 2) });
    expect(t.selectionRule).toBe('proven-win');
    expect(t.stopReason).toBe('proven-win');
    expect(t.simulations).toBe(1);
  });

  it('blocks an opponent that would otherwise win next move', () => {
    const s = createState({ pawns: [at(6, 0), at(7, 4)], currentPlayer: 0 });
    for (const rollout of POLICIES) {
      const t = decideMcts(s, fixed({ rollout, iterations: 600 }), 2);
      const next = applyAction(s, t.candidates[0].action);
      expect(legalPawnMoves(next, 1).some((c) => c.row === 8)).toBe(false);
      expect(t.candidates.filter((c) => c.proven === 'loss').length).toBeGreaterThan(0);
    }
  });

  it('recognises a lost position and still plays legally', () => {
    const s = createState({ pawns: [at(8, 0), at(7, 4)], currentPlayer: 0, wallsRemaining: [0, 0] });
    const t = decideMcts(s, fixed(), 1);
    expect(t.stopReason).toBe('proven-loss');
    expect(isLegalAction(s, t.candidates[0].action)).toBe(true);
    expect(t.candidates.every((c) => c.proven === 'loss')).toBe(true);
  });

  it('respects the time limit, node cap and abort signal', async () => {
    const s = createInitialState();
    const timed = decideMcts(s, resolveMctsSettings({ iterations: 1e7, timeLimitMs: 80 }), 1);
    expect(timed.stopReason).toBe('time');
    expect(timed.elapsedMs).toBeLessThan(80 + 500);
    expect(isLegalAction(s, timed.candidates[0].action)).toBe(true);

    const capped = decideMcts(s, fixed({ iterations: 500, maxNodes: 40 }), 1);
    expect(capped.treeNodes).toBeLessThanOrEqual(40);
    expect(capped.simulations).toBe(500);

    const ac = new AbortController();
    ac.abort();
    await expect(createMctsAgent(fixed()).decide(s, { signal: ac.signal })).rejects.toThrow(/abort/i);
  });

  it('reports progress with simulation counts', () => {
    const seen: number[] = [];
    decideMcts(createInitialState(), resolveMctsSettings({ iterations: 1e7, timeLimitMs: 350 }), 1, {
      onProgress: (p) => seen.push(p.simulations ?? -1),
    });
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it('records the trace consistently (PV, candidate counts, value rule)', () => {
    const s = createInitialState();
    const t = decideMcts(s, fixed({ wallFilter: 'opponent-path' }), 5);
    expect(t.legalActionCount).toBe(legalActions(s).length);
    expect(t.searchedActionCount).toBeLessThan(t.legalActionCount);
    expect(t.pv[0].notation).toBe(t.candidates[0].notation);
    expect(t.pv[0].visits).toBe(t.candidates[0].visits);
    expect(t.valueRule).toContain('100 ply');
    expect(t.rationale.length).toBeGreaterThan(1);
  });

  it('runs through the worker handler', () => {
    const responses: WorkerResponse[] = [];
    handleWorkerRequest(
      { type: 'decide', id: 9, agent: 'mcts', settings: fixed({ iterations: 100 }), seed: 4, state: createInitialState() },
      (r) => responses.push(r),
    );
    const result = responses.at(-1)!;
    expect(result.type).toBe('result');
    if (result.type === 'result') {
      expect(result.id).toBe(9);
      expect(result.decision.trace.algorithm).toBe('mcts');
      expect(isLegalAction(createInitialState(), result.decision.action)).toBe(true);
    }
  });
});
