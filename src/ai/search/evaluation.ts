import {
  cellIndex,
  distanceMap,
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

/** Defaults tuned against the BFS agent (bench/: wall value 0.4 lost 3–9, 1.0 won 11–1 at depth 3–4). */
export const DEFAULT_MINIMAX_EVAL: MinimaxEvalWeights = {
  selfDistance: 1,
  opponentDistance: 1,
  wallDifference: 1,
  tempo: 0.5,
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
    const terms = {
      self: -weights.selfDistance * selfDistance,
      opponent: weights.opponentDistance * opponentDistance,
      walls: weights.wallDifference * (base.selfWalls - base.opponentWalls),
      tempo: state.currentPlayer === perspective ? weights.tempo : -weights.tempo,
    };
    return {
      ...base,
      terminal: null,
      selfDistance,
      opponentDistance,
      terms,
      score: terms.self + terms.opponent + terms.walls + terms.tempo,
    };
  };

  const score = (state: GameState, perspective: PlayerId, dSelf: number, dOpp: number) =>
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
