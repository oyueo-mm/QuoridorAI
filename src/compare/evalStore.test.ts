import { describe, expect, it } from 'vitest';
import { inProcessFactory } from '../arena/agentSpec';
import type { AgentFactory, AgentSpec, Budget } from '../arena/agentSpec';
import { parseMoveList } from '../arena/openings';
import type { Agent } from '../ai/types';
import { EvalStore } from './evalStore';
import { positionKey } from './positionEval';

const BUDGET: Budget = { mode: 'fixed', timeMs: 300 };
const SPECS: AgentSpec[] = [{ kind: 'bfs', depth: 4, simulations: 100 }, { kind: 'alphabeta', depth: 2, simulations: 100 }];
const positions = parseMoveList('e2 e8 e3 e7').positions;
const job = (i: number) => ({ state: positions[i], key: positionKey(positions[i]) });

describe('EvalStore', () => {
  it('evaluates and caches per position and setting', async () => {
    const store = new EvalStore(inProcessFactory);
    await store.request([job(2)], SPECS, BUDGET, 1, 0);
    const bfs = store.get(job(2).key, SPECS[0], 0, BUDGET, 1);
    const ab = store.get(job(2).key, SPECS[1], 1, BUDGET, 1);
    expect(bfs?.status).toBe('done');
    expect(ab?.trace?.algorithm).toBe('minimax');
    expect(store.get(job(3).key, SPECS[0], 0, BUDGET, 1)).toBeUndefined(); // other position
    expect(store.get(job(2).key, SPECS[1], 1, { mode: 'fixed', timeMs: 999 }, 1)).toBeUndefined(); // other budget
    expect(store.running).toBeNull();
  });

  it('a newer request cancels the older one; late answers land only under their own position', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    const slowFactory: AgentFactory = (spec, budget, seed) => {
      const inner = inProcessFactory(spec, budget, seed);
      const agent: Agent = {
        id: inner.id,
        decide: async (state, ctx) => {
          calls++;
          await gate;
          if (ctx?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
          return inner.decide(state, ctx);
        },
      };
      return agent;
    };
    const store = new EvalStore(slowFactory);
    const first = store.request([job(1)], SPECS.slice(0, 1), BUDGET, 1, 0);
    await new Promise((r) => setTimeout(r, 5));
    expect(store.running?.posKey).toBe(job(1).key);
    const second = store.request([job(2)], SPECS.slice(0, 1), BUDGET, 1, 0);
    release();
    await Promise.all([first, second]);
    expect(store.get(job(1).key, SPECS[0], 0, BUDGET, 1)).toBeUndefined(); // cancelled -> not cached
    expect(store.get(job(2).key, SPECS[0], 0, BUDGET, 1)?.status).toBe('done');
    expect(calls).toBe(2);
  });

  it('skips cached entries and finished positions', async () => {
    const store = new EvalStore(inProcessFactory);
    await store.request([job(1)], SPECS.slice(0, 1), BUDGET, 1, 0);
    const before = store.getVersion();
    await store.request([job(1)], SPECS.slice(0, 1), BUDGET, 1, 0);
    expect(store.getVersion() - before).toBeLessThanOrEqual(1); // only the final "idle" notification
  });
});
