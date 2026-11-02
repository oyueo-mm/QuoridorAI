import {
  applyActionMultiUnchecked,
  formatAction,
  goalPathMulti,
  legalActionsMulti,
  onGoal,
  pawnMovesAmong,
} from '../../engine';
import type { Action, MultiState } from '../../engine';
import { allDistances, now, sideSeats } from './common';
import type { MultiContext, MultiDecision, MultiGreedyCandidate, MultiGreedyTrace, MultiGreedyWeights } from './types';

export const DEFAULT_MULTI_GREEDY_WEIGHTS: MultiGreedyWeights = {
  selfDistance: 1,
  allyDistance: 0.5,
  leaderDistance: 0.7,
  opponentDistance: 0.3,
  wallCost: 0.5,
  wallScarcity: 0.5,
  opponentWinThreat: 100,
  teamWinReady: 20,
};

/** Score of an action that wins on the spot; dominates every heuristic score. */
export const MULTI_WIN_SCORE = 1000;
/** Candidates kept in the trace (the search itself looks at every legal action). */
export const GREEDY_TRACE_CANDIDATES = 60;
/** Top candidates whose post-action paths are kept. */
export const GREEDY_TRACE_PATHS = 8;

export function resolveGreedyWeights(partial?: Partial<MultiGreedyWeights>): MultiGreedyWeights {
  const out = { ...DEFAULT_MULTI_GREEDY_WEIGHTS };
  for (const key of Object.keys(out) as (keyof MultiGreedyWeights)[]) {
    const v = partial?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.max(-1000, Math.min(1000, v));
  }
  return out;
}

/** True if `seat` has a pawn move onto its goal line in `state` (whoever's turn it is). */
function canWinNext(state: MultiState, seat: number): boolean {
  const goal = state.rules.players[seat].goal;
  const others = state.pawns.filter((_, i) => i !== seat);
  return pawnMovesAmong(state, state.pawns[seat], others).some((c) => onGoal(c, goal));
}

/**
 * One-ply heuristic for any rule set. Every legal action is applied and scored from the real BFS
 * distances of all seats (sides = teams, or single seats in an individual game):
 *
 *   score = − selfDistance·d(me)  − allyDistance·min d(allies)         (team games)
 *           + leaderDistance·min over opposing sides d + opponentDistance·mean over opposing sides d
 *           − wall cost − opponentWinThreat·(#opposing sides that can win next)
 *           + teamWinReady·[an ally can win next]
 *
 * "d of a side" is the distance of its closest pawn: a team wins when any member arrives. An action
 * that reaches my goal scores MULTI_WIN_SCORE. Ties prefer pawn moves, then the engine's order.
 */
export function decideMultiGreedy(state: MultiState, weights: MultiGreedyWeights, ctx: MultiContext = {}): MultiDecision<MultiGreedyTrace> {
  if (state.winner !== null) throw new Error('Cannot decide in a finished game');
  const t0 = now();
  const rules = state.rules;
  const me = state.currentPlayer;
  const sides = sideSeats(rules);
  const mySide = rules.teams ? rules.teams[me] : me;
  const allies = sides[mySide].filter((s) => s !== me);
  const opposing = sides.filter((_, i) => i !== mySide);
  const wallsLeft = state.wallsRemaining[me];
  const total = Math.max(ctx.wallsTotal?.[me] ?? 0, wallsLeft, 1);
  const wallCost = weights.wallCost + weights.wallScarcity * ((total - wallsLeft) / total);

  const beforeDist = allDistances(state);
  const beforePaths = rules.players.map((_, s) => goalPathMulti(state, s) ?? []);

  const evaluated: MultiGreedyCandidate[] = legalActionsMulti(state).map((action) => {
    const next = applyActionMultiUnchecked(state, action);
    const distances = allDistances(next);
    const immediateWin = next.winner === me;
    const sideDist = (seats: number[]) => Math.min(...seats.map((s) => distances[s]));
    const oppDists = opposing.map(sideDist);
    const leader = oppDists.length ? Math.min(...oppDists) : 0;
    const mean = oppDists.length ? oppDists.reduce((a, b) => a + b, 0) / oppDists.length : 0;
    const threats = immediateWin
      ? []
      : opposing.flatMap((seats) => seats.filter((s) => distances[s] <= 2 && canWinNext(next, s)).slice(0, 1));
    const allyReady = !immediateWin && allies.some((s) => distances[s] <= 2 && canWinNext(next, s));
    const terms = {
      self: -weights.selfDistance * distances[me],
      ally: allies.length ? -weights.allyDistance * Math.min(...allies.map((s) => distances[s])) : 0,
      leader: weights.leaderDistance * leader,
      opponents: weights.opponentDistance * mean,
      wall: action.type === 'wall' ? -wallCost : 0,
      threat: -weights.opponentWinThreat * threats.length,
      ready: allyReady ? weights.teamWinReady : 0,
    };
    const score = immediateWin ? MULTI_WIN_SCORE : Object.values(terms).reduce((a, b) => a + b, 0);
    return { action, notation: formatAction(action), distances, immediateWin, threats, allyReady, terms, score, rank: 0 };
  });

  // Stable sort: legalActionsMulti lists pawn moves first, so ties keep preferring them.
  const order = evaluated.map((c, i) => ({ c, i })).sort((a, b) => b.c.score - a.c.score || a.i - b.i);
  const candidates = order.map((o, r) => ({ ...o.c, rank: r + 1 })).slice(0, GREEDY_TRACE_CANDIDATES);
  for (const c of candidates.slice(0, GREEDY_TRACE_PATHS)) {
    const next = applyActionMultiUnchecked(state, c.action);
    c.pathsAfter = rules.players.map((_, s) => goalPathMulti(next, s) ?? []);
  }
  const best = candidates[0];

  return {
    action: best.action,
    trace: {
      algorithm: 'multi-greedy',
      player: me,
      ply: state.ply,
      elapsedMs: now() - t0,
      turnOrder: rules.turnOrder,
      ...(rules.teams ? { teams: rules.teams } : {}),
      weights,
      wallsRemaining: [...state.wallsRemaining],
      before: { distances: beforeDist, paths: beforePaths },
      totalCandidates: evaluated.length,
      candidates,
      rationale: explain(best, beforeDist, me, allies, opposing, !!rules.teams),
    },
  };
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

function explain(best: MultiGreedyCandidate, before: number[], me: number, allies: number[], opposing: number[][], teamed: boolean): string[] {
  const out: string[] = [];
  const a = best.action as Action;
  if (best.immediateWin) return [`${best.notation}: 목표선에 바로 도착해 승리합니다.`];
  out.push(`내 최단 거리 ${before[me]} → ${best.distances[me]}.`);
  const sideMin = (seats: number[], d: number[]) => Math.min(...seats.map((s) => d[s]));
  const changes = opposing.map((seats) => ({ seats, was: sideMin(seats, before), now: sideMin(seats, best.distances) })).filter((x) => x.was !== x.now);
  if (a.type === 'wall') {
    out.push(changes.length ? `벽 ${best.notation}: ${changes.map((x) => `${x.seats.map((s) => `좌석${s}`).join('·')} ${x.was} → ${x.now}`).join(', ')}.` : `벽 ${best.notation}: 상대 거리는 변하지 않지만 점수가 가장 높습니다 (${fmt(best.score)}).`);
    out.push(`벽 비용 ${fmt(-best.terms.wall)}.`);
  } else {
    out.push(`말 이동 ${best.notation}: 벽을 쓰지 않고 앞으로 나아갑니다.`);
  }
  if (teamed && allies.length) out.push(`아군 최단 거리 ${Math.min(...allies.map((s) => best.distances[s]))}${best.allyReady ? ' — 아군이 다음 수에 도착할 수 있습니다' : ''}.`);
  if (best.threats.length) out.push(`경고: 좌석 ${best.threats.join('·')}가 다음 수에 도착할 수 있지만 이보다 나은 수가 없었습니다.`);
  return out;
}
