import { useState } from 'react';
import { AGENT_CATALOG } from '../../ai/catalog';
import type { PlayerId } from '../../engine';
import type { GameConfig } from '../../session/config';
import { PLAYER_LABEL } from '../theme';
import { Panel } from './Panel';

interface SetupPanelProps {
  current: GameConfig;
  onStart: (config: GameConfig) => void;
}

export function SetupPanel({ current, onStart }: SetupPanelProps) {
  const [draft, setDraft] = useState<GameConfig>(current);
  const changed = draft.userSeat !== current.userSeat || draft.opponent !== current.opponent;

  return (
    <Panel title="게임 설정">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-slate-400">상대</span>
          <select
            value={draft.opponent}
            onChange={(e) => setDraft({ ...draft, opponent: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none"
          >
            <option value="local">로컬 플레이어 (같은 기기)</option>
            <optgroup label="AI 알고리즘 — 다음 단계에서 구현">
              {AGENT_CATALOG.map((agent) => (
                <option key={agent.id} value={agent.id} disabled={!agent.available}>
                  {agent.name} {agent.available ? '' : '(준비 중)'}
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
