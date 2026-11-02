import type { MultiState } from '../../../engine';
import type { MultiAgentSpec, MultiDecision, MultiProgress } from '../types';

/** Main thread → worker. */
export interface MultiWorkerRequest {
  type: 'decide';
  id: number;
  spec: MultiAgentSpec;
  state: MultiState;
  decisionIndex: number;
  wallsTotal?: readonly number[];
}

/** Worker → main thread. Every message carries the id of the request it belongs to. */
export type MultiWorkerResponse =
  | { type: 'progress'; id: number; progress: MultiProgress }
  | { type: 'result'; id: number; decision: MultiDecision }
  | { type: 'error'; id: number; message: string };

/** The subset of the Worker API the engine uses (lets tests inject a fake). */
export interface MultiWorkerLike {
  postMessage(message: MultiWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: MultiWorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}
