import { useEffect, useMemo, useState } from 'react';
import { useMoveSounds, useOutcomeSound } from '../audio/moveSounds';
import { MultiGameStage } from '../components/board/GameStage';
import { multiBoardRules } from '../components/board/boardRules';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import { copyText, downloadText } from '../components/download';
import { MoveLog } from '../components/panels/MoveLog';
import { PlayerChip } from '../components/panels/PlayerStrip';
import { SetupPanel } from '../components/panels/SetupPanel';
import { SidePanel, sidePanelGrid } from '../components/panels/SidePanel';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import { Tabs, buttonClass } from '../components/ui';
import { goalDistanceMulti, seatSlot } from '../engine';
import type { Coord, Goal } from '../engine';
import { buildMultiRecord, multiRecordToText, parseMultiRecord } from '../match/multiRecord';
import { wallOwnersFromMoves } from '../match/wallOwners';
import type { MultiSession } from '../session/useMultiSession';
import type { PlaySetupApi } from './playSetup';

type FourTab = 'moves' | 'rules' | 'setup';

/** Replay speed of "자동 재생". */
const REPLAY_INTERVAL_MS = 700;

const sideOfStart = (c: Coord) => (c.row === 8 ? '아래' : c.row === 0 ? '위' : c.col === 0 ? '왼쪽' : '오른쪽');
const sideOfGoal = (g: Goal) => (g.axis === 'row' ? (g.index === 0 ? '위' : '아래') : g.index === 0 ? '왼쪽' : '오른쪽');

/**
 * Four-player game (local, one device, clockwise). Same screen structure as Play: cards beside the
 * board, controls under it, record / rules / new-game tabs in the side panel. Browsing the record
 * (replay) shows that position read-only; playing resumes from "최신으로".
 */
export function FourPlayerView({ session, setup }: { session: MultiSession; setup: PlaySetupApi }) {
  const { game, history, controller, names, status, gameId } = session;
  const rules = game.rules;
  const boardRules = useMemo(() => multiBoardRules(rules), [rules]);
  const [showPaths, setShowPaths] = useState(false);
  const [tab, setTab] = useState<FourTab>('moves');
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [notice, setNotice] = useState('');
  const [paste, setPaste] = useState('');

  useEffect(() => {
    setSelectedPly(null);
    setAutoplay(false);
    setConfirmRestart(false);
    setNotice('');
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
  const actions = useMemo(() => history.map((h) => ({ action: h.action, player: h.player })), [history]);
  const slotOf = (seat: number) => seatSlot(rules, seat);
  const nameOf = (seat: number) => names[slotOf(seat)];
  const playing = status.kind === 'playing';
  const turnSeat = position.currentPlayer;
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

  const record = () => buildMultiRecord(session.setup, actions, { names, ply });
  const exportJson = () => {
    downloadText(`quoridor-4p-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(record(), null, 2), 'application/json');
    setNotice('JSON 파일을 저장했습니다.');
  };
  const importText = (text: string) => {
    const parsed = parseMultiRecord(text);
    if (!parsed.ok) return setNotice(`가져오기 실패 — ${parsed.error}`);
    controller.load(parsed);
    setNotice(`기보를 불러왔습니다 (${parsed.actions.length}수).`);
    setPaste('');
  };

  const seat = (s: number) => {
    const slot = slotOf(s);
    const start = rules.players[s].start;
    return (
      <PlayerChip
        player={slot}
        name={names[slot]}
        isAi={false}
        thinking={false}
        wallsRemaining={position.wallsRemaining[s]}
        wallsTotal={5}
        distance={distances[s]}
        active={playing && !browsing && turnSeat === s}
        winner={position.winner === s}
        seatHint={`${sideOfStart(start)}에서 시작 → ${sideOfGoal(rules.players[s].goal)}쪽 도착`}
      />
    );
  };

  const statusLine = (
    <div className="flex h-10 items-center justify-between gap-3 px-1">
      {status.kind === 'win' ? (
        <p className="truncate text-sm text-ink" data-status="win">
          <span className={`font-semibold ${PLAYER_TEXT_CLASS[slotOf(status.winner)]}`}>
            {PLAYER_LABEL[slotOf(status.winner)]} {nameOf(status.winner)}
          </span>{' '}
          승리 <span className="ml-2 font-mono text-xs text-faint">{history.length}수</span>
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
    <main className={sidePanelGrid(panelOpen)} data-view="four-player">
      <MultiGameStage
        reserved={30}
        reservedWide={9}
        seats={rules.turnOrder}
        seat={seat}
        status={statusLine}
        side={
          <>
            {status.kind === 'win' ? (
              <p className="text-center text-sm text-ink">
                <span className={`font-semibold ${PLAYER_TEXT_CLASS[slotOf(status.winner)]}`}>
                  {PLAYER_LABEL[slotOf(status.winner)]} {nameOf(status.winner)}
                </span>{' '}
                승리
              </p>
            ) : (
              <p className="text-center text-sm text-ink-soft">
                <span className={`font-semibold ${PLAYER_TEXT_CLASS[slotOf(game.currentPlayer)]}`}>{PLAYER_LABEL[slotOf(game.currentPlayer)]}</span> 차례
              </p>
            )}
            <p className="text-center font-mono text-xs text-muted tabular-nums">{history.length}수</p>
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
            interactive={playing && !browsing}
            showPaths={showPaths}
            lastAction={lastEntry && { action: lastEntry.action, player: lastEntry.player, from: lastEntry.stateBefore.pawns[lastEntry.player] }}
            wallOwners={wallOwners}
            idleHint={browsing ? `기보 보기 — ${ply}수 후 (최신으로 돌아가면 이어서 둘 수 있습니다)` : status.kind === 'win' ? '게임이 끝났습니다 — 무르기로 되돌리거나 다시 하세요' : ''}
            onAction={(a) => controller.play(a)}
          />
        }
        controls={
          <div className="flex min-h-9 flex-wrap items-center gap-2 px-1">
            <button type="button" onClick={() => controller.undo()} disabled={!session.canUndo || browsing} className={`${buttonClass.small} shrink-0`} title={browsing ? '기보 보기 중입니다 — 최신으로 돌아간 뒤 무르세요' : '직전 한 수를 되돌립니다'}>
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
              <button type="button" onClick={() => goTo(history.length)} className={`${buttonClass.small} ml-auto`}>
                최신으로
              </button>
            )}
          </div>
        }
      />

      <SidePanel
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        name="4인전 패널"
        tabs={
          <Tabs
            label="4인전 패널"
            value={tab}
            onChange={setTab}
            items={[
              { id: 'moves', label: '기보', badge: history.length },
              { id: 'rules', label: '규칙' },
              { id: 'setup', label: '새 게임' },
            ]}
          />
        }
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
              <p className="min-h-4 text-[11px] text-faint">{notice || '수를 누르면 그 수 이후의 포지션을 보드에 보여 줍니다. AI 비교·관전·자동 실험은 2인전 전용이라 4인전 기보는 보낼 수 없습니다.'}</p>
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
          <div hidden={tab !== 'rules'}>
            <FourPlayerRules />
          </div>
          <div hidden={tab !== 'setup'}>
            <SetupPanel
              key={`${setup.mode}-${gameId}`}
              current={setup.config}
              currentMulti={setup.multiConfig}
              currentMode={setup.mode}
              onStart={(c) => setup.startTwoPlayer(c)}
              onStartMulti={(c) => {
                setup.startFourPlayer(c);
                setTab('moves');
              }}
            />
          </div>
        </div>
      </SidePanel>
    </main>
  );
}

function FourPlayerRules() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-soft">
      <ul className="list-disc space-y-1.5 pl-5">
        <li>네 말이 각 변의 한가운데에서 출발하고, 자기 출발선의 반대편 줄에 먼저 닿으면 이깁니다.</li>
        <li>차례는 P1 → P2 → P3 → P4, 시계 방향입니다. 한 수에 말을 한 칸 옮기거나 벽 하나를 놓습니다.</li>
        <li>벽은 한 사람당 5개이고, 모든 플레이어의 목표 줄로 가는 길을 완전히 막을 수 없습니다.</li>
        <li>인접한 말은 뛰어넘을 수 있습니다. 바로 뒤가 벽·보드 끝·다른 말이면 그 말의 좌우 옆 칸으로 대각선 이동합니다. 두 개 이상의 말은 뛰어넘을 수 없습니다.</li>
      </ul>
      <p className="text-xs text-faint">공식 룰북(Gigamic) 4인 규칙을 따릅니다. 이번 버전의 4인전은 AI 없이 사람끼리 두는 로컬 대국입니다.</p>
    </div>
  );
}
