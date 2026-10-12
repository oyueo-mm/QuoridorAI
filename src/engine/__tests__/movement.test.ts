import { describe, expect, it } from 'vitest';
import { createInitialState, createState, legalPawnMoves } from '..';
import { at, hWall, keys, vWall } from './helpers';

describe('initial position', () => {
  it('places pawns on the middle of opposite edges with 10 walls each', () => {
    const s = createInitialState();
    expect(s.pawns).toEqual([at(8, 4), at(0, 4)]);
    expect(s.wallsRemaining).toEqual([10, 10]);
    expect(s.currentPlayer).toBe(0);
    expect(s.winner).toBeNull();
  });

  it('gives each player three pawn moves (no move off the board)', () => {
    const s = createInitialState();
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(7, 4), at(8, 3), at(8, 5)]));
    expect(keys(legalPawnMoves(s, 1))).toEqual(keys([at(1, 4), at(0, 3), at(0, 5)]));
  });
});

describe('board boundaries', () => {
  it('allows only two moves from a corner', () => {
    const s = createState({ pawns: [at(8, 0), at(0, 8)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(7, 0), at(8, 1)]));
    expect(keys(legalPawnMoves(s, 1))).toEqual(keys([at(1, 8), at(0, 7)]));
  });

  it('allows three moves along an edge', () => {
    const s = createState({ pawns: [at(4, 0), at(4, 8)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(3, 0), at(5, 0), at(4, 1)]));
    expect(keys(legalPawnMoves(s, 1))).toEqual(keys([at(3, 8), at(5, 8), at(4, 7)]));
  });

  it('allows four moves in open space', () => {
    const s = createState({ pawns: [at(4, 4), at(0, 0)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(3, 4), at(5, 4), at(4, 3), at(4, 5)]));
  });
});

describe('walls block movement', () => {
  it('blocks a step through either half of a horizontal wall', () => {
    // h(7,4) covers cols 4-5 between rows 7 and 8; h(7,3) covers cols 3-4.
    for (const wall of [hWall(7, 4), hWall(7, 3)]) {
      const s = createState({ walls: [wall] });
      expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(8, 3), at(8, 5)]));
    }
  });

  it('does not block columns outside the wall span', () => {
    const s = createState({ walls: [hWall(7, 5)] }); // covers cols 5-6 only
    expect(keys(legalPawnMoves(s, 0))).toContain('7,4');
  });

  it('blocks a step through a vertical wall in both directions', () => {
    // v(3,4) sits between cols 4 and 5 on rows 3-4.
    const s = createState({ pawns: [at(4, 4), at(4, 5)], walls: [vWall(3, 4)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(3, 4), at(5, 4), at(4, 3)]));
    expect(keys(legalPawnMoves(s, 1))).toEqual(keys([at(3, 5), at(5, 5), at(4, 6)]));
  });
});

describe('jumping and diagonal moves', () => {
  it('jumps straight over an adjacent opponent and cannot land on it', () => {
    const s = createState({ pawns: [at(4, 4), at(3, 4)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(2, 4), at(5, 4), at(4, 3), at(4, 5)]));
  });

  it('jumps horizontally too', () => {
    const s = createState({ pawns: [at(4, 4), at(4, 5)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(3, 4), at(5, 4), at(4, 3), at(4, 6)]));
  });

  it('moves diagonally when a wall is behind the opponent', () => {
    // h(2,4) blocks (3,4) -> (2,4).
    const s = createState({ pawns: [at(4, 4), at(3, 4)], walls: [hWall(2, 4)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(
      keys([at(3, 3), at(3, 5), at(5, 4), at(4, 3), at(4, 5)]),
    );
  });

  it('moves diagonally when the board edge is behind the opponent', () => {
    const s = createState({ pawns: [at(1, 4), at(0, 4)], currentPlayer: 0 });
    expect(keys(legalPawnMoves(s, 0))).toEqual(
      keys([at(0, 3), at(0, 5), at(2, 4), at(1, 3), at(1, 5)]),
    );
  });

  it('omits a diagonal that is walled off from the opponent', () => {
    // h(2,4) blocks the straight jump; v(3,4) blocks (3,4)->(3,5) and also (4,4)->(4,5).
    const s = createState({ pawns: [at(4, 4), at(3, 4)], walls: [hWall(2, 4), vWall(3, 4)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(3, 3), at(5, 4), at(4, 3)]));
  });

  it('handles horizontal jumps blocked by a wall', () => {
    // Opponent at (4,1) with v(3,1) to its right: diagonals (3,1) and (5,1).
    const s = createState({ pawns: [at(4, 0), at(4, 1)], walls: [vWall(3, 1)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(3, 1), at(5, 1), at(3, 0), at(5, 0)]));
  });

  it('omits a diagonal that would leave the board', () => {
    // Opponent at (4,0) on the left edge with h(3,0) behind it: only the right diagonal exists.
    const s = createState({ pawns: [at(5, 0), at(4, 0)], walls: [hWall(3, 0)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(4, 1), at(6, 0), at(5, 1)]));
  });

  it('cannot jump through a wall between the pawns', () => {
    // h(3,4) separates (3,4) and (4,4).
    const s = createState({ pawns: [at(4, 4), at(3, 4)], walls: [hWall(3, 4)] });
    expect(keys(legalPawnMoves(s, 0))).toEqual(keys([at(5, 4), at(4, 3), at(4, 5)]));
  });
});
