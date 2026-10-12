import { handleWorkerRequest } from './handler';
import type { WorkerRequest, WorkerResponse } from './protocol';

// Entry point of the search Web Worker.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

scope.onmessage = (event) => handleWorkerRequest(event.data, (response) => scope.postMessage(response));
