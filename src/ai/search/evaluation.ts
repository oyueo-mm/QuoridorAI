import {
  NUM_CELLS,
  cellIndex,
  distanceMap,
  distanceMapShared,
  prepareExtraWallDistances,
  preparedDistanceWithExtraWall,
  prepareLayers,
  layeredDistanceWithExtraWall,
  pathCells,
  rowMasks,
  shortestPathCells,
  isWallAnchorInBounds,
  wallConflicts,
  wallsCuttingPath,
  distanceToRow,
  goalRow,
  opponentOf,
  pathEdgeSet,
  shortestPath,
  wallCutsEdges,
} from '../../engine';
import type { Action, Coord, GameState, PlayerId } from '../../engine';
import type { EvalBreakdown, MinimaxEvalWeights } from '../types';

/** Score of a won position at the root; a win found `ply` plies deep scores WIN_SCORE − ply. */
export const WIN_SCORE = 10_000;
/** Scores beyond this magnitude mean a forced win/loss was found. */
export const DECISIVE_SCORE = WIN_SCORE - 1_000;

/**
 * Race weights v1: the Alpha-Beta default up to stage 3-A, tuned against the BFS agent (bench/:
 * wall value 0.4 lost 3–9, 1.0 won 11–1 at depth 3–4). Still the heuristic inside Guided MCTS
 * (whose strength was never measured with other weights) and the baseline of earlier benchmarks.
 */
export const RACE_EVAL_V1: MinimaxEvalWeights = {
  selfDistance: 1,
  opponentDistance: 1,
  wallDifference: 1,
  tempo: 0.5,
};

/**
 * Candidate E5 (stage 3-B): the linear terms with weights fitted to recorded game outcomes, split
 * by opening (docs/stage3b-eval-report.md). Beat RACE_EVAL_V1 in two independent SPRTs on new
 * openings: depth 4 +44 Elo (+11 … +78), 300 ms +55 Elo (+16 … +96). Kept separately so the
 * stage-3B experiment definitions keep their exact weights.
 */
export const FITTED_EVAL_E5: MinimaxEvalWeights = {
  selfDistance: 1.001,
  opponentDistance: 1,
  wallDifference: 1.503,
  tempo: 0.482,
};

/**
 * Alpha-Beta default since stage 3-B (candidate E6): E5 plus the path-vulnerability threat term
 * (E4). Beat E5 in two independent 300 ms SPRTs on new openings: +86 Elo (+36 … +140, battery)
 * and +89 Elo (+37 … +145, AC power). Costs ~2.2× per node (vulnerability BFS), already paid for
 * in those equal-time results.
 */
export const ALPHA_BETA_EVAL: MinimaxEvalWeights = { ...FITTED_EVAL_E5, vulnerabilityThreat: 0.5 };

/**
 * Static evaluation used at search leaves. Implementations must be deterministic functions
 * of the state (the transposition table and the Minimax/Alpha-Beta equivalence rely on it).
 * Add new evaluators by implementing this interface.
 */
export interface Evaluator {
  readonly id: string;
  /** Non-terminal score from `perspective`'s point of view (higher is better). */
  evaluate(state: GameState, perspective: PlayerId): number;
  /** Same score, itemised for the analysis panel. */
  explain(state: GameState, perspective: PlayerId): EvalBreakdown;
  /**
   * Optional fast path for evaluating many children of one parent. The returned function
   * must give exactly evaluate(child, perspective) for a non-terminal `child` reached from
   * `parent` by `action`; it may reuse work computed once for the parent.
   */
  childEvaluator?(parent: GameState, perspective: PlayerId): (child: GameState, action: Action) => number;
}

/**
 * Distance race evaluator built on the BFS shortest paths (same quantities as the BFS agent):
 *   w_opp·d_opp − w_self·d_self + w_wall·(walls_self − walls_opp) ± tempo
 */
export function createDistanceEvaluator(weights: MinimaxEvalWeights, probe?: VulnerabilityProbe): Evaluator {
  const explain = (state: GameState, perspective: PlayerId): EvalBreakdown => {
    const opp = opponentOf(perspective);
    const base = {
      perspective,
      selfWalls: state.wallsRemaining[perspective],
      opponentWalls: state.wallsRemaining[opp],
      toMove: state.currentPlayer,
    };
    if (state.winner !== null) {
      const win = state.winner === perspective;
      return {
        ...base,
        terminal: win ? 'win' : 'loss',
        selfDistance: win ? 0 : distanceToRow(state, state.pawns[perspective], goalRow(perspective)),
        opponentDistance: win ? distanceToRow(state, state.pawns[opp], goalRow(opp)) : 0,
        terms: { self: 0, opponent: 0, walls: 0, tempo: 0 },
        score: win ? WIN_SCORE : -WIN_SCORE,
      };
    }
    const selfDistance = distanceToRow(state, state.pawns[perspective], goalRow(perspective));
    const opponentDistance = distanceToRow(state, state.pawns[opp], goalRow(opp));
    const terms = termsOf(state, perspective, selfDistance, opponentDistance);
    return {
      ...base,
      terminal: null,
      selfDistance,
      opponentDistance,
      terms,
      score: terms.self + terms.opponent + terms.walls + terms.tempo + (terms.extra ?? 0),
    };
  };

  const extended =
    weights.wallDecay !== undefined ||
    weights.distanceCurve !== undefined ||
    weights.vulnerability !== undefined ||
    weights.vulnerabilityThreat !== undefined;
  const vulnerabilityOf = createVulnerabilityCache(probe);
  const curve = (d: number) => (weights.distanceCurve === undefined ? d : weights.distanceCurve * Math.log1p(d / weights.distanceCurve));
  const wallValue = (walls: number, phase: number) => {
    if (weights.wallDecay === undefined) return weights.wallDifference * walls;
    const r = weights.wallDecay;
    const h = r === 1 ? walls : (1 - Math.pow(r, walls)) / (1 - r);
    return weights.wallDifference * h * phase;
  };

  /** Score parts (all from `perspective`'s point of view). */
  function termsOf(state: GameState, perspective: PlayerId, dSelf: number, dOpp: number) {
    const opp = opponentOf(perspective);
    const wSelf = state.wallsRemaining[perspective];
    const wOpp = state.wallsRemaining[opp];
    const phase = weights.wallPhaseSum === undefined ? 1 : Math.min(1, (dSelf + dOpp) / weights.wallPhaseSum);
    let extra = 0;
    if (weights.vulnerability !== undefined || weights.vulnerabilityThreat !== undefined) {
      const wV = weights.vulnerability ?? 0;
      const wT = weights.vulnerabilityThreat ?? 0;
      // A side's vulnerability only matters when some weight multiplies it (E4 ignores it while
      // the other side has no walls left); skipping the computation leaves the score unchanged.
      const vSelf = wV !== 0 || (wT !== 0 && wOpp > 0) ? vulnerabilityOf(state, perspective) : 0;
      const vOpp = wV !== 0 || (wT !== 0 && wSelf > 0) ? vulnerabilityOf(state, opp) : 0;
      extra += wV * (vOpp - vSelf);
      extra += wT * ((vOpp * Math.min(wSelf, 3)) / 3 - (vSelf * Math.min(wOpp, 3)) / 3);
    }
    return {
      self: -weights.selfDistance * curve(dSelf),
      opponent: weights.opponentDistance * curve(dOpp),
      walls: wallValue(wSelf, phase) - wallValue(wOpp, phase),
      tempo: state.currentPlayer === perspective ? weights.tempo : -weights.tempo,
      ...(extended ? { extra } : {}),
    };
  }

  const score = extended
    ? (state: GameState, perspective: PlayerId, dSelf: number, dOpp: number) => {
        const t = termsOf(state, perspective, dSelf, dOpp);
        return t.self + t.opponent + t.walls + t.tempo + (t.extra ?? 0);
      }
    : (state: GameState, perspective: PlayerId, dSelf: number, dOpp: number) =>
        weights.opponentDistance * dOpp -
        weights.selfDistance * dSelf +
        weights.wallDifference * (state.wallsRemaining[perspective] - state.wallsRemaining[opponentOf(perspective)]) +
        (state.currentPlayer === perspective ? weights.tempo : -weights.tempo);

  return {
    id: 'distance',
    evaluate(state, perspective) {
      const opp = opponentOf(perspective);
      const dSelf = distanceToRow(state, state.pawns[perspective], goalRow(perspective));
      const dOpp = distanceToRow(state, state.pawns[opp], goalRow(opp));
      return score(state, perspective, dSelf, dOpp);
    },
    explain,
    childEvaluator(parent, perspective) {
      // Pawns never block BFS distances, so after a pawn move only the mover's distance changes
      // (read from the parent's distance map), and after a wall only a player whose current
      // shortest path the wall cuts can change (otherwise that path still exists).
      const players = [perspective, opponentOf(perspective)] as const;
      const mapOf = vulnerabilityKernel === 'fast' ? distanceMapShared : distanceMap;
      const maps = players.map((q) => mapOf(parent, goalRow(q)));
      const base = players.map((q, i) => maps[i][cellIndex(parent.pawns[q].row, parent.pawns[q].col)]);
      let edges: Set<number>[] | null = null;
      return (child, action) => {
        let dSelf = base[0];
        let dOpp = base[1];
        if (action.type === 'move') {
          const i = parent.currentPlayer === perspective ? 0 : 1;
          const d = maps[i][cellIndex(action.to.row, action.to.col)];
          if (i === 0) dSelf = d;
          else dOpp = d;
        } else {
          edges ??= players.map((q) => pathEdgeSet(shortestPath(parent, parent.pawns[q], goalRow(q)) ?? []));
          if (wallCutsEdges(edges[0], action.orientation, action.row, action.col)) {
            dSelf = distanceToRow(child, child.pawns[players[0]], goalRow(players[0]));
          }
          if (wallCutsEdges(edges[1], action.orientation, action.row, action.col)) {
            dOpp = distanceToRow(child, child.pawns[players[1]], goalRow(players[1]));
          }
        }
        return score(child, perspective, dSelf, dOpp);
      };
    },
  };
}

/**
 * Path vulnerability of `player`: the largest increase of its shortest-path length that a single
 * wall cutting its current shortest path can cause (pawns ignored, walls that would disconnect it
 * are illegal and skipped; legality for the other player is not checked — a heuristic).
 */
export function vulnerabilityReference(state: GameState, player: PlayerId): number {
  const goal = goalRow(player);
  const path = shortestPath(state, state.pawns[player], goal);
  if (!path) return 0;
  const d = path.length - 1;
  let worst = 0;
  prepareExtraWallDistances(state, state.pawns[player], goal);
  for (const w of wallsCuttingPath(path)) {
    if (!isWallAnchorInBounds(w.row, w.col) || wallConflicts(state, w.orientation, w.row, w.col)) continue;
    const d2 = preparedDistanceWithExtraWall(w.orientation, w.row, w.col);
    if (Number.isFinite(d2) && d2 - d > worst) worst = d2 - d;
  }
  return worst;
}


/**
 * Stage 3-D implementation of vulnerability(): the same value, computed without the intermediate
 * path / candidate-wall objects and with the faster layered extra-wall queries (rowMasks.ts).
 * Candidate walls are exactly those of wallsCuttingPath(path), visited in the same order.
 */
// Scratch for vulnerabilityFast (single-threaded; not re-entered).
const crossV = new Int32Array(9);
const crossH = new Int32Array(9);
const deferred = new Int32Array(256);

/**
 * True when the shortest path crosses the wall (orientation o, anchor row/col) at exactly one of
 * its two cut edges and a three-edge detour beside that edge is open: a walk of length d + 2 then
 * exists in the layout with the wall, so the wall lengthens the path by at most 2.
 * crossV[r] marks the columns of path steps between rows r and r + 1, crossH[r] the columns c of
 * steps between (r, c) and (r, c + 1).
 */
function cheapDetour(m: ReturnType<typeof rowMasks>, vertical: boolean, row: number, col: number): boolean {
  if (vertical) {
    // h wall: cuts the vertical edges at columns col and col + 1 between rows row and row + 1.
    const usedL = (crossV[row] >> col) & 1;
    const usedR = (crossV[row] >> (col + 1)) & 1;
    if (usedL === usedR) return false;
    if (usedL === 1) {
      if (col < 1) return false;
      const b = 1 << (col - 1);
      return (m.east[row] & b) !== 0 && (m.south[row] & b) !== 0 && (m.east[row + 1] & b) !== 0;
    }
    if (col > 6) return false;
    const e = 1 << (col + 1);
    return (m.east[row] & e) !== 0 && (m.south[row] & (1 << (col + 2))) !== 0 && (m.east[row + 1] & e) !== 0;
  }
  // v wall: cuts the horizontal edges (row, col)–(row, col + 1) and (row + 1, col)–(row + 1, col + 1).
  const usedT = (crossH[row] >> col) & 1;
  const usedB = (crossH[row + 1] >> col) & 1;
  if (usedT === usedB) return false;
  const c = 1 << col;
  const c1 = 1 << (col + 1);
  if (usedT === 1) {
    if (row < 1) return false;
    return (m.south[row - 1] & c) !== 0 && (m.east[row - 1] & c) !== 0 && (m.south[row - 1] & c1) !== 0;
  }
  if (row > 6) return false;
  return (m.south[row + 1] & c) !== 0 && (m.east[row + 2] & c) !== 0 && (m.south[row + 1] & c1) !== 0;
}

export function vulnerabilityFast(state: GameState, player: PlayerId): number {
  const goal = goalRow(player);
  const start = state.pawns[player];
  const len = shortestPathCells(state, start, goal);
  if (len < 0) return 0;
  const d = len - 1;
  let worst = 0;
  prepareLayers(state, start, goal);
  const masks = rowMasks(state);
  crossV.fill(0);
  crossH.fill(0);
  for (let i = 1; i < len; i++) {
    const a = pathCells[i - 1];
    const b = pathCells[i];
    const aRow = (a / 9) | 0;
    const aCol = a - aRow * 9;
    const bRow = (b / 9) | 0;
    const bCol = b - bRow * 9;
    if (aCol === bCol) crossV[Math.min(aRow, bRow)] |= 1 << aCol;
    else crossH[aRow] |= 1 << Math.min(aCol, bCol);
  }
  let seenH0 = 0;
  let seenH1 = 0;
  let seenV0 = 0;
  let seenV1 = 0;
  // Candidates with a cheap detour (increase ≤ 2) are queried only if nothing else reached 2:
  // packed as slot·2 + (v wall ? 1 : 0).
  let nDeferred = 0;
  for (let i = 1; i < len; i++) {
    const a = pathCells[i - 1];
    const b = pathCells[i];
    const aRow = (a / 9) | 0;
    const aCol = a - aRow * 9;
    const bRow = (b / 9) | 0;
    const bCol = b - bRow * 9;
    const vertical = aCol === bCol;
    for (let k = 0; k < 2; k++) {
      // Vertical step (rows r, r+1 in one column): h walls anchored at (r, col) and (r, col − 1).
      // Horizontal step (columns c, c+1 in one row): v walls anchored at (row, c) and (row − 1, c).
      const row = vertical ? Math.min(aRow, bRow) : aRow - k;
      const col = vertical ? aCol - k : Math.min(aCol, bCol);
      if (row < 0 || row > 7 || col < 0 || col > 7) continue;
      const slot = row * 8 + col;
      const bit = 1 << (slot & 31);
      let again: boolean;
      if (vertical) {
        again = (slot < 32 ? seenH0 & bit : seenH1 & bit) !== 0;
        if (slot < 32) seenH0 |= bit;
        else seenH1 |= bit;
      } else {
        again = (slot < 32 ? seenV0 & bit : seenV1 & bit) !== 0;
        if (slot < 32) seenV0 |= bit;
        else seenV1 |= bit;
      }
      if (again) continue;
      const o = vertical ? 'h' : 'v';
      if (wallConflicts(state, o, row, col)) continue;
      if (cheapDetour(masks, vertical, row, col)) {
        deferred[nDeferred++] = slot * 2 + (vertical ? 0 : 1);
        continue;
      }
      const d2 = layeredDistanceWithExtraWall(o, row, col);
      if (d2 - d > worst && d2 !== Infinity) worst = d2 - d;
    }
  }
  for (let i = 0; i < nDeferred && worst < 2; i++) {
    const code = deferred[i];
    const slot = code >> 1;
    const d2 = layeredDistanceWithExtraWall((code & 1) === 0 ? 'h' : 'v', slot >> 3, slot & 7);
    if (d2 - d > worst && d2 !== Infinity) worst = d2 - d;
  }
  return worst;
}

export type VulnerabilityKernel = 'reference' | 'fast';
/** Adopted after the single disjoint Stage 3-D confirmation; reference stays available. */
export const DEFAULT_VULNERABILITY_KERNEL: VulnerabilityKernel = 'fast';
let vulnerabilityKernel: VulnerabilityKernel = DEFAULT_VULNERABILITY_KERNEL;

export function setVulnerabilityKernel(k: VulnerabilityKernel): void {
  vulnerabilityKernel = k;
}

/** Runs `fn` with `k` as the vulnerability implementation (synchronous code only) and restores the previous one. */
export function withVulnerabilityKernel<T>(k: VulnerabilityKernel, fn: () => T): T {
  const prev = vulnerabilityKernel;
  vulnerabilityKernel = k;
  try {
    return fn();
  } finally {
    vulnerabilityKernel = prev;
  }
}

/** Path vulnerability of `player` with the active implementation (identical values). */
export function vulnerability(state: GameState, player: PlayerId): number {
  return vulnerabilityKernel === 'fast' ? vulnerabilityFast(state, player) : vulnerabilityReference(state, player);
}

/** Wall layouts kept by one cache before it is cleared (memory bound, ~170 bytes per layout). */
const VULNERABILITY_CACHE_LAYOUTS = 100_000;

export interface VulnerabilityProbe {
  /** Called for every query; `hit` is true when the value was already cached. */
  query?(hit: boolean, layoutHit: boolean): void;
  /** Called before a missing value is computed. */
  miss?(state: GameState, player: PlayerId): void;
}

/**
 * Memoised vulnerability(): the value depends only on the wall layout, the player and that
 * player's cell (pawns and wall counts are ignored), so it is keyed exactly by those — no hashing,
 * no collisions. A search revisits the same layout and cell often (pawn-move siblings, the other
 * player after a pawn move, transpositions, every iterative-deepening iteration).
 */
interface LayoutEntry {
  w0: number;
  w1: number;
  w2: number;
  w3: number;
  readonly values: Int8Array;
  next: LayoutEntry | null;
}

export function createVulnerabilityCache(probe?: VulnerabilityProbe): (state: GameState, player: PlayerId) => number {
  // Layouts are found by a 30-bit hash of their 128 wall bits; the entry keeps the four words, so a
  // hash collision (chained) can never return another layout's values.
  const layouts = new Map<number, LayoutEntry>();
  let count = 0;
  let lastH: Uint8Array | null = null;
  let lastV: Uint8Array | null = null;
  let lastEntry: LayoutEntry | null = null;
  return (state, player) => {
    let entry: LayoutEntry;
    let sameArrays = false;
    if (state.hWalls === lastH && state.vWalls === lastV && lastEntry) {
      entry = lastEntry;
      sameArrays = true;
    } else {
      let w0 = 0;
      let w1 = 0;
      let w2 = 0;
      let w3 = 0;
      const h = state.hWalls;
      const v = state.vWalls;
      for (let i = 0; i < 32; i++) {
        if (h[i]) w0 |= 1 << i;
        if (h[i + 32]) w1 |= 1 << i;
        if (v[i]) w2 |= 1 << i;
        if (v[i + 32]) w3 |= 1 << i;
      }
      const hash = (Math.imul(w0 ^ Math.imul(w1, 0x85ebca6b), 0xc2b2ae35) ^ Math.imul(w2 ^ Math.imul(w3, 0x27d4eb2f), 0x165667b1)) >>> 2;
      const head = layouts.get(hash);
      let e: LayoutEntry | null | undefined = head;
      while (e && (e.w0 !== w0 || e.w1 !== w1 || e.w2 !== w2 || e.w3 !== w3)) e = e.next;
      if (!e) {
        if (count >= VULNERABILITY_CACHE_LAYOUTS) {
          layouts.clear();
          count = 0;
        }
        e = { w0, w1, w2, w3, values: new Int8Array(2 * NUM_CELLS).fill(-1), next: layouts.get(hash) ?? null };
        layouts.set(hash, e);
        count++;
      }
      entry = e;
      lastH = h;
      lastV = v;
      lastEntry = e;
    }
    const values = entry.values;
    const slot = player * NUM_CELLS + cellIndex(state.pawns[player].row, state.pawns[player].col);
    let val = values[slot];
    if (probe) {
      probe.query?.(val >= 0, sameArrays);
      if (val < 0) probe.miss?.(state, player);
    }
    if (val < 0) values[slot] = val = vulnerability(state, player);
    return val;
  };
}

export function pathsOf(state: GameState, perspective: PlayerId): { selfPath: Coord[]; opponentPath: Coord[] } {
  const opp = opponentOf(perspective);
  return {
    selfPath: shortestPath(state, state.pawns[perspective], goalRow(perspective)) ?? [],
    opponentPath: shortestPath(state, state.pawns[opp], goalRow(opp)) ?? [],
  };
}

export function isDecisive(score: number): boolean {
  return Math.abs(score) >= DECISIVE_SCORE;
}

/** Plies until the forced result for a decisive score (from the root). */
export function pliesToResult(score: number): number {
  return WIN_SCORE - Math.abs(score);
}
