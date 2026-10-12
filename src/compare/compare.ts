import type { DecisionTrace } from '../ai/types';
import { deriveSeed } from '../arena/agentSpec';
import { agentLabel } from '../arena/agentSpec';
import type { AgentFactory, AgentSpec, Budget } from '../arena/agentSpec';
import { applyAction, distanceToRow, formatAction, goalRow } from '../engine';
import type { Action, GameState } from '../engine';

/**
 * Decision comparison: the *same* GameState is given to several agents and their chosen
 * actions and real computation results are collected side by side.
 *
 * Scores of different algorithms live on different scales (Minimax evaluation in "steps",
 * MCTS Q in [−1, 1], BFS heuristic score, …), so they are reported per algorithm with their
 * own meaning and never merged into one ranking. The only common facts are engine facts
 * about the position after each chosen action (path lengths, walls left).
 */

export const MAX_COMPARE_AGENTS = 3;

export interface PositionFacts {
  state: GameState;
  /** BFS shortest-path lengths [P1, P2] after the action (pawns ignored). */
  distances: [number, number];
  walls: [number, number];
  winner: GameState['winner'];
}

export type CompareStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface CompareResult {
  index: number;
  spec: AgentSpec;
  label: string;
  seed: number;
  status: CompareStatus;
  action?: Action;
  notation?: string;
  trace?: DecisionTrace;
  elapsedMs?: number;
  after?: PositionFacts;
  error?: string;
}

export function positionFacts(state: GameState): PositionFacts {
  return {
    state,
    distances: [distanceToRow(state, state.pawns[0], goalRow(0)), distanceToRow(state, state.pawns[1], goalRow(1))],
    walls: [state.wallsRemaining[0], state.wallsRemaining[1]],
    winner: state.winner,
  };
}

/**
 * Runs the agents one after another on the same position (sequentially, so time budgets are
 * not distorted by parallel searches). `onUpdate` receives the full result list after every
 * change; abort the signal to cancel (remaining agents are marked 'cancelled').
 */
export async function runComparison(
  state: GameState,
  specs: readonly AgentSpec[],
  budget: Budget,
  seed: number,
  factory: AgentFactory,
  options: { signal?: AbortSignal; onUpdate?: (results: CompareResult[]) => void } = {},
): Promise<CompareResult[]> {
  if (state.winner !== null) throw new Error('이미 끝난 포지션은 비교할 수 없습니다.');
  const chosen = specs.slice(0, MAX_COMPARE_AGENTS);
  const results: CompareResult[] = chosen.map((spec, index) => ({
    index,
    spec,
    label: agentLabel(spec, budget),
    seed: deriveSeed(seed, index),
    status: 'pending',
  }));
  const emit = () => options.onUpdate?.(results.map((r) => ({ ...r })));
  emit();

  for (const r of results) {
    if (options.signal?.aborted) {
      r.status = 'cancelled';
      continue;
    }
    r.status = 'running';
    emit();
    const agent = factory(r.spec, budget, r.seed);
    const t0 = performance.now();
    try {
      const decision = await agent.decide(state, { signal: options.signal });
      r.elapsedMs = performance.now() - t0;
      r.action = decision.action;
      r.notation = formatAction(decision.action);
      r.trace = decision.trace;
      r.after = positionFacts(applyAction(state, decision.action));
      r.status = 'done';
    } catch (err) {
      r.status = options.signal?.aborted ? 'cancelled' : 'error';
      r.error = err instanceof Error ? err.message : String(err);
    } finally {
      agent.dispose?.();
    }
    emit();
  }
  return results;
}

/** Groups agents that chose the same action. */
export function agreement(results: readonly CompareResult[]): { notation: string; labels: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const r of results) if (r.notation) groups.set(r.notation, [...(groups.get(r.notation) ?? []), r.label]);
  return [...groups.entries()].map(([notation, labels]) => ({ notation, labels })).sort((a, b) => b.labels.length - a.labels.length);
}

export interface TraceMetric {
  label: string;
  value: string;
  /** What the number means / its scale. */
  note: string;
}

const fmt = (x: number, d = 2) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(d);

/** Key numbers of a trace, each with its own meaning (not comparable across algorithms). */
export function traceMetrics(trace: DecisionTrace): TraceMetric[] {
  switch (trace.algorithm) {
    case 'random':
      return [
        { label: '후보 행동', value: String(trace.candidateCount), note: '균등 무작위 — 평가 없음' },
        { label: '선택 확률', value: `${((100 / trace.candidateCount) || 0).toFixed(2)}%`, note: '1/N' },
      ];
    case 'bfs': {
      const best = trace.candidates[0];
      return [
        { label: '휴리스틱 점수', value: fmt(best.score), note: 'BFS 1수 평가 (걸음 단위, 다른 AI와 척도 다름)' },
        { label: '내 거리', value: `${best.selfBefore} → ${best.selfAfter}`, note: 'BFS 최단 경로 길이' },
        { label: '상대 거리', value: `${best.opponentBefore} → ${best.opponentAfter}`, note: 'BFS 최단 경로 길이' },
        { label: '평가한 후보', value: String(trace.candidates.length), note: '모든 합법 행동' },
      ];
    }
    case 'minimax':
      return [
        { label: '평가 점수', value: fmt(trace.score), note: 'Minimax 평가 (걸음 단위, 승리 ±10000)' },
        { label: '도달 깊이', value: `${trace.completedDepth}${trace.timedOut ? ' (시간 제한)' : ''}`, note: 'ply' },
        { label: '탐색 노드', value: trace.stats.nodes.toLocaleString(), note: '방문한 탐색 노드' },
        {
          label: '가지치기',
          value: trace.settings.algorithm === 'alphabeta' ? trace.stats.cutoffs.toLocaleString() : '없음',
          note: 'β 컷 횟수',
        },
        { label: 'PV', value: trace.pvNotation.slice(0, 5).join(' '), note: '예상 진행' },
      ];
    case 'mcts': {
      const best = trace.candidates[0];
      const guided = trace.settings.selection === 'puct';
      return [
        { label: '방문 N', value: `${best.visits.toLocaleString()} (${(100 * best.share).toFixed(1)}%)`, note: '선택 수의 방문 횟수와 비율' },
        { label: '평균 가치 Q', value: fmt(best.q, 3), note: 'MCTS 가치 (−1~+1, 다른 AI와 척도 다름)' },
        ...(guided && best.prior !== undefined ? [{ label: '사전 확률 P', value: best.prior.toFixed(3), note: '1수 평가 softmax' }] : []),
        { label: guided ? 'PUCT' : 'UCT', value: best.uct === null ? '–' : best.uct.toFixed(3), note: '최종 선택 점수' },
        { label: '시뮬레이션', value: trace.simulations.toLocaleString(), note: `트리 ${trace.treeNodes.toLocaleString()}노드, 깊이 ${trace.maxTreeDepth}` },
      ];
    }
  }
}
