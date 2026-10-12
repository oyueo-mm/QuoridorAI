import { describe, expect, it } from 'vitest';
import {
  applyAction,
  checkWallPlacement,
  createInitialState,
  createState,
  legalWallPlacements,
} from '..';
import { at, hWall, vWall } from './helpers';

describe('wall overlap and crossing', () => {
  const base = createState({ walls: [hWall(3, 3)] });

  it('rejects the same horizontal wall twice', () => {
    expect(checkWallPlacement(base, hWall(3, 3))).toBe('overlap');
  });

  it('rejects horizontally overlapping walls that share one segment', () => {
    expect(checkWallPlacement(base, hWall(3, 2))).toBe('overlap');
    expect(checkWallPlacement(base, hWall(3, 4))).toBe('overlap');
  });

  it('allows walls that touch end-to-end', () => {
    expect(checkWallPlacement(base, hWall(3, 1))).toBe('ok');
    expect(checkWallPlacement(base, hWall(3, 5))).toBe('ok');
  });

  it('rejects a perpendicular wall crossing at the same center', () => {
    expect(checkWallPlacement(base, vWall(3, 3))).toBe('overlap');
  });

  it('allows a perpendicular wall forming a T', () => {
    expect(checkWallPlacement(base, vWall(2, 3))).toBe('ok');
    expect(checkWallPlacement(base, vWall(4, 3))).toBe('ok');
    expect(checkWallPlacement(base, vWall(3, 2))).toBe('ok');
  });

  it('applies the same rules to vertical walls', () => {
    const s = createState({ walls: [vWall(3, 3)] });
    expect(checkWallPlacement(s, vWall(3, 3))).toBe('overlap');
    expect(checkWallPlacement(s, vWall(2, 3))).toBe('overlap');
    expect(checkWallPlacement(s, vWall(4, 3))).toBe('overlap');
    expect(checkWallPlacement(s, hWall(3, 3))).toBe('overlap');
    expect(checkWallPlacement(s, vWall(1, 3))).toBe('ok');
    expect(checkWallPlacement(s, vWall(5, 3))).toBe('ok');
    expect(checkWallPlacement(s, vWall(3, 4))).toBe('ok');
  });

  it('rejects anchors outside the 8x8 wall grid', () => {
    const s = createInitialState();
    expect(checkWallPlacement(s, hWall(8, 0))).toBe('out-of-bounds');
    expect(checkWallPlacement(s, hWall(0, 8))).toBe('out-of-bounds');
    expect(checkWallPlacement(s, vWall(-1, 0))).toBe('out-of-bounds');
  });
});

describe('path guarantee', () => {
  it('rejects a wall that seals off every route for both players', () => {
    // Row-3/4 barrier across cols 0-7, then a pocket around (2..3, 8).
    const s = createState({
      walls: [hWall(3, 0), hWall(3, 2), hWall(3, 4), hWall(3, 6), vWall(2, 7)],
    });
    expect(checkWallPlacement(s, hWall(1, 7))).toBe('blocks-path');
    expect(legalWallPlacements(s)).not.toContainEqual(hWall(1, 7));
  });

  it('accepts the same wall when an alternative route remains', () => {
    const s = createState({ walls: [hWall(3, 0), hWall(3, 2), hWall(3, 4), vWall(2, 7)] });
    expect(checkWallPlacement(s, hWall(1, 7))).toBe('ok');
  });

  it('rejects a wall that traps only one player', () => {
    // Player 1 in the top-left corner; h(0,0) under (0,0)-(0,1), v(0,1) would close the box.
    const s = createState({ pawns: [at(8, 4), at(0, 0)], walls: [hWall(0, 0)] });
    expect(checkWallPlacement(s, vWall(0, 1))).toBe('blocks-path');
    expect(() => applyAction(s, vWall(0, 1))).toThrow();
  });

  it('accepts a wall that lengthens but does not cut the path', () => {
    const s = createInitialState();
    expect(checkWallPlacement(s, hWall(7, 3))).toBe('ok');
  });
});

describe('wall supply', () => {
  it('decrements the placing player only', () => {
    const s = applyAction(createInitialState(), hWall(4, 4));
    expect(s.wallsRemaining).toEqual([9, 10]);
    expect(s.hWalls[4 * 8 + 4]).toBe(1);
  });

  it('forbids wall placement once a player has none left', () => {
    const s = createState({ wallsRemaining: [0, 10] });
    expect(checkWallPlacement(s, hWall(4, 4))).toBe('no-walls-left');
    expect(legalWallPlacements(s)).toEqual([]);
  });

  it('has all 128 wall slots legal on an empty board', () => {
    expect(legalWallPlacements(createInitialState())).toHaveLength(128);
  });
});
