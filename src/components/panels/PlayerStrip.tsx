import { useId } from 'react';
import { WALLS_PER_PLAYER } from '../../engine';
import { PLAYER_BG_CLASS, PLAYER_BORDER_CLASS, PLAYER_LABEL, PLAYER_TEXT_CLASS, WALL_COLORS } from '../theme';

export interface PlayerStripProps {
  /** Colour / label slot (P1…P4); with two players equal to the seat. */
  player: number;
  /** Who plays this seat: '나', '상대', an AI name … */
  name: string;
  isAi: boolean;
  wallsRemaining: number;
  distance: number;
  /** It is this player's turn (game running). */
  active: boolean;
  thinking: boolean;
  winner: boolean;
  /** Walls each player starts with (default 10; 5 in the four-player game). */
  wallsTotal?: number;
}

/**
 * One line per player above / below the board. Fixed height and fixed-width parts, so turn
 * changes, "thinking" and wall counts never change its size.
 */
export function PlayerStrip({ player, name, isAi, wallsRemaining, distance, active, thinking, winner, wallsTotal = WALLS_PER_PLAYER }: PlayerStripProps) {
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
          {Array.from({ length: wallsTotal }, (_, i) => (
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

/** Same information as PlayerStrip, as a compact vertical card for the column beside the board. */
export function PlayerCard({ player, name, isAi, wallsRemaining, distance, active, thinking, winner, wallsTotal = WALLS_PER_PLAYER }: PlayerStripProps) {
  const status = winner ? '승리' : active ? (thinking ? '생각 중…' : '차례') : '대기';
  const lit = active || winner;
  return (
    <div
      data-player-card={player}
      className={`flex w-full flex-col gap-2.5 rounded-2xl border-2 bg-card p-3.5 transition-colors ${lit ? `${PLAYER_BORDER_CLASS[player]} shadow-[var(--shadow-soft)]` : 'border-line-soft'}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full ${PLAYER_BG_CLASS[player]}`} aria-hidden />
        <span className={`text-base font-semibold ${PLAYER_TEXT_CLASS[player]}`}>{PLAYER_LABEL[player]}</span>
        {isAi && <span className="shrink-0 rounded-md bg-think/10 px-1.5 py-0.5 text-[11px] text-think">AI</span>}
        <span className={`ml-auto shrink-0 text-xs ${winner ? 'font-semibold text-good' : thinking ? 'text-think' : active ? 'font-medium text-ink-soft' : 'text-faint'}`}>{status}</span>
      </div>
      <p className="truncate text-sm text-ink-soft" title={name}>
        {name}
      </p>
      <div className="flex items-center gap-2" title={`${PLAYER_LABEL[player]} 장벽 (남은 벽 ${wallsRemaining}개)`}>
        <WallSwatch player={player} />
        <span className="flex items-center gap-0.5" aria-hidden>
          {Array.from({ length: wallsTotal }, (_, i) => (
            <span key={i} className={`h-4 w-1.5 rounded-full ${i < wallsRemaining ? PLAYER_BG_CLASS[player] : 'bg-inset-strong'}`} style={i < wallsRemaining ? { opacity: 0.85 } : undefined} />
          ))}
        </span>
      </div>
      <dl className="flex items-baseline justify-between text-xs text-muted">
        <div className="flex items-baseline gap-1">
          <dt>남은 벽</dt>
          <dd className="font-mono text-sm text-ink">{wallsRemaining}</dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt>최단 거리</dt>
          <dd className="font-mono text-sm text-ink">{distance}</dd>
        </div>
      </dl>
    </div>
  );
}

/** This player's wall as drawn on the board (P1 solid, P2 with stripes) — the legend for walls. */
export function WallSwatch({ player }: { player: number }) {
  const id = `qz-swatch-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 22 8" className="h-2 w-[22px] shrink-0" role="img" aria-label={`${PLAYER_LABEL[player]} 장벽`}>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
          <rect width={1.5} height={4} fill="#fbf9f5" fillOpacity={0.45} />
        </pattern>
      </defs>
      <pattern id={`${id}-dots`} patternUnits="userSpaceOnUse" width={5} height={5}>
        <circle cx={2.5} cy={2.5} r={1} fill="#fbf9f5" fillOpacity={0.55} />
      </pattern>
      <pattern id={`${id}-bars`} patternUnits="userSpaceOnUse" width={4} height={4}>
        <rect width={1.3} height={4} fill="#fbf9f5" fillOpacity={0.45} />
      </pattern>
      <rect width={22} height={8} rx={3} fill={WALL_COLORS[player]} />
      {player === 1 && <rect width={22} height={8} rx={3} fill={`url(#${id})`} />}
      {player === 2 && <rect width={22} height={8} rx={3} fill={`url(#${id}-dots)`} />}
      {player === 3 && <rect width={22} height={8} rx={3} fill={`url(#${id}-bars)`} />}
    </svg>
  );
}

/**
 * Compact card for the four-player game: slot colour, name, state, walls in hand and the
 * shortest distance — all of it readable at a glance with four of them on screen.
 */
export function PlayerChip({ player, name, wallsRemaining, distance, active, winner, wallsTotal = 5, seatHint, team }: PlayerStripProps & { seatHint: string; team?: { letter: string; name: string } }) {
  const status = winner ? '승리' : active ? '차례' : '';
  const lit = active || winner;
  return (
    <div
      data-player-card={player}
      data-active={active || undefined}
      className={`flex min-w-0 flex-col gap-1.5 rounded-xl border-2 bg-card px-3 py-2.5 transition-colors ${lit ? `${PLAYER_BORDER_CLASS[player]} shadow-[var(--shadow-soft)]` : 'border-line-soft'}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-card ${PLAYER_BG_CLASS[player]}`} aria-hidden>
          {player + 1}
        </span>
        <span className={`shrink-0 text-sm font-semibold ${PLAYER_TEXT_CLASS[player]}`}>{PLAYER_LABEL[player]}</span>
        <span className="min-w-0 truncate text-sm text-ink-soft" title={name}>
          {name}
        </span>
        {team && (
          <span data-team={team.letter} className="shrink-0 rounded-md border border-ink/40 px-1 text-[11px] font-semibold text-ink" title={team.name}>
            {team.name}
          </span>
        )}
        <span className={`ml-auto shrink-0 text-xs ${winner ? 'font-semibold text-good' : 'font-medium text-ink-soft'}`}>{status}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted" title={`${PLAYER_LABEL[player]} 장벽 (남은 벽 ${wallsRemaining}개)`}>
        <WallSwatch player={player} />
        <span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
          {/* More than ten walls (asymmetric games) are shown by the number only. */}
          {Array.from({ length: wallsTotal > 10 ? 0 : wallsTotal }, (_, i) => (
            <span key={i} className={`h-3.5 w-1.5 rounded-full ${i < wallsRemaining ? PLAYER_BG_CLASS[player] : 'bg-inset-strong'}`} style={i < wallsRemaining ? { opacity: 0.85 } : undefined} />
          ))}
        </span>
        <span className="ml-auto flex items-baseline gap-2 whitespace-nowrap font-mono">
          <span>벽 <span className="text-ink">{wallsRemaining}</span></span>
          <span>거리 <span className="text-ink">{distance}</span></span>
        </span>
      </div>
      <p className="text-[11px] text-faint">{seatHint}</p>
    </div>
  );
}
