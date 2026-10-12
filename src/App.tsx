import { useCallback, useEffect, useState } from 'react';
import type { GameState } from './engine';
import { useGameSession } from './session/useGameSession';
import { ArenaView } from './views/ArenaView';
import { CompareView } from './views/CompareView';
import type { CompareSource } from './views/CompareView';
import { ExperimentsView } from './views/ExperimentsView';
import { PlayView } from './views/PlayView';

const TABS = [
  { id: 'play', label: 'Play', hint: '사람 vs AI' },
  { id: 'arena', label: 'Arena', hint: 'AI vs AI 관전' },
  { id: 'compare', label: 'Compare', hint: '같은 포지션 의사결정 비교' },
  { id: 'experiments', label: 'Experiments', hint: '자동 대국·통계' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (TABS.find((t) => t.id === h)?.id ?? 'play') as TabId;
};

/**
 * Shell with four views. Views stay mounted while hidden, so a running Play game, Arena match
 * or experiment keeps going when you switch tabs.
 */
export default function App() {
  const session = useGameSession();
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [compareSource, setCompareSource] = useState<CompareSource | null>(null);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (id: TabId) => {
    window.location.hash = `/${id}`;
    setTab(id);
  };

  const sendToCompare = useCallback((state: GameState, label: string) => {
    setCompareSource({ state, label, sentAt: Date.now() });
    window.location.hash = '/compare';
    setTab('compare');
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800/80 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-white">
              Quoridor<span className="text-sky-400">AI</span> Lab
            </h1>
            <span className="hidden text-xs text-slate-500 md:inline">게임 AI 의사결정 시각화 실험실</span>
          </div>
          <nav className="flex gap-1 rounded-lg bg-slate-900 p-1" aria-label="보기 선택">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                title={t.hint}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  tab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <span className="hidden rounded-full border border-slate-700 px-2.5 py-0.5 font-mono text-[11px] text-slate-400 lg:inline">
            stage 5 · arena
          </span>
        </div>
      </header>

      <div hidden={tab !== 'play'}>
        <PlayView session={session} onCompare={sendToCompare} />
      </div>
      <div hidden={tab !== 'arena'}>
        <ArenaView onCompare={sendToCompare} />
      </div>
      <div hidden={tab !== 'compare'}>
        <CompareView source={compareSource} playState={session.game} />
      </div>
      <div hidden={tab !== 'experiments'}>
        <ExperimentsView />
      </div>
    </div>
  );
}
