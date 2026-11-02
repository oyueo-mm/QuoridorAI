import { DEFAULT_BFS_WEIGHTS } from '../../ai/bfsAgent';
import { AGENT_CATALOG } from '../../ai/catalog';
import { randomSeed } from '../../ai/rng';
import type { BfsWeights } from '../../ai/types';
import type { PlayerId } from '../../engine';
import { isMultiMode } from '../../session/config';
import type { GameConfig, GameMode, Opponent } from '../../session/config';
import { DEFAULT_PLAYER_NAMES, recommendedConfig } from '../../session/MultiController';
import type { MultiConfig } from '../../session/MultiController';
import { PLAYER_BG_CLASS, PLAYER_LABEL } from '../theme';
import { MultiSetupFields } from './MultiSetup';
import { MctsSettingsForm } from './MctsSettingsForm';
import { MinimaxSettingsForm } from './MinimaxSettingsForm';



/** Selectable opponents in 사람 vs AI. */
const AI_OPPONENTS: { value: Exclude<Opponent, 'human'>; label: string }[] = [
  { value: 'random', label: 'Random AI' },
  { value: 'bfs', label: 'BFS AI' },
  { value: 'minimax', label: 'Minimax / Alpha-Beta AI' },
  { value: 'mcts', label: 'Pure MCTS AI' },
  { value: 'mcts-guided', label: 'Guided MCTS AI' },
];

const WEIGHT_FIELDS: { key: keyof BfsWeights; label: string; step: number }[] = [
  { key: 'selfDistance', label: '내 거리 가중치', step: 0.1 },
  { key: 'opponentDistance', label: '상대 거리 가중치', step: 0.1 },
  { key: 'wallCost', label: '벽 기본 비용', step: 0.1 },
  { key: 'wallScarcity', label: '벽 희소성 비용', step: 0.1 },
  { key: 'opponentWinThreat', label: '상대 즉시승리 위협', step: 10 },
];

const inputClass =
  'w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none';


/** The mode-specific settings of the mode browser; the drafts live in the parent (they drive the board preview). */
export function SetupFields({ mode, draft, setDraft, multiDraft, setMultiDraft }: { mode: GameMode; draft: GameConfig; setDraft: (c: GameConfig) => void; multiDraft: MultiConfig; setMultiDraft: (c: MultiConfig) => void }) {
  const multi = isMultiMode(mode);
  const setWeight = (key: keyof BfsWeights, value: number) => setDraft({ ...draft, bfsWeights: { ...draft.bfsWeights, [key]: value } });

  return (
    <div className="space-y-4" data-setup-fields={mode}>
        {mode === 'vs-ai' && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">상대 AI</span>
              <select
                value={draft.opponent === 'human' ? 'minimax' : draft.opponent}
                onChange={(e) => setDraft({ ...draft, opponent: e.target.value as Opponent })}
                className={inputClass}
              >
                {AI_OPPONENTS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
                <optgroup label="다음 단계에서 구현">
                  {AGENT_CATALOG.filter((a) => !a.available).map((agent) => (
                    <option key={agent.id} value={agent.id} disabled>
                      {agent.name} (준비 중)
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            <div>
              <span className="mb-1.5 block text-xs text-muted">내 순서</span>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-inset p-1">
                {([0, 1] as PlayerId[]).map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    onClick={() => setDraft({ ...draft, userSeat: seat })}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      draft.userSeat === seat ? 'bg-card font-medium text-ink shadow-[var(--shadow-soft)]' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {seat === 0 ? '선공' : '후공'} <span className="text-xs text-faint">({PLAYER_LABEL[seat]})</span>
                  </button>
                ))}
              </div>
            </div>

            {draft.opponent === 'mcts' && <MctsSettingsForm value={draft.mcts} onChange={(mcts) => setDraft({ ...draft, mcts })} />}
            {draft.opponent === 'mcts-guided' && <MctsSettingsForm value={draft.mctsGuided} onChange={(mctsGuided) => setDraft({ ...draft, mctsGuided })} />}

            {(draft.opponent === 'random' || draft.opponent === 'mcts' || draft.opponent === 'mcts-guided') && (
              <label className="block">
                <span className="mb-1.5 block text-xs text-muted">무작위 시드</span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={draft.seed}
                    onChange={(e) => setDraft({ ...draft, seed: Math.trunc(Number(e.target.value)) || 0 })}
                    className={`${inputClass} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, seed: randomSeed() })}
                    className="shrink-0 rounded-lg border border-line px-3 text-xs text-ink-soft hover:bg-inset"
                    title="새 시드"
                  >
                    새 시드
                  </button>
                </div>
                <span className="mt-1 block text-[11px] text-faint">같은 시드와 같은 진행이면 같은 수를 둡니다.</span>
              </label>
            )}

            {draft.opponent === 'minimax' && <MinimaxSettingsForm value={draft.minimax} onChange={(minimax) => setDraft({ ...draft, minimax })} />}

            {draft.opponent === 'bfs' && (
              <details className="rounded-lg border border-line-soft bg-paper/50 px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted">BFS 휴리스틱 가중치</summary>
                <div className="mt-3 space-y-2">
                  {WEIGHT_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center justify-between gap-3 text-xs text-muted">
                      {f.label}
                      <input
                        type="number"
                        step={f.step}
                        min={0}
                        value={draft.bfsWeights[f.key]}
                        onChange={(e) => setWeight(f.key, Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-right font-mono text-ink focus:border-accent focus:outline-none"
                      />
                    </label>
                  ))}
                  <button type="button" onClick={() => setDraft({ ...draft, bfsWeights: { ...DEFAULT_BFS_WEIGHTS } })} className="text-[11px] text-accent hover:underline">
                    기본값으로
                  </button>
                </div>
              </details>
            )}
          </>
        )}

        {mode === 'local-2p' && (
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs text-muted">플레이어 이름</legend>
            {([0, 1] as PlayerId[]).map((seat) => (
              <NameRow
                key={seat}
                slot={seat}
                hint={seat === 0 ? '아래 · 선공' : '위 · 후공'}
                value={draft.names?.[seat] ?? ''}
                placeholder={DEFAULT_PLAYER_NAMES[seat]}
                onChange={(v) => setDraft({ ...draft, names: seat === 0 ? [v, draft.names?.[1] ?? ''] : [draft.names?.[0] ?? '', v] })}
              />
            ))}
          </fieldset>
        )}

        {multi && <MultiSetupFields draft={multiDraft} onChange={setMultiDraft} />}

        {!multi && (
          <label className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>
              실험용 최대 턴 <span className="text-faint">(ply, 비우면 무제한)</span>
            </span>
            <input
              type="number"
              min={1}
              value={draft.maxPlies ?? ''}
              onChange={(e) => {
                const v = Math.trunc(Number(e.target.value));
                setDraft({ ...draft, maxPlies: e.target.value === '' || v <= 0 ? null : v });
              }}
              className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-right font-mono text-ink focus:border-accent focus:outline-none"
            />
          </label>
        )}
    </div>
  );
}

/** Drafts after choosing `next` in the mode browser: its recommended settings (typed names are kept). */
export function draftsForMode(next: GameMode, draft: GameConfig, multiDraft: MultiConfig): { draft: GameConfig; multiDraft: MultiConfig } {
  return {
    draft: next === 'vs-ai' && draft.opponent === 'human' ? { ...draft, opponent: 'minimax' } : next === 'local-2p' ? { ...draft, opponent: 'human', userSeat: 0 } : draft,
    // who plays each slot (person / AI) is not a rule of the mode, so it is kept when the mode changes
    multiDraft: isMultiMode(next) && next !== multiDraft.mode ? { ...recommendedConfig(next, multiDraft.names), ...(multiDraft.controllers ? { controllers: multiDraft.controllers } : {}) } : multiDraft,
  };
}

function NameRow({ slot, hint, value, placeholder, onChange }: { slot: number; hint: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className={`flex h-6 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-card ${PLAYER_BG_CLASS[slot]}`}>{PLAYER_LABEL[slot]}</span>
      <input
        type="text"
        maxLength={20}
        value={value}
        placeholder={placeholder}
        aria-label={`${PLAYER_LABEL[slot]} 이름`}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
      <span className="w-14 shrink-0 text-[11px] text-faint">{hint}</span>
    </label>
  );
}
