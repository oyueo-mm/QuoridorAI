import { randomSeed } from '../rng';
import type { MultiRules, MultiState } from '../../engine';
import { DEFAULT_MULTI_GREEDY_WEIGHTS, decideMultiGreedy, resolveGreedyWeights } from './greedy';
import { MAXN_PRESETS, decideMultiMaxN, resolveMaxNSettings } from './maxn';
import { decideMultiRandom } from './random';
import type { MultiAgentKind, MultiAgentSpec, MultiAiSummary, MultiContext, MultiDecision, MultiGreedyWeights, MultiPreset, MultiTrace } from './types';

/**
 * Registry of the multi-player AIs. Only algorithms that exist are listed; Paranoid search and a
 * multi-player MCTS are planned (stage 3-B) and are deliberately absent — adding one means a new
 * entry here, a `decide…` function with its own trace type, and a case in `decideMulti`.
 */
export interface MultiAgentDescriptor {
  id: MultiAgentKind;
  label: string;
  short: string;
  description: string;
  /** Presets offered in the setup form (besides 'custom'). */
  presets: readonly Exclude<MultiPreset, 'custom'>[];
  /** Runs in the search worker (Random is instant and runs inline). */
  heavy: boolean;
  supports(rules: MultiRules): boolean;
}

export const MULTI_AGENTS: readonly MultiAgentDescriptor[] = [
  {
    id: 'random',
    label: 'Random AI',
    short: 'Random',
    description: '합법 행동 중 하나를 무작위로 고릅니다. 평가나 탐색은 하지 않는 기준선입니다.',
    presets: [],
    heavy: false,
    supports: () => true,
  },
  {
    id: 'greedy',
    label: 'BFS / Greedy AI',
    short: 'Greedy',
    description: '모든 합법 행동을 두고 모든 플레이어의 최단 거리로 점수를 매겨 가장 좋은 한 수를 고릅니다 (1수 앞).',
    presets: ['easy', 'normal', 'hard'],
    heavy: true,
    supports: () => true,
  },
  {
    id: 'maxn',
    label: 'Max-N AI',
    short: 'Max-N',
    description: '플레이어별 평가 벡터로 실제 차례 순서대로 탐색합니다 (반복 심화, 시간·노드 예산). 벽 후보는 휴리스틱으로 줄입니다.',
    presets: ['easy', 'normal', 'hard'],
    heavy: true,
    supports: () => true,
  },
];

export const multiAgentInfo = (id: MultiAgentKind): MultiAgentDescriptor => MULTI_AGENTS.find((a) => a.id === id)!;
export const multiAgentSupports = (id: MultiAgentKind, rules: MultiRules): boolean => multiAgentInfo(id).supports(rules);

export const GREEDY_PRESETS: Record<'easy' | 'normal' | 'hard', MultiGreedyWeights> = {
  easy: { ...DEFAULT_MULTI_GREEDY_WEIGHTS, leaderDistance: 0.2, opponentDistance: 0.1, wallCost: 1.5 },
  normal: { ...DEFAULT_MULTI_GREEDY_WEIGHTS },
  hard: { ...DEFAULT_MULTI_GREEDY_WEIGHTS, leaderDistance: 1, opponentDistance: 0.5, wallCost: 0.35 },
};

export const PRESET_LABEL: Record<MultiPreset, string> = { easy: '쉬움', normal: '보통', hard: '어려움', custom: '직접 설정' };

export function defaultAgentSpec(kind: MultiAgentKind, seed: number = randomSeed()): MultiAgentSpec {
  return { kind, seed, preset: 'normal', greedy: { ...GREEDY_PRESETS.normal }, maxn: { ...MAXN_PRESETS.normal } };
}

/** The spec with the numbers of a difficulty preset (the kind and the seed are kept). */
export function withPreset(spec: MultiAgentSpec, preset: Exclude<MultiPreset, 'custom'>): MultiAgentSpec {
  return { ...spec, preset, greedy: { ...GREEDY_PRESETS[preset] }, maxn: { ...MAXN_PRESETS[preset] } };
}

/** Which preset the numbers of `spec` equal (for the kind it uses), else 'custom'. */
export function detectPreset(spec: MultiAgentSpec): MultiPreset {
  if (spec.kind === 'random') return 'normal';
  for (const p of ['easy', 'normal', 'hard'] as const) {
    const same = spec.kind === 'greedy' ? JSON.stringify(spec.greedy) === JSON.stringify(GREEDY_PRESETS[p]) : JSON.stringify(spec.maxn) === JSON.stringify(MAXN_PRESETS[p]);
    if (same) return p;
  }
  return 'custom';
}

const KINDS: readonly string[] = ['random', 'greedy', 'maxn'];

/** Validates and clamps a spec from outside (a record file): unknown values fall back to the defaults. */
export function resolveSpec(raw: unknown): MultiAgentSpec | null {
  const r = raw as Partial<MultiAgentSpec> | null;
  if (!r || typeof r !== 'object' || typeof r.kind !== 'string' || !KINDS.includes(r.kind)) return null;
  const seed = typeof r.seed === 'number' && Number.isInteger(r.seed) ? r.seed >>> 0 : 0;
  const spec: MultiAgentSpec = {
    kind: r.kind as MultiAgentKind,
    seed,
    preset: 'normal',
    greedy: resolveGreedyWeights(r.greedy),
    maxn: resolveMaxNSettings(r.maxn),
  };
  return { ...spec, preset: detectPreset(spec) };
}

/** One decision, synchronously. The worker calls this; so do tests and the main-thread fallback. */
export function decideMulti(spec: MultiAgentSpec, state: MultiState, ctx: MultiContext = {}): MultiDecision {
  switch (spec.kind) {
    case 'random':
      return decideMultiRandom(state, spec.seed, ctx.decisionIndex ?? 0);
    case 'greedy':
      return decideMultiGreedy(state, resolveGreedyWeights(spec.greedy), ctx);
    case 'maxn':
      return decideMultiMaxN(state, spec.maxn, ctx);
  }
}

/** Name of an AI as shown on the seat card. */
export const agentSeatName = (spec: MultiAgentSpec): string =>
  spec.kind === 'random' ? 'Random AI' : `${multiAgentInfo(spec.kind).short} AI · ${PRESET_LABEL[spec.preset]}`;

/** The small record form of a decision (what game files keep instead of the whole trace). */
export function summarizeTrace(trace: MultiTrace): MultiAiSummary {
  const base = { algorithm: trace.algorithm, elapsedMs: Math.round(trace.elapsedMs * 10) / 10 };
  if (trace.algorithm === 'multi-maxn') return { ...base, nodes: trace.nodes, depth: trace.completedDepth, candidates: trace.candidates.length };
  if (trace.algorithm === 'multi-greedy') return { ...base, candidates: trace.totalCandidates };
  return { ...base, candidates: trace.candidateCount };
}
