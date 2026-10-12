import { DEFAULT_MINIMAX_SETTINGS } from '../../ai/minimaxAgent';
import type { MinimaxEvalWeights, MinimaxSettings } from '../../ai/types';

interface Props {
  value: MinimaxSettings;
  onChange: (value: MinimaxSettings) => void;
}

const numberClass =
  'w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-slate-200 focus:border-sky-500 focus:outline-none';

const EVAL_FIELDS: { key: keyof MinimaxEvalWeights; label: string }[] = [
  { key: 'selfDistance', label: '내 거리 가중치' },
  { key: 'opponentDistance', label: '상대 거리 가중치' },
  { key: 'wallDifference', label: '남은 벽 차이 가치' },
  { key: 'tempo', label: '차례(템포) 보너스' },
];

export function MinimaxSettingsForm({ value, onChange }: Props) {
  const set = (patch: Partial<MinimaxSettings>) => onChange({ ...value, ...patch });
  const alphabeta = value.algorithm === 'alphabeta';

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1">
        {(['alphabeta', 'minimax'] as const).map((algo) => (
          <button
            key={algo}
            type="button"
            onClick={() => set({ algorithm: algo })}
            className={`rounded-md px-2 py-1.5 text-xs transition-colors ${
              value.algorithm === algo ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {algo === 'alphabeta' ? 'Alpha-Beta' : 'Minimax (가지치기 없음)'}
          </button>
        ))}
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
        최대 탐색 깊이 (ply)
        <input
          type="number"
          min={1}
          max={10}
          value={value.maxDepth}
          onChange={(e) => set({ maxDepth: Math.min(10, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) })}
          className={numberClass}
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
        <span>
          시간 제한 (ms) <span className="text-slate-500">0 = 없음</span>
        </span>
        <input
          type="number"
          min={0}
          step={250}
          value={value.timeLimitMs}
          onChange={(e) => set({ timeLimitMs: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })}
          className={numberClass}
        />
      </label>
      <label className="block text-xs text-slate-400">
        <span className="mb-1 block">벽 후보</span>
        <select
          value={value.wallFilter}
          onChange={(e) => set({ wallFilter: e.target.value as MinimaxSettings['wallFilter'] })}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
        >
          <option value="opponent-path">상대 최단 경로를 끊는 벽만 (빠름)</option>
          <option value="all">모든 합법 벽 (느림)</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <label className={`flex items-center gap-1.5 ${alphabeta ? '' : 'opacity-40'}`}>
          <input
            type="checkbox"
            disabled={!alphabeta}
            checked={value.moveOrdering}
            onChange={(e) => set({ moveOrdering: e.target.checked })}
            className="accent-sky-500"
          />
          이동 정렬
        </label>
        <label className={`flex items-center gap-1.5 ${alphabeta ? '' : 'opacity-40'}`}>
          <input
            type="checkbox"
            disabled={!alphabeta}
            checked={value.transpositionTable}
            onChange={(e) => set({ transpositionTable: e.target.checked })}
            className="accent-sky-500"
          />
          전치표 (TT)
        </label>
      </div>
      {!alphabeta && (
        <p className="text-[11px] text-amber-300/80">Minimax는 모든 노드를 탐색하므로 깊이 3 이상에서 매우 느려질 수 있습니다.</p>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-slate-400">평가 함수 가중치</summary>
        <div className="mt-2 space-y-2">
          {EVAL_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 text-xs text-slate-400">
              {f.label}
              <input
                type="number"
                step={0.1}
                min={0}
                value={value.evaluation[f.key]}
                onChange={(e) =>
                  set({ evaluation: { ...value.evaluation, [f.key]: Math.max(0, Number(e.target.value) || 0) } })
                }
                className={numberClass}
              />
            </label>
          ))}
        </div>
      </details>
      <button
        type="button"
        onClick={() => onChange({ ...DEFAULT_MINIMAX_SETTINGS, evaluation: { ...DEFAULT_MINIMAX_SETTINGS.evaluation } })}
        className="text-[11px] text-sky-400 hover:underline"
      >
        기본값으로
      </button>
    </div>
  );
}
