import { TRACE_PATH_LIMIT, WIN_SCORE, wallPlacementCost } from '../../ai/bfsAgent';
import type { BfsCandidate, BfsTrace } from '../../ai/types';
import { applyAction, opponentOf } from '../../engine';
import type { PlayerId } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import type { BoardOverlay } from '../board/overlay';
import { PLAYER_BG_CLASS, PLAYER_LABEL } from '../theme';
import { fmtScore, signed } from './preview';
import type { PreviewBinder } from './preview';

interface Props {
  entry: HistoryEntry;
  trace: BfsTrace;
  bind: PreviewBinder;
}

/** Visualises the BFS agent's real evaluation: distances, score terms and the ranking. */
export function BfsAnalysis({ entry, trace, bind }: Props) {
  const me = trace.player;
  const opp = opponentOf(me);
  const best = trace.candidates[0];
  const top = trace.candidates.slice(0, TRACE_PATH_LIMIT);
  const wallCost = wallPlacementCost(trace.weights, trace.wallsRemaining);
  const moveCount = trace.candidates.filter((c) => c.action.type === 'move').length;
  const wallCandidates = trace.candidates.filter((c) => c.action.type === 'wall');
  const delaying = wallCandidates.filter((c) => c.opponentAfter > c.opponentBefore).length;
  const threatened = trace.candidates.filter((c) => c.opponentWinsNext).length;

  const afterOverlay = (c: BfsCandidate) => (): BoardOverlay => ({
    state: applyAction(entry.stateBefore, c.action),
    title: `#${c.rank} ${c.notation} 이후 · BFS가 계산한 경로`,
    highlight: { action: c.action, player: me },
    paths:
      c.selfPathAfter && c.opponentPathAfter
        ? [
            { player: me, path: c.selfPathAfter },
            { player: opp, path: c.opponentPathAfter },
          ]
        : [],
  });
  const beforeOverlay = (): BoardOverlay => ({
    state: entry.stateBefore,
    title: `ply ${trace.ply} 결정 직전 · BFS 최단 경로`,
    paths: [
      { player: me, path: trace.before.selfPath },
      { player: opp, path: trace.before.opponentPath },
    ],
  });

  // Bars compare scores among the listed candidates (min → max); a win always fills the bar.
  const finite = top.filter((c) => !c.immediateWin).map((c) => c.score);
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  const barWidth = (c: BfsCandidate) =>
    c.immediateWin || hi === lo ? 100 : 6 + (94 * (c.score - lo)) / (hi - lo);

  return (
    <div className="space-y-4">
      {/* Chosen action + rationale */}
      <div
        role="button"
        {...bind('chosen', afterOverlay(best))}
        className="block w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-left transition-colors hover:border-amber-400/50 aria-pressed:border-amber-400/70"
      >
        <span className="text-[11px] text-slate-500">선택한 행동 · 마우스를 올리면 평가 경로 표시, 클릭하면 고정</span>
        <span className="mt-1 flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-white">{best.notation}</span>
            <span className="text-xs text-slate-400">{best.action.type === 'move' ? '말 이동' : '벽 설치'}</span>
          </span>
          <span className="font-mono text-sm text-slate-200">
            {best.immediateWin ? '즉시 승리' : `점수 ${fmtScore(best.score)}`}
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

      {/* Path lengths before / after */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs text-slate-400">최단 경로 길이 (BFS, 말 무시)</h3>
          <button
            type="button"
            {...bind('before', beforeOverlay)}
            className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:border-amber-400/50 hover:text-slate-200 aria-pressed:border-amber-400/70"
          >
            결정 직전 경로 보기
          </button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="py-1 text-left font-normal">경로</th>
              <th className="py-1 text-right font-normal">평가 전</th>
              <th className="py-1 text-right font-normal">선택 후</th>
              <th className="py-1 text-right font-normal">변화</th>
            </tr>
          </thead>
          <tbody className="font-mono text-slate-200">
            <DistanceRow player={me} label="내 경로" before={best.selfBefore} after={best.selfAfter} />
            <DistanceRow player={opp} label="상대 경로" before={best.opponentBefore} after={best.opponentAfter} />
          </tbody>
        </table>
      </div>

      {/* Score formula with the weights actually used */}
      <div className="rounded-lg bg-slate-950/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-400">
        점수 = −{trace.weights.selfDistance}·d<sub>내</sub> + {trace.weights.opponentDistance}·d<sub>상대</sub>
        {' '}− 벽비용({wallCost.toFixed(2)}) − {trace.weights.opponentWinThreat}·[상대 즉시승리]
        <br />
        즉시 승리 = {WIN_SCORE} · 동점 시 말 이동 우선
      </div>

      {/* Top candidates */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-xs text-slate-400">상위 후보 비교</h3>
          <span className="text-[11px] text-slate-500">
            상위 {top.length} / 전체 {trace.candidates.length}
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="w-6 py-1 text-left font-normal">#</th>
              <th className="py-1 text-left font-normal">행동</th>
              <th className="py-1 text-right font-normal">내Δ</th>
              <th className="py-1 text-right font-normal">상대Δ</th>
              <th className="py-1 text-right font-normal">비용</th>
              <th className="w-[38%] py-1 pl-2 text-right font-normal">점수</th>
            </tr>
          </thead>
          <tbody>
            {top.map((c) => (
              <tr
                key={c.notation}
                {...bind(`cand-${c.rank}`, afterOverlay(c))}
                className={`cursor-pointer font-mono outline-none hover:bg-slate-800/70 focus:bg-slate-800/70 aria-pressed:bg-amber-400/10 ${
                  c.rank === 1 ? 'bg-slate-800/40' : ''
                }`}
              >
                <td className="py-1 text-slate-500">{c.rank}</td>
                <td className="py-1 text-slate-100">
                  {c.notation}
                  {c.immediateWin && <Badge tone="win">WIN</Badge>}
                  {c.opponentWinsNext && <Badge tone="threat">⚠ 위협</Badge>}
                </td>
                <td className="py-1 text-right text-slate-300">{signed(c.selfAfter - c.selfBefore)}</td>
                <td className="py-1 text-right text-slate-300">{signed(c.opponentAfter - c.opponentBefore)}</td>
                <td className="py-1 text-right text-slate-400">{c.terms.wall ? fmtScore(c.terms.wall) : '–'}</td>
                <td className="py-1 pl-2">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-2 flex-1 rounded-sm bg-slate-800">
                      <div className="h-2 rounded-sm bg-violet-400" style={{ width: `${barWidth(c)}%` }} />
                    </div>
                    <span className="w-12 text-right text-slate-200">{c.immediateWin ? 'WIN' : fmtScore(c.score)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] text-slate-500">
          행에 마우스를 올리면 해당 후보를 둔 뒤의 보드와 AI가 계산한 두 경로가 표시됩니다.
        </p>
      </div>

      {/* Candidate set summary */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <SummaryStat label="평가한 말 이동" value={moveCount} />
        <SummaryStat label="평가한 벽 설치" value={wallCandidates.length} />
        <SummaryStat label="상대 경로를 늘리는 벽" value={delaying} />
        <SummaryStat label="상대 즉시승리 허용 후보" value={threatened} />
      </dl>
    </div>
  );
}

function DistanceRow({ player, label, before, after }: { player: PlayerId; label: string; before: number; after: number }) {
  return (
    <tr>
      <td className="py-1 font-sans text-slate-300">
        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${PLAYER_BG_CLASS[player]}`} />
        {label} <span className="text-slate-500">({PLAYER_LABEL[player]})</span>
      </td>
      <td className="py-1 text-right">{before}</td>
      <td className="py-1 text-right">{after}</td>
      <td className="py-1 text-right text-slate-400">{signed(after - before)}</td>
    </tr>
  );
}

function Badge({ tone, children }: { tone: 'win' | 'threat'; children: string }) {
  return (
    <span
      className={`ml-1.5 rounded px-1 py-px font-sans text-[10px] ${
        tone === 'win' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
      }`}
    >
      {children}
    </span>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-slate-200">{value}</dd>
    </div>
  );
}
