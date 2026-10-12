import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  /** Small caption shown next to the title (e.g. a status badge). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({ title, aside, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/70 p-4 ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-widest text-slate-400 uppercase">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
