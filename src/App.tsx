import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GameLine } from './match/gameRecord';
import { SoundControl } from './components/SoundControl';
import { modeOfConfig } from './session/config';
import type { GameConfig, GameMode } from './session/config';
import type { MultiConfig } from './session/MultiController';
import { useGameSession } from './session/useGameSession';
import { useMultiSession } from './session/useMultiSession';
import { ArenaView } from './views/ArenaView';
import { CompareView } from './views/CompareView';
import type { ArenaIncoming } from './views/ArenaView';
import type { CompareSource } from './views/CompareView';
import { ExperimentsView } from './views/ExperimentsView';
import { MultiPlayView } from './views/MultiPlayView';
import { HomeView } from './views/HomeView';
import { ModeBrowserView } from './views/ModeBrowserView';
import type { RunningGame } from './views/ModeBrowserView';
import type { PlaySetupApi } from './views/playSetup';
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
  const multi = useMultiSession();
  // The official four-player game and the variants are local multi-player games with their own
  // controller; the two basic modes are the two-player session (opponent human or AI).
  const [multiActive, setMultiActive] = useState(false);
  const mode: GameMode = multiActive ? multi.config.mode : modeOfConfig(session.config);
  // Mode browser (Play only): the mode being looked at; null = closed. Opening it never touches the running game.
  const [browser, setBrowser] = useState<{ mode: GameMode; at: number } | null>(null);
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

  const playSetup = useMemo<PlaySetupApi>(
    () => ({
      mode,
      config: session.config,
      multiConfig: multi.config,
      startTwoPlayer: (config: GameConfig) => {
        setMultiActive(false);
        session.controller.restart(config);
      },
      startMulti: (config: MultiConfig) => {
        if (multi.controller.restart(config)) setMultiActive(true);
      },
    }),
    [mode, session.config, session.controller, multi.config, multi.controller],
  );

  const running: RunningGame = multiActive
    ? { mode, plies: multi.history.length, finished: multi.status.kind !== 'playing' }
    : { mode, plies: session.history.length, finished: session.status.kind !== 'playing' };

  const showPlay = useCallback(() => {
    window.location.hash = '/play';
    setRoute('play');
    window.scrollTo({ top: 0 });
  }, []);

  /** Opens the mode browser on `target` (default: the mode being played). Nothing is started. */
  const openBrowser = useCallback(
    (target?: GameMode) => {
      setBrowser({ mode: target ?? mode, at: Date.now() });
      showPlay();
    },
    [mode, showPlay],
  );

  /** Home entry for a basic mode: a game of that mode already running is resumed, otherwise the browser previews it. */
  const openMode = useCallback(
    (target: GameMode) => {
      const live = mode === target && (multiActive ? multi.status.kind : session.status.kind) === 'playing';
      if (live) setBrowser(null);
      else setBrowser({ mode: target, at: Date.now() });
      showPlay();
    },
    [mode, multiActive, multi.status.kind, session.status.kind, showPlay],
  );

  /** Home entry for the variants: the browser opens on the first variant (its tab shows all six). */
  const openVariants = useCallback(() => openBrowser('race-2'), [openBrowser]);

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
        <HomeView onOpen={go} onOpenMode={openMode} onOpenVariants={openVariants} />
      </div>
      <div hidden={route !== 'play' || multiActive || !!browser}>
        <PlayView session={session} setup={playSetup} onChangeMode={() => openBrowser()} onCompare={sendToCompare} onArena={sendToArena} />
      </div>
      <div hidden={route !== 'play' || !multiActive || !!browser}>
        <MultiPlayView session={multi} onChangeMode={() => openBrowser()} />
      </div>
      {browser && (
        <div hidden={route !== 'play'}>
          <ModeBrowserView key={browser.at} setup={playSetup} initialMode={browser.mode} running={running} onClose={() => setBrowser(null)} />
        </div>
      )}
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
