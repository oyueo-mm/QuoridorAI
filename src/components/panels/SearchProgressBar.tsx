import { formatSearchScore } from '../../ai/minimaxAgent';
import type { AgentProgress } from '../../ai/types';

interface Props {
  progress: AgentProgress | null;
  /** Search time budget (0 = unlimited) and depth budget (Minimax), for the progress bar. */
  timeLimitMs: number;
  maxDepth: number;
}

/** Live status of a running search (reported by the worker), shown while the AI thinks. */
export function SearchProgressBar({ progress, timeLimitMs, maxDepth }: Props) {
  const elapsed = progress?.elapsedMs ?? 0;
  const timeFrac = timeLimitMs > 0 ? Math.min(1, elapsed / timeLimitMs) : 0;
  const mcts = progress?.simulations !== undefined;
  const workFrac = !progress
    ? 0
    : mcts
      ? (progress.simulationLimit ?? 0) >= 1e8
        ? 0
        : (progress.simulations ?? 0) / Math.max(1, progress.simulationLimit ?? 1)
      : progress.completedDepth / Math.max(1, maxDepth);
  // The search ends at whichever budget runs out first.
  const frac = Math.min(1, Math.max(timeFrac, workFrac));

  let headline = '탐색 시작…';
  let detail = '';
  if (progress && mcts) {
    headline =
      progress.simulationLimit! >= 1e8
        ? `시뮬레이션 ${progress.simulations!.toLocaleString()} (시간 제한)`
        : `시뮬레이션 ${progress.simulations!.toLocaleString()} / ${progress.simulationLimit!.toLocaleString()}`;
    detail =
      `트리 ${progress.nodes.toLocaleString()} 노드 · 깊이 ${progress.depth} · ${(elapsed / 1000).toFixed(1)}s` +
      (progress.bestNotation ? ` · 최다 방문 ${progress.bestNotation}` : '') +
      (progress.score !== undefined ? ` (Q ${progress.score >= 0 ? '+' : '−'}${Math.abs(progress.score).toFixed(2)})` : '');
  } else if (progress) {
    headline = `깊이 ${progress.depth} 탐색 중 (완료 ${progress.completedDepth}/${maxDepth})`;
    detail =
      `노드 ${progress.nodes.toLocaleString()} · ${(elapsed / 1000).toFixed(1)}s` +
      (progress.bestNotation ? ` · 현재 최선 ${progress.bestNotation}` : '') +
      (progress.score !== undefined ? ` (${formatSearchScore(progress.score)})` : '');
  }

  return (
    <div className="w-full max-w-[640px] rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-2" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-violet-200">
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-violet-400 align-middle" />
          {headline}
        </span>
        {detail && <span className="text-violet-300/80">{detail}</span>}
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-1 rounded-full bg-violet-400 transition-[width] duration-150" style={{ width: `${Math.max(2, frac * 100)}%` }} />
      </div>
    </div>
  );
}
