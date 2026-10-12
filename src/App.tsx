import { useMemo, useState } from 'react';
import { QuoridorBoard } from './components/board/QuoridorBoard';
import { AnalysisPanel } from './components/panels/AnalysisPanel';
import { MoveLog } from './components/panels/MoveLog';
import { PlayerCard } from './components/panels/PlayerCard';
import { SetupPanel } from './components/panels/SetupPanel';
import { PLAYER_LABEL, PLAYER_TEXT_CLASS } from './components/theme';
import { distanceToRow, goalRow, opponentOf } from './engine';
import type { PlayerId } from './engine';
import { useGameSession } from './session/useGameSession';

export default function App() {
  const session = useGameSession();
  const { game, config, controllers } = session;
  const [showPaths, setShowPaths] = useState(true);

  const distances = useMemo(
    () => [0, 1].map((p) => distanceToRow(game, game.pawns[p], goalRow(p as PlayerId))),
    [game],
  );

  const userSeat = config.userSeat;
  // Opponent card on top, user card at the bottom, mirroring the board orientation.
  const seatOrder: PlayerId[] = [opponentOf(userSeat), userSeat];
  const whoIs = (p: PlayerId) => (p === userSeat ? '나' : config.opponent === 'local' ? '로컬 상대' : 'AI');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800/80 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Quoridor<span className="text-sky-400">AI</span> Lab
            </h1>
            <span className="hidden text-xs text-slate-500 sm:inline">게임 AI 의사결정 시각화 실험실</span>
          </div>
          <span className="rounded-full border border-slate-700 px-2.5 py-0.5 font-mono text-[11px] text-slate-400">
            stage 1 · engine + board
          </span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1440px] gap-4 p-4 sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)_300px] xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="order-2 space-y-4 lg:order-1">
          <SetupPanel key={`${config.userSeat}-${config.opponent}`} current={config} onStart={session.restart} />
          {seatOrder.map((p) => (
            <PlayerCard
              key={p}
              player={p}
              controller={controllers[p]}
              isUser={p === userSeat}
              wallsRemaining={game.wallsRemaining[p]}
              distance={distances[p]}
              active={game.winner === null && game.currentPlayer === p}
              winner={game.winner === p}
            />
          ))}
        </aside>

        <section className="order-1 flex flex-col items-center gap-3 lg:order-2">
          <div className="flex w-full max-w-[640px] items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2.5">
            {game.winner !== null ? (
              <p className="text-sm">
                <span className={`font-semibold ${PLAYER_TEXT_CLASS[game.winner]}`}>
                  {PLAYER_LABEL[game.winner]} ({whoIs(game.winner)})
                </span>{' '}
                승리!
              </p>
            ) : (
              <p className="text-sm">
                <span className={`font-semibold ${PLAYER_TEXT_CLASS[game.currentPlayer]}`}>
                  {PLAYER_LABEL[game.currentPlayer]} ({whoIs(game.currentPlayer)})
                </span>{' '}
                차례 <span className="ml-2 font-mono text-xs text-slate-500">ply {game.ply}</span>
              </p>
            )}
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={showPaths}
                  onChange={(e) => setShowPaths(e.target.checked)}
                  className="accent-sky-500"
                />
                최단 경로
              </label>
              {game.winner !== null && (
                <button
                  type="button"
                  onClick={() => session.restart(config)}
                  className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-sky-400"
                >
                  다시 하기
                </button>
              )}
            </div>
          </div>

          <QuoridorBoard
            state={game}
            flipped={userSeat === 1}
            interactive={session.humanToMove}
            showPaths={showPaths}
            onAction={session.play}
          />
        </section>

        <aside className="order-3 space-y-4">
          <AnalysisPanel state={game} />
          <MoveLog history={session.history} />
        </aside>
      </main>
    </div>
  );
}
