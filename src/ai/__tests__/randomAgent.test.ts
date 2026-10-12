import { describe, expect, it } from 'vitest';
import { applyAction, createInitialState, createState, isLegalAction, legalActions } from '../../engine';
import { createRandomAgent } from '../randomAgent';

describe('Random agent', () => {
  it('only chooses legal actions and records the candidate count', async () => {
    const agent = createRandomAgent({ seed: 7 });
    let state = createInitialState();
    for (let i = 0; i < 150 && state.winner === null; i++) {
      const { action, trace } = await agent.decide(state);
      const legal = legalActions(state);
      expect(isLegalAction(state, action)).toBe(true);
      expect(trace.algorithm).toBe('random');
      expect(trace.candidateCount).toBe(legal.length);
      expect(trace.pawnMoveCount + trace.wallCount).toBe(legal.length);
      expect(legal[trace.chosenIndex]).toEqual(action);
      expect(trace.chosenAction).toEqual(action);
      expect(trace.chosenIndex).toBe(Math.floor(trace.roll * legal.length));
      expect(trace.decisionIndex).toBe(i);
      expect(trace.player).toBe(state.currentPlayer);
      state = applyAction(state, action);
    }
  });

  it('is reproducible for the same seed and differs for another seed', async () => {
    const play = async (seed: number) => {
      const agent = createRandomAgent({ seed });
      let state = createInitialState();
      const seq: string[] = [];
      for (let i = 0; i < 20; i++) {
        const { action } = await agent.decide(state);
        seq.push(JSON.stringify(action));
        state = applyAction(state, action);
      }
      return seq;
    };
    expect(await play(123)).toEqual(await play(123));
    expect(await play(123)).not.toEqual(await play(124));
  });

  it('works when only pawn moves remain (no walls left)', async () => {
    const state = createState({ wallsRemaining: [0, 0] });
    const { action, trace } = await createRandomAgent({ seed: 1 }).decide(state);
    expect(action.type).toBe('move');
    expect(trace.wallCount).toBe(0);
    expect(trace.candidateCount).toBe(3);
  });

  it('refuses to act in a finished game', async () => {
    const won = createState({ pawns: [{ row: 0, col: 4 }, { row: 5, col: 5 }] });
    await expect(createRandomAgent({ seed: 1 }).decide(won)).rejects.toThrow();
  });
});
