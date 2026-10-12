import { useEffect, useState } from 'react';
import type { MctsCandidate, MctsTrace } from '../../ai/types';
import type { Action } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import { PLAYER_LABEL } from '../theme';
import { lineOverlay } from './lineOverlay';
import { MctsVisitChart } from './MctsVisitChart';
import type { PreviewBinder } from './preview';

interface Props {
  entry: HistoryEntry;
  trace: MctsTrace;
  bind: PreviewBinder;
}

const CANDIDATE_LIMIT = 12;
const n = (x: number) => x.toLocaleString();
const q = (x: number) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(3);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const ROLLOUT_LABEL: Record<MctsTrace['settings']['rollout'], string> = {
  uniform: '균등 무작위',
  balanced: '이동/벽 균형',
  heuristic: 'BFS 휴리스틱',
};
const STOP_LABEL: Record<MctsTrace['stopReason'], string> = {
  iterations: '횟수 한도',
  time: '시간 제한',
  'proven-win': '승리 증명',
  'proven-loss': '패배 증명',
  'single-move': '유일한 수',
};

/** Visualises a real MCTS run: budget use, visit distribution, replay of the search, PV. */
export function MctsAnalysis({ entry, trace, bind }: Props) {
  const { settings } = trace;
  const puctMode = settings.selection === 'puct';
  const best = trace.candidates[0];
  const top = trace.candidates.slice(0, CANDIDATE_LIMIT);
  const maxVisits = Math.max(1, ...top.map((c) => c.visits));
  const series = [...trace.candidates].sort((a, b) => b.visits - a.visits).slice(0, 4).map((c) => c.notation);
  const [frame, setFrame] = useState(trace.snapshots.length - 1);
  const [playing, setPlaying] = useState(false);
  const snap = trace.snapshots[frame];
  const sps = trace.elapsedMs > 0 ? Math.round((trace.simulations / trace.elapsedMs) * 1000) : 0;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setFrame((f) => {
        if (f >= trace.snapshots.length - 1) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, 140);
    return () => clearInterval(id);
  }, [playing, trace.snapshots.length]);

  const candidateOverlay = (c: MctsCandidate) => () => {
    const line: Action[] = c.reply ? [c.action, c.reply.action] : [c.action];
    return lineOverlay(
      entry.stateBefore,
      line,
      `${c.notation} (${n(c.visits)}회, Q ${q(c.q)})${c.reply ? ` → 최다 응수 ${c.reply.notation}` : ''}`,
    );
  };
  const pvOverlay = (k: number) => () =>
    lineOverlay(entry.stateBefore, trace.pv.slice(0, k).map((p) => p.action), `최다 방문 경로 ${k}/${trace.pv.length}수`);

  return (
    <div className="space-y-4">
      {/* Budget / statistics */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="시뮬레이션" value={n(trace.simulations)} note={`한도 ${n(settings.iterations)} · ${n(sps)}/s`} />
        <Tile label="소요 시간" value={`${trace.elapsedMs.toFixed(0)} ms`} note={settings.timeLimitMs ? `제한 ${n(settings.timeLimitMs)} ms` : '제한 없음'} />
        <Tile label="종료 사유" value={STOP_LABEL[trace.stopReason]} note={`seed ${trace.seed}`} tone={trace.stopReason === 'time' ? 'warn' : undefined} />
        <Tile label="트리 노드" value={n(trace.treeNodes)} note={`최대 깊이 ${trace.maxTreeDepth} · 상한 ${n(settings.maxNodes)}`} />
        <Tile
          label="롤아웃"
          value={`${ROLLOUT_LABEL[settings.rollout]}`}
          note={`평균 ${trace.rollouts.avgPlies.toFixed(1)} ply · 최대 ${settings.rolloutMaxPlies}`}
        />
        <Tile
          label="종료 / 절단"
          value={`${n(trace.rollouts.terminal)} / ${n(trace.rollouts.truncated)}`}
          note={`트리 내 확정 ${n(trace.rollouts.treeTerminal)}`}
          tone={settings.variant === 'pure' && trace.rollouts.truncated > trace.rollouts.terminal ? 'warn' : undefined}
        />
      </div>

      {/* Chosen action */}
      <div
        role="button"
        {...bind('chosen', candidateOverlay(best))}
        className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-left transition-colors hover:border-amber-400/50 aria-pressed:border-amber-400/70"
      >
        <span className="text-[11px] text-slate-500">
          최종 선택 · {trace.selectionRule === 'proven-win' ? '승리 증명 수' : '최다 방문 수'} · 마우스를 올리면 최다 응수까지 표시
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-white">{best.notation}</span>
            {best.reply && (
              <span className="text-xs text-slate-400">
                최다 응수 <span className="font-mono text-slate-200">{best.reply.notation}</span>
              </span>
            )}
          </span>
          <span className="text-right font-mono text-xs text-slate-200">
            N {n(best.visits)} ({pct(best.share)})
            <br />Q {q(best.q)}
          </span>
        </span>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-300">
          {trace.rationale.map((line, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-slate-600">›</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Visit distribution */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-xs text-slate-400">탐색 분포 (후보별 방문 횟수 N)</h3>
          <span className="text-[11px] text-slate-500">
            상위 {top.length} / 탐색 후보 {trace.searchedActionCount} (합법 {trace.legalActionCount})
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="w-6 py-1 text-left font-normal">#</th>
              <th className="py-1 text-left font-normal">행동</th>
              <th className="w-[36%] py-1 text-left font-normal">N</th>
              <th className="py-1 text-right font-normal">Q</th>
              {puctMode && <th className="py-1 text-right font-normal">P</th>}
              <th className="py-1 text-right font-normal">{puctMode ? 'PUCT' : 'UCT'}</th>
              <th className="py-1 pl-2 text-left font-normal">최다 응수</th>
            </tr>
          </thead>
          <tbody>
            {top.map((c) => (
              <tr
                key={c.notation}
                {...bind(`cand-${c.rank}`, candidateOverlay(c))}
                className={`cursor-pointer font-mono outline-none hover:bg-slate-800/70 focus:bg-slate-800/70 aria-pressed:bg-amber-400/10 ${
                  c.rank === 1 ? 'bg-slate-800/40' : ''
                }`}
              >
                <td className="py-1 text-slate-500">{c.rank}</td>
                <td className="py-1 text-slate-100">
                  {c.notation}
                  {c.proven && (
                    <span
                      className={`ml-1 rounded px-1 font-sans text-[10px] ${
                        c.proven === 'win' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {c.proven === 'win' ? '✓ 승리' : '✗ 패배'}
                    </span>
                  )}
                </td>
                <td className="py-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 flex-1 rounded-sm bg-slate-800">
                      <div className="h-2 rounded-sm bg-sky-500" style={{ width: `${Math.max(2, (100 * c.visits) / maxVisits)}%` }} />
                    </div>
                    <span className="w-10 text-right text-slate-300">{n(c.visits)}</span>
                  </div>
                </td>
                <td className="py-1 text-right text-slate-200">{q(c.q)}</td>
                {puctMode && <td className="py-1 text-right text-slate-400">{c.prior === undefined ? '–' : c.prior.toFixed(2)}</td>}
                <td className="py-1 text-right text-slate-400">{c.uct === null ? '–' : c.uct.toFixed(3)}</td>
                <td className="py-1 pl-2 text-slate-400">{c.reply?.notation ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          Q = 이 수를 거친 시뮬레이션의 평균 가치({PLAYER_LABEL[trace.player]} 관점, −1~+1).{' '}
          {puctMode
            ? `PUCT = Q + ${settings.puctConstant}·P·√N부모 / (1 + N), P = 1수 평가의 softmax(τ = ${settings.priorTemperature}). 사전 확률이 낮은 수는 확장되지 않을 수 있습니다.`
            : `UCT = Q + ${settings.exploration}·√(ln N부모 / N).`}
          행에 마우스를 올리면 후보와 최다 응수가 보드에 표시됩니다.
        </p>
      </div>

      {/* Replay */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-xs text-slate-400">탐색 재생 (방문 비율 변화)</h3>
          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <button
              type="button"
              onClick={() => {
                if (!playing && frame >= trace.snapshots.length - 1) setFrame(0);
                setPlaying(!playing);
              }}
              className="rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:border-sky-500"
            >
              {playing ? '❚❚ 정지' : '▶ 재생'}
            </button>
            <span>
              {n(snap?.simulations ?? 0)}회 · {(snap?.elapsedMs ?? 0).toFixed(0)}ms
            </span>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, trace.snapshots.length - 1)}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            setFrame(Number(e.target.value));
          }}
          className="w-full accent-sky-500"
          aria-label="탐색 스냅샷"
        />
        <MctsVisitChart
          snapshots={trace.snapshots}
          series={series}
          marker={frame}
          onSelect={(i) => {
            setPlaying(false);
            setFrame(i);
          }}
        />
        {snap && (
          <div className="mt-2 space-y-1">
            {snap.top.map((t) => (
              <div key={t.notation} className="flex items-center gap-2 font-mono text-[11px]">
                <span className="w-10 text-slate-100">{t.notation}</span>
                <div className="h-2 flex-1 rounded-sm bg-slate-800">
                  <div
                    className="h-2 rounded-sm bg-sky-500 transition-[width] duration-100"
                    style={{ width: `${Math.max(1, (100 * t.visits) / Math.max(1, snap.simulations))}%` }}
                  />
                </div>
                <span className="w-24 text-right text-slate-400">
                  {n(t.visits)} · Q {q(t.q)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          스냅샷 {trace.snapshots.length}개 (각 시점의 상위 {Math.max(0, ...trace.snapshots.map((s) => s.top.length))}개 후보만 기록, 개수가 넘치면 간격을 두 배로 늘려 메모리를 제한).
        </p>
      </div>

      {/* Most visited line */}
      <div>
        <h3 className="mb-1.5 text-xs text-slate-400">최다 방문 경로</h3>
        <div className="flex flex-wrap items-center gap-1">
          {trace.pv.map((step, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-600">→</span>}
              <span
                {...bind(`pv-${i}`, pvOverlay(i + 1))}
                className="cursor-pointer rounded border border-slate-700 bg-slate-800/70 px-1.5 py-0.5 font-mono text-[11px] text-slate-100 outline-none hover:border-amber-400/60 aria-pressed:border-amber-400/80"
                title={`N ${step.visits}, Q ${q(step.q)} (두는 쪽 관점)`}
              >
                <span className="mr-1 text-slate-500">{i + 1}</span>
                {step.notation}
                <span className="ml-1 text-slate-500">{n(step.visits)}</span>
              </span>
            </span>
          ))}
        </div>
      </div>

      <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
        <span className="text-slate-300">가치 규칙:</span> {trace.valueRule}
      </p>
    </div>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg bg-slate-950/60 px-2.5 py-2">
      <div className="text-[10.5px] text-slate-500">{label}</div>
      <div className="truncate font-mono text-sm font-semibold text-slate-100" title={value}>
        {value}
      </div>
      <div className={`truncate text-[10px] ${tone === 'warn' ? 'text-amber-300' : 'text-slate-500'}`} title={note}>
        {note}
      </div>
    </div>
  );
}
