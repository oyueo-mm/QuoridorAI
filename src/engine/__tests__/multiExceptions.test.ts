import { describe, expect, it } from 'vitest';
import { FOUR_PLAYER_RULES, checkWallMulti, createMultiState, legalPawnMovesMulti } from '..';
import type { Coord, WallAction } from '..';
import { at, hWall, keys, vWall } from './helpers';

/**
 * Edge cases of the multi-player pawn rules. The Gigamic rulebook describes jumping for two
 * players and extends it to four ("same rule, other pawns count as opponents") without covering
 * every combination, so these tests pin down the interpretation this project documents:
 *   1. a pawn jumps exactly one adjacent pawn, straight, if the cell behind is free;
 *   2. if it cannot (wall, board edge or ANOTHER PAWN behind), it may step diagonally to either
 *      side of the jumped pawn, where no wall and no pawn is in the way;
 *   3. it never jumps two pawns, and a pawn standing between two walls cannot be jumped past them.
 */
const game = (pawns: Coord[], walls: WallAction[] = []) =>
  createMultiState({
    rules: FOUR_PLAYER_RULES,
    pawns,
    walls: walls.map((w) => ({ orientation: w.orientation, row: w.row, col: w.col })),
    wallsPerPlayer: 5,
  });

/** Moves of seat 0 (the others are placed wherever the test needs them). */
const movesOf = (pawns: Coord[], walls: WallAction[] = []) => keys(legalPawnMovesMulti(game(pawns, walls), 0));

describe('jumping with several pawns around (four players)', () => {
  it('chained pawns: two in a row cannot be jumped; the diagonals of the FIRST pawn are offered', () => {
    const m = movesOf([at(5, 4), at(4, 4), at(3, 4), at(8, 8)]);
    expect(m).not.toContain('4,4');
    expect(m).not.toContain('3,4');
    expect(m).not.toContain('2,4');
    expect(m).toEqual(expect.arrayContaining(['4,3', '4,5', '5,3', '5,5']));
  });

  it('three in a row behave the same as two: still only the diagonals around the first one', () => {
    const m = movesOf([at(6, 4), at(5, 4), at(4, 4), at(3, 4)]);
    expect(m).toEqual(keys([at(5, 3), at(5, 5), at(7, 4), at(6, 3), at(6, 5)]));
  });

  it('a pawn behind the jumped pawn blocks the straight jump, and a pawn on a diagonal removes that diagonal', () => {
    const m = movesOf([at(5, 4), at(4, 4), at(3, 4), at(4, 5)]);
    expect(m).toContain('4,3');
    expect(m).not.toContain('4,5');
    expect(m).not.toContain('3,4');
  });

  it('both diagonals taken: the pawn simply has no move through that direction', () => {
    const m = movesOf([at(5, 4), at(4, 4), at(3, 4), at(4, 5)], []);
    const both = keys(legalPawnMovesMulti(game([at(5, 4), at(4, 4), at(3, 4), at(4, 3)]), 0));
    expect(both).not.toContain('4,3');
    expect(both).toContain('4,5');
    expect(m).not.toContain('2,4');
  });

  it('a wall behind the jumped pawn forces the diagonals; a wall beside the jumped pawn removes that diagonal', () => {
    const behind = movesOf([at(5, 4), at(4, 4), at(0, 0), at(8, 8)], [hWall(3, 4)]); // between (3,4) and (4,4)
    expect(behind).not.toContain('3,4');
    expect(behind).toEqual(expect.arrayContaining(['4,3', '4,5']));
    const sideWalled = movesOf([at(5, 4), at(4, 4), at(0, 0), at(8, 8)], [hWall(3, 4), vWall(4, 4)]); // wall right of (4,4)
    expect(sideWalled).not.toContain('4,5');
    expect(sideWalled).toContain('4,3');
  });

  it('a wall between the mover and the adjacent pawn means no jump at all', () => {
    const m = movesOf([at(5, 4), at(4, 4), at(0, 0), at(8, 8)], [hWall(4, 4)]); // between (4,4) and (5,4)
    expect(m).not.toContain('4,4');
    expect(m).not.toContain('3,4');
    expect(m).not.toContain('4,3');
  });

  it('the board edge behind the jumped pawn forces the diagonals (top edge and side edge)', () => {
    const top = movesOf([at(1, 4), at(0, 4), at(8, 0), at(8, 8)]);
    expect(top).not.toContain('0,4');
    expect(top).toEqual(expect.arrayContaining(['0,3', '0,5']));
    // seat 2 steps left onto seat 1 on the left edge: nothing behind, so it goes around it (3,0)/(5,0)
    const left = keys(legalPawnMovesMulti(game([at(8, 4), at(4, 0), at(4, 1), at(2, 8)]), 2));
    expect(left).not.toContain('4,0');
    expect(left).toEqual(expect.arrayContaining(['3,0', '5,0']));
  });

  it('a jumped pawn in a corner offers only the one diagonal that is on the board', () => {
    const m = movesOf([at(8, 1), at(0, 4), at(8, 0), at(4, 8)]); // seat 0 steps left onto seat 2 in the bottom-left corner
    expect(m).not.toContain('8,0');
    expect(m).toContain('7,0');
    expect(m).toEqual(keys([at(7, 1), at(8, 2), at(7, 0)]));
  });

  it('every side pawn of a mover is a possible jump target in four directions at once', () => {
    const m = movesOf([at(4, 4), at(3, 4), at(5, 4), at(4, 3)]); // up, down and left neighbours are pawns
    expect(m).toEqual(keys([at(2, 4), at(6, 4), at(4, 2), at(4, 5)]));
  });
});

describe('walls and the routes of several players that overlap', () => {
  it('refuses the wall that seals in a player other than the one placing it', () => {
    // seat 2 on (4,0): right side walled and the way up closed, so its only exit is down
    const s = createMultiState({ rules: FOUR_PLAYER_RULES, walls: [vWall(3, 0), hWall(2, 0)], pawns: [at(8, 4), at(0, 4), at(4, 0), at(4, 8)], wallsPerPlayer: 5, firstPlayer: 0 });
    expect(checkWallMulti(s, hWall(4, 0))).toBe('blocks-path'); // seat 0 is the mover, seat 2 is the one it would seal in
    expect(checkWallMulti(s, hWall(4, 3))).toBe('ok');
  });

  it('two players sharing one narrow route both keep it: the wall that would close it is refused', () => {
    // Seats 0 and 1 both have to pass the single gap (column 8) of the wall line between rows 7 and 8.
    const line = [hWall(6, 0), hWall(6, 2), hWall(6, 4), hWall(6, 6)];
    const s = createMultiState({ rules: FOUR_PLAYER_RULES, walls: line, pawns: [at(8, 4), at(0, 4), at(4, 0), at(4, 8)], wallsPerPlayer: 5 });
    expect(checkWallMulti(s, vWall(7, 7))).toBe('blocks-path'); // would shut seat 0 (below the line) away from row 0, and seat 1 from row 8
    expect(checkWallMulti(s, hWall(2, 6))).toBe('ok');
  });

  it('does not treat pawns as obstacles when deciding whether a wall seals a route', () => {
    const s = createMultiState({ rules: FOUR_PLAYER_RULES, walls: [vWall(7, 3), vWall(7, 4)], pawns: [at(8, 4), at(7, 4), at(4, 0), at(4, 8)], wallsPerPlayer: 5 });
    // seat 0 stands in a corridor with a pawn right above it: the pawn moves away, so a far wall is fine
    expect(checkWallMulti(s, hWall(0, 0))).toBe('ok');
    // ...but a wall closing the corridor still seals seat 0 in
    expect(checkWallMulti(s, hWall(6, 3))).toBe('blocks-path');
  });
});
