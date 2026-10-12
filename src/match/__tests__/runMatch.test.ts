import { describe, expect, it } from 'vitest';
import { createBfsAgent } from '../../ai/bfsAgent';
import { createRandomAgent } from '../../ai/randomAgent';
import type { Agent } from '../../ai/types';
import { createInitialState, createState } from '../../engine';
import { matchStatus } from '../outcome';
import { IllegalAgentActionError, runMatch } from '../runMatch';

describe('matchStatus', () => {
  it('distinguishes a rule win from an experimental halt', () => {
    const won = createState({ pawns: [{ row: 0, col: 4 }, { row: 3, col: 3 }], ply: 500 });
    expect(matchStatus(won, 400)).toEqual({ kind: 'win', winner: 0 });
    const long = createState({ ply: 400 });
    expect(matchStatus(long, 400)).toEqual({ kind: 'halted', reason: 'max-plies', maxPlies: 400 });
    expect(matchStatus(long, null)).toEqual({ kind: 'playing' });
    expect(matchStatus(createInitialState(), 400)).toEqual({ kind: 'playing' });
  });
});

describe('runMatch', () => {
  it('halts at the ply budget without declaring a winner', async () => {
    const record = await runMatch([createRandomAgent({ seed: 1 }), createRandomAgent({ seed: 2 })], { maxPlies: 6 });
    expect(record.status).toEqual({ kind: 'halted', reason: 'max-plies', maxPlies: 6 });
    expect(record.finalState.winner).toBeNull();
    expect(record.moves).toHaveLength(6);
  });

  it('ends with an engine win when the game finishes first', async () => {
    const record = await runMatch([createBfsAgent(), createRandomAgent({ seed: 5 })], { maxPlies: 400 });
    expect(record.status).toEqual({ kind: 'win', winner: 0 });
    expect(record.finalState.winner).toBe(0);
  });

  it('terminates BFS vs BFS within the budget', async () => {
    const record = await runMatch([createBfsAgent(), createBfsAgent()], { maxPlies: 300 });
    expect(record.status.kind).not.toBe('playing');
    expect(record.finalState.ply).toBeLessThanOrEqual(300);
  });

  it('random vs random games always finish or halt and stay legal', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const record = await runMatch([createRandomAgent({ seed }), createRandomAgent({ seed: seed + 100 })], { maxPlies: 400 });
      expect(['win', 'halted']).toContain(record.status.kind);
    }
  });

  it('rejects an agent that returns an illegal action', async () => {
    const cheater: Agent = {
      id: 'cheater',
      decide: async (state) => ({
        action: { type: 'move', to: { row: 0, col: 4 } },
        trace: { algorithm: 'random', player: state.currentPlayer, ply: state.ply, elapsedMs: 0, seed: 0, decisionIndex: 0,
          candidateCount: 0, pawnMoveCount: 0, wallCount: 0, roll: 0, chosenIndex: 0, chosenAction: { type: 'move', to: { row: 0, col: 4 } } },
      }),
    };
    await expect(runMatch([cheater, createBfsAgent()])).rejects.toThrow(IllegalAgentActionError);
  });
});

describe('runMatch experimental guards', () => {
  const shuffler = (a: [number, number], b: [number, number]): Agent => {
    let flip = false;
    return {
      id: 'shuffler',
      decide: async (state) => {
        flip = !flip;
        const [row, col] = flip ? a : b;
        const action = { type: 'move' as const, to: { row, col } };
        return {
          action,
          trace: { algorithm: 'random', player: state.currentPlayer, ply: state.ply, elapsedMs: 0, seed: 0, decisionIndex: 0,
            candidateCount: 1, pawnMoveCount: 1, wallCount: 0, roll: 0, chosenIndex: 0, chosenAction: action },
        };
      },
    };
  };

  it('halts on a repeated position without declaring a winner', async () => {
    // Both pawns step sideways and back: the start position recurs every 4 plies.
    const record = await runMatch([shuffler([8, 3], [8, 4]), shuffler([0, 3], [0, 4])], { repetitionLimit: 3, maxPlies: 400 });
    expect(record.status).toEqual({ kind: 'halted', reason: 'repetition', repeats: 3 });
    expect(record.finalState.winner).toBeNull();
    expect(record.moves).toHaveLength(8);
  });

  it('halts when the game exceeds its wall-clock budget', async () => {
    let t = 0;
    const record = await runMatch([createRandomAgent({ seed: 1 }), createRandomAgent({ seed: 2 })], {
      maxGameMs: 50,
      clock: () => (t += 10),
    });
    expect(record.status).toEqual({ kind: 'halted', reason: 'time-limit', limitMs: 50 });
    expect(record.finalState.winner).toBeNull();
  });

  it('reports every move through onMove', async () => {
    const seen: number[] = [];
    const record = await runMatch([createRandomAgent({ seed: 1 }), createRandomAgent({ seed: 2 })], {
      maxPlies: 10,
      onMove: (_m, s) => seen.push(s.ply),
    });
    expect(seen).toEqual(record.moves.map((_, i) => i + 1));
  });
});
