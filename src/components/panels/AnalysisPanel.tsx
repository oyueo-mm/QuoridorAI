import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { agentName } from '../../ai/catalog';
import { distanceToRow, goalRow, legalPawnMoves, legalWallPlacements } from '../../engine';
import type { GameState } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import { BfsAnalysis } from '../analysis/BfsAnalysis';
import { MctsAnalysis } from '../analysis/MctsAnalysis';
import { MinimaxAnalysis } from '../analysis/MinimaxAnalysis';
import type { PreviewBinder } from '../analysis/preview';
import { RandomAnalysis } from '../analysis/RandomAnalysis';
import type { BoardOverlay } from '../board/overlay';
import { PLAYER_LABEL } from '../theme';
import { Panel } from './Panel';

interface AnalysisPanelProps {
  state: GameState;
  history: readonly HistoryEntry[];
  hasAi: boolean;
  thinking: boolean;
  onPreview: (overlay: BoardOverlay | null) => void;
}

interface ActivePreview {
  key: string;
  overlay: BoardOverlay;
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
  const [hovered, setHovered] = useState<ActivePreview | null>(null);
  const [pinned, setPinned] = useState<ActivePreview | null>(null);

  const position = selected === null ? decisions.length - 1 : Math.min(selected, decisions.length - 1);
  const decision = decisions[position];

  // A new move invalidates any preview built on the previous board.
  useEffect(() => {
    setHovered(null);
    setPinned(null);
  }, [history.length, position]);

  const active = hovered ?? pinned;
  useEffect(() => onPreview(active?.overlay ?? null), [active, onPreview]);
  useEffect(() => () => onPreview(null), [onPreview]);

  const bind: PreviewBinder = useCallback(
    (key, build) => {
      const show = () => setHovered((h) => (h?.key === key ? h : { key, overlay: build() }));
      const hide = () => setHovered((h) => (h?.key === key ? null : h));
      return {
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
        onClick: () => setPinned((p) => (p?.key === key ? null : { key, overlay: build() })),
        tabIndex: 0,
        'aria-pressed': pinned?.key === key,
      };
    },
    [pinned],
  );

  return (
    <div className="space-y-4">
      <Panel
        title="AI 분석"
        aside={
          decision && (
            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
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
                <button type="button" onClick={() => setSelected(null)} className="ml-1 text-sky-400 hover:underline">
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
              <span className="font-semibold text-slate-200">
                {agentName(
                  decision.trace.algorithm === 'mcts' && decision.trace.settings.variant === 'guided' ? 'mcts-guided' : decision.trace.algorithm,
                )}{' '}
                · {PLAYER_LABEL[decision.trace.player]}
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                ply {decision.index + 1} · {decision.trace.elapsedMs.toFixed(1)} ms
                {thinking && selected === null && <span className="ml-2 text-violet-300">다음 수 계산 중…</span>}
              </span>
            </div>
            {decision.trace.algorithm === 'random' ? (
              <RandomAnalysis entry={decision.entry} trace={decision.trace} bind={bind} />
            ) : decision.trace.algorithm === 'bfs' ? (
              <BfsAnalysis entry={decision.entry} trace={decision.trace} bind={bind} />
            ) : decision.trace.algorithm === 'minimax' ? (
              <MinimaxAnalysis key={decision.index} entry={decision.entry} trace={decision.trace} bind={bind} />
            ) : (
              <MctsAnalysis key={decision.index} entry={decision.entry} trace={decision.trace} bind={bind} />
            )}
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
      className="rounded px-1.5 py-0.5 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {props.children}
    </button>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs leading-relaxed text-slate-500">
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
    <Panel title="현재 포지션 지표">
      <dl className="space-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-slate-400">{label}</dt>
            <dd className="font-mono text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
