import { describe, expect, it } from 'vitest';
import { applyAction, createInitialState, isLegalAction } from '../../engine';
import { resolveMinimaxSettings } from '../minimaxAgent';
import { handleWorkerRequest } from '../worker/handler';
import type { WorkerLike, WorkerRequest, WorkerResponse } from '../worker/protocol';
import { createWorkerAgent } from '../worker/workerAgent';

/** In-process stand-in for a Web Worker that runs the real handler asynchronously. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  terminated = false;
  requests: WorkerRequest[] = [];
  constructor(private readonly hold = false) {}
  release: (() => void) | null = null;

  postMessage(message: WorkerRequest): void {
    this.requests.push(message);
    const run = () =>
      handleWorkerRequest(message, (response) => {
        if (!this.terminated) this.onmessage?.({ data: response });
      });
    if (this.hold) this.release = run;
    else setTimeout(run, 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const settings = resolveMinimaxSettings({ maxDepth: 2, timeLimitMs: 0 });

describe('WorkerAgent', () => {
  it('returns the worker search result and forwards progress', async () => {
    const workers: FakeWorker[] = [];
    const agent = createWorkerAgent({ agent: 'minimax', settings }, () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const state = applyAction(createInitialState(), { type: 'move', to: { row: 7, col: 4 } });
    const progress: number[] = [];
    const { action, trace } = await agent.decide(state, { onProgress: (p) => progress.push(p.completedDepth) });
    expect(isLegalAction(state, action)).toBe(true);
    expect(trace.algorithm).toBe('minimax');
    expect(trace.algorithm === 'minimax' && trace.completedDepth).toBe(2);
    expect(progress).toContain(2);
    // The worker is reused for the next decision.
    await agent.decide(applyAction(state, action));
    expect(workers).toHaveLength(1);
    expect(workers[0].requests.map((r) => r.id)).toEqual([1, 2]);
  });

  it('abort terminates the worker, rejects, and ignores the late answer', async () => {
    const workers: FakeWorker[] = [];
    const agent = createWorkerAgent({ agent: 'minimax', settings }, () => {
      const w = new FakeWorker(true);
      workers.push(w);
      return w;
    });
    const controller = new AbortController();
    const state = createInitialState();
    const promise = agent.decide(state, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
    expect(workers[0].terminated).toBe(true);
    workers[0].release?.(); // the old computation "finishes" after termination: nothing happens

    // Next decision spawns a fresh worker.
    const next = agent.decide(state);
    workers[1].release?.();
    const { trace } = await next;
    expect(trace.algorithm).toBe('minimax');
    expect(workers).toHaveLength(2);
  });

  it('dispose terminates the worker', async () => {
    const w = new FakeWorker();
    const agent = createWorkerAgent({ agent: 'minimax', settings }, () => w);
    await agent.decide(createInitialState());
    agent.dispose?.();
    expect(w.terminated).toBe(true);
  });

  it('reports worker-side errors', async () => {
    const agent = createWorkerAgent({ agent: 'minimax', settings }, () => new FakeWorker());
    const finished = { ...createInitialState(), winner: 0 as const };
    await expect(agent.decide(finished)).rejects.toThrow();
  });
});
