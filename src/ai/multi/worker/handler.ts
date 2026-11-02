import { decideMulti } from '../registry';
import type { MultiWorkerRequest, MultiWorkerResponse } from './protocol';

/**
 * Worker-side request handling, free of worker globals so it can be unit-tested. The search is
 * synchronous inside the worker; cancelling = terminating the worker from the main thread.
 */
export function handleMultiRequest(request: MultiWorkerRequest, post: (response: MultiWorkerResponse) => void): void {
  const { id } = request;
  try {
    const decision = decideMulti(request.spec, request.state, {
      decisionIndex: request.decisionIndex,
      wallsTotal: request.wallsTotal,
      onProgress: (progress) => post({ type: 'progress', id, progress }),
    });
    post({ type: 'result', id, decision });
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
}
