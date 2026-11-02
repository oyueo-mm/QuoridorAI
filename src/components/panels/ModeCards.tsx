import { useState } from 'react';
import { GAME_MODES } from '../../session/config';
import type { GameMode, ModeInfo } from '../../session/config';
import { Tabs } from '../ui';

type Group = ModeInfo['group'];

const GROUP_LABEL: Record<Group, string> = { basic: '기본 대전', variant: '변형 대전' };

/**
 * Mode choice: 기본 대전 and 변형 대전 as two tabs (the variant tab carries its count so it is
 * found), one compact card per mode. `selected` is what is being looked at, `playing` the game in
 * progress; they are shown differently and a click only changes `selected`.
 */
export function ModeCards({ selected, playing, onChoose }: { selected: GameMode; playing: GameMode; onChoose: (mode: GameMode) => void }) {
  const [group, setGroup] = useState<Group>(GAME_MODES.find((m) => m.id === selected)?.group ?? 'basic');
  const count = (g: Group) => GAME_MODES.filter((m) => m.group === g).length;
  return (
    <div className="space-y-2" data-mode-picker>
      <Tabs<Group>
        label="게임 모드 분류"
        value={group}
        onChange={setGroup}
        items={(['basic', 'variant'] as const).map((g) => ({ id: g, label: GROUP_LABEL[g], badge: count(g) }))}
      />
      <div role="radiogroup" aria-label={GROUP_LABEL[group]} className="space-y-1.5">
        {GAME_MODES.filter((m) => m.group === group).map((m) => {
          const on = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-mode={m.id}
              onClick={() => onChoose(m.id)}
              className={`block w-full rounded-xl border px-3 py-2 text-left transition-colors ${on ? 'border-accent bg-accent/5' : 'border-line-soft bg-card hover:border-line'}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <span className={`h-3 w-3 shrink-0 rounded-full border-2 ${on ? 'border-accent bg-accent' : 'border-line-strong'}`} aria-hidden />
                <span className="truncate">{m.title}</span>
                <span className="shrink-0 rounded-md bg-inset px-1.5 py-0.5 text-[11px] font-normal text-muted">{m.players}</span>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-normal ${m.official ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn'}`}>{m.official ? '공식' : '변형'}</span>
                {playing === m.id && (
                  <span data-playing-badge className="ml-auto shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-normal text-ink-soft">
                    진행 중
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate pl-5 text-xs text-muted" title={m.description}>
                {m.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
