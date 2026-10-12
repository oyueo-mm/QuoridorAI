import type { Action, Coord, GameState, PlayerId } from '../engine';

/**
 * Contract for AI agents.
 *
 * Every agent uses the shared engine for legal moves and returns, together with the chosen
 * action, a DecisionTrace describing *its actual computation* so the analysis panel can
 * visualise it. Agents are async so long searches can move into a Web Worker without
 * changing callers.
 */
export interface AgentDecision<T extends DecisionTraceBase = DecisionTrace> {
  action: Action;
  trace: T;
}

export interface DecisionTraceBase {
  /** Matches AgentDescriptor.id, used to pick the visualisation. */
  algorithm: string;
  /** Player the agent decided for. */
  player: PlayerId;
  /** Ply of the state the decision was made in. */
  ply: number;
  elapsedMs: number;
}

export interface AgentContext {
  signal?: AbortSignal;
}

export interface Agent<T extends DecisionTraceBase = DecisionTrace> {
  readonly id: string;
  /** Rejects if the state is terminal or the signal is aborted. */
  decide(state: GameState, context?: AgentContext): Promise<AgentDecision<T>>;
}

// ---------------------------------------------------------------- Random

export interface RandomTrace extends DecisionTraceBase {
  algorithm: 'random';
  seed: number;
  /** 0-based count of decisions this agent instance has made (position in the RNG stream). */
  decisionIndex: number;
  candidateCount: number;
  pawnMoveCount: number;
  wallCount: number;
  /** Uniform draw in [0, 1) that selected the action. */
  roll: number;
  /** Index of the chosen action in the engine's legalActions() order. */
  chosenIndex: number;
  chosenAction: Action;
}

// ---------------------------------------------------------------- BFS heuristic

export interface BfsWeights {
  /** Penalty per step of the agent's own shortest path after the action. */
  selfDistance: number;
  /** Reward per step of the opponent's shortest path after the action. */
  opponentDistance: number;
  /** Fixed cost of spending a wall. */
  wallCost: number;
  /** Extra wall cost scaled by the fraction of walls already used (scarcity). */
  wallScarcity: number;
  /** Penalty if, after the action, the opponent has a pawn move that wins immediately. */
  opponentWinThreat: number;
}

export interface BfsCandidate {
  action: Action;
  notation: string;
  selfBefore: number;
  selfAfter: number;
  opponentBefore: number;
  opponentAfter: number;
  immediateWin: boolean;
  /** After the action the opponent can reach its goal row with its next pawn move. */
  opponentWinsNext: boolean;
  /** Weighted contributions; score = self + opponent + wall + threat (or WIN_SCORE on immediate win). */
  terms: { self: number; opponent: number; wall: number; threat: number };
  score: number;
  /** 1 = chosen action. */
  rank: number;
  /** Shortest paths after the action; only kept for the top candidates. */
  selfPathAfter?: Coord[];
  opponentPathAfter?: Coord[];
}

export interface BfsTrace extends DecisionTraceBase {
  algorithm: 'bfs';
  weights: BfsWeights;
  wallsRemaining: number;
  before: {
    selfDistance: number;
    opponentDistance: number;
    selfPath: Coord[];
    opponentPath: Coord[];
  };
  /** All legal actions, evaluated and sorted by rank. candidates[0] is the chosen action. */
  candidates: BfsCandidate[];
  /** Human-readable explanation generated from the numbers above. */
  rationale: string[];
}

export type DecisionTrace = RandomTrace | BfsTrace;
