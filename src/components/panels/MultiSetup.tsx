import { randomSeed } from '../../ai/rng';
import { MAX_WALLS, OBSTACLE_PRESETS, TEAM_NAMES, asymmetricRules, defaultAsymmetricPlayers, fixedRules, obstacleBaseRules, teamOf } from '../../engine';
import type { AsymmetricPlayer, Goal, MultiGameMode, MultiRules, ObstaclePreset } from '../../engine';
import { defaultWalls } from '../../match/multiRecord';
import { GAME_MODES } from '../../session/config';
import type { GameMode, ModeInfo } from '../../session/config';
import { DEFAULT_PLAYER_NAMES, playerCountOf, validateMultiConfig } from '../../session/MultiController';
import type { MultiConfig } from '../../session/MultiController';
import { seatText } from '../../session/seatInfo';
import { PLAYER_BG_CLASS, PLAYER_LABEL } from '../theme';

const inputClass = 'w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none';
const smallInput = 'rounded-lg border border-line bg-card px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none';

/** The rules a draft would play with, for the hints next to the names (null while invalid). */
export function previewRules(draft: MultiConfig): MultiRules | null {
  if (draft.mode === 'asymmetric') return draft.asymmetric ? asymmetricRules(draft.asymmetric) : null;
  if (draft.mode === 'obstacle') return obstacleBaseRules(draft.obstacle?.players ?? 2);
  return fixedRules(draft.mode);
}

/** Mode cards in two groups: 기본 대전 (official rules) and 변형 대전. */
export function ModePicker({ selected, playing, onChoose }: { selected: GameMode; playing: GameMode; onChoose: (mode: GameMode) => void }) {
  const groups: { id: ModeInfo['group']; title: string }[] = [
    { id: 'basic', title: '기본 대전' },
    { id: 'variant', title: '변형 대전' },
  ];
  return (
    <div role="radiogroup" aria-label="게임 모드" className="space-y-3">
      {groups.map((g) => (
        <section key={g.id} aria-label={g.title} className="space-y-1.5">
          <h3 className="px-0.5 text-[11px] font-medium tracking-wide text-faint">{g.title}</h3>
          {GAME_MODES.filter((m) => m.group === g.id).map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected === m.id}
              data-mode={m.id}
              onClick={() => onChoose(m.id)}
              className={`block w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${selected === m.id ? 'border-accent bg-accent/5' : 'border-line-soft bg-card hover:border-line'}`}
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${selected === m.id ? 'border-accent bg-accent' : 'border-line-strong'}`} aria-hidden />
                {m.title}
                <span className="rounded-md bg-inset px-1.5 py-0.5 text-[11px] font-normal text-muted">{m.players}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-normal ${m.official ? 'bg-good/10 text-good' : 'bg-warn/10 text-warn'}`}>{m.official ? '공식 규칙' : '변형 규칙'}</span>
                {playing === m.id && <span className="ml-auto text-[11px] font-normal text-faint">진행 중</span>}
              </span>
              <span className="mt-0.5 block pl-[1.375rem] text-xs text-muted">{m.description}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

const GOALS: { label: string; goal: Goal }[] = [
  { label: '위쪽', goal: { axis: 'row', index: 0 } },
  { label: '아래쪽', goal: { axis: 'row', index: 8 } },
  { label: '왼쪽', goal: { axis: 'col', index: 0 } },
  { label: '오른쪽', goal: { axis: 'col', index: 8 } },
];
const goalKey = (g: Goal) => `${g.axis}${g.index}`;
const FILES = 'abcdefghi';

/** Everything below the mode cards that belongs to a multi-player mode. */
export function MultiSetupFields({ draft, onChange }: { draft: MultiConfig; onChange: (config: MultiConfig) => void }) {
  const mode: MultiGameMode = draft.mode;
  const n = playerCountOf(draft);
  const rules = previewRules(draft);
  const errors = validateMultiConfig(draft);
  const setName = (slot: number, v: string) => onChange({ ...draft, names: DEFAULT_PLAYER_NAMES.map((_, i) => (i === slot ? v : (draft.names[i] ?? ''))) });
  const showWalls = mode !== 'four-player' && mode !== 'asymmetric';

  return (
    <div className="space-y-4" data-multi-setup={mode}>
      {mode === 'obstacle' && <ObstacleFields draft={draft} onChange={onChange} />}
      {mode === 'asymmetric' && <AsymmetricFields draft={draft} onChange={onChange} />}

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-xs text-muted">플레이어 이름</legend>
        {Array.from({ length: n }, (_, slot) => {
          const team = rules?.teams ? TEAM_NAMES[teamOf(rules, slot)] : null;
          return (
            <label key={slot} className="flex items-center gap-2">
              <span className={`flex h-6 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-card ${PLAYER_BG_CLASS[slot]}`}>{PLAYER_LABEL[slot]}</span>
              <input
                type="text"
                maxLength={20}
                value={draft.names[slot] ?? ''}
                placeholder={DEFAULT_PLAYER_NAMES[slot]}
                aria-label={`${PLAYER_LABEL[slot]} 이름`}
                onChange={(e) => setName(slot, e.target.value)}
                className={inputClass}
              />
              <span className="w-24 shrink-0 text-[11px] leading-tight text-faint">{team ? `${team} · ` : ''}{rules ? seatText(rules.players[slot]).replace('에서 시작 → ', ' → ').replace(' 도착', '') : ''}</span>
            </label>
          );
        })}
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-xs text-muted">시작 플레이어</span>
        <select
          value={String(draft.firstPlayer)}
          aria-label="시작 플레이어"
          onChange={(e) => onChange({ ...draft, firstPlayer: e.target.value === 'random' ? 'random' : Number(e.target.value) })}
          className={inputClass}
        >
          <option value="random">무작위</option>
          {Array.from({ length: n }, (_, slot) => (
            <option key={slot} value={slot}>
              {PLAYER_LABEL[slot]}
              {draft.names[slot]?.trim() ? ` · ${draft.names[slot].trim()}` : ''}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-faint">{turnHint(mode, n)}</span>
      </label>

      {showWalls && (
        <label className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>
            플레이어당 벽 <span className="text-faint">(권장 {defaultWalls(mode, n)[0]}개)</span>
          </span>
          <input
            type="number"
            min={0}
            max={MAX_WALLS}
            value={draft.walls ?? defaultWalls(mode, n)[0]}
            aria-label="플레이어당 벽 개수"
            onChange={(e) => onChange({ ...draft, walls: Math.trunc(Number(e.target.value)) })}
            className={`w-20 text-right font-mono ${smallInput}`}
          />
        </label>
      )}

      {errors.length > 0 && (
        <ul role="alert" data-setup-errors className="list-disc space-y-0.5 rounded-lg bg-danger/5 py-2 pr-3 pl-6 text-xs text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <p className="text-[11px] leading-relaxed text-faint">{MODE_NOTE[mode]}</p>
    </div>
  );
}

function turnHint(mode: MultiGameMode, n: number): string {
  if (mode === 'team-2v2') return '차례는 P1(A팀) → P2(B팀) → P3(A팀) → P4(B팀)로 팀이 번갈아 갑니다.';
  if (mode === 'three-player') return '차례는 P1(아래) → P2(왼쪽) → P3(위) 순서입니다. 선공이 유리할 수 있어 시작 플레이어를 고를 수 있습니다.';
  if (mode === 'asymmetric') return '위에 적은 순서가 차례 순서입니다.';
  if (mode === 'race-2' || mode === 'race-4') return `차례는 P1 → … → P${n} (왼쪽 말부터)입니다. 선공이 유리할 수 있습니다.`;
  return n === 4 ? '차례는 P1 → P2 → P3 → P4, 시계 방향입니다.' : '출발 위치 순서대로 차례가 돌아갑니다.';
}

const MODE_NOTE: Record<MultiGameMode, string> = {
  'four-player': '공식 룰북(Gigamic) 4인 규칙입니다. 벽은 5개씩, 고정 설정입니다.',
  'race-2': '변형 규칙 — 두 말이 d1·f1에서 출발해 위쪽 줄을 목표로 합니다. 서로 벽으로 길을 방해할 수 있고, 마주치면 점프합니다.',
  'race-4': '변형 규칙 — 네 말이 b·d·f·h열에서 출발해 모두 위쪽 줄을 목표로 합니다. 바깥쪽 말과 가운데 말은 주변 공간이 달라 완전히 같은 조건은 아닙니다.',
  'three-player': '변형 규칙 — 공식 규칙에는 없는 3인 대국입니다. 세 변만 쓰므로 위치에 따라 압박받는 정도가 다를 수 있습니다.',
  'team-2v2': '변형 규칙 — 팀원이 같은 목표선을 공유하지는 않습니다. 한 팀원이 자기 목표선에 닿으면 팀 전체가 이깁니다. 벽은 아군에게도 똑같이 적용되고 벽은 개인별로 가집니다.',
  asymmetric: '변형 규칙 — 설정한 조건이 공정한 대국을 보장하지는 않습니다. 시작 위치가 겹치거나 이미 목표선에 있는 설정은 시작할 수 없습니다.',
  obstacle: '변형 규칙 — 어두운 돌 벽은 처음부터 놓인 중립 벽입니다. 누구의 벽도 아니며, 모든 플레이어가 목표에 갈 수 있는 맵만 만들어집니다.',
};

function ObstacleFields({ draft, onChange }: { draft: MultiConfig; onChange: (c: MultiConfig) => void }) {
  const o = draft.obstacle ?? { players: 2 as const, preset: 'normal' as ObstaclePreset, seed: 1 };
  const set = (patch: Partial<typeof o>, walls?: number) => onChange({ ...draft, obstacle: { ...o, ...patch }, ...(walls !== undefined ? { walls } : {}) });
  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1.5 block text-xs text-muted">참가자 수</span>
        <div role="radiogroup" aria-label="참가자 수" className="grid grid-cols-3 gap-1 rounded-xl bg-inset p-1">
          {([2, 3, 4] as const).map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={o.players === count}
              onClick={() => o.players !== count && set({ players: count }, defaultWalls('obstacle', count)[0])}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${o.players === count ? 'bg-card font-medium text-ink shadow-[var(--shadow-soft)]' : 'text-muted hover:text-ink'}`}
            >
              {count}인
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-xs text-muted">장애물 난이도</span>
        <div role="radiogroup" aria-label="장애물 난이도" className="grid grid-cols-2 gap-1.5">
          {OBSTACLE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={o.preset === p.id}
              data-preset={p.id}
              onClick={() => set({ preset: p.id })}
              className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${o.preset === p.id ? 'border-accent bg-accent/5' : 'border-line-soft bg-card hover:border-line'}`}
            >
              <span className="block text-sm font-medium text-ink">{p.title}</span>
              <span className="block text-[11px] leading-snug text-muted">{p.description}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs text-muted">무작위 시드</span>
        <div className="flex gap-2">
          <input
            type="number"
            value={o.seed}
            aria-label="장애물 시드"
            onChange={(e) => set({ seed: Math.trunc(Number(e.target.value)) || 0 })}
            className={`${inputClass} font-mono`}
          />
          <button type="button" onClick={() => set({ seed: randomSeed() })} className="shrink-0 rounded-lg border border-line px-3 text-xs text-ink-soft hover:bg-inset" title="새 시드">
            새 시드
          </button>
        </div>
        <span className="mt-1 block text-[11px] text-faint">같은 난이도·같은 시드·같은 인원이면 같은 맵이 만들어집니다. 시드는 기보에 저장됩니다.</span>
      </label>
    </div>
  );
}

function AsymmetricFields({ draft, onChange }: { draft: MultiConfig; onChange: (c: MultiConfig) => void }) {
  const players = draft.asymmetric ?? defaultAsymmetricPlayers(2);
  const set = (next: AsymmetricPlayer[]) => onChange({ ...draft, asymmetric: next });
  const update = (i: number, patch: Partial<AsymmetricPlayer>) => set(players.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const swap = (i: number, j: number) => {
    const next = players.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };
  const setCount = (count: number) => {
    const defaults = defaultAsymmetricPlayers(Math.max(count, 2));
    set(count < players.length ? players.slice(0, count) : [...players, ...defaults.slice(players.length, count).map((p) => ({ ...p, walls: 10 }))]);
  };
  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1.5 block text-xs text-muted">참가자 수</span>
        <div role="radiogroup" aria-label="참가자 수" className="grid grid-cols-3 gap-1 rounded-xl bg-inset p-1">
          {[2, 3, 4].map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={players.length === count}
              onClick={() => setCount(count)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${players.length === count ? 'bg-card font-medium text-ink shadow-[var(--shadow-soft)]' : 'text-muted hover:text-ink'}`}
            >
              {count}인
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2" data-asym-players>
        {players.map((p, i) => (
          <div key={i} data-asym-player={i} className="space-y-1.5 rounded-xl border border-line-soft bg-card p-2.5">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-card ${PLAYER_BG_CLASS[i]}`}>{PLAYER_LABEL[i]}</span>
              <span className="text-[11px] text-faint">차례 {i + 1}번째</span>
              <span className="ml-auto flex gap-1">
                <button type="button" className="rounded border border-line px-1.5 text-xs text-ink-soft hover:bg-inset disabled:opacity-30" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label={`${PLAYER_LABEL[i]} 차례 앞당기기`}>
                  ↑
                </button>
                <button type="button" className="rounded border border-line px-1.5 text-xs text-ink-soft hover:bg-inset disabled:opacity-30" disabled={i === players.length - 1} onClick={() => swap(i, i + 1)} aria-label={`${PLAYER_LABEL[i]} 차례 미루기`}>
                  ↓
                </button>
              </span>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs text-muted">
              <span>시작</span>
              <span className="flex gap-1.5">
                <select aria-label={`${PLAYER_LABEL[i]} 시작 열`} value={p.start.col} onChange={(e) => update(i, { start: { ...p.start, col: Number(e.target.value) } })} className={smallInput}>
                  {[...FILES].map((f, col) => (
                    <option key={f} value={col}>
                      {f}열
                    </option>
                  ))}
                </select>
                <select aria-label={`${PLAYER_LABEL[i]} 시작 행`} value={p.start.row} onChange={(e) => update(i, { start: { ...p.start, row: Number(e.target.value) } })} className={smallInput}>
                  {Array.from({ length: 9 }, (_, row) => (
                    <option key={row} value={row}>
                      {9 - row}행
                    </option>
                  ))}
                </select>
              </span>
              <span />
              <span>목표</span>
              <select aria-label={`${PLAYER_LABEL[i]} 목표선`} value={goalKey(p.goal)} onChange={(e) => update(i, { goal: GOALS.find((g) => goalKey(g.goal) === e.target.value)!.goal })} className={smallInput}>
                {GOALS.map((g) => (
                  <option key={goalKey(g.goal)} value={goalKey(g.goal)}>
                    {g.label} 줄
                  </option>
                ))}
              </select>
              <span />
              <span>벽</span>
              <input
                type="number"
                min={0}
                max={MAX_WALLS}
                value={p.walls}
                aria-label={`${PLAYER_LABEL[i]} 벽 개수`}
                onChange={(e) => update(i, { walls: Math.trunc(Number(e.target.value)) })}
                className={`w-20 text-right font-mono ${smallInput}`}
              />
              <span className="text-faint">0~{MAX_WALLS}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
