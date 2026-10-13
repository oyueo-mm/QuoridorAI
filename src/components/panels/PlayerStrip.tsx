import { useId } from 'react';
import { WALLS_PER_PLAYER } from '../../engine';
import type { PlayerId } from '../../engine';
import { PLAYER_BG_CLASS, PLAYER_LABEL, PLAYER_TEXT_CLASS, WALL_COLORS } from '../theme';

interface PlayerStripProps {
  player: PlayerId;
  /** Who plays this seat: '나', '상대', an AI name … */
  name: string;
  isAi: boolean;
  wallsRemaining: number;
  distance: number;
  /** It is this player's turn (game running). */
  active: boolean;
  thinking: boolean;
  winner: boolean;
}

/**
 * One line per player above / below the board. Fixed height and fixed-width parts, so turn
 * changes, "thinking" and wall counts never change its size.
 */
export function PlayerStrip({ player, name, isAi, wallsRemaining, distance, active, thinking, winner }: PlayerStripProps) {
  const status = winner ? '승리' : active ? (thinking ? '생각 중…' : '차례') : '';
  return (
    <div data-player-strip={player} className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 transition-colors ${active || winner ? 'bg-card shadow-[var(--shadow-soft)]' : ''}`}>
      <span className={`h-3 w-3 shrink-0 rounded-full ${PLAYER_BG_CLASS[player]}`} aria-hidden />
      <span className={`shrink-0 text-sm font-semibold ${PLAYER_TEXT_CLASS[player]}`}>{PLAYER_LABEL[player]}</span>
      <span className="min-w-0 truncate text-sm text-ink-soft" title={name}>
        {name}
      </span>
      {isAi && <span className="shrink-0 rounded-md bg-think/10 px-1.5 py-0.5 text-[11px] text-think">AI</span>}
      <span className={`w-14 shrink-0 text-xs ${winner ? 'font-medium text-good' : thinking ? 'text-think' : 'text-muted'}`}>{status}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5" title={`${PLAYER_LABEL[player]} 장벽 (남은 벽 ${wallsRemaining}개)`}>
        <WallSwatch player={player} />
        <span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
          {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
            <span key={i} className={`h-3.5 w-1.5 rounded-full ${i < wallsRemaining ? PLAYER_BG_CLASS[player] : 'bg-inset-strong'}`} style={i < wallsRemaining ? { opacity: 0.85 } : undefined} />
          ))}
        </span>
      </span>
      <span className="ml-1 min-w-14 shrink-0 text-right font-mono text-xs text-muted">
        <span className="sm:sr-only">벽 {wallsRemaining} · </span>거리 {distance}
      </span>
    </div>
  );
}

/** This player's wall as drawn on the board (P1 solid, P2 with stripes) — the legend for walls. */
export function WallSwatch({ player }: { player: PlayerId }) {
  const id = `qz-swatch-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 22 8" className="h-2 w-[22px] shrink-0" role="img" aria-label={`${PLAYER_LABEL[player]} 장벽`}>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
          <rect width={1.5} height={4} fill="#fbf9f5" fillOpacity={0.45} />
        </pattern>
      </defs>
      <rect width={22} height={8} rx={3} fill={WALL_COLORS[player]} />
      {player === 1 && <rect width={22} height={8} rx={3} fill={`url(#${id})`} />}
    </svg>
  );
}
