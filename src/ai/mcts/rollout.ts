import {
  WALL_GRID,
  applyActionUnchecked,
  cellIndex,
  distanceMap,
  distanceToRow,
  goalRow,
  hasPathToRow,
  legalPawnMoves,
  opponentOf,
  pathEdgeSet,
  shortestPath,
  wallConflicts,
  wallCutsEdges,
  wallsCuttingPath,
  withWall,
} from '../../engine';
import type { Action, Coord, GameState, Orientation, PlayerId } from '../../engine';
import type { Rng } from '../rng';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator } from '../search/evaluation';
import type { MctsSettings, RolloutPolicy } from '../types';
import type { LeafEvaluator, LeafResult } from './core';

/**
 * Rollout (simulation) policies. Every policy only plays legal actions; walls are sampled by
 * rejection (random slot → keep if legal), which is uniform over the legal walls without
 * generating all of them.
 */

const WALL_SLOTS = WALL_GRID * WALL_GRID * 2;

/** Legality of a wall given precomputed path edge sets (BFS only if a path is cut). */
function wallIsLegal(state: GameState, o: Orientation, row: number, col: number, edges: Set<number>[]): boolean {
  if (wallConflicts(state, o, row, col)) return false;
  const cuts0 = wallCutsEdges(edges[0], o, row, col);
  const cuts1 = wallCutsEdges(edges[1], o, row, col);
  if (!cuts0 && !cuts1) return true;
  const next = withWall(state, o, row, col);
  if (cuts0 && !hasPathToRow(next, state.pawns[0], goalRow(0))) return false;
  if (cuts1 && !hasPathToRow(next, state.pawns[1], goalRow(1))) return false;
  return true;
}

function pathEdges(state: GameState): Set<number>[] {
  return [0, 1].map((p) => pathEdgeSet(shortestPath(state, state.pawns[p], goalRow(p as PlayerId)) ?? []));
}

const slotToWall = (slot: number): { orientation: Orientation; row: number; col: number } => {
  const orientation: Orientation = slot < WALL_GRID * WALL_GRID ? 'h' : 'v';
  const i = slot % (WALL_GRID * WALL_GRID);
  return { orientation, row: Math.floor(i / WALL_GRID), col: i % WALL_GRID };
};

/** Uniformly random legal wall, or null (no walls left / none found in the attempt budget). */
export function randomLegalWall(state: GameState, rng: Rng, attempts = 64): Action | null {
  if (state.wallsRemaining[state.currentPlayer] <= 0) return null;
  let edges: Set<number>[] | null = null;
  for (let i = 0; i < attempts; i++) {
    const w = slotToWall(Math.floor(rng() * WALL_SLOTS));
    if (wallConflicts(state, w.orientation, w.row, w.col)) continue;
    edges ??= pathEdges(state);
    if (wallIsLegal(state, w.orientation, w.row, w.col, edges)) return { type: 'wall', ...w };
  }
  return null;
}

const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];

/** Uniform over *all* legal actions: rejection sampling over pawn moves ∪ 128 wall slots. */
export function uniformAction(state: GameState, rng: Rng): Action {
  const moves = legalPawnMoves(state);
  if (state.wallsRemaining[state.currentPlayer] <= 0) return { type: 'move', to: pick(moves, rng) };
  let edges: Set<number>[] | null = null;
  for (let i = 0; i < 256; i++) {
    const k = Math.floor(rng() * (moves.length + WALL_SLOTS));
    if (k < moves.length) return { type: 'move', to: moves[k] };
    const w = slotToWall(k - moves.length);
    if (wallConflicts(state, w.orientation, w.row, w.col)) continue;
    edges ??= pathEdges(state);
    if (wallIsLegal(state, w.orientation, w.row, w.col, edges)) return { type: 'wall', ...w };
  }
  return { type: 'move', to: pick(moves, rng) };
}

/** Pawn move or wall first (probability `moveProbability`), then uniform within that type. */
export function balancedAction(state: GameState, rng: Rng, moveProbability: number): Action {
  if (rng() >= moveProbability) {
    const wall = randomLegalWall(state, rng);
    if (wall) return wall;
  }
  return { type: 'move', to: pick(legalPawnMoves(state), rng) };
}

/** Wall candidates sampled per heuristic wall decision. */
const HEURISTIC_WALL_SAMPLES = 8;

/**
 * BFS heuristic: usually step along a shortest path (ties broken randomly). Walls are kept
 * for when they matter, like the BFS agent does: only when the opponent is ahead in the race
 * (it moves right after us, so it wins ties) or about to arrive, the policy samples walls on
 * the opponent's shortest path and plays the one that lengthens that path the most (net of
 * any damage to its own path), if it gains at least one step.
 * A small ε of random pawn moves keeps the simulations diverse.
 *
 * (A first version dropped a random path-cutting wall half the time whenever the opponent
 * was not behind; simulated players then spent all walls early, so keeping walls never
 * looked valuable and MCTS lost to the BFS agent 2–10. See bench/results.)
 */
export function heuristicAction(state: GameState, rng: Rng, wallProbability = 0.8, epsilon = 0.1): Action {
  const me = state.currentPlayer;
  const opp = opponentOf(me);
  const moves = legalPawnMoves(state);
  if (rng() < epsilon) return { type: 'move', to: pick(moves, rng) };

  const myMap = distanceMap(state, goalRow(me));
  const myDist = myMap[cellIndex(state.pawns[me].row, state.pawns[me].col)];
  if (state.wallsRemaining[me] > 0) {
    const oppDist = distanceToRow(state, state.pawns[opp], goalRow(opp));
    if ((oppDist <= myDist || oppDist <= 2) && rng() < wallProbability) {
      const oppPath = shortestPath(state, state.pawns[opp], goalRow(opp));
      if (oppPath) {
        const options = wallsCuttingPath(oppPath);
        const edges = pathEdges(state);
        let best: Action | null = null;
        let bestGain = 0;
        for (let k = 0; k < HEURISTIC_WALL_SAMPLES && options.length > 0; k++) {
          const j = Math.floor(rng() * options.length);
          const w = options[j];
          options[j] = options[options.length - 1];
          options.pop();
          if (!wallIsLegal(state, w.orientation, w.row, w.col, edges)) continue;
          const next = withWall(state, w.orientation, w.row, w.col);
          const gain =
            distanceToRow(next, state.pawns[opp], goalRow(opp)) -
            oppDist -
            (wallCutsEdges(edges[me], w.orientation, w.row, w.col) ? distanceToRow(next, state.pawns[me], goalRow(me)) - myDist : 0);
          if (gain > bestGain) {
            bestGain = gain;
            best = { type: 'wall', ...w };
          }
        }
        if (best) return best;
      }
    }
  }
  let best: Coord[] = [];
  let bestD = Infinity;
  for (const m of moves) {
    const d = myMap[cellIndex(m.row, m.col)];
    if (d < bestD) {
      bestD = d;
      best = [m];
    } else if (d === bestD) best.push(m);
  }
  return { type: 'move', to: pick(best, rng) };
}

export function rolloutAction(policy: RolloutPolicy, state: GameState, rng: Rng, settings: MctsSettings): Action {
  switch (policy) {
    case 'uniform':
      return uniformAction(state, rng);
    case 'balanced':
      return balancedAction(state, rng, settings.balancedMoveProbability);
    case 'heuristic':
      return heuristicAction(state, rng);
  }
}

/** Distance-race estimate for a truncated rollout, from player 0's view (tempo-adjusted). */
/** Race margin from player 0's view: d1 − d0, tempo-adjusted by ±0.5 for the side to move. */
function raceMargin(state: GameState): number {
  const d0 = distanceToRow(state, state.pawns[0], goalRow(0));
  const d1 = distanceToRow(state, state.pawns[1], goalRow(1));
  return d1 - d0 + (state.currentPlayer === 0 ? 0.5 : -0.5);
}

/** Pure-MCTS cut-off value (unchanged): tanh(race margin / 3). */
export function cutoffValue(state: GameState): number {
  return Math.tanh(raceMargin(state) / 3);
}

/** Scale of evaluation scores (≈ steps) mapped to values. */
const EVAL_SCALE = 3;
/** Value shaping: estimates live in (−SHAPE_CAP, SHAPE_CAP); rollout wins in (SHAPE_CAP, 1). */
export const SHAPE_CAP = 0.9;
const SHAPE_K = 4;
const minimaxEval = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);

/**
 * Maps a heuristic score (player 0's view, ≈ steps) to a value.
 * Plain: tanh(x / 3), which saturates near ±1 once a side leads by ~6 steps.
 * Shaped: SHAPE_CAP · x / (|x| + 4), a soft sign that keeps a usable slope in lopsided
 * positions and never reaches the value of a real win.
 */
export function heuristicValue(score: number, shaped: boolean): number {
  return shaped ? (SHAPE_CAP * score) / (Math.abs(score) + SHAPE_K) : Math.tanh(score / EVAL_SCALE);
}

/**
 * Value of a game that ended inside a rollout. Plain: ±1. Shaped: ±(0.9 … 1) growing with
 * the loser's remaining distance, so a losing side still prefers lines where it gets closer.
 */
export function rolloutWinValue(state: GameState, shaped: boolean): number {
  const sign = state.winner === 0 ? 1 : -1;
  if (!shaped) return sign;
  const loser = state.winner === 0 ? 1 : 0;
  const d = distanceToRow(state, state.pawns[loser], goalRow(loser));
  return sign * (SHAPE_CAP + (1 - SHAPE_CAP) * (d / (d + SHAPE_K)));
}

/** Value of a rollout that stopped at the ply limit (player 0's view). */
export function truncatedValue(state: GameState, settings: MctsSettings): number {
  switch (settings.rolloutCutoff) {
    case 'draw':
      return 0;
    case 'distance':
      return settings.valueShaping ? heuristicValue(raceMargin(state), true) : cutoffValue(state);
    case 'evaluation':
      return heuristicValue(minimaxEval.evaluate(state, 0), settings.valueShaping);
  }
}

export function describeValueRule(settings: MctsSettings): string {
  const map = settings.valueShaping ? '0.9·x/(|x|+4)' : 'tanh(x/3)';
  const cutoff =
    settings.rolloutCutoff === 'draw'
      ? '무승부 0'
      : settings.rolloutCutoff === 'distance'
        ? `${map}, x = d상대 − d내 ± 0.5(차례) 거리 추정값`
        : `${map}, x = Minimax 평가값(d상대 − d내 + 벽 차이 ± 템포)`;
  const win = settings.valueShaping
    ? '롤아웃 안에서 끝나면 ±(0.9~1, 패자의 남은 거리가 클수록 1에 가까움)'
    : '롤아웃이 실제로 끝나면 승리 +1 / 패배 −1';
  return (
    `${win}. ${settings.rolloutMaxPlies === 0 ? '롤아웃 없이 리프를 바로' : `${settings.rolloutMaxPlies} ply 안에 끝나지 않으면`} ${cutoff}` +
    `${settings.valueShaping ? ' (|값| < 0.9)' : ' (|값| < 1)'}. 트리 안의 종료 포지션과 Solver가 증명한 노드는 정확히 ±1이므로 실제 승리가 항상 추정값보다 큽니다.`
  );
}

/** Leaf evaluator: play the rollout policy until the game ends or the ply limit. */
export function createRolloutEvaluator(settings: MctsSettings): LeafEvaluator<GameState> {
  return (start, rng): LeafResult => {
    let state = start;
    let plies = 0;
    while (state.winner === null && plies < settings.rolloutMaxPlies) {
      state = applyActionUnchecked(state, rolloutAction(settings.rollout, state, rng, settings));
      plies++;
    }
    if (state.winner !== null) return { value: rolloutWinValue(state, settings.valueShaping), plies, truncated: false };
    return { value: truncatedValue(state, settings), plies, truncated: true };
  };
}
