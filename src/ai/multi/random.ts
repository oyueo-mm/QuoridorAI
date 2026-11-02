import { legalActionsMulti } from '../../engine';
import type { MultiState } from '../../engine';
import { createRng } from '../rng';
import { now } from './common';
import type { MultiDecision, MultiRandomTrace } from './types';

/**
 * Uniformly random legal action. The roll is the `decisionIndex`-th draw of the seat's own
 * seeded stream, so the choice depends only on (state, seed, decisionIndex): reproducible, and the
 * streams of several Random AIs in one game never touch each other.
 */
export function decideMultiRandom(state: MultiState, seed: number, decisionIndex = 0): MultiDecision<MultiRandomTrace> {
  if (state.winner !== null) throw new Error('Cannot decide in a finished game');
  const t0 = now();
  const actions = legalActionsMulti(state);
  const rng = createRng(seed);
  for (let i = 0; i < decisionIndex; i++) rng();
  const roll = rng();
  const chosenIndex = Math.min(actions.length - 1, Math.floor(roll * actions.length));
  const action = actions[chosenIndex];
  const pawnMoveCount = actions.filter((a) => a.type === 'move').length;
  return {
    action,
    trace: {
      algorithm: 'multi-random',
      player: state.currentPlayer,
      ply: state.ply,
      elapsedMs: now() - t0,
      turnOrder: state.rules.turnOrder,
      ...(state.rules.teams ? { teams: state.rules.teams } : {}),
      seed,
      decisionIndex,
      candidateCount: actions.length,
      pawnMoveCount,
      wallCount: actions.length - pawnMoveCount,
      roll,
      chosenIndex,
      chosenAction: action,
    },
  };
}
