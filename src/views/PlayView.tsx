import { useMemo, useState } from 'react';
import { agentName } from '../ai/catalog';
import { QuoridorBoard } from '../components/board/QuoridorBoard';
import type { BoardOverlay } from '../components/board/overlay';
import { AnalysisPanel } from '../components/panels/AnalysisPanel';
import { MoveLog } from '../components/panels/MoveLog';
import { PlayerCard } from '../components/panels/PlayerCard';
import { SearchProgressBar } from '../components/panels/SearchProgressBar';
import { SetupPanel } from '../components/panels/SetupPanel';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from '../components/theme';
import { distanceToRow, goalRow, opponentOf } from '../engine';
import type { PlayerId } from '../engine';
import { describeHalt } from '../match/outcome';
import type { GameSession } from '../session/useGameSession';
import type { GameState } from '../engine';

/** Play: human vs human / human vs AI (stage 1–4 view, unchanged apart from the Compare link). */
export function PlayView({ session, onCompare }: { session: GameSession; onCompare: (state: GameState, label: string) => void }) {
  const { game, config, controllers, status, history, controller } = session;
  const [showPaths, setShowPaths] = useState(true);
  const [overlay, setOverlay] = useState<BoardOverlay | null>(null);

  const distances = useMemo(
    () => [0, 1].map((p) => distanceToRow(game, game.pawns[p], goalRow(p as PlayerId))),
    [game],
  );

  const userSeat = config.userSeat;
  // Opponent card on top, user card at the bottom, mirroring the board orientation.
  const seatOrder: PlayerId[] = [opponentOf(userSeat), userSeat];
  const whoIs = (p: PlayerId) => {
    if (p === userSeat) return '나';
    const c = controllers[p];
    return c.kind === 'ai' ? agentName(c.agentId) : '상대';
  };
  const last = history.at(-1);
  const aiToMove = status.kind === 'playing' && controllers[game.currentPlayer].kind === 'ai';

  return (
    <main className="mx-auto grid max-w-[1440px] gap-4 p-4 sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)_340px] xl:grid-cols-[280px_minmax(0,1fr)_400px]">
      <aside className="order-2 space-y-4 lg:order-1">
          <SetupPanel key={session.gameId} current={config} onStart={(c) => controller.restart(c)} />
          {seatOrder.map((p) => (
            <PlayerCard
              key={p}
              player={p}
              controller={controllers[p]}
              isUser={p === userSeat}
              wallsRemaining={game.wallsRemaining[p]}
              distance={distances[p]}
              active={status.kind === 'playing' && game.currentPlayer === p}
              thinking={session.thinking && game.currentPlayer === p}
              winner={status.kind === 'win' && status.winner === p}
            />
          ))}
        </aside>

        <section className="order-1 flex flex-col items-center gap-3 lg:order-2">
          <div className="flex w-full max-w-[640px] flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2.5">
            {statusText()}
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showPaths}
                  onChange={(e) => setShowPaths(e.target.checked)}
                  className="accent-sky-500"
                />
                현재 최단 경로
              </label>
              {game.winner === null && (
                <button
                  type="button"
                  onClick={() => onCompare(game, `Play · ply ${game.ply}`)}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-500"
                  title="이 포지션에서 여러 AI의 선택을 비교합니다"
                >
                  Compare
                </button>
              )}
              {status.kind !== 'playing' && (
                <button
                  type="button"
                  onClick={() => controller.restart()}
                  className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                >
                  다시 하기
                </button>
              )}
            </div>
          </div>
          {session.thinking && controllers[game.currentPlayer].kind === 'ai' && config.opponent === 'minimax' && (
            <SearchProgressBar
              progress={session.progress}
              timeLimitMs={config.minimax.timeLimitMs}
              maxDepth={config.minimax.maxDepth}
            />
          )}
          {session.thinking && controllers[game.currentPlayer].kind === 'ai' && (config.opponent === 'mcts' || config.opponent === 'mcts-guided') && (
            <SearchProgressBar
              progress={session.progress}
              timeLimitMs={(config.opponent === 'mcts' ? config.mcts : config.mctsGuided).timeLimitMs}
              maxDepth={0}
            />
          )}
          {session.error && (
            <p className="w-full max-w-[640px] rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {session.error}
            </p>
          )}

          <QuoridorBoard
            state={game}
            flipped={userSeat === 1}
            interactive={session.humanToMove}
            showPaths={showPaths}
            lastAction={last && { action: last.action, player: last.player }}
            overlay={overlay}
            idleHint={aiToMove ? 'AI 차례입니다 — 조작할 수 없습니다' : ''}
            onAction={(a) => controller.playHuman(a)}
          />
        </section>

        <aside className="order-3 space-y-4">
          <AnalysisPanel
            key={session.gameId}
            state={game}
            history={history}
            hasAi={controllers.some((c) => c.kind === 'ai')}
            thinking={session.thinking}
            onPreview={setOverlay}
          />
          <MoveLog history={history} />
        </aside>
      </main>
  );

  function statusText() {
    if (status.kind === 'win') {
      return (
        <p className="text-sm">
          <span className={`font-semibold ${PLAYER_TEXT_CLASS[status.winner]}`}>
            {PLAYER_LABEL[status.winner]} ({whoIs(status.winner)})
          </span>{' '}
          승리! <span className="ml-2 font-mono text-xs text-slate-500">ply {game.ply}</span>
        </p>
      );
    }
    if (status.kind === 'halted') {
      return (
        <p className="text-sm text-amber-300">
          실험 중단 — {describeHalt(status)} <span className="text-xs text-slate-400">(승패 없음)</span>
        </p>
      );
    }
    const p = game.currentPlayer;
    return (
      <p className="text-sm">
        <span className={`font-semibold ${PLAYER_TEXT_CLASS[p]}`}>
          {PLAYER_LABEL[p]} ({whoIs(p)})
        </span>{' '}
        {session.thinking ? <span className="text-violet-300">생각 중…</span> : '차례'}
        <span className="ml-2 font-mono text-xs text-slate-500">
          ply {game.ply}
          {config.maxPlies !== null && ` / ${config.maxPlies}`}
        </span>
      </p>
    );
  }
}
