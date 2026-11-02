import type { MultiState } from '../../engine';
import { decideMulti, multiAgentInfo } from './registry';
import type { MultiAgentSpec, MultiDecision, MultiProgress } from './types';
import type { MultiWorkerLike, MultiWorkerResponse } from './worker/protocol';
import { multiWorkersSupported, spawnMultiWorker } from './worker/spawn';

export interface MultiAiJob {
  spec: MultiAgentSpec;
  state: MultiState;
  /** Earlier decisions of this seat (position in a Random AI's stream). */
  decisionIndex: number;
  wallsTotal?: readonly number[];
}

export class MultiCancelledError extends Error {
  constructor() {
    super('AI decision cancelled');
    this.name = 'MultiCancelledError';
  }
}

/** Where AI decisions run: asynchronous, cancellable, one at a time. */
export interface MultiAiEngine {
  readonly mode: 'worker' | 'main-thread';
  /** Starts a decision (a still-running one is cancelled first). Rejects with MultiCancelledError when cancelled. */
  decide(job: MultiAiJob, onProgress?: (p: MultiProgress) => void): Promise<MultiDecision>;
  /** Cancels the running decision; its promise rejects and no result is ever delivered. */
  cancel(): void;
  /** Cancels and releases the worker. The engine can still be used afterwards (it starts a new one). */
  dispose(): void;
}

/**
 * Main-thread fallback budget. Without a worker a search blocks the page for as long as it runs, so
 * it is capped well below the presets' budgets and preceded by an idle gap (FALLBACK_YIELD_MS), which
 * keeps the page responsive even when several AIs play one after another. The trace shows the budget used.
 */
export const FALLBACK_MAX_TIME_MS = 80;
/** Idle time before every main-thread decision, so a chain of AI turns still leaves the page time to paint and react. */
export const FALLBACK_YIELD_MS = 40;

export interface MultiEngineOptions {
  /** Creates the worker (default: the bundled one). */
  spawn?: () => MultiWorkerLike;
  /** Never use a worker (tests, unsupported platforms). */
  mainThreadOnly?: boolean;
}

export function createMultiEngine(options: MultiEngineOptions = {}): MultiAiEngine {
  const spawn = options.spawn ?? spawnMultiWorker;
  let useWorker = !options.mainThreadOnly && (options.spawn !== undefined || multiWorkersSupported());
  let worker: MultiWorkerLike | null = null;
  let failures = 0;
  let nextId = 0;
  let pending: { id: number; resolve: (d: MultiDecision) => void; reject: (e: Error) => void; onProgress?: (p: MultiProgress) => void; token?: { aborted: boolean } } | null = null;

  const settle = (fn: (p: NonNullable<typeof pending>) => void) => {
    const p = pending;
    pending = null;
    if (p) fn(p);
  };
  const killWorker = () => {
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
    worker = null;
  };

  const ensureWorker = (): MultiWorkerLike | null => {
    if (!useWorker) return null;
    if (worker) return worker;
    try {
      const w = spawn();
      w.onmessage = (event) => {
        const msg: MultiWorkerResponse = event.data;
        if (!pending || msg.id !== pending.id) return; // a cancelled request's late message
        if (msg.type === 'progress') pending.onProgress?.(msg.progress);
        else if (msg.type === 'result') {
          failures = 0;
          settle((p) => p.resolve(msg.decision));
        } else settle((p) => p.reject(new Error(msg.message)));
      };
      w.onerror = (event) => {
        failures++;
        killWorker();
        if (failures >= 2) useWorker = false; // keep playing on the (capped) main-thread path
        settle((p) => p.reject(new Error(event.message || 'AI worker failed')));
      };
      worker = w;
    } catch {
      useWorker = false;
      worker = null;
    }
    return worker;
  };

  const cancel = () => {
    if (!pending) return;
    if (pending.token) pending.token.aborted = true;
    // A synchronous search inside the worker cannot be interrupted: end the worker and start a new one lazily.
    if (worker) killWorker();
    settle((p) => p.reject(new MultiCancelledError()));
  };

  return {
    get mode() {
      return useWorker ? 'worker' : 'main-thread';
    },
    decide(job, onProgress) {
      cancel();
      const id = nextId++;
      return new Promise<MultiDecision>((resolve, reject) => {
        // Random is instant and needs no worker.
        if (!multiAgentInfo(job.spec.kind).heavy) {
          try {
            resolve(decideMulti(job.spec, job.state, { decisionIndex: job.decisionIndex }));
          } catch (e) {
            reject(e);
          }
          return;
        }
        const w = ensureWorker();
        if (w) {
          pending = { id, resolve, reject, onProgress };
          w.postMessage({ type: 'decide', id, spec: job.spec, state: job.state, decisionIndex: job.decisionIndex, wallsTotal: job.wallsTotal });
          return;
        }
        const token = { aborted: false };
        pending = { id, resolve, reject, onProgress, token };
        const spec: MultiAgentSpec = { ...job.spec, maxn: { ...job.spec.maxn, timeMs: Math.min(job.spec.maxn.timeMs, FALLBACK_MAX_TIME_MS) } };
        setTimeout(() => {
          if (token.aborted || !pending || pending.id !== id) return;
          try {
            const decision = decideMulti(spec, job.state, { decisionIndex: job.decisionIndex, wallsTotal: job.wallsTotal, signal: token, onProgress });
            settle((p) => p.resolve(decision));
          } catch (e) {
            settle((p) => p.reject(e instanceof Error ? e : new Error(String(e))));
          }
        }, FALLBACK_YIELD_MS);
      });
    },
    cancel,
    dispose() {
      cancel();
      killWorker();
    },
  };
}
