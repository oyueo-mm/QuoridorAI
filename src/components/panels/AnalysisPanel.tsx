import { useMemo } from 'react';
import { distanceToRow, goalRow, legalPawnMoves, legalWallPlacements } from '../../engine';
import type { GameState } from '../../engine';
import { PLAYER_LABEL } from '../theme';
import { Panel } from './Panel';

/**
 * Right-hand analysis area. In stage 1 it only shows engine-level position metrics;
 * AI DecisionTrace visualisations (search tree, visit counts, policy, …) will plug in here.
 */
export function AnalysisPanel({ state }: { state: GameState }) {
  const metrics = useMemo(() => {
    const d0 = distanceToRow(state, state.pawns[0], goalRow(0));
    const d1 = distanceToRow(state, state.pawns[1], goalRow(1));
    return {
      d0,
      d1,
      pawnMoves: legalPawnMoves(state).length,
      wallMoves: legalWallPlacements(state).length,
    };
  }, [state]);

  const mover = PLAYER_LABEL[state.currentPlayer];
  const rows: [string, string][] = [
    [`${PLAYER_LABEL[0]} 최단 거리`, String(metrics.d0)],
    [`${PLAYER_LABEL[1]} 최단 거리`, String(metrics.d1)],
    [`거리 차 (${PLAYER_LABEL[1]} − ${PLAYER_LABEL[0]})`, formatSigned(metrics.d1 - metrics.d0)],
    [`${mover} 합법 이동 수`, String(metrics.pawnMoves)],
    [`${mover} 합법 벽 설치 수`, String(metrics.wallMoves)],
  ];

  return (
    <div className="space-y-4">
      <Panel
        title="AI 분석"
        aside={<span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">STAGE 2+</span>}
      >
        <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs leading-relaxed text-slate-500">
          AI 상대를 선택하면 선택한 행동과
          <br />
          의사결정 근거(DecisionTrace)가 이곳에 시각화됩니다.
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {['최단 경로', '탐색 트리', '평가 함수', '방문 횟수', '정책 확률'].map((t) => (
              <span key={t} className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-400">
                {t}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="포지션 지표">
        <dl className="space-y-1.5 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <dt className="text-slate-400">{label}</dt>
              <dd className="font-mono text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
