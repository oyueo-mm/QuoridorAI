import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_BUDGET, agentLabel, defaultSpec, workerFactory } from '../arena/agentSpec';
import type { AgentSpec, Budget } from '../arena/agentSpec';
import { MatchSession } from '../arena/MatchSession';
import type { ArenaConfig, ArenaMove } from '../arena/MatchSession';
import { parseMoveList } from '../arena/openings';
import { TraceDetail, traceAgentName } from '../components/analysis/TraceDetail';
import { usePreviewBinder } from '../components/analysis/usePreviewBinder';
import { AgentPicker, BudgetBadge, BudgetPicker } from '../components/arena/AgentPicker';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import type { BoardOverlay } from '../components/board/overlay';
import { Panel } from '../components/panels/Panel';
import { SearchProgressBar } from '../components/panels/SearchProgressBar';
import { PLAYER_COLOR, PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import type { GameState } from '../engine';
import { describeHalt } from '../match/outcome';
import type { MatchStatus } from '../match/outcome';

interface Draft {
  /** By seat: [P1, P2]. */
  agents: [AgentSpec, AgentSpec];
  budget: Budget;
  seed: number;
  openingMode: 'random' | 'moves';
  openingSeed: number;
  openingPlies: number;
  moveText: string;
  maxPlies: number;
  repetitionLimit: number;
  maxComputeS: number;
}

const INITIAL: Draft = {
  agents: [defaultSpec('alphabeta'), defaultSpec('mcts-guided')],
  budget: DEFAULT_BUDGET,
  seed: 1,
  openingMode: 'random',
  openingSeed: 1,
  openingPlies: 0,
  moveText: '',
  maxPlies: 200,
  repetitionLimit: 3,
  maxComputeS: 300,
};

function toConfig(d: Draft): ArenaConfig {
  return {
    agents: d.agents,
    budget: d.budget,
    seed: d.seed,
    opening: d.openingMode === 'moves' ? { moves: d.moveText } : { seed: d.openingSeed, plies: d.openingPlies },
    maxPlies: d.maxPlies,
    repetitionLimit: d.repetitionLimit > 0 ? d.repetitionLimit : null,
    maxComputeMs: d.maxComputeS > 0 ? d.maxComputeS * 1000 : null,
  };
}

interface ArchivedMatch {
  matchId: number;
  labels: [string, string];
  status: MatchStatus;
  start: GameState;
  final: GameState;
  moves: readonly ArenaMove[];
  budget: Budget;
}

const MAX_ARCHIVE = 10;
const numberClass =
  'w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-sm text-slate-200 focus:border-sky-500 focus:outline-none';

function resultText(status: MatchStatus, labels: [string, string]): { text: string; tone: string } {
  if (status.kind === 'win') return { text: `${PLAYER_LABEL[status.winner]} ${labels[status.winner]} 승리`, tone: PLAYER_TEXT_CLASS[status.winner] };
  if (status.kind === 'halted') return { text: `실험 중단 — ${describeHalt(status)} (승패 없음)`, tone: 'text-amber-300' };
  return { text: '진행 중', tone: 'text-slate-300' };
}

/** AI vs AI: live viewing with play / pause / step / stop, replays and per-move DecisionTraces. */
export function ArenaView({ onCompare }: { onCompare: (state: GameState, label: string) => void }) {
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [delay, setDelay] = useState(400);
  const [session] = useState(() => new MatchSession(toConfig(INITIAL), workerFactory, 400));
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [archive, setArchive] = useState<ArchivedMatch[]>([]);
  const [viewing, setViewing] = useState<number | null>(null); // archived matchId or null = live
  const [cursor, setCursor] = useState<number | null>(null); // ply index into moves; null = latest
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null);
  const [series, setSeries] = useState({ total: 4, swap: true, active: false, played: 0 });
  const archived = useRef(new Set<number>());

  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => session.setDelay(delay), [session, delay]);

  const labels: [string, string] = [agentLabel(snap.config.agents[0], snap.config.budget), agentLabel(snap.config.agents[1], snap.config.budget)];

  // Archive finished matches (bounded) and drive an automatic series.
  useEffect(() => {
    if (snap.phase !== 'finished' || archived.current.has(snap.matchId)) return;
    archived.current.add(snap.matchId);
    setArchive((a) => [{ matchId: snap.matchId, labels, status: snap.status, start: snap.start, final: snap.game, moves: snap.moves, budget: snap.config.budget }, ...a].slice(0, MAX_ARCHIVE));
    if (series.active) {
      const played = series.played + 1;
      if (played >= series.total) {
        setSeries((s) => ({ ...s, active: false, played }));
        return;
      }
      setSeries((s) => ({ ...s, played }));
      const timer = setTimeout(() => {
        const next = series.swap ? { ...snap.config, agents: [snap.config.agents[1], snap.config.agents[0]] as [AgentSpec, AgentSpec], seed: snap.config.seed + 1 } : { ...snap.config, seed: snap.config.seed + 1 };
        session.restart(next);
        setCursor(null);
        session.play();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [snap.phase, snap.matchId]);

  // What is on screen: the live match or an archived one.
  const shown = viewing === null ? null : archive.find((m) => m.matchId === viewing) ?? null;
  const moves = shown ? shown.moves : snap.moves;
  const start = shown ? shown.start : snap.start;
  const final = shown ? shown.final : snap.game;
  const shownLabels = shown ? shown.labels : labels;
  const shownStatus = shown ? shown.status : snap.status;
  const ply = cursor === null ? moves.length : Math.min(cursor, moves.length);
  const boardState = ply === 0 ? start : ply < moves.length ? moves[ply].stateBefore : final;
  const selectedMove = ply > 0 ? moves[ply - 1] : undefined;
  const bind = usePreviewBinder(setOverlay, `${viewing}:${ply}:${moves.length}`);

  const moveListRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (cursor === null) moveListRef.current?.scrollTo({ top: moveListRef.current.scrollHeight });
  }, [moves.length, cursor]);

  const parsed = useMemo(() => (draft.openingMode === 'moves' ? parseMoveList(draft.moveText) : null), [draft.openingMode, draft.moveText]);
  const draftInvalid = parsed?.error !== undefined || (parsed !== null && parsed.positions.at(-1)!.winner !== null);

  const apply = (autoplay: boolean, seriesMode = false) => {
    setViewing(null);
    setCursor(null);
    session.restart(toConfig(draft));
    if (seriesMode) setSeries((s) => ({ ...s, active: true, played: 0 }));
    if (autoplay) session.play();
  };

  const result = resultText(shownStatus, shownLabels);
  const live = viewing === null;
  const running = live && snap.phase === 'running';

  return (
    <main className="mx-auto grid max-w-[1440px] gap-4 p-4 sm:p-6 lg:grid-cols-[280px_minmax(0,1fr)_380px] xl:grid-cols-[300px_minmax(0,1fr)_420px]">
      {/* ------------------------------------------------ setup */}
      <aside className="order-2 space-y-4 lg:order-1">
        <Panel title="대국 설정" aside={<BudgetBadge budget={draft.budget} />}>
          <div className="space-y-4">
            <AgentPicker label="P1 (선공)" accent={PLAYER_COLOR[0]} value={draft.agents[0]} budget={draft.budget} onChange={(a) => setDraft({ ...draft, agents: [a, draft.agents[1]] })} />
            <button
              type="button"
              onClick={() => setDraft({ ...draft, agents: [draft.agents[1], draft.agents[0]] })}
              className="w-full rounded-md border border-slate-700 py-1 text-xs text-slate-300 hover:border-sky-500"
            >
              ⇅ 선공·후공 교환
            </button>
            <AgentPicker label="P2 (후공)" accent={PLAYER_COLOR[1]} value={draft.agents[1]} budget={draft.budget} onChange={(a) => setDraft({ ...draft, agents: [draft.agents[0], a] })} />
            <BudgetPicker value={draft.budget} onChange={(budget) => setDraft({ ...draft, budget })} />

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <span className="block text-xs text-slate-400">시작 포지션</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1">
                {(['random', 'moves'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraft({ ...draft, openingMode: m })}
                    className={`rounded-md px-2 py-1 text-xs ${draft.openingMode === m ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                  >
                    {m === 'random' ? '랜덤 오프닝' : '기보 입력'}
                  </button>
                ))}
              </div>
              {draft.openingMode === 'random' ? (
                <>
                  <NumberRow label="오프닝 무작위 수 (0 = 기본 시작)" value={draft.openingPlies} min={0} max={12} onChange={(v) => setDraft({ ...draft, openingPlies: v })} />
                  <NumberRow label="오프닝 시드" value={draft.openingSeed} min={0} onChange={(v) => setDraft({ ...draft, openingSeed: v })} />
                </>
              ) : (
                <>
                  <textarea
                    value={draft.moveText}
                    onChange={(e) => setDraft({ ...draft, moveText: e.target.value })}
                    placeholder="예: e2 e8 e3 e7 d6h"
                    rows={2}
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                  />
                  {parsed?.error && <p className="text-[11px] text-red-300">{parsed.error.index + 1}번째 수 &lsquo;{parsed.error.notation}&rsquo;가 합법이 아닙니다.</p>}
                </>
              )}
            </div>

            <div className="space-y-2 border-t border-slate-800 pt-3">
              <span className="block text-xs text-slate-400">실험 중단 조건 (승패 아님)</span>
              <NumberRow label="최대 ply" value={draft.maxPlies} min={10} onChange={(v) => setDraft({ ...draft, maxPlies: v })} />
              <NumberRow label="반복 포지션 횟수 (0 = 끔)" value={draft.repetitionLimit} min={0} onChange={(v) => setDraft({ ...draft, repetitionLimit: v })} />
              <NumberRow label="총 생각 시간 제한 (초, 0 = 끔)" value={draft.maxComputeS} min={0} onChange={(v) => setDraft({ ...draft, maxComputeS: v })} />
              <NumberRow label="AI 시드" value={draft.seed} min={0} onChange={(v) => setDraft({ ...draft, seed: v })} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={draftInvalid} onClick={() => apply(false)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:border-sky-500 disabled:opacity-40">
                새 대국 준비
              </button>
              <button type="button" disabled={draftInvalid} onClick={() => apply(true)} className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-40">
                새 대국 시작
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="연속 대국" aside={series.active ? <span className="font-mono text-[11px] text-sky-300">{series.played}/{series.total}</span> : undefined}>
          <div className="space-y-2">
            <NumberRow label="대국 수" value={series.total} min={1} max={20} onChange={(v) => setSeries({ ...series, total: v })} />
            <label className="flex items-center justify-between text-xs text-slate-400">
              대국마다 선공·후공 교환
              <input type="checkbox" checked={series.swap} onChange={(e) => setSeries({ ...series, swap: e.target.checked })} className="accent-sky-500" />
            </label>
            <button
              type="button"
              disabled={draftInvalid || series.active}
              onClick={() => apply(true, true)}
              className="w-full rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-500 disabled:opacity-40"
            >
              연속 대국 시작 (최대 20판)
            </button>
            {series.active && (
              <button type="button" onClick={() => setSeries({ ...series, active: false })} className="w-full text-[11px] text-amber-300 hover:underline">
                현재 대국 후 연속 대국 멈추기
              </button>
            )}
            <p className="text-[11px] text-slate-500">통계적 비교는 Experiments 탭의 Paired Matches를 사용하세요.</p>
          </div>
        </Panel>
      </aside>

      {/* ------------------------------------------------ board */}
      <section className="order-1 flex flex-col items-center gap-3 lg:order-2">
        <div className="w-full max-w-[640px] space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className={PLAYER_TEXT_CLASS[0]}>{shownLabels[0]}</span>
              <span className="text-slate-500">vs</span>
              <span className={PLAYER_TEXT_CLASS[1]}>{shownLabels[1]}</span>
            </span>
            <span className={`text-xs ${result.tone}`}>
              {shownStatus.kind === 'playing'
                ? `${PLAYER_LABEL[snap.game.currentPlayer]} ${snap.thinking ? '생각 중…' : '차례'}`
                : result.text}
            </span>
          </div>
          {live ? (
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <ControlButton onClick={() => session.pause()} label="❚❚ 일시 정지" />
              ) : (
                <ControlButton onClick={() => (setCursor(null), session.play())} label="▶ 진행" disabled={snap.phase === 'finished'} primary />
              )}
              <ControlButton onClick={() => (setCursor(null), session.step())} label="⏭ 한 수" disabled={running || snap.phase === 'finished' || snap.thinking} />
              <ControlButton onClick={() => (setSeries((s) => ({ ...s, active: false })), session.stop())} label="■ 중단" disabled={snap.phase === 'finished'} />
              <ControlButton onClick={() => (setCursor(null), session.restart(), setSeries((s) => ({ ...s, active: false })))} label="↺ 재시작" />
              <label className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                속도
                <input type="range" min={0} max={2000} step={100} value={2000 - delay} onChange={(e) => setDelay(2000 - Number(e.target.value))} className="w-24 accent-sky-500" aria-label="대국 속도" />
                <span className="w-14 font-mono">{delay} ms</span>
              </label>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-200">리플레이: 대국 #{viewing}</span>
              <button type="button" onClick={() => (setViewing(null), setCursor(null))} className="text-sky-400 hover:underline">
                실시간 대국으로 돌아가기
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <button type="button" onClick={() => setCursor(0)} aria-label="처음">⏮</button>
            <button type="button" onClick={() => setCursor(Math.max(0, ply - 1))} aria-label="이전 수">◀</button>
            <input
              type="range"
              min={0}
              max={moves.length}
              value={ply}
              onChange={(e) => setCursor(Number(e.target.value) >= moves.length ? null : Number(e.target.value))}
              className="flex-1 accent-sky-500"
              aria-label="수 이동"
            />
            <button type="button" onClick={() => setCursor(ply + 1 >= moves.length ? null : ply + 1)} aria-label="다음 수">▶</button>
            <button type="button" onClick={() => setCursor(null)} aria-label="마지막">⏭</button>
            <span className="w-20 text-right">
              {ply}/{moves.length} 수
            </span>
          </div>
        </div>
        {live && snap.thinking && snap.progress && <SearchProgressBar progress={snap.progress} timeLimitMs={snap.config.budget.mode === 'equal-time' ? snap.config.budget.timeMs : 0} maxDepth={snap.config.budget.mode === 'equal-time' ? 30 : snap.config.agents[snap.game.currentPlayer].depth} />}
        {live && snap.error && <p className="w-full max-w-[640px] rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{snap.error}</p>}
        <QuoridorBoard
          state={boardState}
          flipped={false}
          interactive={false}
          showPaths={false}
          lastAction={selectedMove && { action: selectedMove.action, player: selectedMove.player }}
          overlay={overlay}
          idleHint={cursor !== null || !live ? `${ply}수 후의 포지션` : ''}
          onAction={() => {}}
        />
      </section>

      {/* ------------------------------------------------ moves + trace */}
      <aside className="order-3 space-y-4">
        <Panel
          title="기보"
          aside={
            selectedMove && (
              <button
                type="button"
                onClick={() => onCompare(selectedMove.stateBefore, `Arena #${shown?.matchId ?? snap.matchId} · ${selectedMove.ply}수 직전`)}
                className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:border-sky-500"
                title="이 수를 두기 직전 포지션을 Compare로 보냅니다"
              >
                Compare
              </button>
            )
          }
        >
          {moves.length === 0 ? (
            <p className="text-xs text-slate-500">{live && snap.phase === 'idle' ? '▶ 진행 또는 ⏭ 한 수로 대국을 시작하세요.' : '아직 둔 수가 없습니다.'}</p>
          ) : (
            <ol ref={moveListRef} className="max-h-56 space-y-0.5 overflow-y-auto pr-1 font-mono text-xs">
              {moves.map((m, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setCursor(i + 1 >= moves.length ? null : i + 1)}
                    className={`flex w-full gap-3 rounded px-2 py-0.5 text-left hover:bg-slate-800 ${i === ply - 1 ? 'bg-amber-400/10 ring-1 ring-amber-400/40' : 'odd:bg-slate-800/40'}`}
                  >
                    <span className="w-6 text-right text-slate-500">{m.ply}</span>
                    <span className={`w-6 ${PLAYER_TEXT_CLASS[m.player]}`}>{PLAYER_LABEL[m.player]}</span>
                    <span className="w-10 text-slate-200">{m.notation}</span>
                    <span className="flex-1 truncate text-slate-500">{traceAgentName(m.trace)}</span>
                    <span className="text-slate-500">{m.elapsedMs.toFixed(0)}ms</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={selectedMove ? `${selectedMove.ply}수 DecisionTrace` : 'DecisionTrace'}>
          {selectedMove ? <TraceDetail entry={selectedMove} bind={bind} /> : <p className="text-xs text-slate-500">수를 선택하면 그 수를 고른 AI의 실제 계산 기록이 표시됩니다.</p>}
        </Panel>

        <Panel title="완료한 대국 (리플레이)">
          {archive.length === 0 ? (
            <p className="text-xs text-slate-500">끝난 대국이 여기에 보관됩니다 (최근 {MAX_ARCHIVE}개).</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {archive.map((m) => {
                const r = resultText(m.status, m.labels);
                return (
                  <li key={m.matchId}>
                    <button
                      type="button"
                      onClick={() => (setViewing(m.matchId), setCursor(null))}
                      className={`w-full rounded px-2 py-1 text-left hover:bg-slate-800 ${viewing === m.matchId ? 'bg-slate-800' : ''}`}
                    >
                      <span className="font-mono text-slate-500">#{m.matchId}</span> {m.labels[0]} vs {m.labels[1]}
                      <span className={`ml-1 ${r.tone}`}>· {r.text}</span>
                      <span className="ml-1 text-slate-500">· {m.moves.length}수</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </aside>
    </main>
  );
}

function NumberRow({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          let v = Math.trunc(Number(e.target.value)) || 0;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          onChange(v);
        }}
        className={numberClass}
      />
    </label>
  );
}

function ControlButton({ label, onClick, disabled, primary }: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-xs disabled:opacity-40 ${
        primary ? 'bg-sky-500 font-semibold text-slate-950 hover:bg-sky-400' : 'border border-slate-700 text-slate-200 hover:border-sky-500'
      }`}
    >
      {label}
    </button>
  );
}

export { NumberRow };
