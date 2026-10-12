import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BFS_WEIGHTS } from '../../ai/bfsAgent';
import { createAgent } from '../../ai/registry';
import type { Agent } from '../../ai/types';
import type { Action } from '../../engine';
import type { GameConfig } from '../config';
import { GameController } from '../GameController';

const config = (patch: Partial<GameConfig> = {}): GameConfig => ({
  userSeat: 0,
  opponent: 'bfs',
  seed: 1,
  bfsWeights: { ...DEFAULT_BFS_WEIGHTS },
  maxPlies: 400,
  ...patch,
});

const move = (row: number, col: number): Action => ({ type: 'move', to: { row, col } });

const controllers: GameController[] = [];
function make(c: GameConfig, options: ConstructorParameters<typeof GameController>[1] = {}) {
  const ctl = new GameController(c, { aiDelayMs: 0, ...options });
  controllers.push(ctl);
  ctl.activate();
  return ctl;
}
afterEach(() => {
  controllers.splice(0).forEach((c) => c.deactivate());
});

describe('GameController', () => {
  it('lets the user move first and answers with an AI move', async () => {
    const ctl = make(config());
    expect(ctl.getSnapshot().humanToMove).toBe(true);
    expect(ctl.playHuman(move(7, 4))).toBe(true);
    expect(ctl.getSnapshot().humanToMove).toBe(false);
    await ctl.idle();
    const s = ctl.getSnapshot();
    expect(s.history).toHaveLength(2);
    expect(s.history[1].player).toBe(1);
    expect(s.history[1].trace?.algorithm).toBe('bfs');
    expect(s.game.currentPlayer).toBe(0);
    expect(s.humanToMove).toBe(true);
  });

  it('lets the AI make the first move when the user plays second', async () => {
    const ctl = make(config({ userSeat: 1, opponent: 'random' }));
    expect(ctl.getSnapshot().humanToMove).toBe(false);
    expect(ctl.getSnapshot().thinking).toBe(true);
    await ctl.idle();
    const s = ctl.getSnapshot();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].player).toBe(0);
    expect(s.history[0].trace?.algorithm).toBe('random');
    expect(s.game.currentPlayer).toBe(1);
    expect(s.humanToMove).toBe(true);
  });

  it('blocks user input during the AI turn', async () => {
    const ctl = make(config({ userSeat: 1, opponent: 'bfs' }));
    // AI (P1/seat 0) to move: the user must not be able to move either pawn.
    expect(ctl.playHuman(move(7, 4))).toBe(false);
    expect(ctl.playHuman(move(1, 4))).toBe(false);
    await ctl.idle();
    expect(ctl.getSnapshot().history).toHaveLength(1);
  });

  it('rejects illegal user actions', () => {
    const ctl = make(config({ opponent: 'human' }));
    expect(ctl.playHuman(move(6, 4))).toBe(false);
    expect(ctl.getSnapshot().history).toHaveLength(0);
  });

  it('accepts no further actions after a win', async () => {
    const ctl = make(config({ opponent: 'bfs' }));
    // The user walks straight up; BFS AI walks down. P1 moves first and wins the race
    // unless the AI walls; keep playing the BFS-suggested path for P1 until the game ends.
    for (let i = 0; i < 200 && ctl.getSnapshot().status.kind === 'playing'; i++) {
      const s = ctl.getSnapshot();
      const best = (await createAgent('bfs', { seed: 0 }).decide(s.game)).action;
      expect(ctl.playHuman(best)).toBe(true);
      await ctl.idle();
    }
    const end = ctl.getSnapshot();
    expect(end.status.kind).toBe('win');
    expect(end.humanToMove).toBe(false);
    const plies = end.history.length;
    expect(ctl.playHuman(move(end.game.pawns[0].row - 1, end.game.pawns[0].col))).toBe(false);
    await ctl.idle();
    expect(ctl.getSnapshot().history).toHaveLength(plies);
    expect(ctl.getSnapshot().thinking).toBe(false);
  });

  it('switches AI on restart and discards a pending decision of the old AI', async () => {
    let resolveSlow: () => void = () => {};
    const slow: Agent = {
      id: 'slow',
      decide: (state) =>
        new Promise((resolve) => {
          resolveSlow = () =>
            resolve({
              action: move(7, 4),
              trace: { algorithm: 'random', player: state.currentPlayer, ply: state.ply, elapsedMs: 0, seed: 0,
                decisionIndex: 0, candidateCount: 3, pawnMoveCount: 3, wallCount: 0, roll: 0, chosenIndex: 0, chosenAction: move(7, 4) },
            });
        }),
    };
    const factory: typeof createAgent = (id, settings) => (id === 'random' ? slow : createAgent(id, settings));
    const ctl = make(config({ userSeat: 1, opponent: 'random' }), { agentFactory: factory });
    expect(ctl.getSnapshot().thinking).toBe(true);

    ctl.restart(config({ userSeat: 1, opponent: 'bfs' }));
    resolveSlow(); // the old agent answers after the restart — must be ignored
    await ctl.idle();
    const s = ctl.getSnapshot();
    expect(s.gameId).toBe(1);
    expect(s.config.opponent).toBe('bfs');
    expect(s.history).toHaveLength(1);
    expect(s.history[0].trace?.algorithm).toBe('bfs');
  });

  it('restart resets the board, history and status', async () => {
    const ctl = make(config({ opponent: 'random' }));
    ctl.playHuman(move(7, 4));
    await ctl.idle();
    expect(ctl.getSnapshot().history.length).toBe(2);
    ctl.restart();
    const s = ctl.getSnapshot();
    expect(s.history).toHaveLength(0);
    expect(s.game.ply).toBe(0);
    expect(s.game.pawns[0]).toEqual({ row: 8, col: 4 });
    expect(s.status.kind).toBe('playing');
    expect(s.humanToMove).toBe(true);
  });

  it('reproduces the same Random AI game for the same seed', async () => {
    const run = async () => {
      const ctl = make(config({ userSeat: 1, opponent: 'random', seed: 77 }));
      await ctl.idle();
      return ctl.getSnapshot().history[0].action;
    };
    expect(await run()).toEqual(await run());
  });

  it('halts at the experimental ply limit without a winner', async () => {
    const ctl = make(config({ opponent: 'human', maxPlies: 2 }));
    ctl.playHuman(move(7, 4));
    ctl.playHuman(move(1, 4));
    const s = ctl.getSnapshot();
    expect(s.status).toEqual({ kind: 'halted', reason: 'max-plies', maxPlies: 2 });
    expect(s.game.winner).toBeNull();
    expect(s.humanToMove).toBe(false);
    expect(ctl.playHuman(move(6, 4))).toBe(false);
  });

  it('does not drive AI turns while inactive', async () => {
    const ctl = new GameController(config({ userSeat: 1 }), { aiDelayMs: 0 });
    await ctl.idle();
    expect(ctl.getSnapshot().history).toHaveLength(0);
    ctl.activate();
    controllers.push(ctl);
    await ctl.idle();
    expect(ctl.getSnapshot().history).toHaveLength(1);
  });
});
