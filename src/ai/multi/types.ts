import type { Action, Coord, MultiRules } from '../../engine';

/**
 * Types of the multi-player AIs (2–4 seats, any `MultiRules`). They are independent of the
 * two-player `Agent` / `DecisionTrace` types: values are indexed by *seat* (the engine id of a
 * player), never by "me / opponent", and the traces carry what the algorithm actually computed.
 */

export type MultiAgentKind = 'random' | 'greedy' | 'maxn';
export type MultiPreset = 'easy' | 'normal' | 'hard' | 'custom';

/** Weights of the Multi BFS / Greedy heuristic (all applied to real shortest-path distances). */
export interface MultiGreedyWeights {
  /** Penalty per step of my own shortest path after the action. */
  selfDistance: number;
  /** Team games: penalty per step of the closest ally's path (an ally arriving wins for the team). */
  allyDistance: number;
  /** Reward per step of the most advanced opposing side's path (the "leader"). */
  leaderDistance: number;
  /** Reward per step of the average opposing side's path. */
  opponentDistance: number;
  /** Fixed cost of spending a wall. */
  wallCost: number;
  /** Extra wall cost scaled by the fraction of my walls already used. */
  wallScarcity: number;
  /** Penalty per opposing side that can win with its next pawn move after my action. */
  opponentWinThreat: number;
  /** Team games: bonus if an ally could win with its next pawn move after my action. */
  teamWinReady: number;
}

/** Settings of the Multi Max-N search. */
export interface MultiMaxNSettings {
  /** Deepest iteration, in plies (every seat's move is one ply). */
  maxDepth: number;
  /** Wall-clock budget; the last completed iteration is used when it runs out. */
  timeMs: number;
  /** Budget of generated positions. */
  maxNodes: number;
  /** Wall candidates searched at the root (pawn moves are always all searched). */
  rootWalls: number;
  /** Wall candidates searched below the root. */
  innerWalls: number;
  /** Cache of exact search values per (position, remaining depth). */
  transposition: boolean;
  /** Value of each wall still in hand in the leaf evaluation. */
  wallValue: number;
  /** Weight of the strongest opposing side (vs the average) in the leaf evaluation, 0..1. */
  leaderShare: number;
}

export interface MultiAgentSpec {
  kind: MultiAgentKind;
  /** Random AI seed (Greedy and Max-N are deterministic and ignore it). */
  seed: number;
  preset: MultiPreset;
  greedy: MultiGreedyWeights;
  maxn: MultiMaxNSettings;
}

/** Who plays a seat: a person on this device, or one of the multi-player AIs with its own settings. */
export type MultiSeatController = { kind: 'human' } | { kind: 'ai'; agent: MultiAgentSpec };

/** Compact, record-friendly summary of an AI decision (the full trace is not saved in game files). */
export interface MultiAiSummary {
  algorithm: MultiTraceBase['algorithm'];
  elapsedMs: number;
  nodes?: number;
  depth?: number;
  candidates?: number;
}

// ---------------------------------------------------------------- traces

export interface MultiTraceBase {
  algorithm: 'multi-random' | 'multi-greedy' | 'multi-maxn';
  /** Seat the AI decided for. */
  player: number;
  ply: number;
  elapsedMs: number;
  /** Turn order of the game, to label the per-seat values. */
  turnOrder: readonly number[];
  /** Team of every seat (absent = individual game). */
  teams?: readonly number[];
}

export interface MultiRandomTrace extends MultiTraceBase {
  algorithm: 'multi-random';
  seed: number;
  /** Number of earlier decisions of this seat = position in its random stream. */
  decisionIndex: number;
  candidateCount: number;
  pawnMoveCount: number;
  wallCount: number;
  /** Uniform draw in [0, 1) that selected the action. */
  roll: number;
  chosenIndex: number;
  chosenAction: Action;
}

export interface MultiGreedyCandidate {
  action: Action;
  notation: string;
  /** Shortest distance of every seat after the action. */
  distances: number[];
  immediateWin: boolean;
  /** Seats (opposing sides) that could win with their next pawn move after the action. */
  threats: number[];
  /** An ally could win with its next pawn move after the action (team games). */
  allyReady: boolean;
  terms: { self: number; ally: number; leader: number; opponents: number; wall: number; threat: number; ready: number };
  score: number;
  /** 1 = chosen. */
  rank: number;
  /** Shortest paths of every seat after the action; kept for the top candidates only. */
  pathsAfter?: Coord[][];
}

export interface MultiGreedyTrace extends MultiTraceBase {
  algorithm: 'multi-greedy';
  weights: MultiGreedyWeights;
  wallsRemaining: number[];
  before: { distances: number[]; paths: Coord[][] };
  /** Number of legal actions evaluated (the trace keeps the best ones). */
  totalCandidates: number;
  /** Sorted best first; candidates[0] is the chosen action. */
  candidates: MultiGreedyCandidate[];
  rationale: string[];
}

export interface MultiMaxNCandidate {
  action: Action;
  notation: string;
  /** Utility vector by seat from the last completed iteration. */
  values: number[];
  /** Static (depth-0) utility vector of the position after the action. */
  staticValues: number[];
  /** Principal variation from this action (notations, this action first). */
  pv: string[];
  rank: number;
  /** Shortest distance of every seat right after the action. */
  distances: number[];
}

export interface MultiIteration {
  depth: number;
  nodes: number;
  elapsedMs: number;
  bestNotation: string;
  /** Utility vector of the best action. */
  values: number[];
}

export type MultiStopReason = 'depth' | 'time' | 'nodes' | 'forced-win' | 'single-move' | 'cancelled';

export interface MultiMaxNTrace extends MultiTraceBase {
  algorithm: 'multi-maxn';
  settings: MultiMaxNSettings;
  /** Individual (each seat maximises its own utility) or team (one shared utility per team). */
  mode: 'individual' | 'team';
  completedDepth: number;
  nodes: number;
  ttHits: number;
  ttStores: number;
  /** Subtrees cut because the mover already had the best possible value (immediate pruning). */
  prunes: number;
  stopReason: MultiStopReason;
  /** Legal wall placements of the seat vs. the wall candidates the search considered at the root. */
  legalWalls: number;
  consideredWalls: number;
  distances: number[];
  wallsRemaining: number[];
  iterations: MultiIteration[];
  /** Root candidates sorted best first; candidates[0] is the chosen action. */
  candidates: MultiMaxNCandidate[];
  pv: string[];
}

export type MultiTrace = MultiRandomTrace | MultiGreedyTrace | MultiMaxNTrace;

export interface MultiDecision<T extends MultiTrace = MultiTrace> {
  action: Action;
  trace: T;
}

export interface MultiProgress {
  /** Depth being searched / deepest completed iteration. */
  depth: number;
  completedDepth: number;
  nodes: number;
  elapsedMs: number;
  bestNotation?: string;
  /** Utility of the best action for the seat that is thinking. */
  score?: number;
}

export interface MultiContext {
  signal?: { readonly aborted: boolean };
  onProgress?: (p: MultiProgress) => void;
  /** Earlier decisions of this seat (Random AI stream position). */
  decisionIndex?: number;
  /** Walls every seat started with (scarcity of Greedy's wall cost). */
  wallsTotal?: readonly number[];
}

/** Rules are part of the MultiState; kept here only so requests can be typed as plain data. */
export type { MultiRules };
