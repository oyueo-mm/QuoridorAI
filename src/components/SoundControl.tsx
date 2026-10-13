import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { soundEngine } from '../audio/sound';
import type { ArenaSoundMode } from '../audio/sound';
import { Segmented, buttonClass, cardClass } from './ui';

const ARENA_OPTIONS: readonly { value: ArenaSoundMode; label: string; title: string }[] = [
  { value: 'all', label: '모두', title: '모든 수에 효과음' },
  { value: 'limited', label: '제한', title: '빠른 재생에서는 일부 수만 (기본)' },
  { value: 'off', label: '끄기', title: 'Arena에서는 효과음 없음' },
];

/**
 * Speaker button in the header with a small popover: mute, volume, Arena mode, preview.
 * The popover is absolutely positioned, so opening it never moves the page.
 */
export function SoundControl() {
  const settings = useSyncExternalStore(soundEngine.subscribe, soundEngine.getSettings);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const silent = settings.muted || settings.volume === 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={silent ? '효과음 꺼짐 — 설정 열기' : '효과음 켜짐 — 설정 열기'}
        title="효과음"
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-inset ${open ? 'bg-inset text-ink' : 'text-muted'}`}
      >
        <SpeakerIcon muted={silent} />
      </button>
      {open && (
        <div className={`${cardClass} absolute top-full right-0 z-30 mt-2 w-72 space-y-4 p-4`} role="dialog" aria-label="효과음 설정">
          <label className="flex items-center justify-between text-sm text-ink-soft">
            효과음
            <input type="checkbox" checked={!settings.muted} onChange={(e) => soundEngine.update({ muted: !e.target.checked })} className="h-4 w-4 accent-accent" aria-label="효과음 켜기" />
          </label>
          <label className="block text-sm text-ink-soft">
            <span className="flex justify-between">
              음량 <span className="font-mono text-xs text-muted">{Math.round(settings.volume * 100)}</span>
            </span>
            <input type="range" min={0} max={100} step={5} value={Math.round(settings.volume * 100)} onChange={(e) => soundEngine.update({ volume: Number(e.target.value) / 100 })} disabled={settings.muted} className="mt-2 w-full" aria-label="음량" />
          </label>
          <div className="space-y-1.5">
            <span className="block text-sm text-ink-soft">Arena 관전</span>
            <Segmented label="Arena 효과음" options={ARENA_OPTIONS} value={settings.arena} onChange={(arena) => soundEngine.update({ arena })} />
            <p className="text-[11px] leading-relaxed text-faint">승리·패배 소리는 Play에서 내 순서 기준으로 한 번 납니다(Arena 관전은 끔). 리플레이·기보 이동·분석 미리보기·재시작은 무음이고, Experiments의 자동 대국도 무음입니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass.small} onClick={() => soundEngine.play('move', 'preview')}>
              말 소리
            </button>
            <button type="button" className={buttonClass.small} onClick={() => soundEngine.play('wall', 'preview')}>
              벽 소리
            </button>
            <button type="button" className={buttonClass.small} onClick={() => soundEngine.play('win', 'preview')}>
              승리
            </button>
            <button type="button" className={buttonClass.small} onClick={() => soundEngine.play('lose', 'preview')}>
              패배
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" {...s} />
      {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" {...s} /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" {...s} />}
    </svg>
  );
}
