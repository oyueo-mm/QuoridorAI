import { DEFAULT_GUIDED_MCTS_SETTINGS, DEFAULT_MCTS_SETTINGS } from '../../ai/mctsAgent';
import type { MctsSettings, RolloutPolicy } from '../../ai/types';

interface Props {
  value: MctsSettings;
  onChange: (value: MctsSettings) => void;
}

const numberClass =
  'w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-slate-200 focus:border-sky-500 focus:outline-none';
const selectClass =
  'w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none';

const ROLLOUTS: { value: RolloutPolicy; label: string }[] = [
  { value: 'heuristic', label: 'BFS 휴리스틱 (최단 경로 + 벽, 권장)' },
  { value: 'balanced', label: '이동/벽 균형 무작위' },
  { value: 'uniform', label: '균등 무작위 (벽에 치우침)' },
];

const int = (v: string, min: number) => Math.max(min, Math.trunc(Number(v)) || min);

export function MctsSettingsForm({ value, onChange }: Props) {
  const set = (patch: Partial<MctsSettings>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
        시뮬레이션 횟수
        <input
          type="number"
          min={1}
          step={500}
          value={value.iterations}
          onChange={(e) => set({ iterations: int(e.target.value, 1) })}
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
          onChange={(e) => set({ timeLimitMs: int(e.target.value, 0) })}
          className={numberClass}
        />
      </label>
      <label className="block text-xs text-slate-400">
        <span className="mb-1 block">롤아웃 전략</span>
        <select value={value.rollout} onChange={(e) => set({ rollout: e.target.value as RolloutPolicy })} className={selectClass}>
          {ROLLOUTS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {value.rollout === 'balanced' && (
        <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
          말 이동 확률
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={value.balancedMoveProbability}
            onChange={(e) => set({ balancedMoveProbability: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
            className={numberClass}
          />
        </label>
      )}
      <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
        롤아웃 최대 길이 (ply)
        <input
          type="number"
          min={1}
          step={10}
          value={value.rolloutMaxPlies}
          onChange={(e) => set({ rolloutMaxPlies: int(e.target.value, 1) })}
          className={numberClass}
        />
      </label>
      <label className="block text-xs text-slate-400">
        <span className="mb-1 block">최대 길이 도달 시 가치</span>
        <select
          value={value.rolloutCutoff}
          onChange={(e) => set({ rolloutCutoff: e.target.value as MctsSettings['rolloutCutoff'] })}
          className={selectClass}
        >
          <option value="evaluation">Minimax 평가 (거리 + 남은 벽 + 템포)</option>
          <option value="distance">BFS 거리 추정 (경로 길이만)</option>
          <option value="draw">무승부 (0)</option>
        </select>
      </label>

      <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
        <span>
          가치 포화 완화 <span className="text-slate-500">(추정값 |v| &lt; 0.9)</span>
        </span>
        <input type="checkbox" checked={value.valueShaping} onChange={(e) => set({ valueShaping: e.target.checked })} className="accent-sky-500" />
      </label>

      <details>
        <summary className="cursor-pointer text-xs text-slate-400">고급</summary>
        <div className="mt-2 space-y-2">
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">선택 규칙</span>
            <select value={value.selection} onChange={(e) => set({ selection: e.target.value as MctsSettings['selection'] })} className={selectClass}>
              <option value="uct">UCT (모든 수를 한 번씩 확장)</option>
              <option value="puct">PUCT + 휴리스틱 사전 확률 (지연 확장)</option>
            </select>
          </label>
          {value.selection === 'puct' && (
            <>
              <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
                PUCT 상수 c
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={value.puctConstant}
                  onChange={(e) => set({ puctConstant: Math.max(0, Number(e.target.value) || 0) })}
                  className={numberClass}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
                사전 확률 온도 τ
                <input
                  type="number"
                  min={0.05}
                  step={0.1}
                  value={value.priorTemperature}
                  onChange={(e) => set({ priorTemperature: Math.max(0.05, Number(e.target.value) || 1) })}
                  className={numberClass}
                />
              </label>
            </>
          )}
          <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
            탐색 상수 C (UCT)
            <input
              type="number"
              min={0}
              step={0.1}
              value={value.exploration}
              onChange={(e) => set({ exploration: Math.max(0, Number(e.target.value) || 0) })}
              className={numberClass}
            />
          </label>
          <label className="block text-xs text-slate-400">
            <span className="mb-1 block">벽 후보</span>
            <select
              value={value.wallFilter}
              onChange={(e) => set({ wallFilter: e.target.value as MctsSettings['wallFilter'] })}
              className={selectClass}
            >
              <option value="opponent-path">상대 최단 경로를 끊는 벽만</option>
              <option value="all">모든 합법 벽</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-slate-400">
            트리 노드 상한
            <input
              type="number"
              min={10}
              step={10000}
              value={value.maxNodes}
              onChange={(e) => set({ maxNodes: int(e.target.value, 10) })}
              className={numberClass}
            />
          </label>
        </div>
      </details>
      <button
        type="button"
        onClick={() => onChange({ ...(value.variant === 'guided' ? DEFAULT_GUIDED_MCTS_SETTINGS : DEFAULT_MCTS_SETTINGS) })}
        className="text-[11px] text-sky-400 hover:underline"
      >
        기본값으로
      </button>
    </div>
  );
}
