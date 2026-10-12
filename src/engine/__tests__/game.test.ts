import { describe, expect, it } from 'vitest';
import {
  ACTION_SPACE_SIZE,
  IllegalActionError,
  applyAction,
  createInitialState,
  createState,
  decodeAction,
  distanceMap,
  encodeAction,
  formatAction,
  isLegalAction,
  isTerminal,
  legalActions,
} from '..';
import type { Action } from '..';
import { at, hWall, vWall } from './helpers';

const move = (row: number, col: number): Action => ({ type: 'move', to: at(row, col) });

describe('turn management', () => {
  it('alternates players and counts plies', () => {
    let s = createInitialState();
    s = applyAction(s, move(7, 4));
    expect(s.currentPlayer).toBe(1);
    expect(s.ply).toBe(1);
    s = applyAction(s, hWall(5, 5));
    expect(s.currentPlayer).toBe(0);
    expect(s.ply).toBe(2);
    expect(s.wallsRemaining).toEqual([10, 9]);
  });

  it('does not mutate the previous state', () => {
    const s0 = createInitialState();
    const s1 = applyAction(s0, hWall(4, 4));
    const s2 = applyAction(s1, move(1, 4));
    expect(s0.hWalls[4 * 8 + 4]).toBe(0);
    expect(s0.wallsRemaining).toEqual([10, 10]);
    expect(s1.pawns[1]).toEqual(at(0, 4));
    expect(s2.pawns[1]).toEqual(at(1, 4));
  });

  it('rejects moving the opponent pawn or an illegal destination', () => {
    const s = createInitialState();
    expect(() => applyAction(s, move(1, 4))).toThrow(IllegalActionError);
    expect(() => applyAction(s, move(6, 4))).toThrow(IllegalActionError);
    expect(isLegalAction(s, move(7, 4))).toBe(true);
  });

  it('lists 3 pawn moves + 128 walls initially', () => {
    expect(legalActions(createInitialState())).toHaveLength(131);
  });
});

describe('win detection', () => {
  it('player 0 wins on reaching row 0', () => {
    const s = createState({ pawns: [at(1, 2), at(5, 5)], currentPlayer: 0 });
    const end = applyAction(s, move(0, 2));
    expect(end.winner).toBe(0);
    expect(isTerminal(end)).toBe(true);
    expect(legalActions(end)).toEqual([]);
    expect(() => applyAction(end, move(5, 4))).toThrow(IllegalActionError);
  });

  it('player 1 wins on reaching row 8', () => {
    const s = createState({ pawns: [at(3, 3), at(7, 6)], currentPlayer: 1 });
    const end = applyAction(s, move(8, 6));
    expect(end.winner).toBe(1);
    expect(end.currentPlayer).toBe(1);
  });

  it('can win with a diagonal move onto the goal row', () => {
    const s = createState({ pawns: [at(1, 4), at(0, 4)], currentPlayer: 0 });
    expect(applyAction(s, move(0, 3)).winner).toBe(0);
  });

  it('can win with a straight jump onto the goal row', () => {
    const s = createState({ pawns: [at(6, 4), at(7, 4)], currentPlayer: 1 });
    expect(applyAction(s, move(8, 4)).winner).toBe(1);
  });

  it('reaching the opponent goal row does not win', () => {
    const s = createState({ pawns: [at(4, 4), at(1, 1)], currentPlayer: 1 });
    expect(applyAction(s, move(0, 1)).winner).toBeNull();
  });

  it('a wall placement never ends the game', () => {
    expect(applyAction(createInitialState(), hWall(0, 0)).winner).toBeNull();
  });
});

describe('createState validation', () => {
  it('rejects overlapping pawns, conflicting walls and sealed positions', () => {
    expect(() => createState({ pawns: [at(4, 4), at(4, 4)] })).toThrow();
    expect(() => createState({ walls: [hWall(2, 2), vWall(2, 2)] })).toThrow();
    expect(() => createState({ pawns: [at(8, 4), at(0, 0)], walls: [hWall(0, 0), vWall(0, 1)] })).toThrow();
  });
});

describe('action encoding', () => {
  it('round-trips every index', () => {
    expect(ACTION_SPACE_SIZE).toBe(209);
    for (let i = 0; i < ACTION_SPACE_SIZE; i++) {
      expect(encodeAction(decodeAction(i))).toBe(i);
    }
  });

  it('uses the documented layout', () => {
    expect(encodeAction(move(0, 0))).toBe(0);
    expect(encodeAction(move(8, 8))).toBe(80);
    expect(encodeAction(hWall(0, 0))).toBe(81);
    expect(encodeAction(hWall(7, 7))).toBe(144);
    expect(encodeAction(vWall(0, 0))).toBe(145);
    expect(encodeAction(vWall(7, 7))).toBe(208);
    expect(() => decodeAction(209)).toThrow(RangeError);
  });
});

describe('notation', () => {
  it('formats moves and walls', () => {
    expect(formatAction(move(8, 4))).toBe('e1');
    expect(formatAction(move(0, 0))).toBe('a9');
    // h(7,4): center between rows 7/8 and cols 4/5 -> south-west square is (8,4) = e1.
    expect(formatAction(hWall(7, 4))).toBe('e1h');
    expect(formatAction(vWall(0, 0))).toBe('a8v');
  });
});

describe('distanceMap', () => {
  it('matches row distance on an empty board', () => {
    const d = distanceMap(createInitialState(), 0);
    expect(d[8 * 9 + 4]).toBe(8);
    expect(d[0]).toBe(0);
  });
});
