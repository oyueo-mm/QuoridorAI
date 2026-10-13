import { useEffect, useMemo, useState } from 'react';
import { agentName } from '../ai/catalog';
import { useMoveSounds, useOutcomeSound } from '../audio/moveSounds';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import { boardColumnStyle } from '../components/board/layout';
import type { BoardOverlay } from '../components/board/overlay';
import { AnalysisPanel } from '../components/panels/AnalysisPanel';
import { MoveLog } from '../components/panels/MoveLog';
import { PlayerStrip } from '../components/panels/PlayerStrip';
import { SearchProgressBar } from '../components/panels/SearchProgressBar';
import { SetupPanel } from '../components/panels/SetupPanel';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import { ORIENTATION_OPTIONS, Segmented, Tabs, buttonClass, cardClass, useBoardOrientation } from '../components/ui';
import { distanceToRow, goalRow, opponentOf } from '../engine';
import type { PlayerId } from '../engine';
import { copyText, downloadText } from '../components/download';
import { describeHalt } from '../match/outcome';
import { buildRecord, recordToText, resultOf } from '../match/gameRecord';
import type { GameLine, SeatInfo } from '../match/gameRecord';
import { wallOwnersFromMoves } from '../match/wallOwners';
import type { GameSession } from '../session/useGameSession';

type PlayTab = 'analysis' | 'moves' | 'setup';

/** Play: human vs AI / human vs human. Board in the middle; details live in the side tabs. */
export function PlayView({ session, onCompare, onArena }: { session: GameSession; onCompare: (line: GameLine, label: string) => void; onArena: (line: GameLine, label: string) => void }) {
  const { game, config, controllers, status, history, controller } = session;
  const [showPaths, setShowPaths] = useState(false);
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null);
  const hasAi = controllers.some((c) => c.kind === 'ai');
  const [tab, setTab] = useState<PlayTab>('analysis');
  // 'auto' keeps the user's own pawn at the bottom (also when playing second).
  const orientation = useBoardOrientation('play', config.userSeat);

  // Wall owners come from the game record (the engine stores walls without an owner).
  const wallOwners = useMemo(() => wallOwnersFromMoves(history), [history]);
  // Position selected in the record panel for export / Compare / Arena (null = latest).
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => setSelectedPly(null), [session.gameId]);
  const ply = selectedPly === null || selectedPly > history.length ? history.length : selectedPly;
  const positionAt = ply === history.length ? game : history[ply].stateBefore;
  const actions = useMemo(() => history.map((h) => ({ action: h.action, player: h.player })), [history]);
  const line: GameLine = { actions, ply };
  // A sound for every completed move of either side (human or AI); restarts are silent.
  useMoveSounds(session.gameId, history, 'play');
  // Win / loss from the user's seat (Human vs Human: the seat chosen as '내 순서'). Declared after
  // the move sound so the result is scheduled after the winning move's sound.
  useOutcomeSound(session.gameId, status, config.userSeat, 'play');
  const distances = useMemo(() => [0, 1].map((p) => distanceToRow(game, game.pawns[p], goalRow(p as PlayerId))), [game]);

  const userSeat = config.userSeat;
  const whoIs = (p: PlayerId) => {
    if (p === userSeat) return '나';
    const c = controllers[p];
    return c.kind === 'ai' ? agentName(c.agentId) : '상대 (같은 기기)';
  };
  const last = history.at(-1);
  const aiToMove = status.kind === 'playing' && controllers[game.currentPlayer].kind === 'ai';
  const aiSettings =
    config.opponent === 'minimax'
      ? { timeLimitMs: config.minimax.timeLimitMs, maxDepth: config.minimax.maxDepth }
      : config.opponent === 'mcts' || config.opponent === 'mcts-guided'
        ? { timeLimitMs: (config.opponent === 'mcts' ? config.mcts : config.mctsGuided).timeLimitMs, maxDepth: 0 }
        : null;

  const strip = (p: PlayerId) => (
    <PlayerStrip
      player={p}
      name={whoIs(p)}
      isAi={controllers[p].kind === 'ai'}
      wallsRemaining={game.wallsRemaining[p]}
      distance={distances[p]}
      active={status.kind === 'playing' && game.currentPlayer === p}
      thinking={session.thinking && game.currentPlayer === p}
      winner={status.kind === 'win' && status.winner === p}
    />
  );

  return (
    <main className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col items-center">
        <div className="flex flex-col gap-2" style={boardColumnStyle(21)}>
          {strip(opponentOf(orientation.bottomSeat))}

          {/* One fixed-height slot: status, AI search progress or an error — never moves the board. */}
          <div className="h-10">
            {session.error ? (
              <p className="flex h-10 items-center truncate rounded-xl bg-danger/8 px-3 text-xs text-danger" title={session.error}>
                {session.error}
              </p>
            ) : session.thinking && aiToMove && aiSettings ? (
              <SearchProgressBar progress={session.progress} timeLimitMs={aiSettings.timeLimitMs} maxDepth={aiSettings.maxDepth} />
            ) : (
              <div className="flex h-10 items-center justify-between gap-3 px-1">
                {statusText()}
                {status.kind !== 'playing' && (
                  <button type="button" onClick={() => controller.restart()} className={`${buttonClass.primary} shrink-0 px-3 py-1.5 text-xs`}>
                    다시 하기
                  </button>
                )}
              </div>
            )}
          </div>

          <QuoridorBoard
            state={game}
            flipped={orientation.flipped}
            interactive={session.humanToMove}
            showPaths={showPaths}
            lastAction={last && { action: last.action, player: last.player, from: last.stateBefore.pawns[last.player] }}
            overlay={overlay}
            wallOwners={wallOwners}
            idleHint={aiToMove ? 'AI 차례입니다' : ''}
            onAction={(a) => controller.playHuman(a)}
          />

          {strip(orientation.bottomSeat)}

          <div className="flex h-9 items-center gap-2 overflow-x-auto px-1 whitespace-nowrap">
            <button
              type="button"
              onClick={() => controller.undo()}
              disabled={!session.canUndo}
              className={`${buttonClass.small} shrink-0`}
              title={controllers.some((c) => c.kind === 'ai') ? '내 마지막 수와 AI 응수를 되돌립니다' : '직전 수를 되돌립니다'}
            >
              ↶ 무르기
            </button>
            <Segmented label="보드 방향" options={ORIENTATION_OPTIONS} value={orientation.mode} onChange={orientation.setMode} />
            <button type="button" onClick={() => setShowPaths((v) => !v)} aria-pressed={showPaths} className={`${buttonClass.ghost} ${showPaths ? 'bg-inset text-ink' : ''}`}>
              최단 경로
            </button>
            {game.winner === null && (
              <button type="button" onClick={() => onCompare({ actions, ply: history.length }, `Play · ${history.length}수 후`)} className={buttonClass.ghost} title="이 포지션에서 여러 AI의 선택을 비교합니다">
                <span className="sm:hidden">비교</span>
                <span className="hidden sm:inline">이 포지션 비교</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <aside className={`${cardClass} flex h-[34rem] min-w-0 flex-col gap-3 p-3 lg:sticky lg:top-[4.75rem] lg:h-[calc(100svh-6.25rem)]`}>
        <Tabs
          label="Play 패널"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'analysis', label: '분석' },
            { id: 'moves', label: '기보', badge: history.length },
            { id: 'setup', label: '새 게임' },
          ]}
        />
        <div className={`min-h-0 flex-1 px-2 ${tab === 'moves' ? '' : 'scroll-stable'}`}>
          <div hidden={tab !== 'analysis'}>
            <AnalysisPanel key={session.gameId} state={game} history={history} hasAi={hasAi} thinking={session.thinking} onPreview={setOverlay} />
          </div>
          <div hidden={tab !== 'moves'} className="h-full">
            <div className="flex h-full flex-col gap-2">
              <div className="flex min-h-7 flex-wrap items-center gap-1.5">
                <span className="mr-auto text-xs text-muted">
                  {ply === history.length ? `최신 (${history.length}수)` : `선택: ${ply}수 후`}
                  {selectedPly !== null && (
                    <button type="button" onClick={() => setSelectedPly(null)} className="ml-1.5 text-accent hover:underline">
                      최신으로
                    </button>
                  )}
                </span>
                <button type="button" className={buttonClass.small} disabled={history.length === 0} onClick={async () => setNotice((await copyText(recordToText(actions))) ? '기보를 복사했습니다.' : '복사하지 못했습니다 — JSON 다운로드를 이용하세요.')}>
                  복사
                </button>
                <button type="button" className={buttonClass.small} disabled={history.length === 0} onClick={exportJson}>
                  JSON
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={buttonClass.small} onClick={() => onCompare(line, `Play · ${ply}수 후`)}>
                  Compare에서 분석
                </button>
                <button
                  type="button"
                  className={buttonClass.small}
                  disabled={positionAt.winner !== null}
                  onClick={() => onArena(line, `Play · ${ply}수 후`)}
                  title={positionAt.winner !== null ? '끝난 포지션입니다 — 종료 전의 수를 선택하세요' : '이 포지션에서 AI 대 AI로 이어 둡니다'}
                >
                  Arena에서 이어두기
                </button>
              </div>
              <p className="min-h-4 text-[11px] text-faint">
                {positionAt.winner !== null ? '끝난 포지션은 Arena에서 이어 둘 수 없습니다 — 목록에서 종료 전의 수를 선택하세요.' : notice || '수를 누르면 그 수 이후의 포지션을 내보내거나 다른 화면으로 보냅니다.'}
              </p>
              <div className="min-h-0 flex-1">
                <MoveLog moves={history} selectedPly={selectedPly} onSelect={setSelectedPly} />
              </div>
            </div>
          </div>
          <div hidden={tab !== 'setup'}>
            <SetupPanel
              key={session.gameId}
              current={config}
              onStart={(c) => {
                controller.restart(c);
                setTab(c.opponent === 'human' ? 'moves' : 'analysis');
              }}
            />
          </div>
        </div>
      </aside>
    </main>
  );

  function exportJson() {
    const seats = ([0, 1] as const).map((p): SeatInfo => {
      const c = controllers[p];
      if (c.kind === 'human') return { kind: 'human', label: whoIs(p) };
      const settings = c.agentId === 'minimax' ? config.minimax : c.agentId === 'mcts' ? config.mcts : c.agentId === 'mcts-guided' ? config.mctsGuided : c.agentId === 'bfs' ? config.bfsWeights : undefined;
      return { kind: 'ai', label: whoIs(p), agent: c.agentId, settings: { ...(settings ? { [c.agentId]: settings } : {}), seed: config.seed } };
    }) as [SeatInfo, SeatInfo];
    const rec = buildRecord(line, { source: 'play', seats, meta: { userSeat: config.userSeat, maxPlies: config.maxPlies }, result: resultOf(status) });
    downloadText(`quoridor-game-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, JSON.stringify(rec, null, 2), 'application/json');
    setNotice('JSON 파일을 저장했습니다.');
  }

  function statusText() {
    if (status.kind === 'win') {
      return (
        <p className="truncate text-sm text-ink">
          <span className={`font-semibold ${PLAYER_TEXT_CLASS[status.winner]}`}>
            {PLAYER_LABEL[status.winner]} ({whoIs(status.winner)})
          </span>{' '}
          승리 <span className="ml-2 font-mono text-xs text-faint">ply {game.ply}</span>
        </p>
      );
    }
    if (status.kind === 'halted') {
      return (
        <p className="truncate text-sm text-warn">
          실험 중단 — {describeHalt(status)} <span className="text-xs text-faint">(승패 없음)</span>
        </p>
      );
    }
    const p = game.currentPlayer;
    return (
      <p className="truncate text-sm text-ink-soft">
        <span className={`font-semibold ${PLAYER_TEXT_CLASS[p]}`}>{PLAYER_LABEL[p]}</span> {whoIs(p)} · {session.thinking ? <span className="text-think">생각 중…</span> : '차례'}
        <span className="ml-2 font-mono text-xs text-faint">
          ply {game.ply}
          {config.maxPlies !== null && ` / ${config.maxPlies}`}
        </span>
      </p>
    );
  }
}
