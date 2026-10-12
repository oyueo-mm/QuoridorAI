import { useState } from 'react';
import { DEFAULT_BFS_WEIGHTS } from '../../ai/bfsAgent';
import { AGENT_CATALOG } from '../../ai/catalog';
import { randomSeed } from '../../ai/rng';
import type { BfsWeights } from '../../ai/types';
import type { PlayerId } from '../../engine';
import type { GameConfig, Opponent } from '../../session/config';
import { PLAYER_LABEL } from '../theme';
import { MinimaxSettingsForm } from './MinimaxSettingsForm';
import { Panel } from './Panel';

interface SetupPanelProps {
  current: GameConfig;
  onStart: (config: GameConfig) => void;
}

const MODES: { value: Opponent; label: string }[] = [
  { value: 'human', label: 'Human vs Human' },
  { value: 'random', label: 'Human vs Random AI' },
  { value: 'bfs', label: 'Human vs BFS AI' },
  { value: 'minimax', label: 'Human vs Minimax AI' },
];

const WEIGHT_FIELDS: { key: keyof BfsWeights; label: string; step: number }[] = [
  { key: 'selfDistance', label: '내 거리 가중치', step: 0.1 },
  { key: 'opponentDistance', label: '상대 거리 가중치', step: 0.1 },
  { key: 'wallCost', label: '벽 기본 비용', step: 0.1 },
  { key: 'wallScarcity', label: '벽 희소성 비용', step: 0.1 },
  { key: 'opponentWinThreat', label: '상대 즉시승리 위협', step: 10 },
];

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none';

export function SetupPanel({ current, onStart }: SetupPanelProps) {
  const [draft, setDraft] = useState<GameConfig>(current);
  const changed = JSON.stringify(draft) !== JSON.stringify(current);
  const setWeight = (key: keyof BfsWeights, value: number) =>
    setDraft({ ...draft, bfsWeights: { ...draft.bfsWeights, [key]: value } });

  return (
    <Panel title="게임 설정">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-slate-400">대전 모드</span>
          <select
            value={draft.opponent}
            onChange={(e) => setDraft({ ...draft, opponent: e.target.value as Opponent })}
            className={inputClass}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            <optgroup label="다음 단계에서 구현">
              {AGENT_CATALOG.filter((a) => !a.available).map((agent) => (
                <option key={agent.id} value={agent.id} disabled>
                  Human vs {agent.name} (준비 중)
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <div>
          <span className="mb-1.5 block text-xs text-slate-400">내 순서</span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1">
            {([0, 1] as PlayerId[]).map((seat) => (
              <button
                key={seat}
                type="button"
                onClick={() => setDraft({ ...draft, userSeat: seat })}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  draft.userSeat === seat ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {seat === 0 ? '선공' : '후공'} <span className="text-xs text-slate-500">({PLAYER_LABEL[seat]})</span>
              </button>
            ))}
          </div>
        </div>

        {draft.opponent === 'random' && (
          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-400">무작위 시드</span>
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
                className="shrink-0 rounded-lg border border-slate-700 px-3 text-xs text-slate-300 hover:bg-slate-800"
                title="새 시드"
              >
                새 시드
              </button>
            </div>
            <span className="mt-1 block text-[11px] text-slate-500">같은 시드와 같은 진행이면 같은 수를 둡니다.</span>
          </label>
        )}

        {draft.opponent === 'minimax' && (
          <MinimaxSettingsForm value={draft.minimax} onChange={(minimax) => setDraft({ ...draft, minimax })} />
        )}

        {draft.opponent === 'bfs' && (
          <details className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <summary className="cursor-pointer text-xs text-slate-400">BFS 휴리스틱 가중치</summary>
            <div className="mt-3 space-y-2">
              {WEIGHT_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-xs text-slate-400">
                  {f.label}
                  <input
                    type="number"
                    step={f.step}
                    min={0}
                    value={draft.bfsWeights[f.key]}
                    onChange={(e) => setWeight(f.key, Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-slate-200 focus:border-sky-500 focus:outline-none"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() => setDraft({ ...draft, bfsWeights: { ...DEFAULT_BFS_WEIGHTS } })}
                className="text-[11px] text-sky-400 hover:underline"
              >
                기본값으로
              </button>
            </div>
          </details>
        )}

        <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>
            실험용 최대 턴 <span className="text-slate-500">(ply, 비우면 무제한)</span>
          </span>
          <input
            type="number"
            min={1}
            value={draft.maxPlies ?? ''}
            onChange={(e) => {
              const v = Math.trunc(Number(e.target.value));
              setDraft({ ...draft, maxPlies: e.target.value === '' || v <= 0 ? null : v });
            }}
            className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-slate-200 focus:border-sky-500 focus:outline-none"
          />
        </label>

        <button
          type="button"
          onClick={() => onStart(draft)}
          className="w-full rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400"
        >
          {changed ? '이 설정으로 새 게임' : '게임 재시작'}
        </button>
        {changed && <p className="text-xs text-amber-400/80">변경한 설정은 새 게임부터 적용됩니다.</p>}
      </div>
    </Panel>
  );
}
