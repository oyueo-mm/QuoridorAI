import { applyActionUnchecked, formatAction } from '../engine';
import type { GameState } from '../engine';
import { assertCanDecide } from './common';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator, isDecisive, pathsOf, pliesToResult } from './search/evaluation';
import { runSearch } from './search/minimax';
import type { SearchResult } from './search/minimax';
import type { Agent, AgentContext, AgentDecision, MinimaxSettings, MinimaxTrace } from './types';

export const DEFAULT_MINIMAX_SETTINGS: MinimaxSettings = {
  algorithm: 'alphabeta',
  maxDepth: 5,
  timeLimitMs: 2000,
  moveOrdering: true,
  transpositionTable: true,
  wallFilter: 'opponent-path',
  evaluation: { ...DEFAULT_MINIMAX_EVAL },
};

export function resolveMinimaxSettings(partial?: Partial<MinimaxSettings>): MinimaxSettings {
  return {
    ...DEFAULT_MINIMAX_SETTINGS,
    ...partial,
    evaluation: { ...DEFAULT_MINIMAX_EVAL, ...partial?.evaluation },
  };
}

const num = (n: number) => (n < 0 ? '−' : '') + Math.abs(n).toFixed(2);

export function formatSearchScore(score: number): string {
  if (isDecisive(score)) return `${score > 0 ? '승리' : '패배'} ${pliesToResult(score)} ply`;
  return num(score);
}

/** Runs the search and packages the result as a MinimaxTrace. */
export function decideMinimax(state: GameState, settings: MinimaxSettings, context?: AgentContext): MinimaxTrace {
  assertCanDecide(state, context);
  const evaluator = createDistanceEvaluator(settings.evaluation);
  const result = runSearch(state, settings, evaluator, { signal: context?.signal, onProgress: context?.onProgress });
  const me = state.currentPlayer;

  let leaf = state;
  for (const a of result.pv) leaf = applyActionUnchecked(leaf, a);
  const leafEval = evaluator.explain(leaf, me);
  const matchesScore = leaf.winner !== null ? isDecisive(result.score) : Math.abs(leafEval.score - result.score) < 1e-9;

  const trace: MinimaxTrace = {
    algorithm: 'minimax',
    player: me,
    ply: state.ply,
    elapsedMs: result.stats.elapsedMs,
    settings,
    completedDepth: result.completedDepth,
    timedOut: result.timedOut,
    decided: result.decided,
    score: result.score,
    pv: result.pv,
    pvNotation: result.pv.map(formatAction),
    pvComplete: result.pvComplete,
    rootCandidates: result.rootCandidates,
    legalActionCount: result.legalActionCount,
    searchedActionCount: result.searchedActionCount,
    iterations: result.iterations,
    stats: result.stats,
    tree: result.tree,
    rootEval: evaluator.explain(state, me),
    pvLeaf: { ...leafEval, ...pathsOf(leaf, me), matchesScore },
    rationale: [],
  };
  trace.rationale = explain(trace, result);
  return trace;
}

function explain(trace: MinimaxTrace, result: SearchResult): string[] {
  const lines: string[] = [];
  const algo = trace.settings.algorithm === 'alphabeta' ? 'Alpha-Beta' : 'Minimax';
  const [best, second] = trace.rootCandidates;
  lines.push(
    `${best.notation} 선택 — ${algo} 깊이 ${trace.completedDepth} 탐색, 평가 ${formatSearchScore(trace.score)}.` +
      (trace.timedOut ? ` 깊이 ${trace.completedDepth + 1}은 시간 제한(${trace.settings.timeLimitMs}ms)으로 중단되어 버렸습니다.` : ''),
  );
  if (isDecisive(trace.score)) {
    lines.push(
      trace.score > 0
        ? `상대의 모든 대응에 대해 ${pliesToResult(trace.score)} ply 안에 이기는 강제 승리 경로를 찾았습니다.`
        : `탐색한 모든 수가 ${pliesToResult(trace.score)} ply 안에 패배로 이어집니다 — 가장 오래 버티는 수를 골랐습니다.`,
    );
  }
  if (trace.pvNotation.length > 1) {
    lines.push(`예상 상대 대응: ${trace.pvNotation[1]}. 예상 진행(PV): ${trace.pvNotation.join(' → ')}.`);
  }
  if (second) {
    const bound = second.bound === 'upper' ? '≤ ' : '';
    lines.push(`2위 ${second.notation}: ${bound}${formatSearchScore(second.score)} (선택 수와 차이 ${num(best.score - second.score)}${bound ? ' 이상' : ''}).`);
  }
  const pruned = trace.rootCandidates.filter((c) => c.bound === 'upper').length;
  if (pruned > 0) {
    lines.push(`나머지 후보 ${pruned}개는 가지치기로 '이 이상 좋을 수 없음(상한)'만 증명되어 정확한 점수 없이 제외되었습니다.`);
  }
  if (!isDecisive(trace.score) && trace.pvLeaf.terminal === null) {
    const e = trace.pvLeaf;
    lines.push(
      `PV 끝 포지션의 정적 평가: 내 거리 ${e.selfDistance}, 상대 거리 ${e.opponentDistance}, 벽 ${e.selfWalls}:${e.opponentWalls}` +
        ` → ${num(e.score)}${e.matchesScore ? ' (탐색 점수와 일치)' : ''}.`,
    );
  }
  if (trace.settings.wallFilter === 'opponent-path' && result.legalActionCount > result.searchedActionCount) {
    lines.push(
      `벽 후보를 상대 최단 경로를 끊는 벽으로 제한해 루트에서 ${result.legalActionCount}개 중 ${result.searchedActionCount}개 행동을 탐색했습니다.`,
    );
  }
  return lines;
}

export function createMinimaxAgent(partial?: Partial<MinimaxSettings>): Agent<MinimaxTrace> {
  const settings = resolveMinimaxSettings(partial);
  return {
    id: 'minimax',
    async decide(state: GameState, context?: AgentContext): Promise<AgentDecision<MinimaxTrace>> {
      const trace = decideMinimax(state, settings, context);
      return { action: trace.pv[0], trace };
    },
  };
}
