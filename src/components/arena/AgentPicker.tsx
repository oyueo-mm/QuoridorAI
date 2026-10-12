import { ARENA_AGENTS, ARENA_AGENT_KINDS, defaultSpec } from '../../arena/agentSpec';
import type { AgentSpec, Budget, BudgetMode } from '../../arena/agentSpec';

const selectClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 focus:border-sky-500 focus:outline-none';
const numberClass =
  'w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-sm text-slate-200 focus:border-sky-500 focus:outline-none';

/** Agent selector with the parameter that the current budget mode actually uses. */
export function AgentPicker({
  label,
  value,
  budget,
  onChange,
  accent,
}: {
  label: string;
  value: AgentSpec;
  budget: Budget;
  onChange: (spec: AgentSpec) => void;
  accent?: string;
}) {
  const info = ARENA_AGENTS[value.kind];
  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        {accent && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: accent }} />}
        {label}
      </span>
      <select
        aria-label={label}
        value={value.kind}
        onChange={(e) => onChange({ ...defaultSpec(e.target.value as AgentSpec['kind']), depth: value.depth, simulations: value.simulations })}
        className={selectClass}
      >
        {ARENA_AGENT_KINDS.map((k) => (
          <option key={k} value={k}>
            {ARENA_AGENTS[k].name}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-slate-500">{info.description}</p>
      {budget.mode === 'fixed' && info.budget === 'depth' && (
        <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
          탐색 깊이
          <input
            type="number"
            min={1}
            max={value.kind === 'minimax' ? 5 : 8}
            value={value.depth}
            onChange={(e) => onChange({ ...value, depth: Math.max(1, Math.min(value.kind === 'minimax' ? 5 : 8, Math.trunc(Number(e.target.value)) || 1)) })}
            className={numberClass}
          />
        </label>
      )}
      {budget.mode === 'fixed' && info.budget === 'simulations' && (
        <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
          시뮬레이션 수
          <input
            type="number"
            min={10}
            step={100}
            value={value.simulations}
            onChange={(e) => onChange({ ...value, simulations: Math.max(10, Math.trunc(Number(e.target.value)) || 10) })}
            className={numberClass}
          />
        </label>
      )}
      {budget.mode === 'fixed' && value.kind === 'minimax' && value.depth >= 4 && (
        <p className="text-[11px] text-amber-300/80">가지치기 없는 Minimax는 깊이 4 이상에서 수당 수 초 이상 걸릴 수 있습니다.</p>
      )}
      {info.budget === 'none' && <p className="text-[11px] text-slate-500">탐색하지 않으므로 예산이 적용되지 않습니다.</p>}
    </div>
  );
}

/** Equal-time vs fixed-budget switch. The two are never mixed within one match or experiment. */
export function BudgetPicker({ value, onChange }: { value: Budget; onChange: (b: Budget) => void }) {
  const modes: { mode: BudgetMode; label: string; hint: string }[] = [
    { mode: 'equal-time', label: 'Equal Time', hint: '모든 탐색 AI에 같은 수당 시간' },
    { mode: 'fixed', label: 'Fixed Budget', hint: '알고리즘별 깊이·시뮬레이션 고정 (재현 가능)' },
  ];
  return (
    <div className="space-y-1.5">
      <span className="block text-xs text-slate-400">비교 방식</span>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1">
        {modes.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => onChange({ ...value, mode: m.mode })}
            className={`rounded-md px-2 py-1.5 text-xs transition-colors ${
              value.mode === m.mode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>
      {value.mode === 'equal-time' ? (
        <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
          수당 시간 (ms)
          <input
            type="number"
            min={20}
            step={50}
            value={value.timeMs}
            onChange={(e) => onChange({ ...value, timeMs: Math.max(20, Math.trunc(Number(e.target.value)) || 20) })}
            className={numberClass}
          />
        </label>
      ) : (
        <p className="text-[11px] text-slate-500">시간 제한 없이 알고리즘별 깊이·시뮬레이션 수로 비교합니다.</p>
      )}
    </div>
  );
}

export function BudgetBadge({ budget }: { budget: Budget }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10.5px] ${
        budget.mode === 'equal-time' ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300'
      }`}
    >
      {budget.mode === 'equal-time' ? `Equal Time · ${budget.timeMs} ms` : 'Fixed Budget'}
    </span>
  );
}
