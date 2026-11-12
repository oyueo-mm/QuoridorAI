import { decideMcts } from '../mctsAgent';
import { createMinimaxCache, decideMinimax } from '../minimaxAgent';
import type { AgentContext } from '../types';
import type { WorkerRequest, WorkerResponse, WorkerTrace } from './protocol';

/**
 * Worker-side request handling, kept free of worker globals so it can be unit-tested.
 * Searches are synchronous inside the worker; cancellation happens by terminating the
 * worker from the main thread.
 */
/** One worker serves one agent: its Alpha-Beta search state persists like the in-process agent's. */
const minimaxCache = createMinimaxCache();

export function handleWorkerRequest(request: WorkerRequest, post: (response: WorkerResponse) => void): void {
  const { id } = request;
  const context: AgentContext = { onProgress: (progress) => post({ type: 'progress', id, progress }) };
  try {
    let trace: WorkerTrace;
    let action;
    if (request.agent === 'minimax') {
      const t = decideMinimax(request.state, request.settings, context, minimaxCache);
      trace = t;
      action = t.pv[0];
    } else {
      const t = decideMcts(request.state, request.settings, request.seed, context);
      trace = t;
      action = t.candidates[0].action;
    }
    post({ type: 'result', id, decision: { action, trace } });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
}
