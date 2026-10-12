import { formatSearchScore } from '../../ai/minimaxAgent';
import type { AgentProgress } from '../../ai/types';

interface Props {
  progress: AgentProgress | null;
  /** Search time budget (0 = unlimited) and depth budget, for the progress bar. */
  timeLimitMs: number;
  maxDepth: number;
}

/** Live status of a running search (reported by the worker), shown while the AI thinks. */
export function SearchProgressBar({ progress, timeLimitMs, maxDepth }: Props) {
  const elapsed = progress?.elapsedMs ?? 0;
  const timeFrac = timeLimitMs > 0 ? Math.min(1, elapsed / timeLimitMs) : null;
  const depthFrac = progress ? progress.completedDepth / maxDepth : 0;
  const frac = timeFrac ?? depthFrac;

  return (
    <div className="w-full max-w-[640px] rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-2" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-violet-200">
        <span>
          <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-violet-400 align-middle" />
          {progress ? `깊이 ${progress.depth} 탐색 중 (완료 ${progress.completedDepth}/${maxDepth})` : '탐색 시작…'}
        </span>
        {progress && (
          <span className="text-violet-300/80">
            노드 {progress.nodes.toLocaleString()} · {(elapsed / 1000).toFixed(1)}s
            {progress.bestNotation && ` · 현재 최선 ${progress.bestNotation}`}
            {progress.score !== undefined && ` (${formatSearchScore(progress.score)})`}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-1 rounded-full bg-violet-400 transition-[width] duration-150" style={{ width: `${Math.max(2, frac * 100)}%` }} />
      </div>
    </div>
  );
}
