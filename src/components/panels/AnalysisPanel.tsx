import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { distanceToRow, goalRow, legalPawnMoves, legalWallPlacements } from '../../engine';
import type { GameState } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import { TraceDetail, traceAgentName } from '../analysis/TraceDetail';
import { usePreviewBinder } from '../analysis/usePreviewBinder';
import type { BoardOverlay } from '../board/overlay';
import { PLAYER_LABEL } from '../theme';
import { Collapsible } from '../ui';
import { Panel } from './Panel';

interface AnalysisPanelProps {
  state: GameState;
  history: readonly HistoryEntry[];
  hasAi: boolean;
  thinking: boolean;
  onPreview: (overlay: BoardOverlay | null) => void;
}

/**
 * Right-hand analysis area. Shows the DecisionTrace of an AI decision (latest by default,
 * earlier ones via the navigator) and lets the user preview evaluated actions on the board.
 * Mount with a key per game so selection state resets on restart.
 */
export function AnalysisPanel({ state, history, hasAi, thinking, onPreview }: AnalysisPanelProps) {
  const decisions = useMemo(
    () => history.flatMap((entry, index) => (entry.trace ? [{ entry, index, trace: entry.trace }] : [])),
    [history],
  );
  // null = follow the latest decision.
  const [selected, setSelected] = useState<number | null>(null);
  const position = selected === null ? decisions.length - 1 : Math.min(selected, decisions.length - 1);
  const decision = decisions[position];
  // A new move invalidates any preview built on the previous board.
  const bind = usePreviewBinder(onPreview, `${history.length}:${position}`);

  return (
    <div className="space-y-4">
      <Panel
        plain
        title="AI 분석"
        aside={
          decision && (
            <div className="flex items-center gap-1 font-mono text-[11px] text-muted">
              <NavButton label="이전 결정" disabled={position <= 0} onClick={() => setSelected(position - 1)}>
                ◀
              </NavButton>
              <span>
                {position + 1}/{decisions.length}
              </span>
              <NavButton
                label="다음 결정"
                disabled={position >= decisions.length - 1}
                onClick={() => setSelected(position + 1 >= decisions.length - 1 ? null : position + 1)}
              >
                ▶
              </NavButton>
              {selected !== null && (
                <button type="button" onClick={() => setSelected(null)} className="ml-1 text-accent hover:underline">
                  최신
                </button>
              )}
            </div>
          )
        }
      >
        {!hasAi ? (
          <Placeholder>
            Human vs Human 모드입니다.
            <br />
            AI 상대를 선택하면 선택한 행동과 의사결정 근거(DecisionTrace)가 이곳에 시각화됩니다.
          </Placeholder>
        ) : !decision ? (
          <Placeholder>{thinking ? 'AI가 첫 수를 계산하고 있습니다…' : 'AI가 아직 수를 두지 않았습니다.'}</Placeholder>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="font-semibold text-ink">
                {traceAgentName(decision.trace)} · {PLAYER_LABEL[decision.trace.player]}
              </span>
              <span className="font-mono text-[11px] text-faint">
                ply {decision.index + 1} · {decision.trace.elapsedMs.toFixed(1)} ms
                {thinking && selected === null && <span className="ml-2 text-think">다음 수 계산 중…</span>}
              </span>
            </div>
            <TraceDetail key={decision.index} entry={decision.entry} bind={bind} showHeader={false} />
          </div>
        )}
      </Panel>

      <PositionMetrics state={state} />
    </div>
  );
}

function NavButton(props: { label: string; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded px-1.5 py-0.5 hover:bg-inset disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs leading-relaxed text-faint">
      {children}
    </div>
  );
}

/** Live engine metrics of the current position (independent of any AI). */
function PositionMetrics({ state }: { state: GameState }) {
  const metrics = useMemo(() => {
    const d0 = distanceToRow(state, state.pawns[0], goalRow(0));
    const d1 = distanceToRow(state, state.pawns[1], goalRow(1));
    return { d0, d1, pawnMoves: legalPawnMoves(state).length, wallMoves: legalWallPlacements(state).length };
  }, [state]);

  const mover = PLAYER_LABEL[state.currentPlayer];
  const rows: [string, string][] = [
    [`${PLAYER_LABEL[0]} 최단 거리`, String(metrics.d0)],
    [`${PLAYER_LABEL[1]} 최단 거리`, String(metrics.d1)],
    [`거리 차 (${PLAYER_LABEL[1]} − ${PLAYER_LABEL[0]})`, (metrics.d1 - metrics.d0 > 0 ? '+' : '') + (metrics.d1 - metrics.d0)],
    [`${mover} 합법 이동 수`, String(metrics.pawnMoves)],
    [`${mover} 합법 벽 설치 수`, String(metrics.wallMoves)],
  ];

  return (
    <Collapsible title="현재 포지션 지표">
      <dl className="space-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted">{label}</dt>
            <dd className="font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Collapsible>
  );
}
