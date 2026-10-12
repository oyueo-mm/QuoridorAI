import { describe, expect, it } from 'vitest';
import type { Agent } from '../../ai/types';
import { defaultSpec, inProcessFactory } from '../../arena/agentSpec';
import type { AgentFactory, Budget } from '../../arena/agentSpec';
import { applyAction, createInitialState, createState, isLegalAction } from '../../engine';
import type { GameState } from '../../engine';
import { agreement, positionFacts, runComparison, traceMetrics } from '../compare';

const fixed: Budget = { mode: 'fixed', timeMs: 200 };

describe('decision comparison', () => {
  it('gives every agent the identical GameState and collects real results', async () => {
    const seen: GameState[] = [];
    const recording: AgentFactory = (spec, budget, seed) => {
      const inner = inProcessFactory(spec, budget, seed);
      const agent: Agent = { id: inner.id, decide: (state, ctx) => (seen.push(state), inner.decide(state, ctx)) };
      return agent;
    };
    const state = applyAction(createInitialState(), { type: 'move', to: { row: 7, col: 4 } });
    const specs = [defaultSpec('bfs'), { ...defaultSpec('alphabeta'), depth: 3 }, { ...defaultSpec('mcts-guided'), simulations: 300 }];
    const updates: number[] = [];
    const results = await runComparison(state, specs, fixed, 9, recording, { onUpdate: (r) => updates.push(r.filter((x) => x.status === 'done').length) });

    expect(seen).toHaveLength(3);
    expect(seen.every((s) => s === state)).toBe(true);
    expect(results.map((r) => r.status)).toEqual(['done', 'done', 'done']);
    expect(results.map((r) => r.label)).toEqual(['BFS', 'Alpha-Beta (깊이 3)', 'Guided MCTS (300회)']);
    for (const r of results) {
      expect(isLegalAction(state, r.action!)).toBe(true);
      expect(r.trace!.ply).toBe(state.ply);
      expect(r.after!.state.ply).toBe(state.ply + 1);
      expect(traceMetrics(r.trace!).length).toBeGreaterThan(0);
    }
    expect(results[1].trace!.algorithm).toBe('minimax');
    expect(results[2].trace!.algorithm).toBe('mcts');
    expect(updates.at(-1)).toBe(3);
  });

  it('is reproducible for fixed budgets and seeds', async () => {
    const state = createInitialState();
    const specs = [{ ...defaultSpec('mcts'), simulations: 80 }, { ...defaultSpec('mcts-guided'), simulations: 200 }];
    const a = await runComparison(state, specs, fixed, 3, inProcessFactory);
    const b = await runComparison(state, specs, fixed, 3, inProcessFactory);
    expect(b.map((r) => r.notation)).toEqual(a.map((r) => r.notation));
  });

  it('groups agreeing agents and reports engine facts after each move', async () => {
    const state = createState({ pawns: [{ row: 1, col: 2 }, { row: 7, col: 6 }], currentPlayer: 0 });
    const specs = [defaultSpec('bfs'), { ...defaultSpec('alphabeta'), depth: 2 }];
    const results = await runComparison(state, specs, fixed, 1, inProcessFactory);
    const groups = agreement(results);
    expect(groups[0]).toEqual({ notation: 'c9', labels: ['BFS', 'Alpha-Beta (깊이 2)'] });
    expect(results[0].after!.winner).toBe(0);
    expect(positionFacts(createInitialState()).distances).toEqual([8, 8]);
  });

  it('cancels remaining agents when aborted and refuses finished positions', async () => {
    const ac = new AbortController();
    ac.abort();
    const results = await runComparison(createInitialState(), [defaultSpec('bfs'), defaultSpec('random')], fixed, 1, inProcessFactory, { signal: ac.signal });
    expect(results.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    const won = createState({ pawns: [{ row: 0, col: 4 }, { row: 5, col: 5 }] });
    await expect(runComparison(won, [defaultSpec('bfs')], fixed, 1, inProcessFactory)).rejects.toThrow();
  });
});
