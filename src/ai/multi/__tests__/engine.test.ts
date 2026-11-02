import { describe, expect, it } from 'vitest';
import { FOUR_PLAYER_RULES, createMultiState, isLegalActionMulti } from '../../../engine';
import { FALLBACK_MAX_TIME_MS, MultiCancelledError, createMultiEngine } from '../engine';
import { defaultAgentSpec, withPreset } from '../registry';
import { handleMultiRequest } from '../worker/handler';
import type { MultiWorkerLike, MultiWorkerRequest, MultiWorkerResponse } from '../worker/protocol';

const state = createMultiState({ rules: FOUR_PLAYER_RULES, wallsPerPlayer: 5 });
const job = (kind: 'greedy' | 'maxn' | 'random' = 'greedy') => ({ spec: defaultAgentSpec(kind, 4), state, decisionIndex: 0 });

/** A worker whose replies the test releases, or that answers like the real one. */
class FakeWorker implements MultiWorkerLike {
  onmessage: MultiWorkerLike['onmessage'] = null;
  onerror: MultiWorkerLike['onerror'] = null;
  terminated = false;
  requests: MultiWorkerRequest[] = [];
  constructor(private readonly mode: 'echo' | 'hold' = 'echo') {}
  postMessage(request: MultiWorkerRequest): void {
    this.requests.push(request);
    if (this.mode === 'echo') queueMicrotask(() => handleMultiRequest(request, (r) => this.emit(r)));
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(r: MultiWorkerResponse): void {
    this.onmessage?.({ data: r });
  }
}

describe('multi AI engine', () => {
  it('runs a decision in the worker and returns a legal action', async () => {
    const w = new FakeWorker();
    const engine = createMultiEngine({ spawn: () => w });
    expect(engine.mode).toBe('worker');
    const d = await engine.decide(job('maxn'));
    expect(isLegalActionMulti(state, d.action)).toBe(true);
    expect(w.requests).toHaveLength(1);
    engine.dispose();
    expect(w.terminated).toBe(true);
  });

  it('forwards progress, and keeps Random out of the worker', async () => {
    const w = new FakeWorker('hold');
    const engine = createMultiEngine({ spawn: () => w });
    const seen: number[] = [];
    const p = engine.decide(job('maxn'), (pr) => seen.push(pr.nodes));
    w.emit({ type: 'progress', id: w.requests[0].id, progress: { depth: 2, completedDepth: 1, nodes: 77, elapsedMs: 1 } });
    expect(seen).toEqual([77]);
    engine.cancel();
    await expect(p).rejects.toBeInstanceOf(MultiCancelledError);

    const r = await engine.decide(job('random'));
    expect(isLegalActionMulti(state, r.action)).toBe(true);
    expect(w.requests).toHaveLength(1);
  });

  it('cancel terminates the worker, rejects the request and drops its late reply; the next request gets a fresh worker', async () => {
    const workers: FakeWorker[] = [];
    const engine = createMultiEngine({ spawn: () => workers[workers.push(new FakeWorker('hold')) - 1] });
    const first = engine.decide(job());
    const staleId = workers[0].requests[0].id;
    engine.cancel();
    expect(workers[0].terminated).toBe(true);
    await expect(first).rejects.toBeInstanceOf(MultiCancelledError);

    const second = engine.decide(job());
    expect(workers).toHaveLength(2);
    // a reply of the cancelled request arriving on the old worker is ignored
    workers[0].emit({ type: 'error', id: staleId, message: 'late' });
    handleMultiRequest(workers[1].requests[0], (r) => workers[1].emit(r));
    await expect(second).resolves.toBeDefined();
  });

  it('a new request cancels the previous one', async () => {
    const w = new FakeWorker('hold');
    const engine = createMultiEngine({ spawn: () => w });
    const first = engine.decide(job());
    const second = engine.decide(job());
    await expect(first).rejects.toBeInstanceOf(MultiCancelledError);
    handleMultiRequest(w.requests[w.requests.length - 1], (r) => w.emit(r));
    await expect(second).resolves.toBeDefined();
  });

  it('reports a worker error, then falls back to the capped main-thread search after repeated failures', async () => {
    const workers: FakeWorker[] = [];
    const engine = createMultiEngine({ spawn: () => workers[workers.push(new FakeWorker('hold')) - 1] });
    for (let i = 0; i < 2; i++) {
      const p = engine.decide(job());
      workers[i].onerror?.({ message: 'script failed' });
      await expect(p).rejects.toThrow('script failed');
    }
    expect(engine.mode).toBe('main-thread');
    const spec = { ...defaultAgentSpec('maxn'), maxn: { ...withPreset(defaultAgentSpec('maxn'), 'hard').maxn } };
    const t = performance.now();
    const d = await engine.decide({ ...job(), spec });
    expect(performance.now() - t).toBeLessThan(FALLBACK_MAX_TIME_MS * 6);
    expect(isLegalActionMulti(state, d.action)).toBe(true);
    if (d.trace.algorithm === 'multi-maxn') expect(d.trace.settings.timeMs).toBeLessThanOrEqual(FALLBACK_MAX_TIME_MS);
  });

  it('a cancelled main-thread request never delivers', async () => {
    const engine = createMultiEngine({ mainThreadOnly: true });
    const p = engine.decide(job());
    engine.cancel();
    await expect(p).rejects.toBeInstanceOf(MultiCancelledError);
  });

  it('turns a thrown search error into a rejection', async () => {
    const w = new FakeWorker('hold');
    const engine = createMultiEngine({ spawn: () => w });
    const p = engine.decide(job());
    w.emit({ type: 'error', id: w.requests[0].id, message: 'bad state' });
    await expect(p).rejects.toThrow('bad state');
  });
});
