import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createInitialState,
  createState,
  distanceToRow,
  goalRow,
  isBlocked,
  isLegalAction,
  legalActions,
} from '../../engine';
import type { Action, Coord, GameState } from '../../engine';
import { DEFAULT_BFS_WEIGHTS, TRACE_PATH_LIMIT, WIN_SCORE, createBfsAgent, evaluateBfs, wallPlacementCost } from '../bfsAgent';
import { createRandomAgent } from '../randomAgent';

const at = (row: number, col: number): Coord => ({ row, col });

function expectConnectedPath(state: GameState, path: Coord[]) {
  for (let i = 1; i < path.length; i++) {
    const dr = path[i].row - path[i - 1].row;
    const dc = path[i].col - path[i - 1].col;
    expect(Math.abs(dr) + Math.abs(dc)).toBe(1);
    expect(isBlocked(state, path[i - 1].row, path[i - 1].col, dr, dc)).toBe(false);
  }
}

describe('BFS agent', () => {
  it('advances along the shortest path on an empty board', async () => {
    const { action, trace } = await createBfsAgent().decide(createInitialState());
    expect(action).toEqual({ type: 'move', to: at(7, 4) });
    expect(trace.before.selfDistance).toBe(8);
    expect(trace.candidates[0].selfAfter).toBe(7);
  });

  it('evaluates every legal action with distances matching a fresh BFS', () => {
    const state = createState({
      pawns: [at(6, 3), at(2, 5)],
      walls: [{ orientation: 'h', row: 4, col: 2 }],
      wallsRemaining: [6, 7],
    });
    const trace = evaluateBfs(state, DEFAULT_BFS_WEIGHTS);
    expect(trace.candidates).toHaveLength(legalActions(state).length);
    const cost = wallPlacementCost(DEFAULT_BFS_WEIGHTS, 6);
    expect(cost).toBeCloseTo(0.5 + 0.5 * 0.4);

    trace.candidates.forEach((c, i) => {
      const next = applyAction(state, c.action);
      expect(c.rank).toBe(i + 1);
      expect(c.selfBefore).toBe(distanceToRow(state, state.pawns[0], goalRow(0)));
      expect(c.opponentBefore).toBe(distanceToRow(state, state.pawns[1], goalRow(1)));
      expect(c.selfAfter).toBe(distanceToRow(next, next.pawns[0], goalRow(0)));
      expect(c.opponentAfter).toBe(distanceToRow(next, next.pawns[1], goalRow(1)));
      expect(c.terms.wall).toBeCloseTo(c.action.type === 'wall' ? -cost : 0);
      expect(c.terms.threat).toBe(c.opponentWinsNext ? -100 : 0);
      expect(c.score).toBeCloseTo(-c.selfAfter + c.opponentAfter + c.terms.wall + c.terms.threat);
      if (i > 0) expect(c.score).toBeLessThanOrEqual(trace.candidates[i - 1].score + 1e-9);
      if (i < TRACE_PATH_LIMIT) {
        expect(c.selfPathAfter).toHaveLength(c.selfAfter + 1);
        expect(c.opponentPathAfter).toHaveLength(c.opponentAfter + 1);
        expectConnectedPath(next, c.selfPathAfter!);
        expectConnectedPath(next, c.opponentPathAfter!);
      } else {
        expect(c.selfPathAfter).toBeUndefined();
      }
    });
    expect(trace.rationale.length).toBeGreaterThan(0);
  });

  it('takes an immediate win even when a wall would score well', async () => {
    // P1 one step from goal; P2 also one step from its goal.
    const state = createState({ pawns: [at(1, 0), at(7, 8)], currentPlayer: 0 });
    const { action, trace } = await createBfsAgent().decide(state);
    expect(action).toEqual({ type: 'move', to: at(0, 0) });
    expect(trace.candidates[0].immediateWin).toBe(true);
    expect(trace.candidates[0].score).toBe(WIN_SCORE);
    expect(trace.rationale[0]).toContain('즉시 승리');
  });

  it('places a wall when the opponent is about to win and it is behind', async () => {
    // P1 needs 6 steps, P2 needs 1 step (7,4)->(8,4). A wall under row 7 delays P2.
    const state = createState({ pawns: [at(6, 0), at(7, 4)], currentPlayer: 0 });
    const { action, trace } = await createBfsAgent().decide(state);
    expect(action.type).toBe('wall');
    expect(trace.candidates[0].opponentAfter).toBeGreaterThan(1);
    expect(trace.candidates[0].opponentWinsNext).toBe(false);
    // Advancing the pawn instead would leave P2's winning step open.
    const forward = trace.candidates.find((c) => c.action.type === 'move' && c.action.to.row === 5)!;
    expect(forward.opponentWinsNext).toBe(true);
    expect(forward.terms.threat).toBe(-DEFAULT_BFS_WEIGHTS.opponentWinThreat);
  });

  it('detects a winning jump threat that pawn-agnostic BFS distance misses', () => {
    // P1 at (7,3), P2 at (6,4). If P1 steps right to (7,4), P2 can jump over it to (8,4)
    // and win, although P2's BFS distance (pawns ignored) is still 2.
    const state = createState({ pawns: [at(7, 3), at(6, 4)], currentPlayer: 0, wallsRemaining: [0, 10] });
    const trace = evaluateBfs(state, DEFAULT_BFS_WEIGHTS);
    const intoJump = trace.candidates.find((c) => c.action.type === 'move' && c.action.to.col === 4)!;
    expect(intoJump.opponentAfter).toBe(2);
    expect(intoJump.opponentWinsNext).toBe(true);
    expect(trace.candidates[0].opponentWinsNext).toBe(false);
  });

  it('never places a wall when walls are prohibitively expensive', async () => {
    const agent = createBfsAgent({ weights: { wallCost: 100 } });
    const state = createState({ pawns: [at(6, 0), at(7, 4)], currentPlayer: 0 });
    const { action, trace } = await agent.decide(state);
    expect(action.type).toBe('move');
    expect(trace.weights.wallCost).toBe(100);
  });

  it('only chooses legal actions over many positions (vs Random)', async () => {
    const bfs = createBfsAgent();
    const rnd = createRandomAgent({ seed: 99 });
    let state = createInitialState();
    for (let i = 0; i < 200 && state.winner === null; i++) {
      const agent = state.currentPlayer === 0 ? bfs : rnd;
      const { action } = await agent.decide(state);
      expect(isLegalAction(state, action)).toBe(true);
      state = applyAction(state, action);
    }
  });

  it('breaks ties deterministically, preferring pawn moves', () => {
    // With zero weights every action scores 0 except the wall cost (also zeroed).
    const zero = { selfDistance: 0, opponentDistance: 0, wallCost: 0, wallScarcity: 0, opponentWinThreat: 0 };
    const trace = evaluateBfs(createInitialState(), zero);
    const types = trace.candidates.map((c) => c.action.type);
    expect(types.slice(0, 3)).toEqual(['move', 'move', 'move']);
    expect(trace.rationale.some((l) => l.includes('동점'))).toBe(true);
    const again = evaluateBfs(createInitialState(), zero);
    expect(again.candidates.map((c) => c.notation)).toEqual(trace.candidates.map((c) => c.notation));
  });

  it('refuses to act in a finished game', async () => {
    const won = createState({ pawns: [at(0, 4), at(5, 5)] });
    await expect(createBfsAgent().decide(won)).rejects.toThrow();
  });

  it('chosen action equals the top-ranked candidate', async () => {
    const state = applyAction(createInitialState(), { type: 'move', to: at(7, 4) } as Action);
    const { action, trace } = await createBfsAgent().decide(state);
    expect(action).toEqual(trace.candidates[0].action);
    expect(trace.player).toBe(1);
  });
});
