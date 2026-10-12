import type { Action, GameState } from '../engine';

/**
 * Draft contract for AI agents (implemented from stage 2 onward).
 *
 * Every agent uses the shared engine for legal moves and returns, together with the chosen
 * action, a DecisionTrace describing *its actual computation* so the analysis panel can
 * visualise it. Agents are async so long searches can move into a Web Worker without
 * changing callers.
 */
export interface AgentDecision<T extends DecisionTrace = DecisionTrace> {
  action: Action;
  trace: T;
}

export interface DecisionTrace {
  /** Matches AgentDescriptor.id, used to pick the visualisation. */
  algorithm: string;
  elapsedMs: number;
}

export interface AgentContext {
  signal?: AbortSignal;
}

export interface Agent<T extends DecisionTrace = DecisionTrace> {
  readonly id: string;
  decide(state: GameState, context?: AgentContext): Promise<AgentDecision<T>>;
}
