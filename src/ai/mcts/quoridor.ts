import { applyActionUnchecked, cellIndex, distanceMap, goalRow } from '../../engine';
import type { Action, GameState } from '../../engine';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator } from '../search/evaluation';
import { searchCandidates } from '../search/candidates';
import type { MctsSettings } from '../types';
import type { MctsGame } from './core';

const evaluator = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);
/** Score given to an immediately winning move before the softmax. */
const WIN_PRIOR_SCORE = 100;

export interface QuoridorGameOptions {
  /** Heuristic priors for PUCT: softmax of 1-ply evaluations with this temperature. */
  priorTemperature?: number;
}

/**
 * Quoridor as an MctsGame. Candidates are the same verified set the Minimax search uses
 * (all legal pawn moves + legal walls, optionally only those cutting the opponent's path).
 *
 * Without priors (pure MCTS) the expansion order is: winning moves, pawn moves closest to
 * the goal, then walls. With priors (guided MCTS) every candidate is scored by the Minimax
 * evaluation of the resulting position from the mover's view (computed incrementally),
 * turned into probabilities with a softmax, and expanded in prior order.
 */
export function quoridorGame(wallFilter: MctsSettings['wallFilter'], options: QuoridorGameOptions = {}): MctsGame<GameState, Action> {
  const priorCache = new WeakMap<GameState, number[]>();

  const pureOrder = (s: GameState, actions: Action[]) => {
    const dist = distanceMap(s, goalRow(s.currentPlayer));
    const key = (a: Action) => (a.type === 'move' ? dist[cellIndex(a.to.row, a.to.col)] : 1000);
    // Stable sort keeps the engine order among walls.
    return actions.map((a, i) => ({ a, i, k: key(a) })).sort((x, y) => x.k - y.k || x.i - y.i).map((x) => x.a);
  };

  const priorOrder = (s: GameState, actions: Action[], temperature: number) => {
    const me = s.currentPlayer;
    const ctx = evaluator.childEvaluator!(s, me);
    const scored = actions.map((a) => {
      const child = applyActionUnchecked(s, a);
      return { a, score: child.winner === me ? WIN_PRIOR_SCORE : ctx(child, a) };
    });
    const max = Math.max(...scored.map((x) => x.score));
    const weights = scored.map((x) => Math.exp((x.score - max) / temperature));
    const total = weights.reduce((a, b) => a + b, 0);
    const ranked = scored.map((x, i) => ({ a: x.a, p: weights[i] / total })).sort((x, y) => y.p - x.p);
    const ordered = ranked.map((x) => x.a);
    priorCache.set(s, ranked.map((x) => x.p));
    return ordered;
  };

  return {
    toMove: (s) => s.currentPlayer,
    winner: (s) => s.winner,
    apply: applyActionUnchecked,
    actions(s) {
      const actions = searchCandidates(s, wallFilter);
      return options.priorTemperature ? priorOrder(s, actions, options.priorTemperature) : pureOrder(s, actions);
    },
    priors: options.priorTemperature ? (s) => priorCache.get(s) ?? [] : undefined,
  };
}
