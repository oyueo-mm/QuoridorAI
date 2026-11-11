import { describe, expect, it } from 'vitest';
import { applyActionUnchecked, createState, formatAction, legalPawnMoves } from '../../src/engine';
import type { GameState } from '../../src/engine';
import {
  NoWallSolver,
  bestMargin,
  keepsForcedWin,
  marginAfter,
  notation,
  provenResult,
  savingActions,
  selfHarmWalls,
  winIn3Actions,
  winningPawnMoves,
} from './tactics';

describe('exact tactical oracles', () => {
  it('win-in-1 includes straight jumps and diagonal jumps', () => {
    // P0 (e7) faces P1 (e8) with e9 free behind it: straight jump onto the goal row.
    const jump = createState({ pawns: [{ row: 2, col: 4 }, { row: 1, col: 4 }] });
    expect(notation(winningPawnMoves(jump).map((to) => ({ type: 'move' as const, to })))).toEqual(['e9']);
    // P1 sits on the goal row itself: the straight jump would leave the board → diagonals.
    const diag = createState({ pawns: [{ row: 1, col: 4 }, { row: 0, col: 4 }] });
    expect(winningPawnMoves(diag).map((c) => c.col).sort()).toEqual([3, 5]);
  });

  it('defend-1: saving actions stop the threat; the rest lose at once', () => {
    const s = createState({ pawns: [{ row: 4, col: 4 }, { row: 7, col: 0 }], currentPlayer: 0 });
    const saving = savingActions(s);
    expect(saving.length).toBeGreaterThan(0);
    expect(saving.every((a) => a.type === 'wall')).toBe(true); // a pawn cannot get there
    for (const a of saving) {
      const n = applyActionUnchecked(s, a);
      expect(legalPawnMoves(n, 1).some((c) => c.row === 8)).toBe(false);
    }
    const noWalls = createState({ pawns: [{ row: 4, col: 4 }, { row: 7, col: 0 }], wallsRemaining: [0, 10] });
    expect(savingActions(noWalls)).toHaveLength(0);
  });

  it('win-in-3 enumeration agrees with the full-width proof search', () => {
    // P0 two steps from goal, P1 far away and without walls: any forward step forces the win.
    const s = createState({ pawns: [{ row: 2, col: 4 }, { row: 0, col: 0 }], wallsRemaining: [10, 0] });
    const wins = winIn3Actions(s);
    expect(notation(wins)).toContain('e8');
    expect(provenResult(s, 3)).toBe(3);
    for (const a of wins) expect(keepsForcedWin(s, a, 3)).toBe(true);
    // With walls the opponent can delay: not a win in 3 any more.
    const defended = createState({ pawns: [{ row: 2, col: 4 }, { row: 0, col: 0 }], wallsRemaining: [10, 10] });
    expect(winIn3Actions(defended)).toHaveLength(0);
    expect(provenResult(defended, 3)).toBeNull();
  });

  it('retrograde no-wall solver matches full-width search on small cases', () => {
    const walls = [
      { orientation: 'h' as const, row: 3, col: 3 },
      { orientation: 'v' as const, row: 5, col: 4 },
      { orientation: 'h' as const, row: 1, col: 6 },
    ];
    const solver = new NoWallSolver(createState({ walls }));
    const cases: GameState[] = [];
    const pawnsList: [number, number, number, number][] = [
      [3, 4, 5, 4], [2, 2, 6, 6], [4, 4, 3, 4], [1, 7, 7, 1], [2, 5, 2, 4], [5, 0, 4, 8], [3, 3, 4, 3],
    ];
    for (const [r0, c0, r1, c1] of pawnsList) {
      for (const side of [0, 1] as const) {
        cases.push(createState({ pawns: [{ row: r0, col: c0 }, { row: r1, col: c1 }], walls, wallsRemaining: [0, 0], currentPlayer: side }));
      }
    }
    let checked = 0;
    for (const s of cases) {
      const v = solver.valueOf(s);
      expect(v.result).not.toBe('draw');
      if (v.plies > 9) continue;
      const proof = provenResult(s, v.plies);
      expect(proof).toBe(v.result === 'win' ? v.plies : -v.plies);
      // One ply shallower must not prove anything (the solver's length is minimal).
      if (v.plies > 1) expect(provenResult(s, v.plies - 1)).toBeNull();
      checked++;
    }
    expect(checked).toBeGreaterThan(6);
  });

  it('solver move values are consistent with the position value', () => {
    const s = createState({ pawns: [{ row: 4, col: 4 }, { row: 4, col: 5 }], wallsRemaining: [0, 0] });
    const solver = new NoWallSolver(s);
    const v = solver.valueOf(s);
    const moves = legalPawnMoves(s).map((to) => solver.moveValue(s, to));
    if (v.result === 'win') {
      expect(Math.min(...moves.filter((m) => m.result === 'win').map((m) => m.plies))).toBe(v.plies);
    } else {
      expect(moves.every((m) => m.result === 'loss')).toBe(true);
      expect(Math.max(...moves.map((m) => m.plies))).toBe(v.plies);
    }
  });
});

describe('heuristic measures', () => {
  it('margins and self-harm walls', () => {
    const s = createState();
    expect(bestMargin(s)).toBeGreaterThanOrEqual(1);
    expect(marginAfter(s, { type: 'move', to: { row: 7, col: 4 } })).toBe(1);
    // A wall right in front of the own pawn hurts itself, not an opponent on another file.
    const t = createState({ pawns: [{ row: 8, col: 4 }, { row: 0, col: 0 }] });
    expect(selfHarmWalls(t).map(formatAction)).toContain('e1h');
    expect(selfHarmWalls(s).map(formatAction)).not.toContain('e1h'); // both lose a step at the start
  });
});
