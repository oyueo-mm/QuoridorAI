import type { RandomTrace } from '../../ai/types';
import { applyAction, formatAction } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import { PLAYER_LABEL } from '../theme';
import type { PreviewBinder } from './preview';

interface Props {
  entry: HistoryEntry;
  trace: RandomTrace;
  bind: PreviewBinder;
}

/** Shows exactly what the Random agent computed: the candidate set and the draw that picked one. */
export function RandomAnalysis({ entry, trace, bind }: Props) {
  const n = trace.candidateCount;
  const notation = formatAction(trace.chosenAction);
  const movePct = (trace.pawnMoveCount / n) * 100;
  const chosen = bind('chosen', () => ({
    state: applyAction(entry.stateBefore, trace.chosenAction),
    title: `ply ${trace.ply + 1} · Random이 고른 ${notation}`,
    highlight: { action: trace.chosenAction, player: trace.player },
    paths: [],
  }));

  return (
    <div className="space-y-4">
      <div
        role="button"
        {...chosen}
        className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-left transition-colors hover:border-amber-400/50 aria-pressed:border-amber-400/70"
      >
        <span className="text-[11px] text-slate-500">선택한 행동 · 마우스를 올리면 보드에 표시</span>
        <span className="mt-1 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold text-white">{notation}</span>
          <span className="text-xs text-slate-400">{trace.chosenAction.type === 'move' ? '말 이동' : '벽 설치'}</span>
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex justify-between text-xs text-slate-400">
          <span>후보 행동 (합법 행동 전체)</span>
          <span className="font-mono text-slate-200">{n}</span>
        </div>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded" aria-hidden>
          <span className="rounded-l bg-slate-300" style={{ width: `${movePct}%` }} />
          <span className="flex-1 rounded-r bg-amber-500" />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-300" />말 이동 {trace.pawnMoveCount}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />벽 설치 {trace.wallCount}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Stat label="개별 행동 확률" value={`1/${n} = ${((1 / n) * 100).toFixed(2)}%`} />
        <Stat label="벽을 고를 확률" value={`${((trace.wallCount / n) * 100).toFixed(1)}%`} />
        <Stat label="난수 r" value={trace.roll.toFixed(6)} />
        <Stat label="선택 인덱스 ⌊r·N⌋" value={`${trace.chosenIndex} / ${n - 1}`} />
        <Stat label="시드" value={String(trace.seed)} />
        <Stat label="결정 순번" value={`#${trace.decisionIndex + 1}`} />
      </dl>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Random AI는 행동을 평가하지 않습니다. {PLAYER_LABEL[trace.player]}의 합법 행동 {n}개를 엔진 순서(말 이동 →
        가로벽 → 세로벽)로 나열한 뒤, 시드 {trace.seed}의 난수열에서 뽑은 r로 하나를 고릅니다.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-200">{value}</dd>
    </div>
  );
}
