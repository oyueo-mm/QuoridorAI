import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { GameLine } from './match/gameRecord';
import { SiteHeader } from './components/SiteHeader';
import { modeOfConfig } from './session/config';
import type { GameConfig, GameMode } from './session/config';
import type { MultiRules } from './engine';
import type { MultiConfig } from './session/MultiController';
import { useGameSession } from './session/useGameSession';
import { useMultiSession } from './session/useMultiSession';
import type { ArenaIncoming } from './views/ArenaView';
import type { CompareSource } from './views/CompareView';
import { HomeView } from './views/HomeView';
import type { RunningGame } from './views/ModeBrowserView';
import type { PlaySetupApi } from './views/playSetup';
import { SECTIONS } from './sections';
import type { SectionId } from './sections';

const ArenaView = lazy(() => import('./views/ArenaView').then((module) => ({ default: module.ArenaView })));
const CompareView = lazy(() => import('./views/CompareView').then((module) => ({ default: module.CompareView })));
const ExperimentsView = lazy(() => import('./views/ExperimentsView').then((module) => ({ default: module.ExperimentsView })));
const MultiPlayView = lazy(() => import('./views/MultiPlayView').then((module) => ({ default: module.MultiPlayView })));
const ModeBrowserView = lazy(() => import('./views/ModeBrowserView').then((module) => ({ default: module.ModeBrowserView })));
const PlayView = lazy(() => import('./views/PlayView').then((module) => ({ default: module.PlayView })));

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
      startMulti: (config: MultiConfig, options?: { obstacleMap?: MultiRules }) => {
        if (multi.controller.restart(config, options)) setMultiActive(true);
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
      <SiteHeader route={route} go={go} />

      <div hidden={route !== 'home'}>
        <HomeView onOpen={go} onOpenMode={openMode} onOpenVariants={openVariants} />
      </div>
      <div hidden={route !== 'play' || multiActive || !!browser}>
        <DeferredView active={route === 'play' && !multiActive && !browser}>
          <PlayView session={session} setup={playSetup} onChangeMode={() => openBrowser()} onCompare={sendToCompare} onArena={sendToArena} />
        </DeferredView>
      </div>
      <div hidden={route !== 'play' || !multiActive || !!browser}>
        <DeferredView active={route === 'play' && multiActive && !browser}>
          <MultiPlayView session={multi} onChangeMode={() => openBrowser()} />
        </DeferredView>
      </div>
      {browser && (
        <div hidden={route !== 'play'}>
          <Suspense fallback={null}>
            <ModeBrowserView key={browser.at} setup={playSetup} initialMode={browser.mode} running={running} onClose={() => setBrowser(null)} />
          </Suspense>
        </div>
      )}
      <div hidden={route !== 'arena'}>
        <DeferredView active={route === 'arena'}>
          <ArenaView onCompare={sendToCompare} incoming={arenaIncoming} />
        </DeferredView>
      </div>
      <div hidden={route !== 'compare'}>
        <DeferredView active={route === 'compare'}>
          <CompareView source={compareSource} playLine={playLine} onArena={sendToArena} />
        </DeferredView>
      </div>
      <div hidden={route !== 'experiments'}>
        <DeferredView active={route === 'experiments'}>
          <ExperimentsView />
        </DeferredView>
      </div>
    </div>
  );
}

/** Once visited, keep the view mounted even while its wrapper is hidden. */
function DeferredView({ active, children }: { active: boolean; children: ReactNode }) {
  const visited = useRef(false);
  if (active) visited.current = true;
  return visited.current ? <Suspense fallback={null}>{children}</Suspense> : null;
}
