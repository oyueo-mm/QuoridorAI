import { createAgent } from '../ai/registry';
import type { AgentId, AgentSettings } from '../ai/registry';
import type { Agent } from '../ai/types';

/**
 * Agents available in the Arena / Compare / Experiments views and how a search budget is
 * applied to each of them.
 *
 * Two budget modes are kept strictly apart:
 *  - 'equal-time': every search agent gets the same wall-clock limit per move (depth and
 *    simulations unlimited). Results depend on the machine and are not exactly reproducible.
 *  - 'fixed': every search agent gets its own work budget (Minimax depth / MCTS simulations),
 *    no time limit. Deterministic for the recorded seeds.
 * Random and BFS do not search, so neither budget applies to them.
 */

export type ArenaAgentKind = 'random' | 'bfs' | 'minimax' | 'alphabeta' | 'mcts' | 'mcts-guided';
export type BudgetMode = 'equal-time' | 'fixed';

export interface AgentSpec {
  kind: ArenaAgentKind;
  /** Fixed-budget depth (Minimax / Alpha-Beta). */
  depth: number;
  /** Fixed-budget simulations (MCTS). */
  simulations: number;
}

export interface Budget {
  mode: BudgetMode;
  /** Per-move limit for every search agent in 'equal-time' mode. */
  timeMs: number;
}

export interface ArenaAgentInfo {
  name: string;
  /** What the fixed budget controls. */
  budget: 'none' | 'depth' | 'simulations';
  description: string;
}

export const ARENA_AGENTS: Record<ArenaAgentKind, ArenaAgentInfo> = {
  random: { name: 'Random', budget: 'none', description: '합법 행동 중 균등 무작위 (시드 고정)' },
  bfs: { name: 'BFS', budget: 'none', description: 'BFS 최단 거리 1수 휴리스틱' },
  minimax: { name: 'Minimax', budget: 'depth', description: '가지치기 없는 Minimax (모든 노드 탐색)' },
  alphabeta: { name: 'Alpha-Beta', budget: 'depth', description: 'Alpha-Beta + 이동 정렬 + 전치표' },
  mcts: { name: 'Pure MCTS', budget: 'simulations', description: 'UCT + 긴 휴리스틱 롤아웃' },
  'mcts-guided': { name: 'Guided MCTS', budget: 'simulations', description: 'PUCT + 휴리스틱 사전 확률 + 평가 컷오프' },
};

export const ARENA_AGENT_KINDS = Object.keys(ARENA_AGENTS) as ArenaAgentKind[];

export function defaultSpec(kind: ArenaAgentKind): AgentSpec {
  return {
    kind,
    depth: kind === 'minimax' ? 3 : 4,
    simulations: kind === 'mcts' ? 500 : 3000,
  };
}

export const DEFAULT_BUDGET: Budget = { mode: 'equal-time', timeMs: 300 };

/** Human-readable label including the budget actually applied. */
export function agentLabel(spec: AgentSpec, budget: Budget): string {
  const info = ARENA_AGENTS[spec.kind];
  if (info.budget === 'none') return info.name;
  if (budget.mode === 'equal-time') return `${info.name} (${budget.timeMs} ms)`;
  return info.budget === 'depth' ? `${info.name} (깊이 ${spec.depth})` : `${info.name} (${spec.simulations}회)`;
}

/** Registry id and settings for an agent under a budget. */
export function agentSettings(spec: AgentSpec, budget: Budget, seed: number): { id: AgentId; settings: AgentSettings } {
  const timed = budget.mode === 'equal-time';
  switch (spec.kind) {
    case 'random':
      return { id: 'random', settings: { seed } };
    case 'bfs':
      return { id: 'bfs', settings: { seed } };
    case 'minimax':
    case 'alphabeta': {
      const alphabeta = spec.kind === 'alphabeta';
      return {
        id: 'minimax',
        settings: {
          seed,
          minimax: {
            algorithm: alphabeta ? 'alphabeta' : 'minimax',
            moveOrdering: alphabeta,
            transpositionTable: alphabeta,
            maxDepth: timed ? 30 : spec.depth,
            timeLimitMs: timed ? budget.timeMs : 0,
          },
        },
      };
    }
    case 'mcts':
    case 'mcts-guided': {
      const mcts = { iterations: timed ? 1e9 : spec.simulations, timeLimitMs: timed ? budget.timeMs : 0 };
      return spec.kind === 'mcts'
        ? { id: 'mcts', settings: { seed, mcts } }
        : { id: 'mcts-guided', settings: { seed, mctsGuided: mcts } };
    }
  }
}

export type AgentFactory = (spec: AgentSpec, budget: Budget, seed: number) => Agent;

/** Browser default: search agents run in Web Workers. */
export const workerFactory: AgentFactory = (spec, budget, seed) => {
  const { id, settings } = agentSettings(spec, budget, seed);
  return createAgent(id, settings);
};

/** Node / tests: everything in-process. */
export const inProcessFactory: AgentFactory = (spec, budget, seed) => {
  const { id, settings } = agentSettings(spec, budget, seed);
  return createAgent(id, { ...settings, useWorker: false });
};

/** Deterministic seed derivation (independent streams per game / agent). */
export function deriveSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= h >>> 13;
  }
  return h >>> 0;
}
