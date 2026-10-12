import { legalActions } from '../engine';
import type { GameState } from '../engine';
import { assertCanDecide, now } from './common';
import { createRng } from './rng';
import type { Agent, AgentContext, AgentDecision, RandomTrace } from './types';

export interface RandomAgentOptions {
  seed: number;
}

/**
 * Picks uniformly among all legal actions (pawn moves and walls alike).
 * One RNG stream per agent instance: the same seed and the same sequence of states
 * reproduce the same game.
 */
export function createRandomAgent({ seed }: RandomAgentOptions): Agent<RandomTrace> {
  const rng = createRng(seed);
  let decisionIndex = 0;

  return {
    id: 'random',
    async decide(state: GameState, context?: AgentContext): Promise<AgentDecision<RandomTrace>> {
      assertCanDecide(state, context);
      const start = now();
      const actions = legalActions(state);
      const roll = rng();
      const chosenIndex = Math.floor(roll * actions.length);
      const action = actions[chosenIndex];
      const pawnMoveCount = actions.filter((a) => a.type === 'move').length;
      return {
        action,
        trace: {
          algorithm: 'random',
          player: state.currentPlayer,
          ply: state.ply,
          elapsedMs: now() - start,
          seed,
          decisionIndex: decisionIndex++,
          candidateCount: actions.length,
          pawnMoveCount,
          wallCount: actions.length - pawnMoveCount,
          roll,
          chosenIndex,
          chosenAction: action,
        },
      };
    },
  };
}
