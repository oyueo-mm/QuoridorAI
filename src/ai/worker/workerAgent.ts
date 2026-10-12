import type { GameState } from '../../engine';
import type { Agent, AgentContext, AgentDecision } from '../types';
import type { WorkerJob, WorkerLike, WorkerResponse, WorkerTrace } from './protocol';

function abortError(): Error {
  return new DOMException('Decision aborted', 'AbortError');
}

/**
 * Runs a search agent (Minimax or MCTS) in a Web Worker so long searches never block the UI.
 *
 * Stale results cannot leak: each request has an id and only messages with the current id
 * are accepted; aborting terminates the worker (stopping the computation immediately) and a
 * fresh worker is created for the next request.
 */
export function createWorkerAgent(job: WorkerJob, createWorker: () => WorkerLike): Agent<WorkerTrace> {
  let worker: WorkerLike | null = null;
  let seq = 0;

  const kill = (w: WorkerLike) => {
    w.onmessage = null;
    w.onerror = null;
    w.terminate();
    if (worker === w) worker = null;
  };

  return {
    id: job.agent,
    decide(state: GameState, context?: AgentContext): Promise<AgentDecision<WorkerTrace>> {
      return new Promise((resolve, reject) => {
        const signal = context?.signal;
        if (signal?.aborted) return reject(abortError());
        if (state.winner !== null) return reject(new Error('Cannot decide in a finished game'));

        const w = (worker ??= createWorker());
        const id = ++seq;
        const finish = () => {
          signal?.removeEventListener('abort', onAbort);
          w.onmessage = null;
          w.onerror = null;
        };
        const onAbort = () => {
          finish();
          kill(w);
          reject(abortError());
        };

        w.onmessage = ({ data }: { data: WorkerResponse }) => {
          if (data.id !== id) return;
          if (data.type === 'progress') {
            context?.onProgress?.(data.progress);
          } else if (data.type === 'result') {
            finish();
            resolve(data.decision);
          } else {
            finish();
            reject(new Error(data.message));
          }
        };
        w.onerror = (event) => {
          finish();
          kill(w);
          reject(new Error(event.message ?? 'Search worker failed'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        w.postMessage({ ...job, type: 'decide', id, state });
      });
    },
    dispose() {
      if (worker) kill(worker);
    },
  };
}
