import { useMemo, useState } from 'react';
import { agentName } from '../ai/catalog';
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
import type { GameState, PlayerId } from '../engine';
import { describeHalt } from '../match/outcome';
import type { GameSession } from '../session/useGameSession';

type PlayTab = 'analysis' | 'moves' | 'setup';

/** Play: human vs AI / human vs human. Board in the middle; details live in the side tabs. */
export function PlayView({ session, onCompare }: { session: GameSession; onCompare: (state: GameState, label: string) => void }) {
  const { game, config, controllers, status, history, controller } = session;
  const [showPaths, setShowPaths] = useState(false);
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null);
  const hasAi = controllers.some((c) => c.kind === 'ai');
  const [tab, setTab] = useState<PlayTab>('analysis');
  // 'auto' keeps the user's own pawn at the bottom (also when playing second).
  const orientation = useBoardOrientation('play', config.userSeat);

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
            lastAction={last && { action: last.action, player: last.player }}
            overlay={overlay}
            idleHint={aiToMove ? 'AI 차례입니다' : ''}
            onAction={(a) => controller.playHuman(a)}
          />

          {strip(orientation.bottomSeat)}

          <div className="flex h-9 items-center gap-2 overflow-x-auto px-1 whitespace-nowrap">
            <Segmented label="보드 방향" options={ORIENTATION_OPTIONS} value={orientation.mode} onChange={orientation.setMode} />
            <button type="button" onClick={() => setShowPaths((v) => !v)} aria-pressed={showPaths} className={`${buttonClass.ghost} ${showPaths ? 'bg-inset text-ink' : ''}`}>
              최단 경로
            </button>
            {game.winner === null && (
              <button type="button" onClick={() => onCompare(game, `Play · ply ${game.ply}`)} className={buttonClass.ghost} title="이 포지션에서 여러 AI의 선택을 비교합니다">
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
            <MoveLog history={history} />
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
