import type { ReactNode } from 'react';
import { cardClass } from '../ui';

/**
 * Grid columns for a board + side panel layout. Open: board and a 380-460px panel (stacked on
 * small screens). Closed: a single column, so the board is centred.
 */
export const sidePanelGrid = (open: boolean) =>
  `relative mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-6 px-4 py-5 sm:px-6 ${open ? 'lg:grid-cols-[minmax(0,1fr)_clamp(380px,36vw,460px)]' : ''}`;

/**
 * Collapsible right-hand panel. The content stays mounted while collapsed (just display:none),
 * so analysis, the selected move and replay state survive closing and reopening. When closed, a
 * visible "펼치기" button sits at the top-right of the layout (the parent must be `relative`).
 */
export function SidePanel({ open, onToggle, name, tabs, children }: { open: boolean; onToggle: () => void; name: string; tabs: ReactNode; children: ReactNode }) {
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`${name} 펼치기`}
          className="order-last flex items-center justify-center gap-1.5 rounded-xl lg:absolute lg:top-5 lg:right-6 lg:z-10 lg:order-none border border-line bg-card px-3 py-2 text-sm text-ink-soft shadow-[var(--shadow-soft)] transition-colors hover:border-line-strong hover:bg-inset"
        >
          <Chevron dir="left" />
          {name} 펼치기
        </button>
      )}
      <aside hidden={!open} aria-label={name} className={`${cardClass} qz-panel-in flex h-[34rem] min-w-0 flex-col gap-3 p-3 lg:sticky lg:top-[4.75rem] lg:h-[calc(100svh-6.25rem)]`}>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{tabs}</div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={true}
            aria-label={`${name} 접기`}
            title="패널 접기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-inset hover:text-ink"
          >
            <Chevron dir="right" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === 'left' ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} />
    </svg>
  );
}
