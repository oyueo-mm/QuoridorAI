import type { MouseEvent } from 'react';
import { SoundControl } from './SoundControl';
import { SECTIONS } from '../sections';
import type { SectionId } from '../sections';

type RouteId = 'home' | SectionId;

/** Shared by the static first paint and the interactive app. */
export function SiteHeader({ route, go }: { route: RouteId; go: (id: RouteId) => void }) {
  const follow = (event: MouseEvent<HTMLAnchorElement>, id: RouteId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(id);
  };
  return (
    <header className="sticky top-0 z-20 border-b border-line-soft bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#/" onClick={(event) => follow(event, 'home')} className="flex items-center gap-2 text-ink" aria-label="홈으로">
          <Logo />
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">QuoridorAI</span>
        </a>
        <div className="flex min-w-0 items-center gap-1">
          <nav className="flex gap-0.5 overflow-x-auto" aria-label="보기 선택">
            {SECTIONS.map((t) => (
              <a
                key={t.id}
                href={`#/${t.id}`}
                onClick={(event) => follow(event, t.id)}
                title={t.hint}
                aria-current={route === t.id ? 'page' : undefined}
                className={`rounded-lg px-1.5 py-1.5 text-[13px] whitespace-nowrap transition-colors sm:px-3 sm:text-sm ${
                  route === t.id ? 'bg-inset font-medium text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <SoundControl />
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#e7dccb" />
      <rect x="5" y="11" width="14" height="2.4" rx="1.2" fill="#8a6a4b" />
      <circle cx="12" cy="6.8" r="2.6" fill="#ad5646" />
      <circle cx="12" cy="17.2" r="2.6" fill="#3c6a8a" />
    </svg>
  );
}
