import {
  NUM_CELLS,
  cellIndex,
  distanceMap,
  prepareExtraWallDistances,
  preparedDistanceWithExtraWall,
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
 * Alpha-Beta default since stage 3-B (candidate E5): the same linear terms with weights fitted to
 * recorded game outcomes, split by opening (docs/stage3b-eval-report.md). Beat RACE_EVAL_V1 in two
 * independent SPRTs on new openings: depth 4 +44 Elo (+11 … +78), 300 ms +55 Elo (+16 … +96).
 */
export const ALPHA_BETA_EVAL: MinimaxEvalWeights = {
  selfDistance: 1.001,
  opponentDistance: 1,
  wallDifference: 1.503,
  tempo: 0.482,
};

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
export function createDistanceEvaluator(weights: MinimaxEvalWeights): Evaluator {
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
  const vulnerabilityOf = createVulnerabilityCache();
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
      const maps = players.map((q) => distanceMap(parent, goalRow(q)));
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
export function vulnerability(state: GameState, player: PlayerId): number {
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

/** Wall layouts kept by one cache before it is cleared (memory bound, ~170 bytes per layout). */
const VULNERABILITY_CACHE_LAYOUTS = 100_000;

/**
 * Memoised vulnerability(): the value depends only on the wall layout, the player and that
 * player's cell (pawns and wall counts are ignored), so it is keyed exactly by those — no hashing,
 * no collisions. A search revisits the same layout and cell often (pawn-move siblings, the other
 * player after a pawn move, transpositions, every iterative-deepening iteration).
 */
export function createVulnerabilityCache(): (state: GameState, player: PlayerId) => number {
  const layouts = new Map<string, Int8Array>();
  const words = new Int32Array(4);
  let lastH: Uint8Array | null = null;
  let lastV: Uint8Array | null = null;
  let lastEntry: Int8Array | null = null;
  return (state, player) => {
    let entry: Int8Array;
    if (state.hWalls === lastH && state.vWalls === lastV && lastEntry) entry = lastEntry;
    else {
      words.fill(0);
      for (let i = 0; i < 64; i++) {
        if (state.hWalls[i]) words[i >> 5] |= 1 << (i & 31);
        if (state.vWalls[i]) words[2 + (i >> 5)] |= 1 << (i & 31);
      }
      const key = `${words[0]},${words[1]},${words[2]},${words[3]}`;
      let e = layouts.get(key);
      if (!e) {
        if (layouts.size >= VULNERABILITY_CACHE_LAYOUTS) layouts.clear();
        e = new Int8Array(2 * NUM_CELLS).fill(-1);
        layouts.set(key, e);
      }
      entry = e;
      lastH = state.hWalls;
      lastV = state.vWalls;
      lastEntry = e;
    }
    const slot = player * NUM_CELLS + cellIndex(state.pawns[player].row, state.pawns[player].col);
    let v = entry[slot];
    if (v < 0) entry[slot] = v = vulnerability(state, player);
    return v;
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
