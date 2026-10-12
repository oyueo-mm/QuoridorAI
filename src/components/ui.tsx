import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PlayerId } from '../engine';

/*
 * Small shared UI kit for the light design system (tokens in index.css).
 * Cards are soft (rounded-2xl, hairline border, barely-there shadow); buttons come in three
 * weights; tab bars and segmented controls share one look.
 */

export const cardClass = 'rounded-2xl border border-line-soft bg-card shadow-[var(--shadow-soft)]';

export const buttonClass = {
  primary: 'rounded-xl bg-accent px-4 py-2 text-sm font-medium text-card transition-colors hover:bg-accent-strong disabled:opacity-40',
  secondary: 'rounded-xl border border-line bg-card px-4 py-2 text-sm text-ink-soft transition-colors hover:border-line-strong hover:bg-inset disabled:opacity-40',
  ghost: 'rounded-lg px-2.5 py-1 text-xs text-muted transition-colors hover:bg-inset hover:text-ink disabled:opacity-40',
  small: 'rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-line-strong hover:bg-inset disabled:opacity-40',
};

export const inputClass =
  'w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink transition-colors focus:border-accent focus:outline-none';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${cardClass} ${className}`}>{children}</section>;
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Small trailing text, e.g. a count. */
  badge?: ReactNode;
}

/** Underline-free pill tabs. */
export function Tabs<T extends string>({ items, value, onChange, label }: { items: readonly TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-xl bg-inset p-1">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap transition-colors ${
            value === t.id ? 'bg-card font-medium text-ink shadow-[var(--shadow-soft)]' : 'text-muted hover:text-ink'
          }`}
        >
          {t.label}
          {t.badge !== undefined && <span className="min-w-[3ch] text-left font-mono text-[11px] text-faint tabular-nums">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Compact segmented control for a few options. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-inset p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${value === o.value ? 'bg-card font-medium text-ink shadow-[var(--shadow-soft)]' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Accordion section (native <details>, keyboard accessible). */
export function Collapsible({ title, aside, defaultOpen = false, children }: { title: string; aside?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line-soft bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm text-ink-soft select-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="text-faint transition-transform group-open:rotate-90">›</span>
          {title}
        </span>
        {aside}
      </summary>
      <div className="border-t border-line-soft px-4 py-3">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------- board orientation

export type OrientationMode = 'auto' | 'p1' | 'p2';

export const ORIENTATION_OPTIONS: readonly { value: OrientationMode; label: string; title: string }[] = [
  { value: 'auto', label: '자동', title: '내 말이 아래쪽에 오도록 자동으로 돌립니다' },
  { value: 'p1', label: 'P1 시점', title: 'P1(선공)이 아래쪽' },
  { value: 'p2', label: 'P2 시점', title: 'P2(후공)가 아래쪽' },
];

function readStored(key: string): OrientationMode | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === 'auto' || v === 'p1' || v === 'p2' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Board orientation with a remembered choice per view. `autoSeat` is the seat shown at the
 * bottom in 'auto' mode (e.g. the user's seat in Play). Returns the mode, its setter, the
 * seat at the bottom and whether the board is flipped (P2 at the bottom).
 */
export function useBoardOrientation(storageKey: string, autoSeat: PlayerId) {
  const key = `quoridor-ai/orientation/${storageKey}`;
  const [mode, setMode] = useState<OrientationMode>(() => readStored(key) ?? 'auto');
  useEffect(() => {
    try {
      window.localStorage.setItem(key, mode);
    } catch {
      // Storage unavailable (private mode): the choice simply is not remembered.
    }
  }, [key, mode]);
  const bottomSeat = bottomSeatFor(mode, autoSeat);
  return { mode, setMode, bottomSeat, flipped: bottomSeat === 1 };
}

/** Seat drawn at the bottom: 'auto' follows `autoSeat` (e.g. the user's own seat). */
export function bottomSeatFor(mode: OrientationMode, autoSeat: PlayerId): PlayerId {
  return mode === 'auto' ? autoSeat : mode === 'p1' ? 0 : 1;
}
