import {
  WALLS_PER_PLAYER,
  applyAction,
  encodeAction,
  formatAction,
  goalRow,
  legalActions,
  legalPawnMoves,
  opponentOf,
  shortestPath,
} from '../engine';
import type { Action, Coord, GameState, PlayerId } from '../engine';
import { assertCanDecide, now } from './common';
import type { Agent, AgentContext, AgentDecision, BfsCandidate, BfsTrace, BfsWeights } from './types';

export const DEFAULT_BFS_WEIGHTS: BfsWeights = {
  selfDistance: 1,
  opponentDistance: 1,
  wallCost: 0.5,
  wallScarcity: 0.5,
  opponentWinThreat: 100,
};

/** Score given to an action that wins on the spot; dominates every heuristic score. */
export const WIN_SCORE = 1000;
/** Number of top candidates whose post-action paths are kept in the trace. */
export const TRACE_PATH_LIMIT = 10;
const EPS = 1e-9;

export interface BfsAgentOptions {
  weights?: Partial<BfsWeights>;
}

/** Cost of spending one wall when `remaining` walls are left before placing it. */
export function wallPlacementCost(weights: BfsWeights, remaining: number): number {
  const usedFraction = (WALLS_PER_PLAYER - remaining) / WALLS_PER_PLAYER;
  return weights.wallCost + weights.wallScarcity * usedFraction;
}

function pathFor(state: GameState, player: PlayerId): Coord[] {
  const path = shortestPath(state, state.pawns[player], goalRow(player));
  // Legal states always keep a path for both players.
  if (path === null) throw new Error(`No path for player ${player}`);
  return path;
}

/**
 * One-ply heuristic agent. Every legal action (pawn moves and walls) is applied to a copy of
 * the state and scored from BFS shortest-path lengths:
 *
 *   score = − selfDistance · d_self(after) + opponentDistance · d_opp(after) − wall cost
 *           − opponentWinThreat · [opponent can win with its next pawn move]
 *
 * An action that reaches the goal row scores WIN_SCORE. The threat check uses the engine's
 * real pawn moves (jumps included), not the pawn-agnostic BFS distance. Ties prefer pawn moves, then the
 * lower action index, so the agent is deterministic.
 */
export function evaluateBfs(state: GameState, weights: BfsWeights): BfsTrace {
  const start = now();
  const me = state.currentPlayer;
  const opp = opponentOf(me);
  const selfPath = pathFor(state, me);
  const opponentPath = pathFor(state, opp);
  const selfBefore = selfPath.length - 1;
  const opponentBefore = opponentPath.length - 1;
  const wallCost = wallPlacementCost(weights, state.wallsRemaining[me]);

  const evaluated = legalActions(state).map((action) => {
    const next = applyAction(state, action);
    const selfPathAfter = pathFor(next, me);
    const opponentPathAfter = pathFor(next, opp);
    const selfAfter = selfPathAfter.length - 1;
    const opponentAfter = opponentPathAfter.length - 1;
    const immediateWin = next.winner === me;
    const opponentWinsNext =
      !immediateWin && legalPawnMoves(next, opp).some((c) => c.row === goalRow(opp));
    const terms = {
      self: -weights.selfDistance * selfAfter,
      opponent: weights.opponentDistance * opponentAfter,
      wall: action.type === 'wall' ? -wallCost : 0,
      threat: opponentWinsNext ? -weights.opponentWinThreat : 0,
    };
    const candidate: BfsCandidate = {
      action,
      notation: formatAction(action),
      selfBefore,
      selfAfter,
      opponentBefore,
      opponentAfter,
      immediateWin,
      opponentWinsNext,
      terms,
      score: immediateWin ? WIN_SCORE : terms.self + terms.opponent + terms.wall + terms.threat,
      rank: 0,
    };
    return { candidate, selfPathAfter, opponentPathAfter, index: encodeAction(action) };
  });

  evaluated.sort((a, b) => {
    const diff = b.candidate.score - a.candidate.score;
    if (Math.abs(diff) > EPS) return diff;
    const typeOrder = Number(a.candidate.action.type === 'wall') - Number(b.candidate.action.type === 'wall');
    return typeOrder !== 0 ? typeOrder : a.index - b.index;
  });

  const candidates = evaluated.map((e, i) => {
    const c: BfsCandidate = { ...e.candidate, rank: i + 1 };
    if (i < TRACE_PATH_LIMIT) {
      c.selfPathAfter = e.selfPathAfter;
      c.opponentPathAfter = e.opponentPathAfter;
    }
    return c;
  });

  const trace: BfsTrace = {
    algorithm: 'bfs',
    player: me,
    ply: state.ply,
    elapsedMs: 0,
    weights,
    wallsRemaining: state.wallsRemaining[me],
    before: { selfDistance: selfBefore, opponentDistance: opponentBefore, selfPath, opponentPath },
    candidates,
    rationale: [],
  };
  trace.rationale = explain(trace, wallCost);
  trace.elapsedMs = now() - start;
  return trace;
}

const signed = (n: number, digits = 0) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n).toFixed(digits);
const num = (n: number) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);
const kind = (a: Action) => (a.type === 'move' ? '말 이동' : '벽 설치');

/** Builds the explanation strictly from the computed candidate numbers. */
function explain(trace: BfsTrace, wallCost: number): string[] {
  const [best, second] = trace.candidates;
  const lines: string[] = [];
  if (best.immediateWin) {
    lines.push(`${best.notation} (${kind(best.action)}): 목표 줄에 바로 도달하는 즉시 승리 수입니다.`);
    return lines;
  }
  lines.push(
    `${best.notation} (${kind(best.action)}) 선택 — 점수 ${num(best.score)}, 후보 ${trace.candidates.length}개 중 1위.`,
  );
  lines.push(
    `내 최단 거리 ${best.selfBefore} → ${best.selfAfter} (${signed(best.selfAfter - best.selfBefore)}), ` +
      `상대 최단 거리 ${best.opponentBefore} → ${best.opponentAfter} (${signed(best.opponentAfter - best.opponentBefore)}).`,
  );
  const threatened = trace.candidates.filter((c) => c.opponentWinsNext).length;
  if (threatened === trace.candidates.length) {
    lines.push('어떤 수를 두어도 상대가 다음 수에 승리할 수 있습니다 (막을 수 없는 위협).');
  } else if (threatened > 0) {
    lines.push(
      `후보 ${threatened}개는 상대에게 다음 수 즉시 승리를 허용해 위협 페널티 ${trace.weights.opponentWinThreat}를 받았고, 이 수는 그 위협을 피합니다.`,
    );
  }
  if (best.action.type === 'wall') {
    lines.push(`벽 비용 ${wallCost.toFixed(2)}를 지불했습니다 (설치 전 남은 벽 ${trace.wallsRemaining}개).`);
  } else if (trace.wallsRemaining > 0) {
    const bestWall = trace.candidates.find((c) => c.action.type === 'wall');
    if (bestWall) {
      lines.push(
        `최선의 벽 ${bestWall.notation}은 상대 거리를 ${signed(bestWall.opponentAfter - bestWall.opponentBefore)} 바꾸지만 ` +
          `비용 ${wallCost.toFixed(2)} 포함 점수 ${num(bestWall.score)}로 ${bestWall.rank}위입니다.`,
      );
    }
  }
  if (second) {
    const margin = best.score - second.score;
    lines.push(
      Math.abs(margin) <= EPS
        ? `2위 ${second.notation}와 동점 — 말 이동 우선, 행동 인덱스 순 규칙으로 결정했습니다.`
        : `2위 ${second.notation} (${num(second.score)}) 대비 ${signed(margin, 2)} 앞섭니다.`,
    );
  }
  return lines;
}

export function createBfsAgent(options: BfsAgentOptions = {}): Agent<BfsTrace> {
  const weights: BfsWeights = { ...DEFAULT_BFS_WEIGHTS, ...options.weights };
  return {
    id: 'bfs',
    async decide(state: GameState, context?: AgentContext): Promise<AgentDecision<BfsTrace>> {
      assertCanDecide(state, context);
      const trace = evaluateBfs(state, weights);
      return { action: trace.candidates[0].action, trace };
    },
  };
}
