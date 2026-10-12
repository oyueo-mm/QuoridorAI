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
  /** Periodic progress for long-running agents (search). */
  onProgress?: (progress: AgentProgress) => void;
}

export interface AgentProgress {
  /** Depth currently being searched. */
  depth: number;
  /** Deepest fully completed iteration (0 = none yet). */
  completedDepth: number;
  nodes: number;
  elapsedMs: number;
  /** Best move of the last completed iteration. */
  bestNotation?: string;
  score?: number;
  /** MCTS only: simulations so far and the simulation budget. */
  simulations?: number;
  simulationLimit?: number;
}

export interface Agent<T extends DecisionTraceBase = DecisionTrace> {
  readonly id: string;
  /** Rejects if the state is terminal or the signal is aborted. */
  decide(state: GameState, context?: AgentContext): Promise<AgentDecision<T>>;
  /** Releases resources (e.g. a Web Worker) when the agent is no longer used. */
  dispose?(): void;
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

// ---------------------------------------------------------------- Minimax / Alpha-Beta

export interface MinimaxEvalWeights {
  /** Penalty per step of the evaluated player's shortest path. */
  selfDistance: number;
  /** Reward per step of the opponent's shortest path. */
  opponentDistance: number;
  /** Value of each wall in hand, relative to the opponent's (own − opponent's). */
  wallDifference: number;
  /** Bonus for being the side to move (worth roughly half a step in a race). */
  tempo: number;
}

export interface MinimaxSettings {
  algorithm: 'minimax' | 'alphabeta';
  /** Maximum iterative-deepening depth (plies). */
  maxDepth: number;
  /** Wall-clock budget per decision in ms; 0 = unlimited. Depth 1 always completes. */
  timeLimitMs: number;
  moveOrdering: boolean;
  /** Only used by alpha-beta. */
  transpositionTable: boolean;
  /**
   * Wall candidates searched at every node: all legal walls, or only legal walls that cut the
   * opponent's current shortest path (the only walls that can lengthen it immediately).
   */
  wallFilter: 'all' | 'opponent-path';
  evaluation: MinimaxEvalWeights;
}

/** How a score relates to the true minimax value (alpha-beta may only prove a bound). */
export type ScoreBound = 'exact' | 'lower' | 'upper';

export interface SearchStats {
  /** Search nodes visited (interior + leaves + terminals). */
  nodes: number;
  /** Depth-0 static evaluations. */
  leaves: number;
  terminals: number;
  /** Extra static evaluations spent on move ordering. */
  orderingEvals: number;
  /** Beta cutoffs (alpha ≥ beta). */
  cutoffs: number;
  /** Sibling moves skipped because of cutoffs. */
  prunedMoves: number;
  ttProbes: number;
  ttHits: number;
  ttCutoffs: number;
  elapsedMs: number;
}

export interface SearchIteration {
  depth: number;
  score: number;
  best: string;
  pv: string[];
  nodes: number;
  cutoffs: number;
  elapsedMs: number;
}

export interface RootCandidate {
  action: Action;
  notation: string;
  /** From the deciding player's perspective. */
  score: number;
  bound: ScoreBound;
  /**
   * Opponent's answer found by the search: the expected reply for exactly scored moves,
   * or the refutation that proved the bound for pruned (upper-bound) moves.
   */
  reply?: Action;
  replyNotation?: string;
  nodes: number;
  rank: number;
}

/** Recorded part of the search tree (root, its children and grandchildren; trimmed). */
export interface SearchTreeNode {
  action?: Action;
  notation: string;
  /** Player who made `action` (for the root: the deciding player). */
  mover: PlayerId;
  /** From the deciding player's perspective. */
  score: number;
  bound: ScoreBound;
  /** Nodes searched in this subtree. */
  nodes: number;
  /** Remaining depth when this node was searched. */
  depth: number;
  terminal: boolean;
  /** A beta cutoff happened at this node (some children were never searched). */
  cutoff: boolean;
  searchedChildren: number;
  totalChildren: number;
  children?: SearchTreeNode[];
  /** Searched children dropped from the recording to keep the trace small. */
  omitted?: { count: number; minScore: number; maxScore: number };
}

export interface EvalBreakdown {
  perspective: PlayerId;
  terminal: 'win' | 'loss' | null;
  selfDistance: number;
  opponentDistance: number;
  selfWalls: number;
  opponentWalls: number;
  toMove: PlayerId;
  terms: { self: number; opponent: number; walls: number; tempo: number };
  score: number;
}

export interface MinimaxTrace extends DecisionTraceBase {
  algorithm: 'minimax';
  settings: MinimaxSettings;
  completedDepth: number;
  timedOut: boolean;
  /** Search stopped early because a forced result was found. */
  decided: boolean;
  score: number;
  pv: Action[];
  pvNotation: string[];
  /** PV was extended from the transposition table / truncated by it. */
  pvComplete: boolean;
  rootCandidates: RootCandidate[];
  /** Number of legal actions vs. actions actually searched at the root (wall filter). */
  legalActionCount: number;
  searchedActionCount: number;
  iterations: SearchIteration[];
  stats: SearchStats;
  tree: SearchTreeNode;
  rootEval: EvalBreakdown;
  /** Static evaluation at the end of the PV, with the BFS paths it used. */
  pvLeaf: EvalBreakdown & { selfPath: Coord[]; opponentPath: Coord[]; matchesScore: boolean };
  rationale: string[];
}

// ---------------------------------------------------------------- MCTS

export type RolloutPolicy = 'uniform' | 'balanced' | 'heuristic';

export interface MctsSettings {
  /**
   * 'pure' = classic UCT with random/heuristic rollouts (stage-4 baseline, kept unchanged);
   * 'guided' = Heuristic-Guided MCTS (evaluation cut-off, PUCT with heuristic priors, value shaping).
   * Informational: the individual switches below define the behaviour.
   */
  variant: 'pure' | 'guided';
  /** Maximum number of simulations (selection → expansion → simulation → backpropagation). */
  iterations: number;
  /** Wall-clock budget in ms; 0 = unlimited. With a time limit the result depends on speed. */
  timeLimitMs: number;
  /** UCT exploration constant C in Q + C·√(ln N_parent / N_child), Q ∈ [−1, 1]. */
  exploration: number;
  rollout: RolloutPolicy;
  /** Rollouts stop after this many plies even without a winner. */
  rolloutMaxPlies: number;
  /**
   * Value of a rollout that hit rolloutMaxPlies: 'distance' = race estimate from path lengths
   * only, 'evaluation' = the Minimax evaluation (path lengths + walls in hand + tempo),
   * 'draw' = 0.
   */
  rolloutCutoff: 'distance' | 'evaluation' | 'draw';
  /** Tree policy: UCT (expand every child before re-visiting) or PUCT with heuristic priors. */
  selection: 'uct' | 'puct';
  /** PUCT constant c in Q + c·P·√N_parent / (1 + N_child). */
  puctConstant: number;
  /** Softmax temperature (in evaluation units ≈ steps) turning 1-ply evaluations into priors. */
  priorTemperature: number;
  /**
   * Value shaping against saturation: heuristic estimates are mapped with a soft sign into
   * (−0.9, 0.9) instead of saturating near ±1, and wins found by a rollout keep a margin
   * term in (0.9, 1). Terminal/proven tree nodes stay exactly ±1, so a real win always
   * outranks any estimate.
   */
  valueShaping: boolean;
  /** Balanced rollout: probability of choosing a pawn move instead of a wall. */
  balancedMoveProbability: number;
  /** Same candidate filter as Minimax: 'opponent-path' keeps only walls cutting the opponent's path. */
  wallFilter: 'all' | 'opponent-path';
  /** Tree size cap; once reached, no new nodes are expanded (memory bound). */
  maxNodes: number;
}

export type ProvenResult = 'win' | 'loss' | null;

export interface MctsCandidate {
  action: Action;
  notation: string;
  visits: number;
  /** Mean value W/N from the deciding player's perspective, in [−1, 1]. */
  q: number;
  /** Final UCT score as seen from the root (null for proven moves). */
  uct: number | null;
  /** visits / total root visits. */
  share: number;
  /** Solved by MCTS-Solver from the deciding player's view. */
  proven: ProvenResult;
  /** Prior probability (PUCT only). */
  prior?: number;
  /** Most visited opponent reply under this move. */
  reply?: { action: Action; notation: string; visits: number; q: number };
  rank: number;
}

export interface MctsSnapshot {
  simulations: number;
  elapsedMs: number;
  /** Top root children by visits at that moment (q from the deciding player's view). */
  top: { notation: string; visits: number; q: number }[];
}

export interface MctsTrace extends DecisionTraceBase {
  algorithm: 'mcts';
  settings: MctsSettings;
  /** Seed of the RNG used for this decision (derived from the game seed and ply). */
  seed: number;
  simulations: number;
  treeNodes: number;
  maxTreeDepth: number;
  stopReason: 'iterations' | 'time' | 'proven-win' | 'proven-loss' | 'single-move';
  rootQ: number;
  rollouts: {
    /** Simulations that ran a rollout (others ended in a terminal/proven tree node). */
    count: number;
    terminal: number;
    truncated: number;
    avgPlies: number;
    treeTerminal: number;
  };
  /** How simulation results are turned into values (recorded for transparency). */
  valueRule: string;
  legalActionCount: number;
  searchedActionCount: number;
  candidates: MctsCandidate[];
  selectionRule: 'most-visits' | 'proven-win';
  /** Most-visited line from the root; q from the perspective of the player making each move. */
  pv: { action: Action; notation: string; visits: number; q: number }[];
  snapshots: MctsSnapshot[];
  rationale: string[];
}

export type DecisionTrace = RandomTrace | BfsTrace | MinimaxTrace | MctsTrace;
