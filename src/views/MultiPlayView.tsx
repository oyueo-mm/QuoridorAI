import { useEffect, useMemo, useState } from 'react';
import { summarizeTrace } from '../ai/multiAgent';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useMoveSounds, useOutcomeSound } from '../audio/moveSounds';
import { MultiGameStage } from '../components/board/GameStage';
import { multiBoardRules } from '../components/board/boardRules';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import type { BoardOverlay } from '../components/board/overlay';
import { copyText, downloadText } from '../components/download';
import { MoveLog } from '../components/panels/MoveLog';
import { PlayerChip } from '../components/panels/PlayerStrip';
import { ModeBar } from '../components/panels/ModeBar';
import { MultiAnalysisPanel } from '../components/panels/MultiAnalysisPanel';
import { SidePanel, sidePanelGrid } from '../components/panels/SidePanel';
import { OBSTACLE_WALL, PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import { Segmented, Tabs, buttonClass } from '../components/ui';
import { TEAM_NAMES, goalDistanceMulti, obstacleMetrics, describeObstacleMap, seatSlot, teamOf, teamSeats, winningSeats } from '../engine';
import type { MultiRules } from '../engine';
import { buildMultiRecord, multiRecordToText, parseMultiRecord } from '../match/multiRecord';
import type { ParsedMultiRecord } from '../match/multiRecord';
import { wallOwnersFromMoves } from '../match/wallOwners';
import { modeInfo } from '../session/config';
import type { GameMode } from '../session/config';
import { seatText } from '../session/seatInfo';
import type { MultiSession } from '../session/useMultiSession';

type MultiTab = 'moves' | 'analysis' | 'rules';

/** AI turn pacing offered in the controls (minimum duration of an AI turn). */
const SPEED_OPTIONS = [
  { value: '1500', label: '느리게', title: '한 수에 최소 1.5초' },
  { value: '500', label: '보통', title: '한 수에 최소 0.5초' },
  { value: '100', label: '빠르게', title: '한 수에 최소 0.1초' },
  { value: '0', label: '최대', title: 'AI가 답하는 즉시 둡니다' },
] as const;
const nearestSpeed = (ms: number) => SPEED_OPTIONS.reduce((best, o) => (Math.abs(Number(o.value) - ms) < Math.abs(Number(best.value) - ms) ? o : best)).value;
type LoadableRecord = Extract<ParsedMultiRecord, { ok: true }>;

/** Replay speed of "자동 재생". */
const REPLAY_INTERVAL_MS = 700;

/**
 * Local multi-player game (one device): the official four-player game and every variant. Same
 * screen structure as Play: cards beside the board, controls under it, record / rules / new-game
 * tabs in the side panel. Browsing the record (replay) shows that position read-only; playing
 * resumes from "최신으로". What differs per mode is the rule set in `session.setup.rules`.
 */
export function MultiPlayView({ session, onChangeMode }: { session: MultiSession; onChangeMode: () => void }) {
  const { game, history, controller, names, status, gameId } = session;
  const rules = game.rules;
  const mode = session.config.mode;
  const title = modeInfo(mode).title;
  const [pendingImport, setPendingImport] = useState<LoadableRecord | null>(null);
  const boardRules = useMemo(() => multiBoardRules(rules), [rules]);
  const [showPaths, setShowPaths] = useState(false);
  const [tab, setTab] = useState<MultiTab>('moves');
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [notice, setNotice] = useState('');
  // Board preview of a candidate hovered in the analysis tab (read-only, replaces the live position).
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null);
  const [paste, setPaste] = useState('');

  // The AI tab only exists while a seat is an AI (a new game may have none).
  useEffect(() => {
    if (tab === 'analysis' && !session.aiPresent) setTab('moves');
  }, [tab, session.aiPresent]);
  useEffect(() => {
    setSelectedPly(null);
    setAutoplay(false);
    setConfirmRestart(false);
    setNotice('');
    setPendingImport(null);
    setOverlay(null);
  }, [gameId]);
  // The record can shrink (undo): keep the selection inside it.
  useEffect(() => {
    if (selectedPly !== null && selectedPly >= history.length) setSelectedPly(null);
  }, [history.length, selectedPly]);

  const ply = selectedPly ?? history.length;
  const browsing = selectedPly !== null;
  const position = browsing ? history[ply].stateBefore : game;
  const lastEntry = ply > 0 ? history[ply - 1] : undefined;
  const wallOwners = useMemo(() => wallOwnersFromMoves(history), [history]);
  const actions = useMemo(() => history.map((h) => ({ action: h.action, player: h.player, ...(h.trace ? { ai: summarizeTrace(h.trace) } : {}) })), [history]);
  const slotControllers = rules.turnOrder.map((seat) => session.controllers[seat]);
  const slotOf = (seat: number) => seatSlot(rules, seat);
  const nameOf = (seat: number) => names[slotOf(seat)];
  const playing = status.kind === 'playing';
  const turnSeat = position.currentPlayer;
  const winners = useMemo(() => winningSeats(position), [position]);
  const teamed = !!rules.teams;
  const teamLabel = (seat: number) => TEAM_NAMES[teamOf(rules, seat)];
  const distances = useMemo(() => rules.players.map((_, seat) => goalDistanceMulti(position, seat)), [position, rules]);

  useMoveSounds(gameId, history, 'play');
  // Hot-seat: there is no "my side", so any decided game sounds as a win.
  useOutcomeSound(gameId, status.kind === 'win' ? { kind: 'win', winner: 0 } : { kind: 'playing' }, 0, 'play');

  // Automatic replay: step to the next position until the latest one.
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => {
      setSelectedPly((cur) => {
        const next = (cur ?? history.length) + 1;
        if (next >= history.length) {
          setAutoplay(false);
          return null;
        }
        return next;
      });
    }, REPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, history.length]);
  useEffect(() => {
    if (!confirmRestart) return;
    const timer = window.setTimeout(() => setConfirmRestart(false), 3500);
    return () => window.clearTimeout(timer);
  }, [confirmRestart]);

  const goTo = (target: number) => {
    setAutoplay(false);
    setSelectedPly(target >= history.length ? null : Math.max(0, target));
  };
  const startAutoplay = () => {
    if (autoplay) return setAutoplay(false);
    // from the start when the latest position is selected (nothing left to replay otherwise)
    if (selectedPly === null) setSelectedPly(0);
    setAutoplay(true);
  };

  const record = () => buildMultiRecord(session.setup, actions, { names, ply, mode, controllers: slotControllers });
  const exportJson = () => {
    downloadText(`quoridor-${mode}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(record(), null, 2), 'application/json');
    setNotice('JSON 파일을 저장했습니다.');
  };
  const applyImport = (parsed: LoadableRecord) => {
    controller.load(parsed);
    setNotice(`기보를 불러왔습니다 — ${modeInfo(parsed.mode).title}, ${parsed.actions.length}수.`);
    setPaste('');
  };
  // An invalid file changes nothing; a valid one replaces a game in progress only after a confirmation.
  const importText = (text: string) => {
    const parsed = parseMultiRecord(text);
    if (!parsed.ok) return setNotice(`가져오기 실패 — ${parsed.error} 현재 게임은 그대로입니다.`);
    if (history.length > 0) return setPendingImport(parsed);
    applyImport(parsed);
  };

  const seat = (s: number) => {
    const slot = slotOf(s);
    return (
      <PlayerChip
        player={slot}
        name={names[slot]}
        isAi={session.controllers[s].kind === 'ai'}
        thinking={session.thinking?.seat === s}
        wallsRemaining={position.wallsRemaining[s]}
        wallsTotal={session.setup.wallsPerPlayer[s]}
        distance={distances[s]}
        active={playing && !browsing && turnSeat === s}
        winner={winners.includes(s)}
        seatHint={seatText(rules.players[s])}
        team={teamed ? { letter: 'AB'[teamOf(rules, s)], name: teamLabel(s) } : undefined}
      />
    );
  };

  /** "P2 이름 승리", or in team games "A팀 승리 — P3 이름이 도착". */
  const winnerText = (winner: number) => (
    <>
      {teamed && <span className="font-semibold">{teamLabel(winner)} 승리 — </span>}
      <span className={`font-semibold ${PLAYER_TEXT_CLASS[slotOf(winner)]}`}>
        {PLAYER_LABEL[slotOf(winner)]} {nameOf(winner)}
      </span>
      {teamed ? ' 도착' : ' 승리'}
    </>
  );

  const aiTurn = playing && !session.humanToMove;
  const idleHint = browsing
    ? `기보 보기 — ${ply}수 후 (최신으로 돌아가면 이어서 둘 수 있습니다)`
    : status.kind === 'win'
      ? '게임이 끝났습니다 — 무르기로 되돌리거나 다시 하세요'
      : aiTurn
        ? `${PLAYER_LABEL[slotOf(game.currentPlayer)]} ${nameOf(game.currentPlayer)} ${session.paused ? '— AI 진행이 일시정지되어 있습니다' : session.thinking ? '생각 중…' : '차례'}`
        : '';

  const statusLine = (
    <div className="flex h-10 items-center justify-between gap-3 px-1">
      {status.kind === 'win' ? (
        <p className="truncate text-sm text-ink" data-status="win">
          {winnerText(status.winner)} <span className="ml-2 font-mono text-xs text-faint">{history.length}수</span>
        </p>
      ) : (
        <p className="truncate text-sm text-ink-soft" data-status="playing">
          <span className={`font-semibold ${PLAYER_TEXT_CLASS[slotOf(game.currentPlayer)]}`}>
            {PLAYER_LABEL[slotOf(game.currentPlayer)]} {nameOf(game.currentPlayer)}
          </span>{' '}
          차례 <span className="ml-2 font-mono text-xs text-faint">{history.length}수</span>
        </p>
      )}
      {status.kind === 'win' && (
        <button type="button" onClick={() => controller.restart()} className={`${buttonClass.primary} shrink-0 px-3 py-1.5 text-xs`}>
          다시 하기
        </button>
      )}
    </div>
  );

  return (
    <main className={sidePanelGrid(panelOpen)} data-view="multi" data-mode={mode}>
      <MultiGameStage
        reserved={30}
        reservedWide={9}
        seats={rules.turnOrder}
        seat={seat}
        status={statusLine}
        side={
          <>
            <p className="text-center text-[11px] font-medium text-muted" data-mode-title>
              {title}
              <span className="ml-1.5 rounded bg-warn/10 px-1 text-warn">{modeInfo(mode).official ? '공식' : '변형'}</span>
            </p>
            {status.kind === 'win' ? (
              <p className="text-center text-sm text-ink" data-status-side="win">
                {winnerText(status.winner)}
              </p>
            ) : (
              <p className="text-center text-sm text-ink-soft" data-status-side="playing">
                <span className={`font-semibold ${PLAYER_TEXT_CLASS[slotOf(game.currentPlayer)]}`}>{PLAYER_LABEL[slotOf(game.currentPlayer)]}</span> 차례
              </p>
            )}
            <p className="text-center font-mono text-xs text-muted tabular-nums">{history.length}수</p>
            {boardRules.neutralWalls && (
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted" data-obstacle-legend>
                <span className="inline-block h-2 w-6 rounded-sm" style={{ background: OBSTACLE_WALL.fill, border: `1px solid ${OBSTACLE_WALL.stroke}` }} aria-hidden />
                중립 벽 {boardRules.neutralWalls.size}개
              </p>
            )}
            {status.kind === 'win' && (
              <button type="button" onClick={() => controller.restart()} className={`${buttonClass.primary} px-3 py-1.5 text-xs`}>
                다시 하기
              </button>
            )}
          </>
        }
        board={
          <QuoridorBoard
            state={position}
            rules={boardRules}
            flipped={false}
            interactive={session.humanToMove && !browsing}
            overlay={overlay}
            showPaths={showPaths}
            lastAction={lastEntry && { action: lastEntry.action, player: lastEntry.player, from: lastEntry.stateBefore.pawns[lastEntry.player] }}
            wallOwners={wallOwners}
            idleHint={idleHint}
            onAction={(a) => controller.play(a)}
          />
        }
        controls={
          <>
          <div className="flex min-h-9 flex-wrap items-center gap-2 px-1">
            <button type="button" onClick={() => controller.undo()} disabled={!session.canUndo || browsing} className={`${buttonClass.small} shrink-0`} title={browsing ? '기보 보기 중입니다 — 최신으로 돌아간 뒤 무르세요' : session.aiPresent ? '내 이전 차례로 되돌립니다 (그 뒤의 AI 수도 함께)' : '직전 한 수를 되돌립니다'}>
              ↶ 무르기
            </button>
            <button type="button" onClick={() => setShowPaths((v) => !v)} aria-pressed={showPaths} className={`${buttonClass.ghost} ${showPaths ? 'bg-inset text-ink' : ''}`} title="네 플레이어의 최단 경로를 각자의 색으로 표시합니다">
              최단 경로
            </button>
            <button
              type="button"
              onClick={() => (confirmRestart || history.length === 0 ? (controller.restart(), setConfirmRestart(false)) : setConfirmRestart(true))}
              className={`${confirmRestart ? 'text-danger' : ''} ${buttonClass.ghost}`}
            >
              {confirmRestart ? '정말 처음부터?' : '재시작'}
            </button>
            {browsing && (
              <button type="button" onClick={() => goTo(history.length)} className={buttonClass.small}>
                최신으로
              </button>
            )}
            {session.aiPresent && (
              <span className="flex flex-wrap items-center gap-1.5" data-ai-controls>
                <button type="button" onClick={() => controller.setPaused(!session.paused)} aria-pressed={session.paused} data-ai-pause className={`${buttonClass.small} ${session.paused ? 'bg-inset text-ink' : ''}`} title="AI 진행을 멈추거나 이어 갑니다">
                  {session.paused ? '▶ 진행' : '⏸ 일시정지'}
                </button>
                <button type="button" onClick={() => controller.step()} disabled={!session.paused || !aiTurn || !!session.thinking} data-ai-step className={buttonClass.small} title="일시정지 중 AI가 한 수만 둡니다">
                  한 수 ▶|
                </button>
                <Segmented label="AI 속도" options={SPEED_OPTIONS} value={nearestSpeed(session.delayMs)} onChange={(v) => controller.setDelay(Number(v))} />
              </span>
            )}
            <button type="button" onClick={onChangeMode} className={`${buttonClass.small} ml-auto`} data-open-mode-browser title="다른 게임 모드를 살펴보고 고릅니다 (지금 게임은 유지됩니다)">
              모드 변경
            </button>
          </div>
          {session.notice && (
            <p role="alert" data-ai-notice className="mt-1 rounded-lg bg-warn/10 px-3 py-1.5 text-xs text-warn">
              {session.notice}
            </p>
          )}
          </>
        }
      />

      <SidePanel
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        name={`${title} 패널`}
        tabs={
          <Tabs
            label={`${title} 패널`}
            value={tab}
            onChange={setTab}
            items={[
              { id: 'moves', label: '기보', badge: history.length },
              ...(session.aiPresent ? [{ id: 'analysis' as const, label: 'AI 분석' }] : []),
              { id: 'rules', label: '규칙' },
            ]}
          />
        }
        header={<ModeBar mode={mode} onChange={onChangeMode} />}
      >
        <div className={`min-h-0 flex-1 px-2 ${tab === 'moves' ? '' : 'scroll-stable'}`}>
          <div hidden={tab !== 'moves'} className="h-full">
            <div className="flex h-full flex-col gap-2">
              <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                <span className="mr-auto text-xs text-muted">{browsing ? `선택: ${ply}수 후` : `최신 (${history.length}수)`}</span>
                <button
                  type="button"
                  className={buttonClass.small}
                  disabled={history.length === 0}
                  onClick={async () => setNotice((await copyText(multiRecordToText(actions, rules.players.length))) ? '기보를 복사했습니다.' : '복사하지 못했습니다 — JSON 다운로드를 이용하세요.')}
                >
                  복사
                </button>
                <button type="button" className={buttonClass.small} disabled={history.length === 0} onClick={exportJson}>
                  JSON
                </button>
                <label className={`${buttonClass.small} cursor-pointer`}>
                  가져오기
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    aria-label="기보 JSON 가져오기"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) importText(await file.text());
                    }}
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="기보 재생">
                <button type="button" className={buttonClass.small} disabled={history.length === 0 || ply === 0} onClick={() => goTo(0)} title="처음 포지션">
                  ⏮
                </button>
                <button type="button" className={buttonClass.small} disabled={ply === 0} onClick={() => goTo(ply - 1)} title="한 수 뒤로">
                  ◀
                </button>
                <button type="button" className={buttonClass.small} disabled={ply >= history.length} onClick={() => goTo(ply + 1)} title="한 수 앞으로">
                  ▶
                </button>
                <button type="button" className={buttonClass.small} disabled={ply >= history.length} onClick={() => goTo(history.length)} title="마지막 포지션">
                  ⏭
                </button>
                <button type="button" className={`${buttonClass.small} ${autoplay ? 'bg-inset text-ink' : ''}`} disabled={history.length === 0} onClick={startAutoplay} aria-pressed={autoplay}>
                  {autoplay ? '정지' : '처음부터 재생'}
                </button>
              </div>
              <p className="min-h-4 text-[11px] text-faint">{notice || '수를 누르면 그 수 이후의 포지션을 보드에 보여 줍니다. AI 비교·관전·자동 실험은 정규 2인전 전용이라 이 기보는 보낼 수 없습니다.'}</p>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">JSON 붙여넣기로 가져오기</summary>
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={3}
                  aria-label="기보 JSON 붙여넣기"
                  className="mt-1.5 w-full rounded-lg border border-line bg-card p-2 font-mono text-[11px] text-ink focus:border-accent focus:outline-none"
                />
                <button type="button" className={`${buttonClass.small} mt-1`} disabled={!paste.trim()} onClick={() => importText(paste)}>
                  불러오기
                </button>
              </details>
              <div className="min-h-0 flex-1">
                <MoveLog moves={history} selectedPly={selectedPly} onSelect={(p) => goTo(p === null ? history.length : p)} slotOf={slotOf} nameOf={nameOf} />
              </div>
            </div>
          </div>
          {session.aiPresent && (
            <div hidden={tab !== 'analysis'}>
              <MultiAnalysisPanel key={gameId} history={history} thinking={session.thinking} paused={session.paused} turnOrder={rules.turnOrder} onPreview={setOverlay} />
            </div>
          )}
          <div hidden={tab !== 'rules'}>
            <ModeRules mode={mode} rules={rules} wallsPerPlayer={session.setup.wallsPerPlayer} />
          </div>
        </div>
      </SidePanel>
      {pendingImport && (
        <ConfirmDialog
          title="진행 중인 게임을 덮어쓸까요?"
          confirmLabel="기보 불러오기"
          onCancel={() => {
            setPendingImport(null);
            setNotice('가져오기를 취소했습니다 — 현재 게임은 그대로입니다.');
          }}
          onConfirm={() => {
            const parsed = pendingImport;
            setPendingImport(null);
            applyImport(parsed);
          }}
        >
          현재 {title} 게임({history.length}수)이 있습니다. 기보를 불러오면 이 게임은 사라집니다.
          <br />
          불러올 기보: <b>{modeInfo(pendingImport.mode).title}</b>, {pendingImport.actions.length}수.
        </ConfirmDialog>
      )}
    </main>
  );
}

const JUMP_RULES = [
  '인접한 말은 바로 뒤로 뛰어넘을 수 있습니다. 바로 뒤가 벽·보드 끝·다른 말이면 그 말의 좌우 옆 칸으로 대각선 이동합니다 (그 옆 칸에 벽이나 말이 있으면 못 갑니다).',
  '한 번에 말 하나만 뛰어넘습니다. 말이 두 개 이상 일렬로 붙어 있으면 직선 점프는 불가능하고, 첫 말 기준으로 대각선만 가능합니다.',
  '모든 플레이어에게 목표선까지 가는 길이 하나는 남아 있어야 하며, 이를 막는 벽은 놓을 수 없습니다. 말은 길을 막는 것으로 치지 않습니다.',
];

const MODE_RULES: Record<string, string[]> = {
  'four-player': [
    '네 말이 각 변의 한가운데에서 출발하고, 자기 출발선의 반대편 줄에 먼저 닿으면 이깁니다.',
    '차례는 P1 → P2 → P3 → P4, 시계 방향입니다. 한 수에 말을 한 칸 옮기거나 벽 하나를 놓습니다.',
    '벽은 한 사람당 5개입니다.',
  ],
  'race-2': [
    '두 말이 맨 아래 줄 d1·f1에서 나란히 출발해, 위쪽 줄에 먼저 닿는 사람이 이깁니다. 두 출발점 모두 목표까지 8칸입니다.',
    '벽은 10개씩. 상대의 길을 막아 늦출 수 있지만 완전히 막을 수는 없습니다.',
    '같은 길목에서 마주치면 점프 규칙이 그대로 적용됩니다.',
  ],
  'race-4': [
    '네 말이 맨 아래 줄 b·d·f·h에서 출발해 모두 위쪽 줄을 향합니다. 먼저 닿는 사람이 이깁니다.',
    '벽은 5개씩. 모든 말의 길이 남아 있어야 벽을 놓을 수 있습니다.',
    '배치는 좌우 대칭이지만, 바깥쪽(b·h)과 가운데(d·f) 말은 주변 공간이 달라 구조적으로 완전히 같지는 않습니다. 시작 플레이어를 바꿔 균형을 맞춰 보세요.',
  ],
  'three-player': [
    '아래·왼쪽·위의 중앙에서 출발해 각자 반대편 줄에 먼저 닿는 사람이 이깁니다. (공식 규칙에 없는 변형입니다)',
    '차례는 P1(아래) → P2(왼쪽) → P3(위) 시계 방향. 벽은 5개씩.',
    '오른쪽 변은 비어 있어서 위치에 따라 불리·유리가 생길 수 있습니다. 시작 플레이어를 고르거나 무작위로 정할 수 있습니다.',
  ],
  'team-2v2': [
    '정규 4인전과 같은 배치입니다. A팀은 아래·위, B팀은 왼쪽·오른쪽에 있고 A → B → A → B 순서로 번갈아 둡니다.',
    '각자 자기 출발선의 반대편이 목표입니다. 팀원 누구든 자기 목표선에 먼저 닿으면 팀 전체가 이깁니다.',
    '팀원의 말도 일반 말과 똑같이 같은 칸에 못 서고, 점프·대각선 규칙의 대상입니다. 벽은 아군에게도 똑같이 작용하며, 벽은 개인별 5개입니다 (팀 공동 벽은 없습니다).',
  ],
  asymmetric: [
    '시작 위치·목표선·벽 개수·차례 순서를 플레이어마다 다르게 정한 대국입니다. 먼저 자기 목표선에 닿는 사람이 이깁니다.',
    '이 조건이 공정한 대국을 보장하지는 않습니다. 겹치는 시작 위치나, 시작부터 목표선 위인 배치는 허용되지 않습니다.',
  ],
  obstacle: [
    '처음부터 놓인 어두운 돌 벽(중립 벽)이 있는 맵에서 경쟁합니다. 중립 벽은 누구의 벽도 아니라서 내 벽 개수에 포함되지 않습니다.',
    '모든 참가자가 목표선에 갈 수 있는 맵만 만들어집니다. 이후 각자 자기 벽을 더 놓을 수 있습니다.',
    '같은 난이도·시드·인원이면 같은 맵입니다. 시드와 중립 벽 위치는 기보에 함께 저장됩니다.',
  ],
};

const PRESET_TITLE: Record<string, string> = { easy: '쉬움', normal: '보통', hard: '어려움', random: '무작위' };

function ModeRules({ mode, rules, wallsPerPlayer }: { mode: GameMode; rules: MultiRules; wallsPerPlayer: readonly number[] }) {
  const info = modeInfo(mode);
  const metrics = rules.neutralWalls?.length ? obstacleMetrics(rules, rules.neutralWalls) : null;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-soft" data-rules-tab={mode}>
      <p className="text-xs font-medium text-muted">
        {info.title} · {info.players} · {info.official ? '공식 규칙' : '변형 규칙'}
      </p>
      <ul className="list-disc space-y-1.5 pl-5">
        {(MODE_RULES[mode] ?? []).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">이동·점프·벽 (모든 모드 공통)</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {JUMP_RULES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <ul className="space-y-0.5 text-xs text-muted" aria-label="플레이어 설정">
        {rules.players.map((p, i) => (
          <li key={i}>
            <span className="font-medium text-ink-soft">{PLAYER_LABEL[i]}</span>
            {rules.teams ? ` (${TEAM_NAMES[rules.teams[i]]})` : ''} — {seatText(p)} · 벽 {wallsPerPlayer[i]}개
          </li>
        ))}
        {rules.teams && <li>같은 팀: {[0, 1].map((t) => teamSeats(rules, rules.teams!.indexOf(t)).map((s) => PLAYER_LABEL[s]).join('·')).join(' / ')}</li>}
      </ul>
      {metrics && (
        <p className="rounded-lg bg-inset px-3 py-2 text-xs text-muted" data-obstacle-info>
          {rules.preset ? `난이도 ${PRESET_TITLE[rules.preset] ?? rules.preset} · ` : ''}
          시드 <span className="font-mono">{rules.seed}</span>
          <br />
          {describeObstacleMap(metrics)}
        </p>
      )}
      <p className="text-xs text-faint">
        {info.official ? '공식 룰북(Gigamic) 4인 규칙을 따릅니다. ' : ''}여러 말이 얽힌 점프처럼 룰북이 정하지 않은 경우는 위와 같이 해석해 적용합니다. 자리마다 사람 또는 AI(Random · BFS / Greedy · Max-N)를 고를 수 있고, AI가 모두인 대국은 스스로 진행합니다.
      </p>
    </div>
  );
}
