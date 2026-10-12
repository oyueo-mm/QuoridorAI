import type { ReactNode } from 'react';
import { cardClass } from '../ui';

interface PanelProps {
  title: string;
  /** Small caption shown next to the title (e.g. a status badge). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Without the card frame — for panels that already sit inside a card (tab bodies). */
  plain?: boolean;
}

export function Panel({ title, aside, children, className = '', plain = false }: PanelProps) {
  return (
    <section className={`${plain ? '' : `${cardClass} p-5`} ${className}`}>
      <header className="mb-3 flex min-h-6 items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-ink-soft">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
