import type { CSSProperties, ReactNode } from 'react';
import type { PlayerId } from '../../engine';

/**
 * Board + player info + controls for Play and AI 대국 관전.
 *
 * Wide screens (1100px+, the `stage` breakpoint): player cards sit in a column to the left of the board, the top card
 * level with the board's top edge and the bottom card with its bottom edge (the seat at the top of
 * the drawn board comes first, so flipping the board swaps the cards too). That frees the height
 * the old strips above/below the board used, so the board grows.
 * Narrower screens and phones: the compact strips above and below the board, as before.
 *
 * Board width depends only on the viewport and the available width (never on panel content):
 * see `.qz-stage` in index.css. `reserved` / `reservedWide` = rem of height taken by everything
 * in the column except the board (stacked / wide layout).
 */
export function GameStage({
  reserved,
  reservedWide,
  topSeat,
  bottomSeat,
  seat,
  status,
  side,
  board,
  controls,
}: {
  reserved: number;
  reservedWide: number;
  topSeat: PlayerId;
  bottomSeat: PlayerId;
  seat: (player: PlayerId, variant: 'strip' | 'card') => ReactNode;
  /** Status row above the board (stacked layout only). */
  status: ReactNode;
  /** Status block between the two player cards (wide layout; replaces the row above the board). */
  side: ReactNode;
  board: ReactNode;
  controls: ReactNode;
}) {
  const vars = { '--qz-reserved': `${reserved}rem`, '--qz-reserved-wide': `${reservedWide}rem` } as CSSProperties;
  return (
    <section className="qz-stage flex min-w-0 items-start justify-center" style={vars}>
      <div className="flex w-[var(--qz-board)] flex-col gap-2 stage:grid stage:w-auto stage:grid-cols-[var(--qz-cards)_var(--qz-board)] stage:gap-x-5">
        <div className="stage:hidden">{seat(topSeat, 'strip')}</div>
        <div className="stage:hidden">{status}</div>
        {/* Cards span the board only (the 1.75rem below it is the board's hint line). contain:size keeps
            this column from ever making the row taller than the board, whatever the status says. */}
        <div className="hidden stage:col-start-1 stage:row-start-1 stage:mb-7 stage:flex stage:flex-col stage:justify-between stage:gap-3 stage:overflow-hidden stage:[contain:size]">
          {seat(topSeat, 'card')}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-hidden">{side}</div>
          {seat(bottomSeat, 'card')}
        </div>
        <div className="stage:col-start-2 stage:row-start-1">{board}</div>
        <div className="stage:hidden">{seat(bottomSeat, 'strip')}</div>
        <div className="stage:col-start-2 stage:row-start-2">{controls}</div>
      </div>
    </section>
  );
}

/**
 * GameStage for more than two players: the same board column and sizing rules (see `.qz-stage`),
 * but all player cards form one column beside the board on wide screens (top to bottom in seat
 * order) and a 2×2 block above the board on narrow screens and phones.
 */
export function MultiGameStage({
  reserved,
  reservedWide,
  seats,
  seat,
  status,
  side,
  board,
  controls,
}: {
  reserved: number;
  reservedWide: number;
  seats: readonly number[];
  seat: (player: number) => ReactNode;
  /** Status row above the board (stacked layout only). */
  status: ReactNode;
  /** Status block under the cards (wide layout). */
  side: ReactNode;
  board: ReactNode;
  controls: ReactNode;
}) {
  const vars = { '--qz-reserved': `${reserved}rem`, '--qz-reserved-wide': `${reservedWide}rem` } as CSSProperties;
  return (
    <section className="qz-stage qz-stage-multi flex min-w-0 items-start justify-center" style={vars}>
      <div className="flex w-[var(--qz-board)] flex-col gap-2 stage:grid stage:w-auto stage:grid-cols-[var(--qz-cards)_var(--qz-board)] stage:gap-x-5">
        <div className="grid grid-cols-2 gap-2 stage:hidden">{seats.map((p) => <div key={p} className="min-w-0">{seat(p)}</div>)}</div>
        <div className="stage:hidden">{status}</div>
        <div className="hidden stage:col-start-1 stage:row-start-1 stage:mb-7 stage:flex stage:flex-col stage:justify-between stage:gap-3 stage:overflow-hidden stage:[contain:size]">
          {seats.map((p) => <div key={p}>{seat(p)}</div>)}
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-hidden">{side}</div>
        </div>
        <div className="stage:col-start-2 stage:row-start-1">{board}</div>
        <div className="stage:col-start-2 stage:row-start-2">{controls}</div>
      </div>
    </section>
  );
}
