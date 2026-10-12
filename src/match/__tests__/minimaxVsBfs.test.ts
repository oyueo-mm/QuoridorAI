import { describe, expect, it } from 'vitest';
import { createBfsAgent } from '../../ai/bfsAgent';
import { createMinimaxAgent } from '../../ai/minimaxAgent';
import { createRng } from '../../ai/rng';
import { applyAction, createInitialState, legalPawnMoves } from '../../engine';
import type { GameState } from '../../engine';
import { runMatch } from '../runMatch';

/** Seeded openings: a few random pawn moves (no walls), so deterministic agents play different games. */
function opening(seed: number, plies: number): GameState {
  const rng = createRng(seed);
  let s = createInitialState();
  for (let i = 0; i < plies; i++) {
    const moves = legalPawnMoves(s);
    s = applyAction(s, { type: 'move', to: moves[Math.floor(rng() * moves.length)] });
  }
  return s;
}

describe('Minimax vs BFS AI', () => {
  it('Alpha-Beta depth 3 beats the BFS agent in most games from both seats', async () => {
    const starts = [createInitialState(), opening(1, 2), opening(2, 4)];
    const results: string[] = [];
    let wins = 0;
    for (const start of starts) {
      for (const seat of [0, 1] as const) {
        const mm = createMinimaxAgent({ maxDepth: 3, timeLimitMs: 0 });
        const record = await runMatch(seat === 0 ? [mm, createBfsAgent()] : [createBfsAgent(), mm], {
          maxPlies: 300,
          initialState: start,
        });
        // runMatch re-validates every action, so reaching here means all moves were legal.
        expect(record.status.kind).toBe('win');
        if (record.status.kind === 'win' && record.status.winner === seat) wins++;
        results.push(`${record.status.kind === 'win' && record.status.winner === seat ? 'W' : 'L'}`);
      }
    }
    expect(wins, results.join('')).toBeGreaterThanOrEqual(5);
  }, 120_000);
});
