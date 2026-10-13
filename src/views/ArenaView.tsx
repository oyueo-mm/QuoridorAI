import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMoveSounds } from '../audio/moveSounds';
import { soundEngine } from '../audio/sound';
import { DEFAULT_BUDGET, agentLabel, defaultSpec, workerFactory } from '../arena/agentSpec';
import type { AgentSpec, Budget } from '../arena/agentSpec';
import { MatchSession } from '../arena/MatchSession';
import type { ArenaConfig, ArenaMove } from '../arena/MatchSession';
import { openingRecord, parseMoveList } from '../arena/openings';
import { TraceDetail, traceAgentName } from '../components/analysis/TraceDetail';
import { usePreviewBinder } from '../components/analysis/usePreviewBinder';
import { AgentPicker, BudgetBadge, BudgetPicker } from '../components/arena/AgentPicker';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import { boardColumnStyle } from '../components/board/layout';
import type { BoardOverlay } from '../components/board/overlay';
import { Panel } from '../components/panels/Panel';
import { PlayerStrip } from '../components/panels/PlayerStrip';
import { SearchProgressBar } from '../components/panels/SearchProgressBar';
import { PLAYER_COLOR, PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import { Collapsible, Segmented, Tabs, buttonClass, cardClass, inputClass, useBoardOrientation } from '../components/ui';
import { distanceToRow, goalRow, opponentOf } from '../engine';
import type { GameState, PlayerId } from '../engine';
import { describeHalt } from '../match/outcome';
import { movesText } from '../match/gameRecord';
import type { GameLine } from '../match/gameRecord';
import { wallOwnersFromMoves } from '../match/wallOwners';
import type { RecordedAction } from '../match/wallOwners';
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
  /** Moves from the standard start to `start` (the opening), e.g. for wall owners. */
  startRecord: RecordedAction[];
}

/** A record sent from another view; Arena prepares a match starting from its selected ply. */
export interface ArenaIncoming {
  line: GameLine;
  label: string;
  sentAt: number;
}

const MAX_ARCHIVE = 10;
const numberClass = 'w-20 rounded-lg border border-line bg-card px-2 py-1 text-right font-mono text-sm text-ink focus:border-accent focus:outline-none';

function resultText(status: MatchStatus, labels: [string, string]): { text: string; tone: string } {
  if (status.kind === 'win') return { text: `${PLAYER_LABEL[status.winner]} ${labels[status.winner]} 승리`, tone: PLAYER_TEXT_CLASS[status.winner] };
  if (status.kind === 'halted') return { text: `실험 중단 — ${describeHalt(status)} (승패 없음)`, tone: 'text-warn' };
  return { text: '진행 중', tone: 'text-ink-soft' };
}

/** AI vs AI: live viewing with play / pause / step / stop, replays and per-move DecisionTraces. */
export function ArenaView({ onCompare, incoming }: { onCompare: (line: GameLine, label: string) => void; incoming: ArenaIncoming | null }) {
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
  const [tab, setTab] = useState<'moves' | 'trace' | 'setup' | 'archive'>('moves');
  // Spectating: P1 at the bottom unless the viewer turns the board.
  const orientation = useBoardOrientation('arena', 0);

  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => session.setDelay(delay), [session, delay]);

  const liveStartRecord = useMemo(() => openingRecord(snap.config.opening), [snap.config.opening]);
  const [notice, setNotice] = useState('');
  const labels: [string, string] = [agentLabel(snap.config.agents[0], snap.config.budget), agentLabel(snap.config.agents[1], snap.config.budget)];

  // Archive finished matches (bounded) and drive an automatic series.
  useEffect(() => {
    if (snap.phase !== 'finished' || archived.current.has(snap.matchId)) return;
    archived.current.add(snap.matchId);
    setArchive((a) => [{ matchId: snap.matchId, labels, status: snap.status, start: snap.start, final: snap.game, moves: snap.moves, budget: snap.config.budget, startRecord: liveStartRecord }, ...a].slice(0, MAX_ARCHIVE));
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
  const startRecord = shown ? shown.startRecord : liveStartRecord;
  const wallOwners = useMemo(() => wallOwnersFromMoves(moves, wallOwnersFromMoves(startRecord)), [moves, startRecord]);

  // A record from Play / Compare: prepare a match that continues from its selected position.
  useEffect(() => {
    if (!incoming) return;
    const next: Draft = { ...draft, openingMode: 'moves', moveText: movesText(incoming.line.actions, incoming.line.ply) };
    setDraft(next);
    setViewing(null);
    setCursor(null);
    setSeries((s) => ({ ...s, active: false }));
    session.restart(toConfig(next));
    setNotice(`${incoming.label} 포지션을 이어 둘 준비가 되었습니다 — ▶ 진행 (AI는 설정 탭에서 바꿀 수 있습니다)`);
    setTab('moves');
  }, [incoming?.sentAt]);
  // Sounds only for new live moves while the live position is shown (replay browsing is silent).
  // 'limited' thins out fast games to at most about three sounds per second.
  const soundSettings = useSyncExternalStore(soundEngine.subscribe, soundEngine.getSettings);
  useMoveSounds(snap.matchId, snap.moves, 'arena', viewing === null && cursor === null, soundSettings.arena === 'limited' && delay < 300 ? 350 : 0);
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
  const thinkingNow = live && snap.thinking && cursor === null;
  const distances = [0, 1].map((p) => distanceToRow(boardState, boardState.pawns[p], goalRow(p as PlayerId)));
  const strip = (p: PlayerId) => (
    <PlayerStrip
      player={p}
      name={shownLabels[p]}
      isAi
      wallsRemaining={boardState.wallsRemaining[p]}
      distance={distances[p]}
      active={shownStatus.kind === 'playing' && boardState.winner === null && boardState.currentPlayer === p}
      thinking={thinkingNow && boardState.currentPlayer === p}
      winner={ply === moves.length && shownStatus.kind === 'win' && shownStatus.winner === p}
    />
  );

  return (
    <main className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ------------------------------------------------ board (fixed geometry) */}
      <section className="flex flex-col items-center">
        <div className="flex flex-col gap-2" style={boardColumnStyle(25)}>
          {strip(opponentOf(orientation.bottomSeat))}

          <div className="h-10">
            {live && snap.error ? (
              <p className="flex h-10 items-center truncate rounded-xl bg-danger/8 px-3 text-xs text-danger" title={snap.error}>
                {snap.error}
              </p>
            ) : thinkingNow && snap.progress ? (
              <SearchProgressBar progress={snap.progress} timeLimitMs={snap.config.budget.mode === 'equal-time' ? snap.config.budget.timeMs : 0} maxDepth={snap.config.budget.mode === 'equal-time' ? 30 : snap.config.agents[snap.game.currentPlayer].depth} />
            ) : (
              <div className="flex h-10 items-center justify-between gap-3 px-1 text-sm">
                <span className={`truncate ${live ? result.tone : 'text-warn'}`} title={notice && live && snap.moves.length === 0 ? notice : undefined}>
                  {!live
                    ? `리플레이 #${viewing} · ${result.text}`
                    : notice && snap.moves.length === 0 && snap.phase === 'idle'
                      ? notice
                      : shownStatus.kind === 'playing'
                        ? `${PLAYER_LABEL[snap.game.currentPlayer]} ${snap.thinking ? '생각 중…' : snap.phase === 'running' ? '차례' : '대기 중'}`
                        : result.text}
                </span>
                {!live && (
                  <button type="button" onClick={() => (setViewing(null), setCursor(null))} className={`${buttonClass.ghost} shrink-0 text-accent`}>
                    실시간으로
                  </button>
                )}
              </div>
            )}
          </div>

          <QuoridorBoard
            state={boardState}
            flipped={orientation.flipped}
            interactive={false}
            showPaths={false}
            lastAction={selectedMove && { action: selectedMove.action, player: selectedMove.player, from: selectedMove.stateBefore.pawns[selectedMove.player] }}
            overlay={overlay}
            wallOwners={wallOwners}
            idleHint={cursor !== null || !live ? `${ply}수 후의 포지션` : ''}
            onAction={() => {}}
          />

          {strip(orientation.bottomSeat)}

          {/* Playback controls (live) — one fixed row. */}
          <div className="flex h-10 items-center gap-1.5 overflow-x-auto px-1 whitespace-nowrap">
            {live ? (
              <>
                {running ? (
                  <ControlButton onClick={() => session.pause()} label="❚❚ 일시 정지" />
                ) : (
                  <ControlButton onClick={() => (setCursor(null), session.play())} label="▶ 진행" disabled={snap.phase === 'finished'} primary />
                )}
                <ControlButton onClick={() => (setCursor(null), session.step())} label="⏭ 한 수" disabled={running || snap.phase === 'finished' || snap.thinking} />
                <ControlButton onClick={() => (setSeries((s) => ({ ...s, active: false })), session.stop())} label="■ 중단" disabled={snap.phase === 'finished'} />
                <ControlButton onClick={() => (setCursor(null), session.restart(), setSeries((s) => ({ ...s, active: false })))} label="↺ 재시작" />
                <label className="ml-auto flex items-center gap-2 pl-2 text-[11px] text-muted">
                  속도
                  <input type="range" min={0} max={2000} step={100} value={2000 - delay} onChange={(e) => setDelay(2000 - Number(e.target.value))} className="w-20" aria-label="대국 속도" />
                  <span className="w-12 font-mono">{delay}ms</span>
                </label>
              </>
            ) : (
              <span className="px-1 text-xs text-muted">완료한 대국을 보는 중입니다 — 타임라인으로 수를 오갈 수 있습니다.</span>
            )}
          </div>

          {/* Timeline + orientation — one fixed row. */}
          <div className="flex h-9 items-center gap-1 px-1 font-mono text-[11px] text-muted">
            <button type="button" className={buttonClass.ghost} onClick={() => setCursor(0)} aria-label="처음">⏮</button>
            <button type="button" className={buttonClass.ghost} onClick={() => setCursor(Math.max(0, ply - 1))} aria-label="이전 수">◀</button>
            <input type="range" min={0} max={moves.length} value={ply} onChange={(e) => setCursor(Number(e.target.value) >= moves.length ? null : Number(e.target.value))} className="min-w-0 flex-1" aria-label="수 이동" />
            <button type="button" className={buttonClass.ghost} onClick={() => setCursor(ply + 1 >= moves.length ? null : ply + 1)} aria-label="다음 수">▶</button>
            <button type="button" className={buttonClass.ghost} onClick={() => setCursor(null)} aria-label="마지막">⏭</button>
            <span className="w-14 shrink-0 text-right">
              {ply}/{moves.length}
            </span>
            <Segmented label="보드 방향" options={ARENA_ORIENTATION} value={orientation.mode === 'p2' ? 'p2' : 'p1'} onChange={orientation.setMode} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ side tabs (fixed height, inner scroll) */}
      <aside className={`${cardClass} flex h-[34rem] min-w-0 flex-col gap-3 p-3 lg:sticky lg:top-[4.75rem] lg:h-[calc(100svh-6.25rem)]`}>
        <Tabs
          label="Arena 패널"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'moves', label: '기보', badge: moves.length },
            { id: 'trace', label: '분석' },
            { id: 'setup', label: '설정' },
            { id: 'archive', label: '리플레이', badge: archive.length || undefined },
          ]}
        />
        <div className={`min-h-0 flex-1 px-2 ${tab === 'moves' ? 'flex flex-col' : 'scroll-stable'}`}>
          <div hidden={tab !== 'moves'} className="min-h-0 flex-1">
            <div className="flex h-full flex-col gap-2">
              <div className="flex min-h-7 items-center justify-between gap-2">
                <span className="text-sm text-ink-soft">대국 #{shown ? shown.matchId : snap.matchId}</span>
                {selectedMove && (
                  <button
                    type="button"
                    onClick={() => onCompare({ actions: [...startRecord, ...moves.map((m) => ({ action: m.action, player: m.player }))], ply: startRecord.length + ply - 1 }, `Arena #${shown?.matchId ?? snap.matchId} · ${selectedMove.ply}수 직전`)}
                    className={buttonClass.small}
                    title="이 수를 두기 직전 포지션을 Compare로 보냅니다"
                  >
                    이 포지션 비교
                  </button>
                )}
              </div>
              {moves.length === 0 ? (
                <p className="py-6 text-center text-sm text-faint">{live && snap.phase === 'idle' ? '▶ 진행 또는 한 수로 대국을 시작하세요.' : '아직 둔 수가 없습니다.'}</p>
              ) : (
                <ol ref={moveListRef} className="scroll-stable min-h-0 flex-1 space-y-0.5 pr-1 font-mono text-[13px]">
                  {moves.map((m, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setCursor(i + 1 >= moves.length ? null : i + 1)}
                        className={`flex w-full gap-3 rounded-lg px-2.5 py-1 text-left hover:bg-inset ${i === ply - 1 ? 'bg-warn/10 ring-1 ring-warn/30' : 'odd:bg-inset/60'}`}
                      >
                        <span className="w-7 text-right text-faint">{m.ply}</span>
                        <span className={`w-7 ${PLAYER_TEXT_CLASS[m.player]}`}>{PLAYER_LABEL[m.player]}</span>
                        <span className="w-12 text-ink">{m.notation}</span>
                        <span className="min-w-0 flex-1 truncate text-faint">{traceAgentName(m.trace)}</span>
                        <span className="text-faint">{m.elapsedMs.toFixed(0)}ms</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div hidden={tab !== 'trace'}>
            <Panel plain title={selectedMove ? `${selectedMove.ply}수 DecisionTrace` : 'DecisionTrace'}>
              {selectedMove ? <TraceDetail entry={selectedMove} bind={bind} /> : <p className="py-6 text-center text-sm text-faint">기보에서 수를 고르면 그 수를 둔 AI의 실제 계산 기록이 여기에 표시됩니다.</p>}
            </Panel>
          </div>

          <div hidden={tab !== 'setup'} className="space-y-6">
            <Panel plain title="대국 설정" aside={<BudgetBadge budget={draft.budget} />}>
              <div className="space-y-4">
                <AgentPicker label="P1 (선공)" accent={PLAYER_COLOR[0]} value={draft.agents[0]} budget={draft.budget} onChange={(a) => setDraft({ ...draft, agents: [a, draft.agents[1]] })} />
                <button type="button" onClick={() => setDraft({ ...draft, agents: [draft.agents[1], draft.agents[0]] })} className={`${buttonClass.small} w-full`}>
                  ⇅ 선공·후공 교환
                </button>
                <AgentPicker label="P2 (후공)" accent={PLAYER_COLOR[1]} value={draft.agents[1]} budget={draft.budget} onChange={(a) => setDraft({ ...draft, agents: [draft.agents[0], a] })} />
                <BudgetPicker value={draft.budget} onChange={(budget) => setDraft({ ...draft, budget })} />

                <Collapsible title="시작 포지션">
                  <div className="space-y-2">
                    <Segmented
                      label="시작 포지션"
                      options={[
                        { value: 'random' as const, label: '랜덤 오프닝' },
                        { value: 'moves' as const, label: '기보 입력' },
                      ]}
                      value={draft.openingMode}
                      onChange={(m) => setDraft({ ...draft, openingMode: m })}
                    />
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
                          className={`${inputClass} font-mono text-xs`}
                        />
                        {parsed?.error && <p className="text-[11px] text-danger">{parsed.error.index + 1}번째 수 &lsquo;{parsed.error.notation}&rsquo;가 합법이 아닙니다.</p>}
                      </>
                    )}
                  </div>
                </Collapsible>

                <Collapsible title="실험 중단 조건 · 시드">
                  <div className="space-y-2">
                    <NumberRow label="최대 ply" value={draft.maxPlies} min={10} onChange={(v) => setDraft({ ...draft, maxPlies: v })} />
                    <NumberRow label="반복 포지션 횟수 (0 = 끔)" value={draft.repetitionLimit} min={0} onChange={(v) => setDraft({ ...draft, repetitionLimit: v })} />
                    <NumberRow label="총 생각 시간 제한 (초, 0 = 끔)" value={draft.maxComputeS} min={0} onChange={(v) => setDraft({ ...draft, maxComputeS: v })} />
                    <NumberRow label="AI 시드" value={draft.seed} min={0} onChange={(v) => setDraft({ ...draft, seed: v })} />
                  </div>
                </Collapsible>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={draftInvalid} onClick={() => apply(false)} className={buttonClass.secondary}>
                    새 대국 준비
                  </button>
                  <button type="button" disabled={draftInvalid} onClick={() => (apply(true), setTab('moves'))} className={buttonClass.primary}>
                    새 대국 시작
                  </button>
                </div>
              </div>
            </Panel>

            <Panel plain title="연속 대국" aside={series.active ? <span className="font-mono text-[11px] text-accent">{series.played}/{series.total}</span> : undefined}>
              <div className="space-y-2">
                <NumberRow label="대국 수" value={series.total} min={1} max={20} onChange={(v) => setSeries({ ...series, total: v })} />
                <label className="flex items-center justify-between text-xs text-muted">
                  대국마다 선공·후공 교환
                  <input type="checkbox" checked={series.swap} onChange={(e) => setSeries({ ...series, swap: e.target.checked })} className="accent-accent" />
                </label>
                <button type="button" disabled={draftInvalid || series.active} onClick={() => (apply(true, true), setTab('moves'))} className={`${buttonClass.secondary} w-full text-xs`}>
                  연속 대국 시작 (최대 20판)
                </button>
                {series.active && (
                  <button type="button" onClick={() => setSeries({ ...series, active: false })} className="w-full text-[11px] text-warn hover:underline">
                    현재 대국 후 연속 대국 멈추기
                  </button>
                )}
                <p className="text-[11px] text-faint">통계적 비교는 Experiments의 Paired Matches를 사용하세요.</p>
              </div>
            </Panel>
          </div>

          <div hidden={tab !== 'archive'}>
            <Panel plain title="완료한 대국">
              {archive.length === 0 ? (
                <p className="py-6 text-center text-sm text-faint">끝난 대국이 여기에 보관됩니다 (최근 {MAX_ARCHIVE}개).</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {archive.map((m) => {
                    const r = resultText(m.status, m.labels);
                    return (
                      <li key={m.matchId}>
                        <button
                          type="button"
                          onClick={() => (setViewing(m.matchId), setCursor(null), setTab('moves'))}
                          className={`w-full rounded-lg px-2.5 py-2 text-left hover:bg-inset ${viewing === m.matchId ? 'bg-inset' : ''}`}
                        >
                          <span className="font-mono text-faint">#{m.matchId}</span> {m.labels[0]} vs {m.labels[1]}
                          <span className={`ml-1 ${r.tone}`}>· {r.text}</span>
                          <span className="ml-1 text-faint">· {m.moves.length}수</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </aside>
    </main>
  );
}

const ARENA_ORIENTATION = [
  { value: 'p1' as const, label: 'P1 아래', title: 'P1(선공)이 아래쪽' },
  { value: 'p2' as const, label: 'P2 아래', title: 'P2(후공)가 아래쪽' },
];

function NumberRow({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-muted">
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
    <button type="button" onClick={onClick} disabled={disabled} className={`${primary ? buttonClass.primary : buttonClass.secondary} shrink-0 px-3 py-1.5 text-xs`}>
      {label}
    </button>
  );
}

export { NumberRow };
