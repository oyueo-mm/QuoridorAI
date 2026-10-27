import { HomeBoard } from './HomeBoard';
import { SECTIONS } from '../sections';
import type { SectionId } from '../sections';

/** Landing page: what this is, and four ways in. */
export function HomeView({ onOpen }: { onOpen: (id: SectionId) => void }) {
  return (
    <main className="mx-auto max-w-[1080px] px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:gap-14">
        <div className="lg:-translate-y-16 xl:-translate-x-10">
          <p className="text-base font-medium tracking-wide text-muted md:text-[21px]">쿼리도 인공지능</p>
          <h1 className="mt-2 text-5xl font-semibold tracking-tight text-ink sm:text-6xl md:text-[70px] md:leading-none">QuoridorAI</h1>
          <div className="mt-8 flex flex-wrap gap-2">
            <button type="button" onClick={() => onOpen('play')} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-card transition-colors hover:bg-accent-strong">
              바로 플레이
            </button>
            <button type="button" onClick={() => onOpen('arena')} className="rounded-xl border border-line bg-card px-5 py-2.5 text-sm text-ink-soft transition-colors hover:border-line-strong hover:bg-inset">
              AI 대국 관전
            </button>
          </div>
        </div>
        <HomeBoard />
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-2" aria-label="시작하기">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            className="group flex min-h-40 flex-col justify-between rounded-2xl border border-line-soft bg-card p-6 text-left shadow-[var(--shadow-soft)] transition-colors hover:border-line"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-ink">{s.label}</h2>
                <p className="mt-1 text-sm text-muted">{s.hint}</p>
              </div>
              <SectionIcon index={i} />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">{s.description}</p>
            <span className="mt-4 text-sm text-accent transition-transform group-hover:translate-x-0.5">열기 →</span>
          </button>
        ))}
      </section>

      <p className="mt-12 text-center text-xs text-faint">
        모든 계산은 브라우저 안에서 실행됩니다 · Random · BFS · Minimax · MCTS
      </p>
    </main>
  );
}

function SectionIcon({ index }: { index: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-inset text-ink-soft">
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        {index === 0 && (
          <>
            <circle cx="12" cy="8" r="3.2" {...common} />
            <path d="M7 20c.6-3.4 2.6-5.4 5-5.4s4.4 2 5 5.4" {...common} />
          </>
        )}
        {index === 1 && (
          <>
            <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6z" {...common} />
            <circle cx="12" cy="12" r="2.6" {...common} />
          </>
        )}
        {index === 2 && (
          <>
            <rect x="3" y="4" width="7.5" height="16" rx="2" {...common} />
            <rect x="13.5" y="4" width="7.5" height="16" rx="2" {...common} />
          </>
        )}
        {index === 3 && <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...common} />}
      </svg>
    </span>
  );
}
