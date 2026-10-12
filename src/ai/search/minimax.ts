import {
  applyActionUnchecked,
  decodeAction,
  encodeAction,
  formatAction,
  goalRow,
  hashState,
  isLegalAction,
  legalActions,
  opponentOf,
} from '../../engine';
import type { Action, GameState, PlayerId } from '../../engine';
import { now } from '../common';
import type {
  AgentProgress,
  MinimaxSettings,
  RootCandidate,
  ScoreBound,
  SearchIteration,
  SearchStats,
  SearchTreeNode,
} from '../types';
import { isCandidateLegal, pseudoCandidates } from './candidates';
import { DECISIVE_SCORE, WIN_SCORE, isDecisive } from './evaluation';
import type { Evaluator } from './evaluation';

/**
 * Negamax search with optional alpha-beta pruning, iterative deepening, move ordering
 * (static evaluation, TT move, killer moves) and a transposition table.
 *
 * Scores are from the perspective of the side to move at each node and from the deciding
 * player's perspective in the result. A win found `p` plies from the root scores
 * WIN_SCORE − p, so faster wins (and slower losses) are preferred.
 *
 * Exactness guarantees:
 *  - 'minimax' searches every candidate with a full window: every root score is exact.
 *  - 'alphabeta' returns the same root score as 'minimax' for the same depth, evaluator and
 *    candidate generator. Transposition-table values are only reused for the *same*
 *    remaining depth, so the TT never changes the fixed-depth minimax value (entries of other
 *    depths are only used for move ordering).
 *
 * Performance: wall candidates are generated pseudo-legally and their path check (a BFS) is
 * only run when the search is about to explore them, so walls cut off by pruning are free.
 */

export class SearchTimeout extends Error {
  constructor() {
    super('Search time limit reached');
    this.name = 'SearchTimeout';
  }
}

export interface SearchHooks {
  signal?: AbortSignal;
  onProgress?: (progress: AgentProgress) => void;
  /** Injectable clock (tests). */
  clock?: () => number;
  /** Benchmark switches for before/after measurements. */
  disableIncrementalEval?: boolean;
  disableLazyLegality?: boolean;
  /** Minimum remaining depth for static-evaluation ordering (default 3, chosen by benchmark). */
  staticOrderingMinDepth?: number;
}

export interface SearchResult {
  bestAction: Action;
  score: number;
  pv: Action[];
  pvComplete: boolean;
  completedDepth: number;
  timedOut: boolean;
  decided: boolean;
  rootCandidates: RootCandidate[];
  iterations: SearchIteration[];
  stats: SearchStats;
  tree: SearchTreeNode;
  legalActionCount: number;
  searchedActionCount: number;
}

const INF = 1e9;
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;
const TT_MAX_ENTRIES = 1_000_000;
/** The tree is recorded for the root's children (ply 1) and grandchildren (ply 2). */
export const TREE_RECORD_PLIES = 2;
export const TREE_CHILD_LIMIT = 10;
const TIME_CHECK_MASK = 63;
const PROGRESS_INTERVAL_MS = 120;

interface TTEntry {
  check: number;
  depth: number;
  value: number;
  flag: number;
  best: number;
}

interface Child {
  action: Action;
  index: number;
  /** Deferred reachability checks (see pseudoCandidates). */
  check: number;
  key: number;
  /** Built on demand. */
  child: GameState | null;
  /** null = not verified yet. */
  legal: boolean | null;
}

/** Mate scores are stored relative to the node so they stay valid at any ply. */
const toTT = (score: number, ply: number) =>
  score >= DECISIVE_SCORE ? score + ply : score <= -DECISIVE_SCORE ? score - ply : score;
const fromTT = (value: number, ply: number) =>
  value >= DECISIVE_SCORE ? value - ply : value <= -DECISIVE_SCORE ? value + ply : value;

const flipBound = (b: ScoreBound): ScoreBound => (b === 'upper' ? 'lower' : b === 'lower' ? 'upper' : 'exact');

export function emptyStats(): SearchStats {
  return {
    nodes: 0,
    leaves: 0,
    terminals: 0,
    orderingEvals: 0,
    cutoffs: 0,
    prunedMoves: 0,
    ttProbes: 0,
    ttHits: 0,
    ttCutoffs: 0,
    elapsedMs: 0,
  };
}

function abortError(): Error {
  return new DOMException('Search aborted', 'AbortError');
}

export function runSearch(
  root: GameState,
  settings: MinimaxSettings,
  evaluator: Evaluator,
  hooks: SearchHooks = {},
): SearchResult {
  if (root.winner !== null) throw new Error('Cannot search a finished game');
  const clock = hooks.clock ?? now;
  const start = clock();
  const prune = settings.algorithm === 'alphabeta';
  const useTT = prune && settings.transpositionTable;
  // Plain minimax searches every child with a full window, so ordering cannot help it.
  const ordering = prune && settings.moveOrdering;
  const rootSide = root.currentPlayer;
  const stats = emptyStats();
  const tt = new Map<number, TTEntry>();
  const killers: number[][] = [];
  const deadline = settings.timeLimitMs > 0 ? start + settings.timeLimitMs : Infinity;
  const incremental = !hooks.disableIncrementalEval && evaluator.childEvaluator !== undefined;
  const lazy = !hooks.disableLazyLegality;
  const staticOrderingMinDepth = hooks.staticOrderingMinDepth ?? 3;

  let checkTime = false;
  let iterDepth = 0;
  let completedDepth = 0;
  let lastProgress = start;
  let lastBest: string | undefined;
  let lastScore: number | undefined;

  const report = (t: number) => {
    hooks.onProgress?.({
      depth: iterDepth,
      completedDepth,
      nodes: stats.nodes,
      elapsedMs: t - start,
      bestNotation: lastBest,
      score: lastScore,
    });
  };

  const tick = () => {
    if ((stats.nodes & TIME_CHECK_MASK) !== 0) return;
    if (hooks.signal?.aborted) throw abortError();
    const t = clock();
    if (checkTime && t > deadline) throw new SearchTimeout();
    if (hooks.onProgress && t - lastProgress >= PROGRESS_INTERVAL_MS) {
      lastProgress = t;
      report(t);
    }
  };

  /**
   * Static value for `side`. The evaluator is always asked from the deciding player's view
   * (classic minimax: the opponent minimises the root player's utility), then negated for the
   * opponent's nodes. This keeps asymmetric weights meaningful and independent of leaf parity.
   */
  const leafValue = (state: GameState, side: PlayerId) => {
    const e = evaluator.evaluate(state, rootSide);
    return side === rootSide ? e : -e;
  };

  /**
   * Leaf thunks for the children of a depth-1 node: the parent's incremental evaluator is
   * built lazily on the first leaf actually evaluated (a cutoff may make it unnecessary).
   */
  const leafEvaluator = (parent: GameState, childSide: PlayerId) => {
    if (!incremental) return null;
    let ctx: ((child: GameState, action: Action) => number) | null = null;
    const sign = childSide === rootSide ? 1 : -1;
    return (child: GameState, action: Action) => () => {
      ctx ??= evaluator.childEvaluator!(parent, rootSide);
      return sign * ctx(child, action);
    };
  };

  const storeKiller = (ply: number, index: number) => {
    const k = (killers[ply] ??= []);
    if (k[0] === index) return;
    k[1] = k[0];
    k[0] = index;
  };

  /** Builds the child state and completes deferred legality checks; returns legality. */
  const materialize = (state: GameState, it: Child): boolean => {
    it.child ??= applyActionUnchecked(state, it.action);
    if (it.legal === null) it.legal = isCandidateLegal(state, { action: it.action, check: it.check }, it.child);
    return it.legal;
  };

  /** Candidate list ordered best-first for the side to move. Unverified walls stay lazy. */
  const expand = (state: GameState, side: PlayerId, depth: number, ply: number, ttBest: number): Child[] => {
    let items: Child[] = pseudoCandidates(state, settings.wallFilter).map((c) => ({
      action: c.action,
      index: encodeAction(c.action),
      check: c.check,
      key: 0,
      child: null,
      legal: c.check === 0 ? true : null,
    }));
    if (!lazy) items = items.filter((it) => materialize(state, it));
    if (!ordering) return items;

    const goal = goalRow(side);
    if (depth >= staticOrderingMinDepth) {
      // Static evaluation of every child (they will mostly be searched anyway); illegal walls
      // are dropped here. The TT move only breaks ties: measured to beat "TT move first".
      items = items.filter((it) => materialize(state, it));
      const ctx = incremental ? evaluator.childEvaluator!(state, rootSide) : null;
      const sign = side === rootSide ? 1 : -1;
      for (const it of items) {
        if (it.child!.winner === side) it.key = 3 * INF;
        else {
          const e = ctx ? ctx(it.child!, it.action) : evaluator.evaluate(it.child!, rootSide);
          it.key = sign * e + (it.index === ttBest ? 1e-6 : 0);
          stats.orderingEvals++;
        }
      }
    } else {
      // Children are leaves: cheap ordering only (immediate wins, TT move, killer moves).
      const k = killers[ply];
      for (const it of items) {
        if (it.action.type === 'move' && it.action.to.row === goal) it.key = 3 * INF;
        else if (it.index === ttBest) it.key = 2 * INF;
        else if (k && it.index === k[0]) it.key = INF;
        else if (k && it.index === k[1]) it.key = INF - 1;
      }
    }
    return items.sort((a, b) => b.key - a.key);
  };

  const newRecord = (action: Action, mover: PlayerId, depth: number): SearchTreeNode => ({
    action,
    notation: formatAction(action),
    mover,
    score: 0,
    bound: 'exact',
    nodes: 0,
    depth,
    terminal: false,
    cutoff: false,
    searchedChildren: 0,
    totalChildren: 0,
  });

  /** Fills a child record after its search (score/bound converted to the root's view). */
  const finishRecord = (rec: SearchTreeNode, side: PlayerId, v: number, a: number, b: number, nodes: number) => {
    const bound: ScoreBound = v <= a ? 'upper' : v >= b ? 'lower' : 'exact';
    rec.score = side === rootSide ? v : -v;
    rec.bound = side === rootSide ? bound : flipBound(bound);
    rec.nodes = nodes;
  };

  /** Keeps the most relevant recorded children (best for the mover first). */
  const trimChildren = (rec: SearchTreeNode, children: SearchTreeNode[], mover: PlayerId, limit: number) => {
    const sorted = children.slice().sort((x, y) => (mover === rootSide ? y.score - x.score : x.score - y.score));
    rec.children = sorted.slice(0, limit);
    const rest = sorted.slice(limit);
    if (rest.length > 0) {
      const scores = rest.map((r) => r.score);
      rec.omitted = { count: rest.length, minScore: Math.min(...scores), maxScore: Math.max(...scores) };
    }
  };

  function negamax(
    state: GameState,
    side: PlayerId,
    depth: number,
    ply: number,
    alpha: number,
    beta: number,
    pv: Action[],
    rec: SearchTreeNode | null,
    leaf?: () => number,
  ): number {
    stats.nodes++;
    tick();
    pv.length = 0;
    if (state.winner !== null) {
      stats.terminals++;
      if (rec) rec.terminal = true;
      return state.winner === side ? WIN_SCORE - ply : -(WIN_SCORE - ply);
    }
    if (depth === 0) {
      stats.leaves++;
      return leaf ? leaf() : leafValue(state, side);
    }

    const alphaOrig = alpha;
    let ttBest = -1;
    let hash: { key: number; check: number } | null = null;
    if (useTT) {
      hash = hashState(state);
      stats.ttProbes++;
      const e = tt.get(hash.key);
      if (e && e.check === hash.check) {
        stats.ttHits++;
        ttBest = e.best;
        // Recorded nodes are always searched so the tree view stays complete.
        if (e.depth === depth && !rec) {
          const v = fromTT(e.value, ply);
          if (e.flag === TT_EXACT) {
            stats.ttCutoffs++;
            if (e.best >= 0) pv.push(decodeAction(e.best));
            return v;
          }
          if (e.flag === TT_LOWER) alpha = Math.max(alpha, v);
          else beta = Math.min(beta, v);
          if (alpha >= beta) {
            stats.ttCutoffs++;
            return v;
          }
        }
      }
    }

    const items = expand(state, side, depth, ply, ttBest);
    const opp = opponentOf(side);
    const childPv: Action[] = [];
    const recordChildren = rec !== null && ply + 1 <= TREE_RECORD_PLIES;
    const recorded: SearchTreeNode[] = [];
    const leafFor = depth === 1 ? leafEvaluator(state, opp) : null;
    let best = -INF;
    let bestIndex = -1;
    let searched = 0;
    let cutoffAt = -1;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!materialize(state, it)) continue;
      const a = prune ? alpha : -INF;
      const b = prune ? beta : INF;
      const childRec = recordChildren ? newRecord(it.action, side, depth - 1) : null;
      const before = stats.nodes;
      const child = it.child!;
      const v = -negamax(child, opp, depth - 1, ply + 1, -b, -a, childPv, childRec, leafFor?.(child, it.action));
      searched++;
      if (childRec) {
        finishRecord(childRec, side, v, a, b, stats.nodes - before);
        recorded.push(childRec);
      }
      if (v > best) {
        best = v;
        bestIndex = it.index;
        pv.length = 0;
        pv.push(it.action, ...childPv);
      }
      if (prune) {
        if (best > alpha) alpha = best;
        if (alpha >= beta) {
          stats.cutoffs++;
          stats.prunedMoves += items.length - i - 1;
          storeKiller(ply, it.index);
          cutoffAt = i;
          break;
        }
      }
    }

    if (rec) {
      rec.searchedChildren = searched;
      rec.cutoff = cutoffAt >= 0;
      // Recorded nodes are few: verify the skipped walls so the tree shows exact counts.
      let skippedLegal = 0;
      for (let j = cutoffAt + 1; cutoffAt >= 0 && j < items.length; j++) if (materialize(state, items[j])) skippedLegal++;
      rec.totalChildren = searched + skippedLegal;
      if (recordChildren) trimChildren(rec, recorded, side, TREE_CHILD_LIMIT);
    }
    if (useTT && hash) {
      if (tt.size >= TT_MAX_ENTRIES) tt.clear();
      const flag = best <= alphaOrig ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
      // After a fail-low every move was ≤ alpha, so "best" is arbitrary: keep the old TT move.
      const move = flag === TT_UPPER ? ttBest : bestIndex;
      tt.set(hash.key, { check: hash.check, depth, value: toTT(best, ply), flag, best: move });
    }
    return best;
  }

  // ------------------------------------------------------------------ root
  const legalActionCount = legalActions(root).length;
  const opp = opponentOf(rootSide);
  let rootOrder: Child[] | null = null;

  const searchRoot = (depth: number) => {
    iterDepth = depth;
    stats.nodes++;
    // Previous iteration's ranking (PV first) is the best root ordering available.
    const items = (rootOrder ?? expand(root, rootSide, depth, 0, -1)).filter((it) => materialize(root, it));

    const tree: SearchTreeNode = {
      notation: '시작 포지션',
      mover: rootSide,
      score: 0,
      bound: 'exact',
      nodes: 0,
      depth,
      terminal: false,
      cutoff: false,
      searchedChildren: items.length,
      totalChildren: items.length,
    };
    const nodesBefore = stats.nodes;
    const candidates: (RootCandidate & { item: Child })[] = [];
    const recorded: SearchTreeNode[] = [];
    const childPv: Action[] = [];
    const rootLeaf = depth === 1 ? leafEvaluator(root, opp) : null;
    let alpha = -INF;
    let best = -INF;
    let pv: Action[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const child = it.child!;
      const a = prune ? alpha : -INF;
      const childRec = newRecord(it.action, rootSide, depth - 1);
      const before = stats.nodes;
      const v = -negamax(child, opp, depth - 1, 1, -INF, -a, childPv, childRec, rootLeaf?.(child, it.action));
      const bound: ScoreBound = prune && i > 0 && v <= a ? 'upper' : 'exact';
      finishRecord(childRec, rootSide, v, bound === 'upper' ? a : -INF, INF, stats.nodes - before);
      recorded.push(childRec);
      candidates.push({
        item: it,
        action: it.action,
        notation: childRec.notation,
        score: v,
        bound,
        reply: childPv[0],
        replyNotation: childPv[0] ? formatAction(childPv[0]) : undefined,
        nodes: stats.nodes - before,
        rank: 0,
      });
      if (v > best) {
        best = v;
        pv = [it.action, ...childPv];
      }
      if (prune && v > alpha) alpha = v;
    }

    tree.score = best;
    tree.nodes = stats.nodes - nodesBefore + 1;
    trimChildren(tree, recorded, rootSide, TREE_CHILD_LIMIT + 2);
    // Stable sort: exact scores before bounds with the same value, then search order.
    candidates.sort((x, y) => y.score - x.score || Number(x.bound !== 'exact') - Number(y.bound !== 'exact'));
    candidates.forEach((c, i) => (c.rank = i + 1));
    return { score: best, pv, candidates, tree };
  };

  let result: ReturnType<typeof searchRoot> | null = null;
  let timedOut = false;
  let decided = false;
  const iterations: SearchIteration[] = [];
  const maxDepth = Math.max(1, Math.floor(settings.maxDepth));

  for (let depth = 1; depth <= maxDepth; depth++) {
    checkTime = depth > 1;
    const nodes0 = stats.nodes;
    const cutoffs0 = stats.cutoffs;
    const t0 = clock();
    try {
      result = searchRoot(depth);
    } catch (err) {
      if (err instanceof SearchTimeout) {
        timedOut = true;
        break;
      }
      throw err;
    }
    completedDepth = depth;
    if (ordering) rootOrder = result.candidates.map((c) => c.item);
    lastBest = formatAction(result.pv[0]);
    lastScore = result.score;
    iterations.push({
      depth,
      score: result.score,
      best: lastBest,
      pv: result.pv.map(formatAction),
      nodes: stats.nodes - nodes0,
      cutoffs: stats.cutoffs - cutoffs0,
      elapsedMs: clock() - t0,
    });
    report(clock());
    if (isDecisive(result.score)) {
      decided = true;
      break;
    }
    if (result.candidates.length === 1) break;
  }

  if (!result) throw new Error('Search produced no result');

  // Extend a PV truncated by TT cutoffs using stored best moves (validated for legality).
  const pv = result.pv.slice();
  let s = root;
  for (const a of pv) s = applyActionUnchecked(s, a);
  while (useTT && pv.length < completedDepth && s.winner === null) {
    const h = hashState(s);
    const e = tt.get(h.key);
    if (!e || e.check !== h.check || e.best < 0) break;
    const next = decodeAction(e.best);
    if (!isLegalAction(s, next)) break;
    pv.push(next);
    s = applyActionUnchecked(s, next);
  }

  stats.elapsedMs = clock() - start;
  return {
    bestAction: result.pv[0],
    score: result.score,
    pv,
    pvComplete: pv.length >= completedDepth || s.winner !== null,
    completedDepth,
    timedOut,
    decided,
    rootCandidates: result.candidates.map(({ item: _item, ...c }) => c),
    iterations,
    stats,
    tree: result.tree,
    legalActionCount,
    searchedActionCount: result.candidates.length,
  };
}
