import type { GameState } from '../../engine';
import type { AgentDecision, AgentProgress, MctsSettings, MctsTrace, MinimaxSettings, MinimaxTrace } from '../types';

/** Which search runs in the worker, with its settings. */
export type WorkerJob =
  | { agent: 'minimax'; settings: MinimaxSettings }
  | { agent: 'mcts'; settings: MctsSettings; seed: number };

/** Main thread → worker. */
export type WorkerRequest = WorkerJob & {
  type: 'decide';
  id: number;
  state: GameState;
};

export type WorkerTrace = MinimaxTrace | MctsTrace;

/** Worker → main thread. Every message carries the request id it belongs to. */
export type WorkerResponse =
  | { type: 'progress'; id: number; progress: AgentProgress }
  | { type: 'result'; id: number; decision: AgentDecision<WorkerTrace> }
  | { type: 'error'; id: number; message: string };

/** The subset of the Worker API used by WorkerAgent (lets tests inject a fake). */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}
