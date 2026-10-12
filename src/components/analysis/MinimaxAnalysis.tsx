import { formatSearchScore } from '../../ai/minimaxAgent';
import { isDecisive } from '../../ai/search/evaluation';
import type { MinimaxTrace, RootCandidate, ScoreBound } from '../../ai/types';
import { opponentOf } from '../../engine';
import type { Action } from '../../engine';
import type { HistoryEntry } from '../../session/useGameSession';
import { PLAYER_LABEL } from '../theme';
import { lineOverlay } from './lineOverlay';
import type { PreviewBinder } from './preview';
import { SearchTreeView } from './SearchTreeView';

interface Props {
  entry: HistoryEntry;
  trace: MinimaxTrace;
  bind: PreviewBinder;
}

const CANDIDATE_LIMIT = 12;
const boundPrefix = (b: ScoreBound) => (b === 'upper' ? '≤ ' : b === 'lower' ? '≥ ' : '');
const n = (x: number) => x.toLocaleString();

/** Visualises the real Minimax / Alpha-Beta search: statistics, PV, iterations, candidates, tree. */
export function MinimaxAnalysis({ entry, trace, bind }: Props) {
  const { stats, settings } = trace;
  const me = trace.player;
  const opp = opponentOf(me);
  const best = trace.rootCandidates[0];
  const algo = settings.algorithm === 'alphabeta' ? 'Alpha-Beta' : 'Minimax';
  const nps = stats.elapsedMs > 0 ? Math.round((stats.nodes / stats.elapsedMs) * 1000) : 0;

  const pvOverlay = (k: number) => () => {
    const actions = trace.pv.slice(0, k);
    const atLeaf = k === trace.pv.length && trace.pvComplete && trace.pvLeaf.terminal === null;
    return lineOverlay(
      entry.stateBefore,
      actions,
      `PV ${k}/${trace.pv.length}수 진행${atLeaf ? ' · 끝 포지션의 평가 경로' : ''}`,
      atLeaf
        ? [
            { player: me, path: trace.pvLeaf.selfPath },
            { player: opp, path: trace.pvLeaf.opponentPath },
          ]
        : [],
    );
  };
  const candidateOverlay = (c: RootCandidate) => () => {
    const line: Action[] = c.reply ? [c.action, c.reply] : [c.action];
    return lineOverlay(
      entry.stateBefore,
      line,
      `#${c.rank} ${c.notation}${c.replyNotation ? ` → ${c.bound === 'exact' ? '예상 응수' : '반박 수'} ${c.replyNotation}` : ''}`,
    );
  };

  const exactScores = trace.rootCandidates.filter((c) => !isDecisive(c.score)).map((c) => c.score);
  const lo = Math.min(...exactScores);
  const hi = Math.max(...exactScores);
  const barWidth = (c: RootCandidate) =>
    isDecisive(c.score) ? (c.score > 0 ? 100 : 3) : hi === lo ? 100 : 6 + (94 * (c.score - lo)) / (hi - lo);
  const maxIterNodes = Math.max(...trace.iterations.map((i) => i.nodes));

  return (
    <div className="space-y-4">
      {/* Search statistics */}
      <div className="grid grid-cols-3 gap-2">
        <Tile
          label="도달 깊이"
          value={`${trace.completedDepth} / ${settings.maxDepth}`}
          note={trace.timedOut ? '시간 제한 도달' : trace.decided ? '승패 확정' : '최대 깊이 완료'}
          tone={trace.timedOut ? 'warn' : undefined}
        />
        <Tile label="방문 노드" value={n(stats.nodes)} note={`잎 ${n(stats.leaves)} · ${n(nps)}/s`} />
        <Tile label="소요 시간" value={`${stats.elapsedMs.toFixed(0)} ms`} note={settings.timeLimitMs ? `제한 ${n(settings.timeLimitMs)} ms` : '제한 없음'} />
        <Tile
          label="가지치기 (β 컷)"
          value={settings.algorithm === 'alphabeta' ? n(stats.cutoffs) : '–'}
          note={settings.algorithm === 'alphabeta' ? `건너뛴 후보 ${n(stats.prunedMoves)}` : 'Minimax: 가지치기 없음'}
        />
        <Tile
          label="TT 적중"
          value={settings.algorithm === 'alphabeta' && settings.transpositionTable ? n(stats.ttHits) : '–'}
          note={settings.transpositionTable && settings.algorithm === 'alphabeta' ? `조회 ${n(stats.ttProbes)} · 컷 ${n(stats.ttCutoffs)}` : '사용 안 함'}
        />
        <Tile
          label="루트 후보"
          value={`${trace.searchedActionCount}`}
          note={trace.searchedActionCount < trace.legalActionCount ? `합법 ${trace.legalActionCount} 중 (벽 필터)` : '합법 행동 전체'}
        />
      </div>

      {/* Chosen action */}
      <div
        role="button"
        {...bind('chosen', candidateOverlay(best))}
        className="block w-full cursor-pointer rounded-lg border border-line bg-paper/60 p-3 text-left transition-colors hover:border-warn/50 aria-pressed:border-warn/70"
      >
        <span className="text-[11px] text-faint">
          선택한 행동 · {algo} · 마우스를 올리면 예상 응수까지 표시, 클릭하면 고정
        </span>
        <span className="mt-1 flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold text-ink">{best.notation}</span>
            {best.replyNotation && (
              <span className="text-xs text-muted">
                예상 응수 <span className="font-mono text-ink">{best.replyNotation}</span>
              </span>
            )}
          </span>
          <span className="font-mono text-sm text-ink">{formatSearchScore(trace.score)}</span>
        </span>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-ink-soft">
          {trace.rationale.map((line, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-faint">›</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Principal variation */}
      <div>
        <h3 className="mb-1.5 text-xs text-muted">
          주 변화 (Principal Variation){!trace.pvComplete && <span className="ml-1 text-faint">· TT로 일부 생략</span>}
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          {trace.pvNotation.map((step, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-faint">→</span>}
              <span
                {...bind(`pv-${i}`, pvOverlay(i + 1))}
                className="cursor-pointer rounded border border-line bg-inset/70 px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none hover:border-warn/60 aria-pressed:border-warn/80"
              >
                <span className="mr-1 text-faint">{i + 1}</span>
                <span className={i % 2 === 0 ? 'text-ink' : 'text-ink-soft'}>{step}</span>
              </span>
            </span>
          ))}
        </div>
        {trace.pvLeaf.terminal === null && trace.pvComplete && (
          <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted">
            PV 끝 평가: d내 {trace.pvLeaf.selfDistance} · d상대 {trace.pvLeaf.opponentDistance} · 벽 {trace.pvLeaf.selfWalls}:
            {trace.pvLeaf.opponentWalls} · {trace.pvLeaf.toMove === me ? '내 차례' : '상대 차례'} → {trace.pvLeaf.score.toFixed(2)}
            {trace.pvLeaf.matchesScore ? ' ✓ 탐색 점수와 일치' : ''}
          </p>
        )}
        <p className="mt-1 font-mono text-[11px] text-faint">
          평가식: −{settings.evaluation.selfDistance}·d내 + {settings.evaluation.opponentDistance}·d상대 +{' '}
          {settings.evaluation.wallDifference}·(벽내 − 벽상대) ± {settings.evaluation.tempo}(차례) · 점수는 {PLAYER_LABEL[me]} 관점
        </p>
      </div>

      {/* Iterative deepening */}
      <div>
        <h3 className="mb-1.5 text-xs text-muted">반복 심화 (Iterative Deepening)</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-faint">
              <th className="py-1 text-left font-normal">깊이</th>
              <th className="py-1 text-left font-normal">최선</th>
              <th className="py-1 text-right font-normal">점수</th>
              <th className="w-[34%] py-1 pl-2 text-right font-normal">노드</th>
              <th className="py-1 text-right font-normal">ms</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {trace.iterations.map((it) => (
              <tr key={it.depth}>
                <td className="py-0.5 text-muted">{it.depth}</td>
                <td className="py-0.5 text-ink">{it.best}</td>
                <td className="py-0.5 text-right text-ink">{formatSearchScore(it.score)}</td>
                <td className="py-0.5 pl-2">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 flex-1 rounded-sm bg-inset">
                      <div className="h-1.5 rounded-sm bg-think-strong" style={{ width: `${Math.max(3, (100 * it.nodes) / maxIterNodes)}%` }} />
                    </div>
                    <span className="w-12 text-right text-ink-soft">{n(it.nodes)}</span>
                  </div>
                </td>
                <td className="py-0.5 text-right text-muted">{it.elapsedMs.toFixed(0)}</td>
              </tr>
            ))}
            {trace.timedOut && (
              <tr>
                <td className="py-0.5 text-warn">{trace.completedDepth + 1}</td>
                <td colSpan={4} className="py-0.5 font-sans text-[11px] text-warn/80">
                  시간 제한으로 중단 — 결과를 버리고 깊이 {trace.completedDepth}의 수를 사용
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Root candidates */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-xs text-muted">후보 행동 평가 (깊이 {trace.completedDepth})</h3>
          <span className="text-[11px] text-faint">
            상위 {Math.min(CANDIDATE_LIMIT, trace.rootCandidates.length)} / {trace.rootCandidates.length}
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-faint">
              <th className="w-6 py-1 text-left font-normal">#</th>
              <th className="py-1 text-left font-normal">행동</th>
              <th className="py-1 text-left font-normal">상대 응수</th>
              <th className="w-[36%] py-1 pl-2 text-right font-normal">점수</th>
            </tr>
          </thead>
          <tbody>
            {trace.rootCandidates.slice(0, CANDIDATE_LIMIT).map((c) => (
              <tr
                key={c.notation}
                {...bind(`cand-${c.rank}`, candidateOverlay(c))}
                className={`cursor-pointer font-mono outline-none hover:bg-inset/70 focus:bg-inset/70 aria-pressed:bg-warn/10 ${
                  c.rank === 1 ? 'bg-inset/40' : ''
                }`}
              >
                <td className="py-1 text-faint">{c.rank}</td>
                <td className="py-1 text-ink">{c.notation}</td>
                <td className="py-1 text-muted">
                  {c.replyNotation ?? '–'}
                  {c.replyNotation && c.bound === 'upper' && <span className="ml-1 font-sans text-[10px] text-think">반박</span>}
                </td>
                <td className="py-1 pl-2">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-2 flex-1 rounded-sm bg-inset">
                      <div
                        className={`h-2 rounded-sm ${c.bound === 'exact' ? 'bg-think-strong' : 'bg-think/35'}`}
                        style={{ width: `${barWidth(c)}%` }}
                      />
                    </div>
                    <span className="w-[4.5rem] text-right text-ink">
                      {boundPrefix(c.bound)}
                      {formatSearchScore(c.score)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          ≤ 표시는 Alpha-Beta가 &lsquo;이 값보다 좋을 수 없음&rsquo;만 증명하고 잘라낸 후보입니다(연한 막대). &lsquo;반박&rsquo;은 그 증명에 쓰인
          상대의 수입니다. 행에 마우스를 올리면 후보와 응수가 보드에 번호로 표시됩니다.
        </p>
      </div>

      {/* Search tree */}
      <div>
        <h3 className="mb-1.5 text-xs text-muted">탐색 트리 (주요 분기)</h3>
        <SearchTreeView key={`${entry.stateBefore.ply}`} trace={trace} stateBefore={entry.stateBefore} bind={bind} />
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          주황 = 주 변화, 점선 = 경계값(≤/≥), ■ = 종료 포지션. 루트의 자식과 손자까지만 기록하며 각 단계의 상위 노드만 표시하고
          나머지는 요약합니다. 상대 응수는 {PLAYER_LABEL[me]}에게 가장 불리한 수부터 정렬됩니다.
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'warn' }) {
  return (
    <div className="rounded-lg bg-paper/60 px-2.5 py-2">
      <div className="text-[10.5px] text-faint">{label}</div>
      <div className="font-mono text-sm font-semibold text-ink">{value}</div>
      <div className={`truncate text-[10px] ${tone === 'warn' ? 'text-warn' : 'text-faint'}`} title={note}>
        {note}
      </div>
    </div>
  );
}
