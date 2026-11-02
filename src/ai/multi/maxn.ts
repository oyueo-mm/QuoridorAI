import {
  NUM_WALL_SLOTS,
  formatAction,
  goalPathMulti,
  legalPawnMovesMulti,
  legalWallPlacementsMulti,
  nextPlayer,
  onGoal,
  pathEdgeSet,
  wallConflicts,
  wallCutsEdges,
  wallIndex,
  wallsCuttingPath,
  withWall,
} from '../../engine';
import type { Action, Coord, MultiState } from '../../engine';
import { createRng } from '../rng';
import { allDistances, goalDistance, now, sideSeats } from './common';
import type {
  MultiContext,
  MultiDecision,
  MultiIteration,
  MultiMaxNCandidate,
  MultiMaxNSettings,
  MultiMaxNTrace,
  MultiStopReason,
} from './types';

/*
 * Multi Max-N.
 *
 * Max-N (Luckhardt & Irani) searches a game with n players by giving every position a *vector* of
 * utilities, one per seat. The seat to move picks the child whose vector is best for itself and
 * hands that whole vector up; the search follows the game's real `turnOrder`, never "seat id + 1".
 *
 *  - Individual games: every seat has its own utility, so every seat maximises its own entry.
 *  - Team games (2 vs 2): a team wins when any member arrives, so the utility is defined per team
 *    and both members get the same number. Each ply therefore maximises the *team* utility, i.e.
 *    teammates cooperate perfectly (a team "max" node) and the teams oppose each other. This is
 *    not the same as independent Max-N, where a teammate could choose a child that is better for
 *    itself and worse for its partner.
 *
 * Leaf utility of seat s on side t:  u_s = T_t − (λ·max T_o + (1−λ)·mean T_o) over the other sides o,
 * T_side = −(distance of its closest pawn) + wallValue·(walls in hand). Terminal positions are
 * ±WIN (a win at ply k is WIN − k, so faster wins and later losses are preferred).
 *
 * Search = iterative deepening with a time and a node budget; an unfinished iteration is thrown
 * away and the last completed one decides. Depth 1 (the static evaluation of every candidate) is
 * always completed, so there is always a legal answer.
 *
 * Wall candidates are a HEURISTIC subset of the legal walls: only walls that cut a current
 * shortest path of an opposing seat and actually lengthen some opposing route, ranked by the leaf
 * evaluation and cut to `rootWalls` / `innerWalls`. Below the root only opposing seats within
 * INNER_WINDOW steps of the closest opposing seat are walled against (walls against a far-behind
 * player are rarely worth a tempo and are the bulk of the candidates), and only the INNER_EVAL_FACTOR ×
 * innerWalls anchors that cut the most opposing routes are measured with BFS. Every candidate is
 * verified legal (all seats keep a route). This is not an exhaustive search over walls, so the
 * result is not claimed optimal.
 */

/** Below the root: wall against opposing seats at most this many steps behind the closest one. */
export const INNER_WINDOW = 2;
/** Below the root: evaluate (BFS) at most this many times `innerWalls` anchors, taken in order of how many opposing routes they cut. */
export const INNER_EVAL_FACTOR = 3;

export const WIN = 10_000;

export const MAXN_LIMITS = {
  maxDepth: [1, 10],
  timeMs: [20, 30_000],
  maxNodes: [100, 5_000_000],
  rootWalls: [0, 40],
  innerWalls: [0, 20],
  wallValue: [0, 5],
  leaderShare: [0, 1],
} as const;

export const MAXN_PRESETS: Record<'easy' | 'normal' | 'hard', MultiMaxNSettings> = {
  easy: { maxDepth: 2, timeMs: 400, maxNodes: 20_000, rootWalls: 4, innerWalls: 3, transposition: true, wallValue: 0.35, leaderShare: 0.5 },
  normal: { maxDepth: 4, timeMs: 1200, maxNodes: 150_000, rootWalls: 8, innerWalls: 4, transposition: true, wallValue: 0.35, leaderShare: 0.5 },
  hard: { maxDepth: 8, timeMs: 3000, maxNodes: 600_000, rootWalls: 10, innerWalls: 5, transposition: true, wallValue: 0.35, leaderShare: 0.5 },
};

export function resolveMaxNSettings(partial?: Partial<MultiMaxNSettings>): MultiMaxNSettings {
  const base = { ...MAXN_PRESETS.normal, ...partial };
  const clamp = (key: keyof typeof MAXN_LIMITS, integer: boolean) => {
    const [lo, hi] = MAXN_LIMITS[key];
    const v = Number(base[key]);
    const x = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : MAXN_PRESETS.normal[key];
    return integer ? Math.round(x) : x;
  };
  return {
    maxDepth: clamp('maxDepth', true),
    timeMs: clamp('timeMs', true),
    maxNodes: clamp('maxNodes', true),
    rootWalls: clamp('rootWalls', true),
    innerWalls: clamp('innerWalls', true),
    wallValue: clamp('wallValue', false),
    leaderShare: clamp('leaderShare', false),
    transposition: base.transposition !== false,
  };
}

// ---------------------------------------------------------------- hashing

const Z_SIZE = 2 * NUM_WALL_SLOTS + 4 * 81 + 4 * 21 + 4;
const Z1 = new Int32Array(Z_SIZE);
const Z2 = new Int32Array(Z_SIZE);
{
  const rng = createRng(0x51ed270b);
  for (let i = 0; i < Z_SIZE; i++) {
    Z1[i] = (rng() * 4294967296) | 0;
    Z2[i] = (rng() * 4294967296) | 0;
  }
}
const zWall = (horizontal: boolean, row: number, col: number) => (horizontal ? 0 : NUM_WALL_SLOTS) + wallIndex(row, col);
const zPawn = (seat: number, c: Coord) => 2 * NUM_WALL_SLOTS + seat * 81 + c.row * 9 + c.col;
const zWalls = (seat: number, count: number) => 2 * NUM_WALL_SLOTS + 4 * 81 + seat * 21 + count;
const zTurn = (seat: number) => 2 * NUM_WALL_SLOTS + 4 * 81 + 4 * 21 + seat;

function hashOf(state: MultiState): [number, number] {
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < NUM_WALL_SLOTS; i++) {
    if (state.hWalls[i]) { h1 ^= Z1[i]; h2 ^= Z2[i]; }
    if (state.vWalls[i]) { h1 ^= Z1[NUM_WALL_SLOTS + i]; h2 ^= Z2[NUM_WALL_SLOTS + i]; }
  }
  state.pawns.forEach((p, s) => {
    h1 ^= Z1[zPawn(s, p)]; h2 ^= Z2[zPawn(s, p)];
    const w = zWalls(s, state.wallsRemaining[s]);
    h1 ^= Z1[w]; h2 ^= Z2[w];
  });
  const t = zTurn(state.currentPlayer);
  return [h1 ^ Z1[t], h2 ^ Z2[t]];
}

// ---------------------------------------------------------------- search

class Abort extends Error {
  constructor(readonly reason: MultiStopReason) {
    super(reason);
  }
}

interface Node {
  state: MultiState;
  h1: number;
  h2: number;
  /** Shortest distance of every seat. */
  dists: number[];
  paths?: Coord[][];
  edges?: Set<number>[];
}

interface Child {
  action: Action;
  node: Node;
  vec: Float64Array;
  terminal: boolean;
}

class MaxN {
  nodes = 0;
  ttHits = 0;
  ttStores = 0;
  prunes = 0;
  private readonly sides: number[][];
  private readonly sideOfSeat: number[];
  private readonly tt: Map<number, Float64Array>[] = [];
  private ttSize = 0;
  private readonly t0 = now();
  private lastProgress = 0;
  private pv: Action[][] = [];
  /** Filled by the root loop so budget checks can report progress. */
  progressInfo: { depth: number; completedDepth: number; bestNotation?: string; score?: number } = { depth: 1, completedDepth: 1 };
  private calls = 0;

  constructor(readonly settings: MultiMaxNSettings, private readonly ctx: MultiContext, readonly rootSeat: number, rules: MultiState['rules']) {
    this.sides = sideSeats(rules);
    this.sideOfSeat = rules.players.map((_, s) => (rules.teams ? rules.teams[s] : s));
  }

  elapsed(): number {
    return now() - this.t0;
  }

  /** Throws Abort when a budget is spent or the search was cancelled. */
  private check(): void {
    if (this.ctx.signal?.aborted) throw new Abort('cancelled');
    if (this.nodes > this.settings.maxNodes) throw new Abort('nodes');
    if ((++this.calls & 15) !== 0) return;
    const t = this.elapsed();
    if (t > this.settings.timeMs) throw new Abort('time');
    if (this.ctx.onProgress && t - this.lastProgress > 120) this.report(t);
  }

  report(t = this.elapsed()): void {
    this.lastProgress = t;
    this.ctx.onProgress?.({ ...this.progressInfo, nodes: this.nodes, elapsedMs: t });
  }

  // ----- evaluation

  /** Utility vector by seat of a non-terminal position. */
  utility(state: MultiState, dists: readonly number[]): Float64Array {
    const k = this.sides.length;
    const strength = new Float64Array(k);
    for (let t = 0; t < k; t++) {
      let best = Infinity;
      let walls = 0;
      for (const s of this.sides[t]) {
        if (dists[s] < best) best = dists[s];
        walls += state.wallsRemaining[s];
      }
      strength[t] = -best + this.settings.wallValue * walls;
    }
    const out = new Float64Array(dists.length);
    const lambda = this.settings.leaderShare;
    for (let s = 0; s < out.length; s++) {
      const mine = this.sideOfSeat[s];
      let max = -Infinity;
      let sum = 0;
      for (let t = 0; t < k; t++) {
        if (t === mine) continue;
        sum += strength[t];
        if (strength[t] > max) max = strength[t];
      }
      out[s] = strength[mine] - (lambda * max + (1 - lambda) * (sum / (k - 1)));
    }
    return out;
  }

  /** Vector of a finished game; `depth` plies below the root (faster wins, slower losses are better). */
  terminal(state: MultiState, depth: number): Float64Array {
    const out = new Float64Array(state.pawns.length);
    const winnerSide = this.sideOfSeat[state.winner!];
    for (let s = 0; s < out.length; s++) out[s] = this.sideOfSeat[s] === winnerSide ? WIN - depth : -WIN + depth;
    return out;
  }

  // ----- move generation

  root(state: MultiState): Node {
    const [h1, h2] = hashOf(state);
    return { state, h1, h2, dists: allDistances(state) };
  }

  private ensurePaths(node: Node): void {
    if (node.paths) return;
    const s = node.state;
    node.paths = s.rules.players.map((_, seat) => goalPathMulti(s, seat) ?? []);
    node.edges = node.paths.map((p) => pathEdgeSet(p));
  }

  private pawnChild(node: Node, to: Coord, depth: number): Child {
    const s = node.state;
    const me = s.currentPlayer;
    const pawns = s.pawns.slice();
    const from = pawns[me];
    pawns[me] = { row: to.row, col: to.col };
    const goal = s.rules.players[me].goal;
    const won = onGoal(to, goal);
    const state: MultiState = { ...s, pawns, currentPlayer: won ? me : nextPlayer(s.rules, me), winner: won ? me : null, ply: s.ply + 1 };
    const dists = node.dists.slice();
    dists[me] = won ? 0 : goalDistance(state, to, goal);
    const a = zPawn(me, from);
    const b = zPawn(me, to);
    const t0 = zTurn(me);
    const t1 = zTurn(state.currentPlayer);
    const child: Node = { state, dists, h1: node.h1 ^ Z1[a] ^ Z1[b] ^ Z1[t0] ^ Z1[t1], h2: node.h2 ^ Z2[a] ^ Z2[b] ^ Z2[t0] ^ Z2[t1] };
    this.nodes++;
    return { action: { type: 'move', to: { row: to.row, col: to.col } }, node: child, terminal: won, vec: won ? this.terminal(state, depth + 1) : this.utility(state, dists) };
  }

  /**
   * Wall candidates (see the header: a heuristic subset of the legal walls), best `limit` by the
   * static utility for the seat to move.
   */
  private wallChildren(node: Node, limit: number, depth: number): Child[] {
    const s = node.state;
    const me = s.currentPlayer;
    if (limit <= 0 || s.wallsRemaining[me] <= 0) return [];
    this.ensurePaths(node);
    const mySide = this.sideOfSeat[me];
    const seen = new Set<number>();
    const scored: Child[] = [];
    const nextSeat = nextPlayer(s.rules, me);
    let closest = Infinity;
    for (let q = 0; q < s.pawns.length; q++) if (this.sideOfSeat[q] !== mySide && node.dists[q] < closest) closest = node.dists[q];
    // 1. anchors that cut a shortest path of an opposing seat in the window
    const anchors: { orientation: 'h' | 'v'; row: number; col: number; key: number; cuts: number }[] = [];
    for (let q = 0; q < s.pawns.length; q++) {
      if (this.sideOfSeat[q] === mySide) continue;
      if (depth > 0 && node.dists[q] > closest + INNER_WINDOW) continue;
      for (const w of wallsCuttingPath(node.paths![q])) {
        const key = zWall(w.orientation === 'h', w.row, w.col);
        if (seen.has(key)) continue;
        seen.add(key);
        if (wallConflicts(s, w.orientation, w.row, w.col)) continue;
        let cuts = 0;
        for (let p = 0; p < s.pawns.length; p++) if (this.sideOfSeat[p] !== mySide && wallCutsEdges(node.edges![p], w.orientation, w.row, w.col)) cuts++;
        anchors.push({ ...w, key, cuts });
      }
    }
    // 2. below the root only the anchors that cut the most opposing routes are evaluated (BFS per candidate is the cost)
    if (depth > 0 && anchors.length > limit * INNER_EVAL_FACTOR) {
      anchors.sort((x, y) => y.cuts - x.cuts);
      anchors.length = limit * INNER_EVAL_FACTOR;
    }
    for (const w of anchors) {
      const key = w.key;
      const layout = withWall(s, w.orientation, w.row, w.col);
      const dists = node.dists.slice();
      let legal = true;
      let gain = 0;
      for (let p = 0; p < dists.length && legal; p++) {
        if (!wallCutsEdges(node.edges![p], w.orientation, w.row, w.col)) continue;
        const d = goalDistance(layout, s.pawns[p], s.rules.players[p].goal);
        if (d === Infinity) legal = false;
        else {
          dists[p] = d;
          if (this.sideOfSeat[p] !== mySide) gain += d - node.dists[p];
        }
      }
      if (!legal || gain <= 0) continue;
      const wallsRemaining = s.wallsRemaining.slice();
      wallsRemaining[me] -= 1;
      const state: MultiState = { ...s, hWalls: layout.hWalls, vWalls: layout.vWalls, wallsRemaining, currentPlayer: nextSeat, ply: s.ply + 1 };
      const z = zWalls(me, s.wallsRemaining[me]);
      const z2 = zWalls(me, wallsRemaining[me]);
      const t0 = zTurn(me);
      const t1 = zTurn(nextSeat);
      const child: Node = { state, dists, h1: node.h1 ^ Z1[key] ^ Z1[z] ^ Z1[z2] ^ Z1[t0] ^ Z1[t1], h2: node.h2 ^ Z2[key] ^ Z2[z] ^ Z2[z2] ^ Z2[t0] ^ Z2[t1] };
      scored.push({ action: { type: 'wall', orientation: w.orientation, row: w.row, col: w.col }, node: child, terminal: false, vec: this.utility(state, dists) });
    }
    scored.sort((a, b) => b.vec[me] - a.vec[me]);
    const kept = scored.slice(0, limit);
    this.nodes += kept.length;
    return kept;
  }

  /** Candidate children, best (static utility for the mover) first; pawn moves win ties. */
  expand(node: Node, wallLimit: number, depth: number): Child[] {
    const s = node.state;
    const me = s.currentPlayer;
    const children = legalPawnMovesMulti(s).map((to) => this.pawnChild(node, to, depth));
    children.push(...this.wallChildren(node, wallLimit, depth));
    return children.map((c, i) => ({ c, i })).sort((a, b) => b.c.vec[me] - a.c.vec[me] || a.i - b.i).map((x) => x.c);
  }

  // ----- search

  search(node: Node, remaining: number, depth: number): Float64Array {
    this.check();
    const s = node.state;
    const me = s.currentPlayer;
    this.pv[depth] = [];
    const useTt = this.settings.transposition && remaining >= 2;
    let table: Map<number, Float64Array> | undefined;
    const key = (node.h1 >>> 0) * 2_097_152 + ((node.h2 >>> 11) & 0x1fffff);
    if (useTt) {
      table = this.tt[remaining] ??= new Map();
      const hit = table.get(key);
      if (hit) {
        this.ttHits++;
        return hit;
      }
    }
    const children = this.expand(node, this.settings.innerWalls, depth);
    if (children.length === 0) return this.utility(s, node.dists);
    let best: Float64Array;
    if (remaining === 1) {
      best = children[0].vec;
      this.pv[depth] = [children[0].action];
    } else {
      best = children[0].terminal ? children[0].vec : new Float64Array(0);
      let bestAction = children[0].action;
      let bestPv: Action[] = [];
      let first = true;
      for (const child of children) {
        this.pv[depth + 1] = [];
        const v = child.terminal ? child.vec : this.search(child.node, remaining - 1, depth + 1);
        if (first || v[me] > best[me]) {
          first = false;
          best = v;
          bestAction = child.action;
          bestPv = this.pv[depth + 1];
        }
        // Nothing can beat winning with this very move: the other children cannot change the answer.
        if (best[me] >= WIN - (depth + 1)) {
          this.prunes++;
          break;
        }
      }
      this.pv[depth] = [bestAction, ...bestPv];
    }
    if (table) {
      if (this.ttSize > 400_000) {
        for (const t of this.tt) t?.clear();
        this.ttSize = 0;
      }
      table.set(key, best);
      this.ttSize++;
      this.ttStores++;
    }
    return best;
  }

  /** Principal variation below the root child that was searched last. */
  pvBelowRoot(): Action[] {
    return this.pv[1] ?? [];
  }
}

export function decideMultiMaxN(state: MultiState, settingsIn: Partial<MultiMaxNSettings>, ctx: MultiContext = {}): MultiDecision<MultiMaxNTrace> {
  if (state.winner !== null) throw new Error('Cannot decide in a finished game');
  const settings = resolveMaxNSettings(settingsIn);
  const t0 = now();
  const me = state.currentPlayer;
  const rules = state.rules;
  const search = new MaxN(settings, ctx, me, rules);
  const root = search.root(state);
  const children = search.expand(root, settings.rootWalls, 0);
  if (children.length === 0) throw new Error('No legal action');

  const legalWalls = state.wallsRemaining[me] > 0 ? legalWallPlacementsMulti(state).length : 0;
  const consideredWalls = children.filter((c) => c.action.type === 'wall').length;
  const iterations: MultiIteration[] = [];
  const staticVec = new Map<Child, Float64Array>(children.map((c) => [c, c.vec]));
  let ordered = children;
  let values = new Map<Child, Float64Array>(children.map((c) => [c, c.vec]));
  let pvs = new Map<Child, Action[]>(children.map((c) => [c, [c.action]]));
  let completedDepth = 1;
  let stop: MultiStopReason = 'depth';

  const record = (depth: number, nodesBefore: number, tStart: number) => {
    iterations.push({
      depth,
      nodes: search.nodes - nodesBefore,
      elapsedMs: now() - tStart,
      bestNotation: formatAction(ordered[0].action),
      values: Array.from(values.get(ordered[0])!),
    });
  };
  record(1, 0, t0);

  const winning = children.find((c) => c.terminal && c.node.state.winner === me);
  if (winning) stop = 'forced-win';
  else if (children.length === 1) stop = 'single-move';
  else {
    let lastIterMs = 0;
    for (let depth = 2; depth <= settings.maxDepth; depth++) {
      search.progressInfo = { depth, completedDepth, bestNotation: formatAction(ordered[0].action), score: values.get(ordered[0])![me] };
      if (search.elapsed() + 2 * lastIterMs > settings.timeMs) {
        stop = 'time';
        break;
      }
      const iterStart = now();
      const nodesBefore = search.nodes;
      const nextValues = new Map<Child, Float64Array>();
      const nextPvs = new Map<Child, Action[]>();
      try {
        for (const child of ordered) {
          if (child.terminal) {
            nextValues.set(child, child.vec);
            nextPvs.set(child, [child.action]);
            continue;
          }
          const v = search.search(child.node, depth - 1, 1);
          nextValues.set(child, v);
          nextPvs.set(child, [child.action, ...search.pvBelowRoot()]);
        }
      } catch (err) {
        if (err instanceof Abort) {
          stop = err.reason;
          break;
        }
        throw err;
      }
      values = nextValues;
      pvs = nextPvs;
      ordered = ordered.map((c, i) => ({ c, i })).sort((a, b) => values.get(b.c)![me] - values.get(a.c)![me] || a.i - b.i).map((x) => x.c);
      completedDepth = depth;
      lastIterMs = now() - iterStart;
      record(depth, nodesBefore, iterStart);
      search.progressInfo = { depth, completedDepth, bestNotation: formatAction(ordered[0].action), score: values.get(ordered[0])![me] };
      search.report();
    }
  }

  // Depth 1 never sorted by the iterations: rank by the final values (static order breaks ties).
  if (completedDepth === 1) ordered = ordered.map((c, i) => ({ c, i })).sort((a, b) => values.get(b.c)![me] - values.get(a.c)![me] || a.i - b.i).map((x) => x.c);

  const candidates: MultiMaxNCandidate[] = ordered.map((c, i) => ({
    action: c.action,
    notation: formatAction(c.action),
    values: Array.from(values.get(c)!),
    staticValues: Array.from(staticVec.get(c)!),
    pv: pvs.get(c)!.map(formatAction),
    rank: i + 1,
    distances: [...c.node.dists],
  }));
  const best = ordered[0];
  return {
    action: best.action,
    trace: {
      algorithm: 'multi-maxn',
      player: me,
      ply: state.ply,
      elapsedMs: now() - t0,
      turnOrder: rules.turnOrder,
      ...(rules.teams ? { teams: rules.teams } : {}),
      settings,
      mode: rules.teams ? 'team' : 'individual',
      completedDepth,
      nodes: search.nodes,
      ttHits: search.ttHits,
      ttStores: search.ttStores,
      prunes: search.prunes,
      stopReason: stop,
      legalWalls,
      consideredWalls,
      distances: root.dists,
      wallsRemaining: [...state.wallsRemaining],
      iterations,
      candidates,
      pv: candidates[0].pv,
    },
  };
}
