import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { MultiGreedyCandidate, MultiGreedyTrace, MultiMaxNCandidate, MultiMaxNTrace, MultiRandomTrace, MultiTrace } from '../../ai/multiAgent';
import { MAXN_WIN } from '../../ai/multiAgent';
import { TEAM_NAMES, applyActionMulti, formatAction, goalPathMulti, legalActionsMulti } from '../../engine';
import type { Action, MultiState } from '../../engine';
import type { MultiHistoryEntry, MultiSnapshot } from '../../session/MultiController';
import { usePreviewBinder } from '../analysis/usePreviewBinder';
import type { PreviewBinder } from '../analysis/preview';
import type { BoardOverlay } from '../board/overlay';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../theme';
import { Collapsible } from '../ui';
import { Panel } from './Panel';

interface Props {
  history: readonly MultiHistoryEntry[];
  thinking: MultiSnapshot['thinking'];
  paused: boolean;
  turnOrder: readonly number[];
  onPreview: (overlay: BoardOverlay | null) => void;
}

const ALGORITHM_NAME: Record<MultiTrace['algorithm'], string> = { 'multi-random': 'Random', 'multi-greedy': 'BFS / Greedy', 'multi-maxn': 'Max-N' };

/** Seat label by turn-order position (P1…Pn) and its colour. */
const slotOf = (trace: MultiTrace, seat: number) => trace.turnOrder.indexOf(seat);

/**
 * Analysis of the multi-player AIs. Everything shown is read from the trace the AI returned (what it
 * computed); candidate rows preview their board on hover / focus (click pins), with shortest paths
 * taken from the rules engine for the position after the action.
 */
export function MultiAnalysisPanel({ history, thinking, paused, turnOrder, onPreview }: Props) {
  const decisions = useMemo(() => history.flatMap((entry, index) => (entry.trace ? [{ entry, index, trace: entry.trace }] : [])), [history]);
  const [selected, setSelected] = useState<number | null>(null); // null = follow the latest decision
  const position = selected === null ? decisions.length - 1 : Math.min(selected, decisions.length - 1);
  const decision = decisions[position];
  const bind = usePreviewBinder(onPreview, `${history.length}:${position}`);

  return (
    <div className="space-y-4" data-multi-analysis>
      <Panel
        plain
        title="AI 분석"
        aside={
          decision && (
            <div className="flex items-center gap-1 font-mono text-[11px] text-muted">
              <button type="button" aria-label="이전 결정" disabled={position <= 0} onClick={() => setSelected(position - 1)} className="rounded px-1.5 py-0.5 hover:bg-inset disabled:opacity-30">
                ◀
              </button>
              <span>
                {position + 1}/{decisions.length}
              </span>
              <button
                type="button"
                aria-label="다음 결정"
                disabled={position >= decisions.length - 1}
                onClick={() => setSelected(position + 1 >= decisions.length - 1 ? null : position + 1)}
                className="rounded px-1.5 py-0.5 hover:bg-inset disabled:opacity-30"
              >
                ▶
              </button>
              {selected !== null && (
                <button type="button" onClick={() => setSelected(null)} className="ml-1 text-accent hover:underline">
                  최신
                </button>
              )}
            </div>
          )
        }
      >
        {thinking && (
          <p className="mb-2 rounded-lg bg-think/10 px-3 py-1.5 text-xs text-think" role="status" data-multi-thinking>
            {PLAYER_LABEL[turnOrder.indexOf(thinking.seat)]} 계산 중
            {thinking.progress ? ` — 깊이 ${thinking.progress.completedDepth}/${thinking.progress.depth} · 노드 ${thinking.progress.nodes.toLocaleString()} · ${(thinking.progress.elapsedMs / 1000).toFixed(1)}초` : '…'}
          </p>
        )}
        {!decision ? (
          <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs leading-relaxed text-faint">
            {paused ? 'AI 진행이 일시정지되어 있습니다.' : 'AI가 수를 두면 선택 근거와 계산 결과가 이곳에 나타납니다.'}
            <br />
            분석에 보이는 값은 AI가 실제로 계산한 값뿐입니다.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="font-semibold text-ink">
                {ALGORITHM_NAME[decision.trace.algorithm]} ·{' '}
                <span className={PLAYER_TEXT_CLASS[slotOf(decision.trace, decision.trace.player)]}>{PLAYER_LABEL[slotOf(decision.trace, decision.trace.player)]}</span>
                {decision.trace.teams && <span className="ml-1 font-normal text-muted">({TEAM_NAMES[decision.trace.teams[decision.trace.player]]})</span>}
              </span>
              <span className="font-mono text-[11px] text-faint">
                {decision.index + 1}수 · {decision.trace.elapsedMs.toFixed(1)} ms
              </span>
            </div>
            <p className="rounded-lg bg-inset px-3 py-2 text-xs text-ink-soft" data-multi-chosen>
              선택: <span className="font-mono font-semibold text-ink">{formatAction(decision.entry.action)}</span>
            </p>
            {decision.trace.algorithm === 'multi-random' && <RandomView trace={decision.trace} />}
            {decision.trace.algorithm === 'multi-greedy' && <GreedyView key={decision.index} entry={decision.entry} trace={decision.trace} bind={bind} />}
            {decision.trace.algorithm === 'multi-maxn' && <MaxNView key={decision.index} entry={decision.entry} trace={decision.trace} bind={bind} />}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- shared pieces

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-inset px-2.5 py-1.5" title={hint}>
      <dt className="text-[10px] text-faint">{label}</dt>
      <dd className="font-mono text-xs text-ink">{value}</dd>
    </div>
  );
}

function SeatHead({ trace, children }: { trace: MultiTrace; children?: (seat: number) => ReactNode }) {
  return (
    <>
      {trace.turnOrder.map((seat, slot) => (
        <th key={seat} className={`px-1 text-center font-semibold ${PLAYER_TEXT_CLASS[slot]}`} scope="col">
          {PLAYER_LABEL[slot]}
          {children?.(seat)}
        </th>
      ))}
    </>
  );
}

/** Utility of a position for one seat; huge values are wins / losses with the number of plies. */
function fmtUtility(v: number): string {
  if (v > MAXN_WIN - 200) return `승(${MAXN_WIN - Math.round(v)})`;
  if (v < -MAXN_WIN + 200) return `패(${Math.round(v) + MAXN_WIN})`;
  return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(2);
}

const paths = (state: MultiState) => state.rules.players.flatMap((_, seat) => {
  const path = goalPathMulti(state, seat);
  return path && path.length > 1 ? [{ player: seat, path }] : [];
});

function overlayAfter(entry: MultiHistoryEntry, actions: Action[], title: string): BoardOverlay {
  let state = entry.stateBefore;
  const marks: NonNullable<BoardOverlay['marks']> = [];
  actions.forEach((action, i) => {
    marks.push({ action, player: state.currentPlayer, label: String(i + 1) });
    state = applyActionMulti(state, action);
  });
  const first = marks[0];
  return { state, title, highlight: first && actions.length === 1 ? { action: first.action, player: first.player } : undefined, marks: actions.length > 1 ? marks : undefined, paths: paths(state) };
}

/** Replays a principal variation (notations) from `entry.stateBefore`; stops at the first move that no longer matches. */
function actionsOfNotations(entry: MultiHistoryEntry, notations: readonly string[]): Action[] {
  const out: Action[] = [];
  let state = entry.stateBefore;
  for (const n of notations) {
    const action = legalActionsMulti(state).find((a) => formatAction(a) === n);
    if (!action) break;
    out.push(action);
    state = applyActionMulti(state, action);
    if (state.winner !== null) break;
  }
  return out;
}

function beforeOverlay(entry: MultiHistoryEntry, title: string): BoardOverlay {
  return { state: entry.stateBefore, title, paths: paths(entry.stateBefore) };
}

// ---------------------------------------------------------------- Random

function RandomView({ trace }: { trace: MultiRandomTrace }) {
  return (
    <div className="space-y-2" data-analysis="multi-random">
      <p className="text-xs leading-relaxed text-ink-soft">Random AI는 평가나 탐색을 하지 않습니다. 합법 행동 전체에서 한 가지를 무작위로 뽑았습니다.</p>
      <dl className="grid grid-cols-3 gap-1.5">
        <Stat label="합법 행동" value={trace.candidateCount} />
        <Stat label="말 이동" value={trace.pawnMoveCount} />
        <Stat label="벽 설치" value={trace.wallCount} />
        <Stat label="시드" value={trace.seed} />
        <Stat label="난수 순번" value={trace.decisionIndex} hint="이 AI가 그 전에 둔 수의 개수 = 난수열에서의 위치" />
        <Stat label="난수 값" value={trace.roll.toFixed(6)} />
      </dl>
      <p className="text-[11px] text-faint">
        선택 번호 {trace.chosenIndex + 1}/{trace.candidateCount} = ⌊난수 × 합법 행동 수⌋ + 1 (말 이동이 먼저, 벽이 그다음 순서).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Greedy

function GreedyView({ entry, trace, bind }: { entry: MultiHistoryEntry; trace: MultiGreedyTrace; bind: PreviewBinder }) {
  const top = trace.candidates.slice(0, 10);
  const best = trace.candidates[0];
  const w = trace.weights;
  const teamed = !!trace.teams;
  return (
    <div className="space-y-3" data-analysis="multi-greedy">
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-soft" data-greedy-rationale>
        {trace.rationale.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">결정 직전 최단 거리 (클릭하면 경로 표시)</p>
        <table className="w-full text-xs" {...bind('before', () => beforeOverlay(entry, `${entry.stateBefore.ply}수 결정 직전 · 모든 플레이어의 최단 경로`))}>
          <thead>
            <tr className="text-[10px] text-faint">
              <SeatHead trace={trace} />
            </tr>
          </thead>
          <tbody>
            <tr className="font-mono">
              {trace.turnOrder.map((seat) => (
                <td key={seat} className="text-center">
                  {trace.before.distances[seat]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">
          후보 행동 {trace.totalCandidates}개를 모두 평가 · 상위 {top.length}개 (마우스를 올리면 그 수 이후의 보드)
        </p>
        <ol className="space-y-1">
          {top.map((c) => (
            <GreedyRow key={c.notation} c={c} trace={trace} entry={entry} bind={bind} chosen={c === best} />
          ))}
        </ol>
      </div>

      <Collapsible title="평가식과 가중치">
        <p className="mb-2 text-[11px] leading-relaxed text-faint">
          점수 = −{w.selfDistance}·내 거리{teamed ? ` − ${w.allyDistance}·아군 최단 거리` : ''} + {w.leaderDistance}·선두 상대 거리 + {w.opponentDistance}·상대 평균 거리 − 벽 비용({w.wallCost}+{w.wallScarcity}·사용 비율) −{' '}
          {w.opponentWinThreat}·(다음 수에 도착 가능한 상대){teamed ? ` + ${w.teamWinReady}·(아군 다음 수 도착 가능)` : ''}. 내 목표선에 바로 닿는 수는 승리로 최고점입니다. 거리는 모두 이 후보를 둔 뒤 BFS로 계산한 값입니다.
          {teamed && ' 팀전에서는 한 팀원이 도착하면 팀이 이기므로 각 팀의 거리는 가장 가까운 팀원 기준입니다.'}
        </p>
      </Collapsible>
    </div>
  );
}

/** The paths the AI kept for this candidate, else the engine's shortest paths of the position after it. */
function afterPaths(c: MultiGreedyCandidate, entry: MultiHistoryEntry) {
  const kept = (c.pathsAfter ?? []).flatMap((path, seat) => (path.length > 1 ? [{ player: seat, path }] : []));
  return kept.length ? kept : paths(applyActionMulti(entry.stateBefore, c.action));
}

function GreedyRow({ c, trace, entry, bind, chosen }: { c: MultiGreedyCandidate; trace: MultiGreedyTrace; entry: MultiHistoryEntry; bind: PreviewBinder; chosen: boolean }) {
  const t = c.terms;
  const parts: [string, number][] = [['내 거리', t.self], ['아군', t.ally], ['선두', t.leader], ['평균', t.opponents], ['벽', t.wall], ['위협', t.threat], ['준비', t.ready]];
  const handlers = bind(`g:${c.notation}`, () => ({
    state: applyActionMulti(entry.stateBefore, c.action),
    title: `#${c.rank} ${c.notation} 이후 · BFS가 계산한 경로`,
    highlight: { action: c.action, player: trace.player },
    paths: afterPaths(c, entry),
  }));
  return (
    <li className={`cursor-pointer rounded-lg border px-2 py-1.5 text-xs transition-colors hover:border-line-strong ${chosen ? 'border-accent bg-accent/5' : 'border-line-soft'}`} data-greedy-candidate={c.rank} {...handlers}>
      <div className="flex items-baseline gap-2">
        <span className="w-5 font-mono text-[10px] text-faint">#{c.rank}</span>
        <span className="font-mono font-semibold text-ink">{c.notation}</span>
        <span className="text-[10px] text-faint">{c.action.type === 'wall' ? '벽' : '이동'}</span>
        {c.immediateWin && <span className="rounded bg-good/10 px-1 text-[10px] text-good">승리</span>}
        {c.threats.length > 0 && <span className="rounded bg-danger/10 px-1 text-[10px] text-danger">위협 {c.threats.length}</span>}
        <span className="ml-auto font-mono text-ink">{c.immediateWin ? '승리' : c.score.toFixed(2)}</span>
      </div>
      <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted">
        <span title="이 수 이후 플레이어별 최단 거리">
          거리{' '}
          {trace.turnOrder.map((seat, slot) => (
            <span key={seat} className={`mr-1 ${PLAYER_TEXT_CLASS[slot]}`}>
              {c.distances[seat]}
              {c.distances[seat] !== trace.before.distances[seat] && <span className="text-faint">({c.distances[seat] > trace.before.distances[seat] ? '+' : ''}{c.distances[seat] - trace.before.distances[seat]})</span>}
            </span>
          ))}
        </span>
        {!c.immediateWin && (
          <span className="truncate text-faint">
            {parts.filter(([, v]) => v !== 0).map(([n, v]) => `${n} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join(' · ')}
          </span>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- Max-N

const STOP_TEXT: Record<MultiMaxNTrace['stopReason'], string> = {
  depth: '설정한 깊이까지 모두 탐색',
  time: '시간 예산 소진 — 마지막으로 끝낸 깊이의 결과 사용',
  nodes: '노드 예산 소진 — 마지막으로 끝낸 깊이의 결과 사용',
  'forced-win': '즉시 승리 수 발견',
  'single-move': '후보가 하나뿐',
  cancelled: '취소됨 — 마지막으로 끝낸 깊이의 결과 사용',
};

function MaxNView({ entry, trace, bind }: { entry: MultiHistoryEntry; trace: MultiMaxNTrace; bind: PreviewBinder }) {
  const top = trace.candidates.slice(0, 8);
  const s = trace.settings;
  return (
    <div className="space-y-3" data-analysis="multi-maxn">
      <dl className="grid grid-cols-3 gap-1.5">
        <Stat label="완료 깊이" value={`${trace.completedDepth} / ${s.maxDepth}`} hint="끝까지 탐색한 반복 심화의 깊이 / 설정한 최대 깊이" />
        <Stat label="노드 수" value={trace.nodes.toLocaleString()} hint="평가한 국면 수" />
        <Stat label="시간" value={`${trace.elapsedMs.toFixed(0)} ms`} hint={`예산 ${s.timeMs} ms`} />
        <Stat label="후보 행동" value={trace.candidates.length} hint="첫 수에서 탐색한 말 이동 전부 + 벽 후보" />
        <Stat label="벽 후보" value={`${trace.consideredWalls} / ${trace.legalWalls}`} hint="탐색한 벽 후보 / 합법 벽 전체 (휴리스틱으로 줄임)" />
        <Stat label="가지치기" value={trace.prunes} hint="이기는 수를 찾아 나머지를 건너뛴 횟수" />
        <Stat label="전치표 적중" value={s.transposition ? trace.ttHits.toLocaleString() : '꺼짐'} />
        <Stat label="전치표 저장" value={s.transposition ? trace.ttStores.toLocaleString() : '꺼짐'} />
        <Stat label="방식" value={trace.mode === 'team' ? '팀 Max-N' : '개인 Max-N'} />
      </dl>
      <p className="text-[11px] text-faint" data-maxn-stop>
        종료: {STOP_TEXT[trace.stopReason]}.
      </p>
      <p className="rounded-lg bg-inset px-3 py-2 text-[11px] leading-relaxed text-muted">
        {trace.mode === 'team'
          ? '팀전: 같은 팀은 평가값이 같고(팀 단위 효용), 차례마다 그 팀의 값을 최대화합니다. 팀원이 서로 완전히 협력한다고 보는 탐색이며, 개인전 Max-N과 다릅니다.'
          : '개인전: 각 플레이어가 자기 평가값을 최대화한다고 보고, 실제 차례 순서대로 평가 벡터를 올려 보냅니다.'}{' '}
        벽 후보는 상대의 최단 경로를 실제로 늘리는 벽만 골라 줄인 휴리스틱이라, 모든 합법 수를 탐색한 결과는 아닙니다.
      </p>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">후보 행동과 플레이어별 평가 벡터 (마우스를 올리면 예상 수순)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-maxn-candidates>
            <thead>
              <tr className="text-[10px] text-faint">
                <th className="px-1 text-left">#</th>
                <th className="px-1 text-left">수</th>
                <SeatHead trace={trace} />
              </tr>
            </thead>
            <tbody>
              {top.map((c) => (
                <MaxNRow key={c.notation} c={c} trace={trace} entry={entry} bind={bind} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-faint">값은 마지막으로 끝낸 깊이({trace.completedDepth})의 평가입니다. 굵은 칸이 그 수를 두는 플레이어의 값이며, 이 값이 가장 큰 수가 선택됩니다.</p>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-medium text-muted">예상 후속 수순</p>
        <p className="font-mono text-xs text-ink-soft" data-maxn-pv>
          {trace.pv.join(' → ') || '—'}
        </p>
      </div>

      <Collapsible title={`반복 심화 (${trace.iterations.length}회)`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-faint">
              <th className="px-1 text-left">깊이</th>
              <th className="px-1 text-right">노드</th>
              <th className="px-1 text-right">ms</th>
              <th className="px-1 text-left">최선</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {trace.iterations.map((it) => (
              <tr key={it.depth}>
                <td className="px-1">{it.depth}</td>
                <td className="px-1 text-right">{it.nodes.toLocaleString()}</td>
                <td className="px-1 text-right">{it.elapsedMs.toFixed(0)}</td>
                <td className="px-1">{it.bestNotation}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-faint">깊이 1 = 후보 각각의 정적 평가(탐색 없음)입니다.</p>
      </Collapsible>
    </div>
  );
}

function MaxNRow({ c, trace, entry, bind }: { c: MultiMaxNCandidate; trace: MultiMaxNTrace; entry: MultiHistoryEntry; bind: PreviewBinder }) {
  const handlers = bind(`m:${c.notation}`, () => {
    const actions = actionsOfNotations(entry, c.pv.length ? c.pv : [c.notation]);
    return overlayAfter(entry, actions, `#${c.rank} ${c.notation} · 예상 수순 ${actions.length}수 후`);
  });
  return (
    <tr className={`cursor-pointer border-t border-line-soft transition-colors hover:bg-inset ${c.rank === 1 ? 'bg-accent/5' : ''}`} data-maxn-candidate={c.rank} {...handlers}>
      <td className="px-1 font-mono text-[10px] text-faint">{c.rank}</td>
      <td className="px-1 font-mono font-semibold text-ink">{c.notation}</td>
      {trace.turnOrder.map((seat) => (
        <td key={seat} className={`px-1 text-center font-mono text-[11px] ${seat === trace.player ? 'font-bold text-ink' : 'text-muted'}`}>
          {fmtUtility(c.values[seat])}
        </td>
      ))}
    </tr>
  );
}

