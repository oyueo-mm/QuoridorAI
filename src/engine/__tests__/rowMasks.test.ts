import { describe, expect, it } from 'vitest';
import { createRng } from '../../ai/rng';
import {
  BOARD_SIZE,
  NUM_WALL_SLOTS,
  WALL_GRID,
  applyAction,
  createInitialState,
  distanceMap,
  distanceMapMasked,
  distanceMapReference,
  distanceToRow,
  distanceToRowMasked,
  distanceToRowReference,
  getPathKernel,
  hasPathToRow,
  hasPathToRowMasked,
  legalActions,
  shortestPathMasked,
  shortestPathReference,
  wallConflicts,
  withPathKernel,
  withWall,
} from '..';
import type { Orientation, WallLayout } from '..';

/** Layouts from rule-abiding random games (paths always exist). */
function gameLayouts(seed: number, count: number): WallLayout[] {
  const rng = createRng(seed);
  const out: WallLayout[] = [];
  let s = createInitialState();
  while (out.length < count) {
    if (s.winner !== null || s.wallsRemaining[0] + s.wallsRemaining[1] === 0) s = createInitialState();
    const actions = legalActions(s);
    const walls = actions.filter((a) => a.type === 'wall');
    const pool = walls.length > 0 && rng() < 0.7 ? walls : actions;
    s = applyAction(s, pool[Math.floor(rng() * pool.length)]);
    out.push(s);
  }
  return out;
}

/** Arbitrary non-overlapping layouts (no path rule): include sealed-off regions. */
function freeLayouts(seed: number, count: number, walls: number): WallLayout[] {
  const rng = createRng(seed);
  const out: WallLayout[] = [];
  for (let i = 0; i < count; i++) {
    let layout: WallLayout = { hWalls: new Uint8Array(NUM_WALL_SLOTS), vWalls: new Uint8Array(NUM_WALL_SLOTS) };
    for (let k = 0; k < walls * 4 && layout.hWalls.reduce((a, b) => a + b, 0) + layout.vWalls.reduce((a, b) => a + b, 0) < walls; k++) {
      const o: Orientation = rng() < 0.5 ? 'h' : 'v';
      const r = Math.floor(rng() * WALL_GRID);
      const c = Math.floor(rng() * WALL_GRID);
      if (!wallConflicts(layout, o, r, c)) layout = withWall(layout, o, r, c);
    }
    out.push(layout);
  }
  return out;
}

function compareAll(layouts: WallLayout[]) {
  let unreachable = 0;
  for (const w of layouts) {
    for (let target = 0; target < BOARD_SIZE; target++) {
      expect(Array.from(distanceMapMasked(w, target))).toEqual(Array.from(distanceMapReference(w, target)));
    }
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const start = { row, col };
        for (const target of [0, 4, 8]) {
          const ref = distanceToRowReference(w, start, target);
          if (ref === Infinity) unreachable++;
          expect(distanceToRowMasked(w, start, target)).toBe(ref);
          expect(hasPathToRowMasked(w, start, target)).toBe(ref !== Infinity);
          if (target !== 4) expect(shortestPathMasked(w, start, target)).toEqual(shortestPathReference(w, start, target));
        }
      }
    }
  }
  return unreachable;
}

describe('row-mask bitboard pathfinding', () => {
  it('matches the cell-by-cell BFS on positions from random games', () => {
    compareAll(gameLayouts(11, 150));
  });

  it('matches it on dense arbitrary layouts with unreachable regions', () => {
    const unreachable = compareAll([...freeLayouts(5, 60, 20), ...freeLayouts(6, 60, 32), ...freeLayouts(7, 30, 45)]);
    expect(unreachable).toBeGreaterThan(100); // the case is really exercised
  });

  it('masks follow wall changes (new arrays → new masks)', () => {
    let w: WallLayout = createInitialState();
    const start = { row: 8, col: 4 };
    expect(distanceToRowMasked(w, start, 0)).toBe(8);
    w = withWall(w, 'h', 6, 3);
    expect(distanceToRowMasked(w, start, 0)).toBe(distanceToRowReference(w, start, 0));
    w = withWall(w, 'h', 6, 5);
    expect(distanceToRowMasked(w, start, 0)).toBe(distanceToRowReference(w, start, 0));
  });

  it('kernel switch is scoped and the public functions agree under both kernels', () => {
    const layouts = gameLayouts(3, 40);
    expect(getPathKernel()).toBe('masked');
    const masked = layouts.map((w) => [distanceToRow(w, { row: 8, col: 4 }, 0), hasPathToRow(w, { row: 0, col: 4 }, 8), Array.from(distanceMap(w, 8))]);
    const reference = withPathKernel('reference', () => {
      expect(getPathKernel()).toBe('reference');
      return layouts.map((w) => [distanceToRow(w, { row: 8, col: 4 }, 0), hasPathToRow(w, { row: 0, col: 4 }, 8), Array.from(distanceMap(w, 8))]);
    });
    expect(getPathKernel()).toBe('masked');
    expect(masked).toEqual(reference);
    expect(() => withPathKernel('reference', () => { throw new Error('x'); })).toThrow();
    expect(getPathKernel()).toBe('masked');
  });
});
