import { createBfsAgent } from './bfsAgent';
import { createRandomAgent } from './randomAgent';
import type { Agent, BfsWeights } from './types';

export type AgentId = 'random' | 'bfs';

export interface AgentSettings {
  /** Seed for stochastic agents. */
  seed: number;
  bfsWeights?: Partial<BfsWeights>;
}

/** Creates a fresh agent instance (fresh RNG stream) for a new game. */
export function createAgent(id: AgentId, settings: AgentSettings): Agent {
  switch (id) {
    case 'random':
      return createRandomAgent({ seed: settings.seed });
    case 'bfs':
      return createBfsAgent({ weights: settings.bfsWeights });
  }
}
