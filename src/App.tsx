import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GameLine } from './match/gameRecord';
import { SoundControl } from './components/SoundControl';
import { useGameSession } from './session/useGameSession';
import { ArenaView } from './views/ArenaView';
import { CompareView } from './views/CompareView';
import type { ArenaIncoming } from './views/ArenaView';
import type { CompareSource } from './views/CompareView';
import { ExperimentsView } from './views/ExperimentsView';
import { HomeView } from './views/HomeView';
import { PlayView } from './views/PlayView';
import { SECTIONS } from './sections';
import type { SectionId } from './sections';

type RouteId = 'home' | SectionId;

const routeFromHash = (): RouteId => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (SECTIONS.find((t) => t.id === h)?.id ?? 'home') as RouteId;
};

/**
 * Shell: Home plus four views. Views stay mounted while hidden, so a running Play game, Arena
 * match or experiment keeps going when you switch.
 */
export default function App() {
  const session = useGameSession();
  const [route, setRoute] = useState<RouteId>(routeFromHash);
  const [compareSource, setCompareSource] = useState<CompareSource | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = useCallback((id: RouteId) => {
    window.location.hash = id === 'home' ? '/' : `/${id}`;
    setRoute(id);
    window.scrollTo({ top: 0 });
  }, []);

  // The live Play game as a record (Compare's 'Play 탭' source).
  const playLine = useMemo<GameLine>(() => ({ actions: session.history.map((h) => ({ action: h.action, player: h.player })), ply: session.history.length }), [session.history]);
  const [arenaIncoming, setArenaIncoming] = useState<ArenaIncoming | null>(null);

  const sendToArena = useCallback((line: GameLine, label: string) => {
    setArenaIncoming({ line, label, sentAt: Date.now() });
    window.location.hash = '/arena';
    setRoute('arena');
  }, []);

  const sendToCompare = useCallback((line: GameLine, label: string) => {
    setCompareSource({ line, label, sentAt: Date.now() });
    window.location.hash = '/compare';
    setRoute('compare');
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line-soft bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={() => go('home')} className="flex items-center gap-2 text-ink" aria-label="홈으로">
            <Logo />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">QuoridorAI</span>
          </button>
          <div className="flex min-w-0 items-center gap-1">
            <nav className="flex gap-0.5 overflow-x-auto" aria-label="보기 선택">
              {SECTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(t.id)}
                  title={t.hint}
                  aria-current={route === t.id ? 'page' : undefined}
                  className={`rounded-lg px-1.5 py-1.5 text-[13px] whitespace-nowrap transition-colors sm:px-3 sm:text-sm ${
                    route === t.id ? 'bg-inset font-medium text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            <SoundControl />
          </div>
        </div>
      </header>

      <div hidden={route !== 'home'}>
        <HomeView onOpen={go} />
      </div>
      <div hidden={route !== 'play'}>
        <PlayView session={session} onCompare={sendToCompare} onArena={sendToArena} />
      </div>
      <div hidden={route !== 'arena'}>
        <ArenaView onCompare={sendToCompare} incoming={arenaIncoming} />
      </div>
      <div hidden={route !== 'compare'}>
        <CompareView source={compareSource} playLine={playLine} onArena={sendToArena} />
      </div>
      <div hidden={route !== 'experiments'}>
        <ExperimentsView />
      </div>
    </div>
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
