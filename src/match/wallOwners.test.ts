import { describe, expect, it } from 'vitest';
import { openingRecord, parseMoveList } from '../arena/openings';
import { applyAction, createInitialState, legalActions, wallIndex } from '../engine';
import type { Action, PlayerId } from '../engine';
import { NO_WALL_OWNERS, wallKey, wallOwnersFromMoves } from './wallOwners';

describe('wall owners from the game record', () => {
  it('assigns every placed wall to the player who placed it, along a random game', () => {
    let state = createInitialState();
    const record: { action: Action; player: PlayerId }[] = [];
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 120 && state.winner === null; i++) {
      const actions = legalActions(state);
      const walls = actions.filter((a) => a.type === 'wall');
      const pool = walls.length > 0 && rand() < 0.5 ? walls : actions.filter((a) => a.type === 'move');
      const action = pool[Math.floor(rand() * pool.length)];
      record.push({ action, player: state.currentPlayer });
      state = applyAction(state, action);
    }
    const owners = wallOwnersFromMoves(record);
    let placed = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        for (const o of ['h', 'v'] as const) {
          if (!(o === 'h' ? state.hWalls : state.vWalls)[wallIndex(row, col)]) continue;
          placed++;
          const entry = record.find((r) => r.action.type === 'wall' && r.action.orientation === o && r.action.row === row && r.action.col === col)!;
          expect(owners.get(wallKey(o, row, col))).toBe(entry.player);
        }
      }
    }
    expect(placed).toBeGreaterThan(4);
    expect(owners.size).toBe(placed);
  });

  it('keeps owners known for the start position and leaves unknown walls out', () => {
    const base = new Map<string, PlayerId>([[wallKey('h', 2, 2), 1]]);
    const owners = wallOwnersFromMoves([{ action: { type: 'wall', orientation: 'v', row: 4, col: 4 }, player: 0 }], base);
    expect(owners.get(wallKey('h', 2, 2))).toBe(1);
    expect(owners.get(wallKey('v', 4, 4))).toBe(0);
    expect(owners.get(wallKey('h', 0, 0))).toBeUndefined(); // not recorded -> drawn neutral
    expect(base.size).toBe(1); // input not modified
    expect(wallOwnersFromMoves([{ action: { type: 'move', to: { row: 7, col: 4 } }, player: 0 }])).toBe(NO_WALL_OWNERS);
  });

  it('records the player of each parsed move (opening move lists)', () => {
    const parsed = parseMoveList('e2 e8 e3h d6v');
    expect(parsed.actions.map((a) => a.player)).toEqual([0, 1, 0, 1]);
    const owners = wallOwnersFromMoves(openingRecord({ moves: 'e2 e8 e3h d6v' }));
    expect([...owners.values()].sort()).toEqual([0, 1]);
    expect(openingRecord({ seed: 1, plies: 6 })).toEqual([]); // random openings move pawns only
  });
});
