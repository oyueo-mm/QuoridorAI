import type { Rng } from '../rng';

/**
 * Game-agnostic Monte Carlo Tree Search (UCT) with an MCTS-Solver extension.
 *
 * Conventions
 *  - Two players, 0 and 1. A node stores the player who made the move into it (`mover`).
 *  - Values passed around are from player 0's perspective, in [−1, 1].
 *  - A node accumulates W from its mover's perspective, so Q = W/N is "how good this move
 *    was for the player who chose it" and a parent simply picks the child with the best Q.
 *
 * Extension points (for AlphaZero-style PUCT later)
 *  - `SelectionRule` scores a child from (child stats, parent visits); PUCT can use `prior`.
 *  - `LeafEvaluator` turns a leaf into a value: random rollouts today, a value network later.
 *  - `MctsGame.actions` returns actions in expansion order; a policy network would supply
 *    priors through `priors` instead.
 */

export type Player = 0 | 1;

export interface MctsGame<S, A> {
  toMove(state: S): Player;
  winner(state: S): Player | null;
  /** Legal actions, most promising first (expansion order). */
  actions(state: S): A[];
  apply(state: S, action: A): S;
  /** Optional prior probabilities aligned with `actions` (unused by UCT). */
  priors?(state: S, actions: A[]): number[];
}

export interface LeafResult {
  /** From player 0's perspective, in [−1, 1]. */
  value: number;
  plies: number;
  /** The simulation stopped at its length limit instead of a real game end. */
  truncated: boolean;
}

export type LeafEvaluator<S> = (state: S, rng: Rng) => LeafResult;

export interface MctsNode<S, A> {
  action: A | null;
  mover: Player;
  state: S;
  parent: MctsNode<S, A> | null;
  children: MctsNode<S, A>[];
  /** Actions not expanded yet (a stack: the next action to expand is last). null = not generated. */
  untried: A[] | null;
  /** Priors aligned with `untried` when the game supplies them. */
  untriedPriors: number[] | null;
  N: number;
  /** Sum of values from the mover's perspective. */
  W: number;
  /** MCTS-Solver result from the mover's perspective. */
  proven: 'win' | 'loss' | null;
  prior: number;
  depth: number;
}

export interface SelectionRule {
  readonly id: string;
  score(child: MctsNode<unknown, unknown>, parentVisits: number): number;
  /**
   * Optional: score of a not-yet-expanded action with prior `prior` under `parent`.
   * When present, expansion is lazy: a new child is created only when the best untried
   * action outscores every expanded child (PUCT-style). Without it, every action is
   * expanded once before any child is revisited (classic UCT).
   */
  unvisitedScore?(prior: number, parent: MctsNode<unknown, unknown>): number;
}

/** UCB1 applied to trees: Q + C·√(ln N_parent / N_child). */
export function uct(exploration: number): SelectionRule {
  return {
    id: 'uct',
    score: (child, parentVisits) => child.W / child.N + exploration * Math.sqrt(Math.log(parentVisits) / child.N),
  };
}

/** Mean value at `node` from the perspective of the player to move there (the chooser). */
export function chooserValue(node: MctsNode<unknown, unknown>): number {
  return node.N > 0 ? -node.W / node.N : 0;
}

/**
 * AlphaZero's PUCT: Q + c·P·√N_parent / (1 + N_child). Unvisited actions use a first-play
 * urgency of the parent's value minus `fpuReduction`.
 */
export function puct(c: number, fpuReduction = 0.1): SelectionRule {
  return {
    id: 'puct',
    score: (child, parentVisits) => child.W / child.N + (c * child.prior * Math.sqrt(parentVisits)) / (1 + child.N),
    unvisitedScore: (prior, parent) => chooserValue(parent) - fpuReduction + c * prior * Math.sqrt(Math.max(1, parent.N)),
  };
}

export interface MctsConfig {
  maxIterations: number;
  /** 0 = unlimited. */
  timeLimitMs: number;
  maxNodes: number;
  selection: SelectionRule;
  /** Root children kept per snapshot. */
  snapshotTopK: number;
  /** Snapshot budget; when exceeded every other snapshot is dropped and the interval doubles. */
  maxSnapshots: number;
}

export interface MctsProgress {
  iterations: number;
  elapsedMs: number;
  nodes: number;
  maxDepth: number;
  /** Most visited root child so far. */
  best: MctsNode<unknown, unknown> | null;
}

export interface MctsHooks {
  signal?: AbortSignal;
  clock?: () => number;
  onProgress?: (progress: MctsProgress) => void;
  progressIntervalMs?: number;
}

export interface RawSnapshot {
  iterations: number;
  elapsedMs: number;
  /** Index into root.children, visits and Q (root child's mover perspective). */
  top: { child: number; visits: number; q: number }[];
}

export interface MctsResult<S, A> {
  root: MctsNode<S, A>;
  iterations: number;
  elapsedMs: number;
  nodes: number;
  maxDepth: number;
  stopReason: 'iterations' | 'time' | 'proven-win' | 'proven-loss' | 'single-move';
  rollouts: { count: number; terminal: number; truncated: number; totalPlies: number; treeTerminal: number };
  snapshots: RawSnapshot[];
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createNode<S, A>(state: S, action: A | null, mover: Player, parent: MctsNode<S, A> | null): MctsNode<S, A> {
  return {
    action,
    mover,
    state,
    parent,
    children: [],
    untried: null,
    untriedPriors: null,
    N: 0,
    W: 0,
    proven: null,
    prior: 1,
    depth: parent ? parent.depth + 1 : 0,
  };
}

/**
 * Child to descend into: a proven win for the chooser is taken immediately; proven losses
 * are avoided unless every child is lost; otherwise the selection rule decides (first
 * maximum wins ties, so the search is deterministic for a given RNG).
 */
export function selectChild<S, A>(node: MctsNode<S, A>, rule: SelectionRule): MctsNode<S, A> {
  for (const c of node.children) if (c.proven === 'win') return c;
  const open = node.children.filter((c) => c.proven !== 'loss');
  const pool = open.length > 0 ? open : node.children;
  let best = pool[0];
  let bestScore = -Infinity;
  for (const c of pool) {
    const s = rule.score(c as MctsNode<unknown, unknown>, node.N);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/** MCTS-Solver propagation for `node` after one of its children changed. */
export function updateProof<S, A>(node: MctsNode<S, A>): void {
  if (node.proven !== null) return;
  // The player to move here (= children's mover) can win: the mover into `node` lost.
  if (node.children.some((c) => c.proven === 'win')) {
    node.proven = 'loss';
    return;
  }
  // Every possible reply loses for the player to move: the mover into `node` won.
  const fullyExpanded = node.untried !== null && node.untried.length === 0 && node.children.length > 0;
  if (fullyExpanded && node.children.every((c) => c.proven === 'loss')) node.proven = 'win';
}

/** Adds one simulation result (player-0 value) to every node from `leaf` up to the root. */
export function backpropagate<S, A>(leaf: MctsNode<S, A>, value: number): void {
  for (let n: MctsNode<S, A> | null = leaf; n; n = n.parent) {
    n.N += 1;
    n.W += n.mover === 0 ? value : -value;
    if (n.parent) updateProof(n.parent);
  }
}

function abortError(): Error {
  return new DOMException('Search aborted', 'AbortError');
}

export function runMcts<S, A>(
  game: MctsGame<S, A>,
  rootState: S,
  evaluate: LeafEvaluator<S>,
  rng: Rng,
  config: MctsConfig,
  hooks: MctsHooks = {},
): MctsResult<S, A> {
  if (game.winner(rootState) !== null) throw new Error('Cannot search a finished game');
  const clock = hooks.clock ?? now;
  const start = clock();
  const deadline = config.timeLimitMs > 0 ? start + config.timeLimitMs : Infinity;
  const progressInterval = hooks.progressIntervalMs ?? 100;
  const rootPlayer = game.toMove(rootState);
  const root = createNode<S, A>(rootState, null, rootPlayer === 0 ? 1 : 0, null);
  const rollouts = { count: 0, terminal: 0, truncated: 0, totalPlies: 0, treeTerminal: 0 };
  const snapshots: RawSnapshot[] = [];
  let snapshotEvery = 1;
  let nodes = 1;
  let maxDepth = 0;
  let iterations = 0;
  let lastProgress = start;
  let stopReason: MctsResult<S, A>['stopReason'] = 'iterations';

  const expandActions = (node: MctsNode<S, A>) => {
    const actions = game.actions(node.state);
    const priors = game.priors?.(node.state, actions);
    // Stack order: reverse so that pop() returns the most promising action first.
    node.untried = actions.slice().reverse();
    node.untriedPriors = priors ? priors.slice().reverse() : null;
  };

  const takeSnapshot = (elapsed: number) => {
    const top = root.children
      .map((c, i) => ({ child: i, visits: c.N, q: c.N > 0 ? c.W / c.N : 0 }))
      .sort((a, b) => b.visits - a.visits || b.q - a.q)
      .slice(0, config.snapshotTopK);
    snapshots.push({ iterations, elapsedMs: elapsed, top });
    if (snapshots.length > config.maxSnapshots) {
      // Keep memory bounded: drop every other snapshot (never the first) and sample less often.
      const kept = snapshots.filter((_, i) => i % 2 === 0);
      snapshots.length = 0;
      snapshots.push(...kept);
      snapshotEvery *= 2;
    }
  };

  /** UCT: always expand first. PUCT: only if the best untried action beats every child. */
  const shouldExpand = (node: MctsNode<S, A>): boolean => {
    const rule = config.selection;
    if (!rule.unvisitedScore || node.children.length === 0) return true;
    const best = selectChild(node, rule);
    if (best.proven === 'win') return false;
    const remaining = node.untried!.length;
    const prior = node.untriedPriors?.at(-1) ?? 1 / (remaining + node.children.length);
    return (
      rule.unvisitedScore(prior, node as MctsNode<unknown, unknown>) >
      rule.score(best as MctsNode<unknown, unknown>, node.N)
    );
  };

  expandActions(root);
  if (root.untried!.length === 0) throw new Error('No legal actions');
  const singleMove = root.untried!.length === 1;

  for (;;) {
    if (iterations >= config.maxIterations) {
      stopReason = 'iterations';
      break;
    }
    if (hooks.signal?.aborted) throw abortError();
    const t = clock();
    if (iterations > 0 && t > deadline) {
      stopReason = 'time';
      break;
    }
    if (hooks.onProgress && t - lastProgress >= progressInterval) {
      lastProgress = t;
      const best = root.children.reduce<MctsNode<S, A> | null>((b, c) => (!b || c.N > b.N ? c : b), null);
      hooks.onProgress({ iterations, elapsedMs: t - start, nodes, maxDepth, best: best as MctsNode<unknown, unknown> | null });
    }

    // 1. Selection (+ 2. Expansion of one child)
    let node = root;
    while (true) {
      if (node !== root && node.proven !== null) break;
      if (game.winner(node.state) !== null) break;
      if (node.untried === null) expandActions(node);
      if (node.untried!.length > 0 && nodes < config.maxNodes && shouldExpand(node)) {
        const action = node.untried!.pop()!;
        const child = createNode(game.apply(node.state, action), action, game.toMove(node.state), node);
        if (node.untriedPriors) child.prior = node.untriedPriors.pop() ?? 1;
        node.children.push(child);
        nodes++;
        node = child;
        break;
      }
      if (node.children.length === 0) break;
      node = selectChild(node, config.selection);
    }
    if (node.depth > maxDepth) maxDepth = node.depth;

    // 3. Simulation (or exact value for terminal / solved nodes)
    let value: number;
    const winner = game.winner(node.state);
    if (winner !== null) {
      // In Quoridor the player who just moved is always the winner; stay general anyway.
      node.proven = winner === node.mover ? 'win' : 'loss';
      value = winner === 0 ? 1 : -1;
      rollouts.treeTerminal++;
    } else if (node.proven !== null) {
      const moverWins = node.proven === 'win';
      value = (node.mover === 0) === moverWins ? 1 : -1;
      rollouts.treeTerminal++;
    } else {
      const r = evaluate(node.state, rng);
      value = r.value;
      rollouts.count++;
      rollouts.totalPlies += r.plies;
      if (r.truncated) rollouts.truncated++;
      else rollouts.terminal++;
    }

    // 4. Backpropagation (with solver updates)
    backpropagate(node, value);
    iterations++;

    if (iterations % snapshotEvery === 0) takeSnapshot(clock() - start);
    if (root.children.some((c) => c.proven === 'win')) {
      stopReason = 'proven-win';
      break;
    }
    if (root.proven !== null) {
      stopReason = root.proven === 'loss' ? 'proven-win' : 'proven-loss';
      break;
    }
    if (singleMove) {
      stopReason = 'single-move';
      break;
    }
  }

  const elapsedMs = clock() - start;
  if (snapshots.at(-1)?.iterations !== iterations) takeSnapshot(elapsedMs);
  return { root, iterations, elapsedMs, nodes, maxDepth, stopReason, rollouts, snapshots };
}
