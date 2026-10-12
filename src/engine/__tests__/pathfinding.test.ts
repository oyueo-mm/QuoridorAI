import { describe, expect, it } from 'vitest';
import { createInitialState, createState, distanceToRow, isBlocked, shortestPath } from '..';
import type { Coord, WallLayout } from '..';
import { at, hWall, vWall } from './helpers';

function expectValidPath(walls: WallLayout, path: Coord[], start: Coord, targetRow: number) {
  expect(path[0]).toEqual(start);
  expect(path[path.length - 1].row).toBe(targetRow);
  for (let i = 1; i < path.length; i++) {
    const dr = path[i].row - path[i - 1].row;
    const dc = path[i].col - path[i - 1].col;
    expect(Math.abs(dr) + Math.abs(dc)).toBe(1);
    expect(isBlocked(walls, path[i - 1].row, path[i - 1].col, dr, dc)).toBe(false);
  }
}

describe('shortestPath', () => {
  it('goes straight on an empty board', () => {
    const s = createInitialState();
    const p0 = shortestPath(s, s.pawns[0], 0)!;
    expect(p0).toHaveLength(9);
    expectValidPath(s, p0, s.pawns[0], 0);
    expect(distanceToRow(s, s.pawns[1], 8)).toBe(8);
  });

  it('returns just the start when already on the target row', () => {
    expect(shortestPath(createInitialState(), at(0, 3), 0)).toEqual([at(0, 3)]);
  });

  it('detours around walls', () => {
    // Wall directly in front of player 0 forces one sidestep: 8 + 1 = 9 steps.
    const s = createState({ walls: [hWall(7, 4)] });
    const p = shortestPath(s, s.pawns[0], 0)!;
    expect(p).toHaveLength(10);
    expectValidPath(s, p, s.pawns[0], 0);
  });

  it('follows a corridor when the board is mostly walled', () => {
    // Barrier between rows 4/5 with a single gap at col 8.
    const s = createState({
      pawns: [at(8, 0), at(0, 0)],
      walls: [hWall(4, 0), hWall(4, 2), hWall(4, 4), hWall(4, 6), vWall(3, 7)],
    });
    const p = shortestPath(s, s.pawns[0], 0)!;
    expectValidPath(s, p, s.pawns[0], 0);
    expect(p.some((c) => c.row === 4 && c.col === 8)).toBe(true);
    // 8 columns right to reach the gap + 8 rows up.
    expect(p.length - 1).toBe(16);
  });

  it('returns null when no route exists (raw layout, bypassing legality)', () => {
    const hWalls = new Uint8Array(64);
    const vWalls = new Uint8Array(64);
    for (const c of [0, 2, 4, 6]) hWalls[3 * 8 + c] = 1;
    vWalls[2 * 8 + 7] = 1;
    hWalls[1 * 8 + 7] = 1;
    expect(shortestPath({ hWalls, vWalls }, at(8, 4), 0)).toBeNull();
    expect(distanceToRow({ hWalls, vWalls }, at(8, 4), 0)).toBe(Infinity);
  });
});
