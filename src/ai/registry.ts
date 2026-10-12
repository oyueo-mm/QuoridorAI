import { createBfsAgent } from './bfsAgent';
import { createMinimaxAgent, resolveMinimaxSettings } from './minimaxAgent';
import { createRandomAgent } from './randomAgent';
import type { Agent, BfsWeights, MinimaxSettings } from './types';
import { spawnSearchWorker, workersSupported } from './worker/spawn';
import { createWorkerAgent } from './worker/workerAgent';

export type AgentId = 'random' | 'bfs' | 'minimax';

export interface AgentSettings {
  /** Seed for stochastic agents. */
  seed: number;
  bfsWeights?: Partial<BfsWeights>;
  minimax?: Partial<MinimaxSettings>;
  /** Run search agents in a Web Worker (default: whenever the platform supports workers). */
  useWorker?: boolean;
}

/** Creates a fresh agent instance (fresh RNG stream / worker) for a new game. */
export function createAgent(id: AgentId, settings: AgentSettings): Agent {
  switch (id) {
    case 'random':
      return createRandomAgent({ seed: settings.seed });
    case 'bfs':
      return createBfsAgent({ weights: settings.bfsWeights });
    case 'minimax': {
      const useWorker = settings.useWorker ?? workersSupported();
      return useWorker
        ? createWorkerAgent(resolveMinimaxSettings(settings.minimax), spawnSearchWorker)
        : createMinimaxAgent(settings.minimax);
    }
  }
}
