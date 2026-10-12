import { agentName } from '../../ai/catalog';
import type { DecisionTrace } from '../../ai/types';
import type { Action, GameState, PlayerId } from '../../engine';
import { PLAYER_LABEL } from '../theme';
import { BfsAnalysis } from './BfsAnalysis';
import { MctsAnalysis } from './MctsAnalysis';
import { MinimaxAnalysis } from './MinimaxAnalysis';
import type { PreviewBinder } from './preview';
import { RandomAnalysis } from './RandomAnalysis';

export interface TraceEntry {
  player: PlayerId;
  action: Action;
  stateBefore: GameState;
  trace?: DecisionTrace;
}

export function traceAgentName(trace: DecisionTrace): string {
  if (trace.algorithm === 'mcts') return agentName(trace.settings.variant === 'guided' ? 'mcts-guided' : 'mcts');
  if (trace.algorithm === 'minimax') return trace.settings.algorithm === 'alphabeta' ? 'Alpha-Beta' : 'Minimax';
  return agentName(trace.algorithm);
}

/** The algorithm-specific DecisionTrace view (same components as the Play analysis panel). */
export function TraceDetail({ entry, bind, showHeader = true }: { entry: TraceEntry; bind: PreviewBinder; showHeader?: boolean }) {
  const trace = entry.trace;
  if (!trace) return <p className="text-xs text-faint">이 수에는 AI 계산 기록이 없습니다 (사람이 둔 수).</p>;
  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
          <span className="font-semibold text-ink">
            {traceAgentName(trace)} · {PLAYER_LABEL[trace.player]}
          </span>
          <span className="font-mono text-[11px] text-faint">
            ply {trace.ply + 1} · {trace.elapsedMs.toFixed(1)} ms
          </span>
        </div>
      )}
      {trace.algorithm === 'random' ? (
        <RandomAnalysis entry={entry} trace={trace} bind={bind} />
      ) : trace.algorithm === 'bfs' ? (
        <BfsAnalysis entry={entry} trace={trace} bind={bind} />
      ) : trace.algorithm === 'minimax' ? (
        <MinimaxAnalysis key={`${trace.ply}-${trace.player}`} entry={entry} trace={trace} bind={bind} />
      ) : (
        <MctsAnalysis key={`${trace.ply}-${trace.player}`} entry={entry} trace={trace} bind={bind} />
      )}
    </div>
  );
}
