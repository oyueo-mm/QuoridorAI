import { WALLS_PER_PLAYER } from '../../engine';
import type { PlayerId } from '../../engine';
import type { SeatController } from '../../session/config';
import { PLAYER_BG_CLASS, PLAYER_LABEL, PLAYER_RING_CLASS, PLAYER_TEXT_CLASS } from '../theme';

interface PlayerCardProps {
  player: PlayerId;
  controller: SeatController;
  isUser: boolean;
  wallsRemaining: number;
  distance: number;
  active: boolean;
  winner: boolean;
}

export function PlayerCard({ player, controller, isUser, wallsRemaining, distance, active, winner }: PlayerCardProps) {
  const role = isUser ? '나' : controller.kind === 'human' ? '로컬 상대' : controller.agentId;
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition-shadow ${
        active ? `ring-2 ${PLAYER_RING_CLASS[player]}` : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${PLAYER_BG_CLASS[player]}`} />
          <span className={`font-semibold ${PLAYER_TEXT_CLASS[player]}`}>{PLAYER_LABEL[player]}</span>
          <span className="text-xs text-slate-500">{player === 0 ? '선공' : '후공'}</span>
        </div>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{role}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>남은 벽</span>
        <span className="font-mono text-slate-200">
          {wallsRemaining} / {WALLS_PER_PLAYER}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < wallsRemaining ? 'bg-amber-500' : 'bg-slate-800'}`} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>목표까지 최단 거리 (BFS)</span>
        <span className="font-mono text-slate-200">{distance}</span>
      </div>
      {(active || winner) && (
        <p className={`mt-3 text-xs font-medium ${PLAYER_TEXT_CLASS[player]}`}>{winner ? '🏆 승리' : '● 차례'}</p>
      )}
    </div>
  );
}
