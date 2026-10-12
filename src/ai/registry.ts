import { createBfsAgent } from './bfsAgent';
import { createMctsAgent, resolveMctsSettings } from './mctsAgent';
import { createMinimaxAgent, resolveMinimaxSettings } from './minimaxAgent';
import { createRandomAgent } from './randomAgent';
import type { Agent, BfsWeights, MctsSettings, MinimaxSettings } from './types';
import { spawnSearchWorker, workersSupported } from './worker/spawn';
import { createWorkerAgent } from './worker/workerAgent';

export type AgentId = 'random' | 'bfs' | 'minimax' | 'mcts' | 'mcts-guided';

export interface AgentSettings {
  /** Seed for stochastic agents. */
  seed: number;
  bfsWeights?: Partial<BfsWeights>;
  minimax?: Partial<MinimaxSettings>;
  mcts?: Partial<MctsSettings>;
  mctsGuided?: Partial<MctsSettings>;
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
        ? createWorkerAgent({ agent: 'minimax', settings: resolveMinimaxSettings(settings.minimax) }, spawnSearchWorker)
        : createMinimaxAgent(settings.minimax);
    }
    case 'mcts': {
      const useWorker = settings.useWorker ?? workersSupported();
      return useWorker
        ? createWorkerAgent({ agent: 'mcts', settings: resolveMctsSettings(settings.mcts), seed: settings.seed }, spawnSearchWorker)
        : createMctsAgent(settings.mcts, settings.seed);
    }
    case 'mcts-guided': {
      const resolved = resolveMctsSettings({ ...settings.mctsGuided, variant: 'guided' });
      const useWorker = settings.useWorker ?? workersSupported();
      return useWorker
        ? createWorkerAgent({ agent: 'mcts', settings: resolved, seed: settings.seed }, spawnSearchWorker)
        : createMctsAgent(resolved, settings.seed);
    }
  }
}
