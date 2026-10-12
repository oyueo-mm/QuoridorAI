import { decideMinimax } from '../minimaxAgent';
import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * Worker-side request handling, kept free of worker globals so it can be unit-tested.
 * The search is synchronous inside the worker; cancellation happens by terminating the
 * worker from the main thread.
 */
export function handleWorkerRequest(request: WorkerRequest, post: (response: WorkerResponse) => void): void {
  const { id } = request;
  try {
    const trace = decideMinimax(request.state, request.settings, {
      onProgress: (progress) => post({ type: 'progress', id, progress }),
    });
    post({ type: 'result', id, decision: { action: trace.pv[0], trace } });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
}
