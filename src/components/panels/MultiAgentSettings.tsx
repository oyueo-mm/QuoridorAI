import { MAXN_LIMITS, MULTI_AGENTS, PRESET_LABEL, defaultAgentSpec, detectPreset, multiAgentInfo, withPreset } from '../../ai/multiAgent';
import type { MultiAgentKind, MultiAgentSpec, MultiGreedyWeights, MultiMaxNSettings, MultiPreset } from '../../ai/multiAgent';
import { randomSeed } from '../../ai/rng';
import type { MultiSeatController } from '../../session/MultiController';

const numberInput = 'w-24 rounded-lg border border-line bg-card px-2 py-1 text-right font-mono text-sm text-ink focus:border-accent focus:outline-none';

/** Who plays a seat in the setup form: a select, plus presets and advanced settings for an AI seat only. */
export function SeatControllerFields({ slot, label, value, onChange }: { slot: number; label: string; value: MultiSeatController; onChange: (c: MultiSeatController) => void }) {
  const kind = value.kind === 'human' ? 'human' : value.agent.kind;
  return (
    <div className="space-y-1.5" data-seat-controller={slot}>
      <label className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] text-muted">{label}</span>
        <select
          value={kind}
          aria-label={`${label} 조작`}
          data-seat-kind={slot}
          onChange={(e) => {
            const next = e.target.value;
            if (next === 'human') onChange({ kind: 'human' });
            else if (next !== kind) onChange({ kind: 'ai', agent: defaultAgentSpec(next as MultiAgentKind) });
          }}
          className="w-full rounded-xl border border-line bg-card px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
        >
          <option value="human">사람</option>
          {MULTI_AGENTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {value.kind === 'ai' && <AgentFields spec={value.agent} onChange={(agent) => onChange({ kind: 'ai', agent })} slot={slot} />}
    </div>
  );
}

function AgentFields({ spec, onChange, slot }: { spec: MultiAgentSpec; onChange: (s: MultiAgentSpec) => void; slot: number }) {
  const info = multiAgentInfo(spec.kind);
  const preset = detectPreset(spec);
  const setGreedy = (patch: Partial<MultiGreedyWeights>) => onChange({ ...spec, greedy: { ...spec.greedy, ...patch }, preset: 'custom' });
  const setMaxN = (patch: Partial<MultiMaxNSettings>) => onChange({ ...spec, maxn: { ...spec.maxn, ...patch }, preset: 'custom' });
  return (
    <div className="ml-14 space-y-1.5 rounded-xl border border-line-soft bg-paper/50 p-2" data-agent-fields={slot}>
      <p className="text-[11px] leading-snug text-faint">{info.description}</p>
      {info.presets.length > 0 && (
        <div role="radiogroup" aria-label="난이도" className="inline-flex gap-0.5 rounded-lg bg-inset p-0.5">
          {(['easy', 'normal', 'hard'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={preset === p}
              data-agent-preset={p}
              onClick={() => onChange(withPreset(spec, p))}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${preset === p ? 'bg-card font-medium text-ink shadow-[var(--shadow-soft)]' : 'text-muted hover:text-ink'}`}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
          {preset === 'custom' && <span className="px-2 py-1 text-xs text-faint">{PRESET_LABEL.custom}</span>}
        </div>
      )}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none">고급 설정</summary>
        <div className="mt-2 space-y-1.5">
          {spec.kind === 'random' && <SeedField spec={spec} onChange={onChange} />}
          {spec.kind === 'greedy' && <GreedyFields value={spec.greedy} onChange={setGreedy} reset={() => onChange(withPreset(spec, 'normal'))} />}
          {spec.kind === 'maxn' && <MaxNFields value={spec.maxn} onChange={setMaxN} reset={() => onChange(withPreset(spec, 'normal'))} />}
        </div>
      </details>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3" title={hint}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SeedField({ spec, onChange }: { spec: MultiAgentSpec; onChange: (s: MultiAgentSpec) => void }) {
  return (
    <Row label="무작위 시드" hint="같은 시드와 같은 진행이면 같은 수를 둡니다">
      <span className="flex gap-1.5">
        <input type="number" value={spec.seed} aria-label="AI 무작위 시드" onChange={(e) => onChange({ ...spec, seed: Math.trunc(Number(e.target.value)) >>> 0 })} className={numberInput} />
        <button type="button" onClick={() => onChange({ ...spec, seed: randomSeed() })} className="rounded-lg border border-line px-2 text-[11px] text-ink-soft hover:bg-inset">
          새 시드
        </button>
      </span>
    </Row>
  );
}

const GREEDY_FIELDS: { key: keyof MultiGreedyWeights; label: string; hint: string; step: number }[] = [
  { key: 'selfDistance', label: '내 거리', hint: '내 최단 거리 1칸당 감점', step: 0.1 },
  { key: 'allyDistance', label: '아군 거리', hint: '팀전: 가장 가까운 아군의 최단 거리 1칸당 감점', step: 0.1 },
  { key: 'leaderDistance', label: '선두 상대 거리', hint: '가장 앞선 상대(팀)의 거리 1칸당 가점', step: 0.1 },
  { key: 'opponentDistance', label: '상대 평균 거리', hint: '상대(팀)들의 평균 거리 1칸당 가점', step: 0.1 },
  { key: 'wallCost', label: '벽 기본 비용', hint: '벽 하나를 쓰는 비용', step: 0.1 },
  { key: 'wallScarcity', label: '벽 희소성 비용', hint: '이미 쓴 벽 비율에 비례하는 추가 비용', step: 0.1 },
  { key: 'opponentWinThreat', label: '상대 즉시승리 위협', hint: '내 수 뒤에 다음 수로 도착할 수 있는 상대(팀) 1개당 감점', step: 10 },
  { key: 'teamWinReady', label: '아군 승리 준비', hint: '팀전: 아군이 다음 수에 도착할 수 있으면 가점', step: 5 },
];

function GreedyFields({ value, onChange, reset }: { value: MultiGreedyWeights; onChange: (p: Partial<MultiGreedyWeights>) => void; reset: () => void }) {
  return (
    <>
      {GREEDY_FIELDS.map((f) => (
        <Row key={f.key} label={f.label} hint={f.hint}>
          <input type="number" step={f.step} min={0} value={value[f.key]} aria-label={f.label} onChange={(e) => onChange({ [f.key]: Math.max(0, Number(e.target.value) || 0) })} className={numberInput} />
        </Row>
      ))}
      <button type="button" onClick={reset} className="text-[11px] text-accent hover:underline">
        기본값으로
      </button>
    </>
  );
}

const MAXN_FIELDS: { key: keyof typeof MAXN_LIMITS; label: string; hint: string; step: number }[] = [
  { key: 'maxDepth', label: '최대 깊이 (수)', hint: '반복 심화의 마지막 깊이. 한 사람의 한 수가 1입니다', step: 1 },
  { key: 'timeMs', label: '시간 예산 (ms)', hint: '다 쓰면 마지막으로 끝낸 깊이의 결과를 둡니다', step: 100 },
  { key: 'maxNodes', label: '노드 예산', hint: '평가한 국면 수의 한도', step: 10000 },
  { key: 'rootWalls', label: '벽 후보 (첫 수)', hint: '첫 수에서 탐색할 벽 후보 수 (말 이동은 전부 탐색)', step: 1 },
  { key: 'innerWalls', label: '벽 후보 (그 이후)', hint: '탐색 중 각 국면에서 탐색할 벽 후보 수', step: 1 },
  { key: 'wallValue', label: '남은 벽 가치', hint: '평가식에서 손에 든 벽 1개의 가치', step: 0.05 },
  { key: 'leaderShare', label: '선두 상대 비중 (0~1)', hint: '평가식에서 가장 앞선 상대 vs 상대 평균의 비중', step: 0.1 },
];

function MaxNFields({ value, onChange, reset }: { value: MultiMaxNSettings; onChange: (p: Partial<MultiMaxNSettings>) => void; reset: () => void }) {
  return (
    <>
      {MAXN_FIELDS.map((f) => {
        const [lo, hi] = MAXN_LIMITS[f.key];
        return (
          <Row key={f.key} label={f.label} hint={f.hint}>
            <input
              type="number"
              step={f.step}
              min={lo}
              max={hi}
              value={value[f.key]}
              aria-label={f.label}
              onChange={(e) => onChange({ [f.key]: Math.min(hi, Math.max(lo, Number(e.target.value) || lo)) })}
              className={numberInput}
            />
          </Row>
        );
      })}
      <Row label="전치표 사용" hint="같은 국면의 탐색 값을 재사용합니다 (결과는 같고 노드가 줄어듭니다)">
        <input type="checkbox" checked={value.transposition} aria-label="전치표 사용" onChange={(e) => onChange({ transposition: e.target.checked })} />
      </Row>
      <p className="text-[11px] leading-snug text-faint">벽 후보는 상대의 최단 경로를 실제로 늘리는 벽으로 줄인 휴리스틱입니다. 모든 합법 벽을 탐색하는 것이 아니므로 최적 수를 보장하지 않습니다.</p>
      <button type="button" onClick={reset} className="text-[11px] text-accent hover:underline">
        보통 난이도 값으로
      </button>
    </>
  );
}

export type { MultiPreset };
