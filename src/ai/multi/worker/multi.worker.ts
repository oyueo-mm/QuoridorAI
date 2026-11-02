import { handleMultiRequest } from './handler';
import type { MultiWorkerRequest, MultiWorkerResponse } from './protocol';

// Entry point of the multi-player search Web Worker.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MultiWorkerRequest>) => void) | null;
  postMessage: (message: MultiWorkerResponse) => void;
};

scope.onmessage = (event) => handleMultiRequest(event.data, (response) => scope.postMessage(response));
