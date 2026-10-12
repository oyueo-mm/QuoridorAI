import type { GameState } from '../../engine';
import type { AgentDecision, AgentProgress, MinimaxSettings, MinimaxTrace } from '../types';

/** Main thread → worker. */
export type WorkerRequest = {
  type: 'decide';
  id: number;
  state: GameState;
  settings: MinimaxSettings;
};

/** Worker → main thread. Every message carries the request id it belongs to. */
export type WorkerResponse =
  | { type: 'progress'; id: number; progress: AgentProgress }
  | { type: 'result'; id: number; decision: AgentDecision<MinimaxTrace> }
  | { type: 'error'; id: number; message: string };

/** The subset of the Worker API used by WorkerAgent (lets tests inject a fake). */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}
