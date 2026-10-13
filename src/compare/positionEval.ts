import type { AgentSpec, Budget } from '../arena/agentSpec';
import type { DecisionTrace } from '../ai/types';
import { distanceToRow, goalRow, hashState } from '../engine';
import type { GameState, PlayerId } from '../engine';

/*
 * What the evaluation chart plots, and what each number means.
 *
 * Common metric (every position, same formula): BFS race margin
 *     margin = (P2's shortest path to its goal) − (P1's shortest path to its goal)
 *   in steps, positive = P1 is closer. It ignores whose turn it is, walls in hand and pawn
 *   blocking, so it is a rough indicator, not a winning chance.
 *
 * AI values (only where that AI evaluated the position, with the budget it ran under):
 *   Alpha-Beta / Minimax  trace.score — search evaluation of the position for the player to
 *                         move, in the evaluation function's step-like units; ±10000 = forced
 *                         win / loss found by the search.
 *   MCTS                  q of the chosen move — mean simulation value in [−1, 1] for the
 *                         player to move. Not a probability.
 *   BFS                   score of the best one-move candidate (1-ply heuristic) for the player
 *                         to move.
 *   Random                no value.
 * All three are from the perspective of the player to move, so they are converted to P1's
 * view by flipping the sign when P2 is to move (exact for these zero-sum evaluations). Values
 * of different algorithms or budgets have different scales and are never put on one axis or
 * converted into a common score.
 */

export const FORCED_SCORE = 9000;

export function positionKey(state: GameState): string {
  const h = hashState(state);
  return `${h.key}:${h.check}`;
}

/** Common metric from P1's view (steps). */
export function raceMargin(state: GameState): number {
  return distanceToRow(state, state.pawns[1], goalRow(1)) - distanceToRow(state, state.pawns[0], goalRow(0));
}

export type ValueKind = 'minimax' | 'mcts' | 'bfs';

export interface AiValue {
  kind: ValueKind;
  /** From P1's view. */
  value: number;
  /** Forced result proven by the search (Minimax ±10000): +1 = P1 wins, −1 = P2 wins. */
  forced?: 1 | -1;
}

export const VALUE_INFO: Record<ValueKind, { unit: string; meaning: string }> = {
  minimax: { unit: '평가 점수(걸음 단위)', meaning: '탐색이 찾은 최선 진행의 평가 함수 값. ±10000은 강제 승패' },
  mcts: { unit: 'Q (−1~+1)', meaning: '선택한 수의 평균 시뮬레이션 가치. 승률이 아님' },
  bfs: { unit: '1수 휴리스틱 점수', meaning: '가장 좋은 한 수 후보의 BFS 휴리스틱 점수' },
};

/** The AI's own value of the position it decided in, converted to P1's view (null = none). */
export function aiValue(trace: DecisionTrace, mover: PlayerId): AiValue | null {
  const sign = mover === 0 ? 1 : -1;
  switch (trace.algorithm) {
    case 'minimax': {
      const forced = Math.abs(trace.score) >= FORCED_SCORE ? ((Math.sign(trace.score) * sign) as 1 | -1) : undefined;
      return { kind: 'minimax', value: trace.score * sign, ...(forced ? { forced } : {}) };
    }
    case 'mcts':
      return trace.candidates.length ? { kind: 'mcts', value: trace.candidates[0].q * sign } : null;
    case 'bfs':
      return trace.candidates.length ? { kind: 'bfs', value: trace.candidates[0].score * sign } : null;
    case 'random':
      return null;
  }
}

/** Identifies an AI evaluation setting; results of different settings are never mixed. */
export function evalKey(spec: AgentSpec, budget: Budget, seed: number): string {
  return `${spec.kind}/d${spec.depth}/s${spec.simulations}|${budget.mode}:${budget.timeMs}|seed${seed}`;
}
