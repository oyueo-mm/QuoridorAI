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
    <div className="flex h-10 w-full flex-col justify-center gap-1.5 rounded-xl bg-think/5 px-3" role="status" aria-live="polite">
      <div className="flex min-w-0 items-center gap-3 font-mono text-[11px] text-think">
        <span className="flex w-52 shrink-0 items-center gap-1.5 truncate tabular-nums">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-think" />
          {headline}
        </span>
        {detail && <span className="min-w-0 truncate text-think/75" title={detail}>{detail}</span>}
      </div>
      <div className="h-0.5 overflow-hidden rounded-full bg-think/10">
        <div className="h-0.5 rounded-full bg-think/70 transition-[width] duration-150" style={{ width: `${Math.max(2, frac * 100)}%` }} />
      </div>
    </div>
  );
}
