import { describe, expect, it } from 'vitest';
import { CELL, GAP, PITCH, cellFromView, cellToView, hitTest, wallAnchorFromView } from './geometry';

describe('board geometry', () => {
  it('maps cell centers to cells', () => {
    expect(hitTest(CELL / 2, CELL / 2)).toEqual({ kind: 'cell', view: { row: 0, col: 0 } });
    expect(hitTest(8 * PITCH + CELL / 2, 4 * PITCH + CELL / 2)).toEqual({ kind: 'cell', view: { row: 4, col: 8 } });
  });

  it('maps the horizontal gap below row 2 to a horizontal wall at the nearest intersection', () => {
    const y = 3 * PITCH - GAP / 2;
    // Pointer over the right half of column 4 -> wall spans cols 4-5.
    expect(hitTest(4 * PITCH + CELL * 0.75, y)).toEqual({ kind: 'wall', orientation: 'h', view: { row: 2, col: 4 } });
    // Pointer over the left half of column 4 -> wall spans cols 3-4.
    expect(hitTest(4 * PITCH + CELL * 0.25, y)).toEqual({ kind: 'wall', orientation: 'h', view: { row: 2, col: 3 } });
    // Rightmost column clamps to anchor 7.
    expect(hitTest(8 * PITCH + CELL / 2, y)).toEqual({ kind: 'wall', orientation: 'h', view: { row: 2, col: 7 } });
  });

  it('maps the vertical gap right of column 5 to a vertical wall', () => {
    const x = 6 * PITCH - GAP / 2;
    expect(hitTest(x, 1 * PITCH + CELL * 0.75)).toEqual({ kind: 'wall', orientation: 'v', view: { row: 1, col: 5 } });
  });

  it('ignores points outside the board', () => {
    expect(hitTest(-5, 10)).toBeNull();
    expect(hitTest(10, 9 * PITCH)).toBeNull();
  });

  it('flips cells and wall anchors by 180°', () => {
    expect(cellToView({ row: 8, col: 4 }, true)).toEqual({ row: 0, col: 4 });
    expect(cellFromView(cellToView({ row: 2, col: 7 }, true), true)).toEqual({ row: 2, col: 7 });
    expect(wallAnchorFromView(0, 0, true)).toEqual({ row: 7, col: 7 });
    expect(wallAnchorFromView(3, 5, false)).toEqual({ row: 3, col: 5 });
  });
});
