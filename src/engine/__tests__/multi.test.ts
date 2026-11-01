import { describe, expect, it } from 'vitest';
import {
  FOUR_PLAYER_RULES,
  IllegalMultiActionError,
  TWO_PLAYER_RULES,
  applyAction,
  applyActionMulti,
  checkWallMulti,
  createInitialState,
  createMultiState,
  goalDistanceMulti,
  goalPathMulti,
  isLegalActionMulti,
  legalActions,
  legalActionsMulti,
  legalPawnMoves,
  legalPawnMovesMulti,
  legalWallPlacementsMulti,
  legalWallPlacementsMultiBruteForce,
  nextPlayer,
  previousPlayer,
} from '..';
import type { Action, MultiState } from '..';
import { at, hWall, keys, vWall } from './helpers';

/** mulberry32 — deterministic playouts. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const four = (setup: Parameters<typeof createMultiState>[0] = {}) => createMultiState({ rules: FOUR_PLAYER_RULES, ...setup });
const sortedActions = (actions: Action[]) => actions.map((a) => JSON.stringify(a)).sort();

describe('four-player initial position', () => {
  it('puts the pawns on the middle of the four sides with five walls each', () => {
    const s = four();
    expect(s.pawns).toEqual([at(8, 4), at(0, 4), at(4, 0), at(4, 8)]);
    expect(s.wallsRemaining).toEqual([5, 5, 5, 5]);
    expect(s.winner).toBeNull();
    expect(s.ply).toBe(0);
  });

  it('plays clockwise: bottom, left, top, right', () => {
    const rules = FOUR_PLAYER_RULES;
    expect(s0(rules)).toEqual([0, 2, 1, 3, 0]);
    expect(previousPlayer(rules, 0)).toBe(3);
    expect(previousPlayer(rules, 2)).toBe(0);
  });

  it('lets any seat start and keeps the cyclic order', () => {
    const s = four({ firstPlayer: 1 });
    expect(s.currentPlayer).toBe(1);
    const s2 = applyActionMulti(s, { type: 'move', to: at(1, 4) });
    expect(s2.currentPlayer).toBe(3);
  });

  it('gives every player its own goal line', () => {
    const s = four();
    expect([0, 1, 2, 3].map((p) => goalDistanceMulti(s, p))).toEqual([8, 8, 8, 8]);
    expect(goalPathMulti(s, 2)!.at(-1)!.col).toBe(8);
    expect(goalPathMulti(s, 3)!.at(-1)!.col).toBe(0);
  });

  it('rejects malformed rule sets and setups', () => {
    expect(() => createMultiState({ rules: { ...FOUR_PLAYER_RULES, turnOrder: [0, 1, 2] } })).toThrow();
    expect(() => four({ pawns: [at(0, 0), at(0, 0), at(4, 0), at(4, 8)] })).toThrow(/share/);
    expect(() => four({ firstPlayer: 4 })).toThrow();
  });

  function s0(rules: typeof FOUR_PLAYER_RULES) {
    const seq = [0];
    for (let i = 0; i < 4; i++) seq.push(nextPlayer(rules, seq[i]));
    return seq;
  }
});

describe('four-player pawn movement', () => {
  it('gives each start pawn three moves and no diagonals', () => {
    const s = four();
    expect(keys(legalPawnMovesMulti(s, 0))).toEqual(keys([at(7, 4), at(8, 3), at(8, 5)]));
    expect(keys(legalPawnMovesMulti(s, 1))).toEqual(keys([at(1, 4), at(0, 3), at(0, 5)]));
    expect(keys(legalPawnMovesMulti(s, 2))).toEqual(keys([at(3, 0), at(5, 0), at(4, 1)]));
    expect(keys(legalPawnMovesMulti(s, 3))).toEqual(keys([at(3, 8), at(5, 8), at(4, 7)]));
  });

  it('allows all four directions in open space and respects walls', () => {
    const s = four({ pawns: [at(4, 4), at(0, 4), at(0, 0), at(8, 8)] });
    expect(keys(legalPawnMovesMulti(s, 0))).toEqual(keys([at(3, 4), at(5, 4), at(4, 3), at(4, 5)]));
    const walled = four({ pawns: [at(4, 4), at(0, 4), at(0, 0), at(8, 8)], walls: [{ orientation: 'h', row: 3, col: 4 }, { orientation: 'v', row: 4, col: 4 }] });
    expect(keys(legalPawnMovesMulti(walled, 0))).toEqual(keys([at(5, 4), at(4, 3)]));
  });

  it('cannot move onto another pawn but jumps straight over one', () => {
    const s = four({ pawns: [at(4, 4), at(3, 4), at(0, 0), at(8, 8)] });
    expect(keys(legalPawnMovesMulti(s, 0))).toEqual(keys([at(2, 4), at(5, 4), at(4, 3), at(4, 5)]));
  });

  it('jumps horizontally over a side pawn (left/right seats)', () => {
    const s = four({ pawns: [at(8, 4), at(0, 4), at(4, 3), at(4, 4)] });
    expect(keys(legalPawnMovesMulti(s, 2))).toEqual(keys([at(3, 3), at(5, 3), at(4, 2), at(4, 5)]));
  });

  it('goes diagonally when a wall is behind the jumped pawn', () => {
    const s = four({ pawns: [at(4, 4), at(3, 4), at(0, 0), at(8, 8)], walls: [{ orientation: 'h', row: 2, col: 4 }] });
    expect(keys(legalPawnMovesMulti(s, 0))).toEqual(keys([at(5, 4), at(4, 3), at(4, 5), at(3, 3), at(3, 5)]));
  });

  it('goes diagonally when the board edge is behind the jumped pawn', () => {
    const s = four({ pawns: [at(1, 4), at(0, 4), at(5, 0), at(5, 8)] });
    expect(keys(legalPawnMovesMulti(s, 0))).toEqual(keys([at(2, 4), at(1, 3), at(1, 5), at(0, 3), at(0, 5)]));
  });

  it('does not jump two pawns in a row: a third pawn behind forces the diagonal', () => {
    const s = four({ pawns: [at(4, 4), at(3, 4), at(2, 4), at(8, 8)] });
    // straight (2,4) is occupied; sides of the jumped pawn at (3,3)/(3,5)
    expect(keys(legalPawnMovesMulti(s, 0))).toEqual(keys([at(5, 4), at(4, 3), at(4, 5), at(3, 3), at(3, 5)]));
  });

  it('skips a diagonal square held by another pawn and one blocked by a wall', () => {
    const s = four({
      pawns: [at(4, 4), at(3, 4), at(2, 4), at(3, 3)],
      walls: [{ orientation: 'v', row: 2, col: 4 }],
    });
    // right of the jumped pawn is walled off, left holds a pawn, straight is occupied
    const moves = keys(legalPawnMovesMulti(s, 0));
    expect(moves).not.toContain('3,3');
    expect(moves).not.toContain('3,5');
    expect(moves).not.toContain('2,4');
  });

  it('never allows two pawns on one cell, whatever the position (random play)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = rng(seed);
      let s: MultiState = four();
      for (let i = 0; i < 120 && s.winner === null; i++) {
        const a = legalActionsMulti(s);
        s = applyActionMulti(s, a[Math.floor(r() * a.length)]);
        const cells = new Set(s.pawns.map((p) => `${p.row},${p.col}`));
        expect(cells.size).toBe(4);
      }
    }
  });
});

describe('four-player walls', () => {
  it('counts walls per player', () => {
    let s = four();
    s = applyActionMulti(s, hWall(3, 3));
    expect(s.wallsRemaining).toEqual([4, 5, 5, 5]);
    expect(s.currentPlayer).toBe(2);
    s = applyActionMulti(s, vWall(5, 5));
    expect(s.wallsRemaining).toEqual([4, 5, 4, 5]);
    expect(s.currentPlayer).toBe(1);
  });

  it('rejects overlapping and crossing walls', () => {
    const s = four({ walls: [{ orientation: 'h', row: 3, col: 3 }] });
    expect(checkWallMulti(s, hWall(3, 3))).toBe('overlap');
    expect(checkWallMulti(s, hWall(3, 4))).toBe('overlap');
    expect(checkWallMulti(s, hWall(3, 2))).toBe('overlap');
    expect(checkWallMulti(s, vWall(3, 3))).toBe('overlap');
    expect(checkWallMulti(s, hWall(8, 0))).toBe('out-of-bounds');
    expect(checkWallMulti(s, hWall(3, 5))).toBe('ok');
  });

  it('forbids sealing in any player, not only the mover', () => {
    // Seat 2 at (0,0). v(0,0) blocks (0,0)|(0,1) and (1,0)|(1,1). h(1,0) would then close the
    // pocket {(0,0),(1,0)}. Seat 0 is the mover and keeps its own route, yet the wall is illegal.
    const s = four({
      pawns: [at(8, 4), at(0, 4), at(0, 0), at(4, 8)],
      walls: [{ orientation: 'v', row: 0, col: 0 }],
      firstPlayer: 0,
    });
    expect(checkWallMulti(s, hWall(1, 0))).toBe('blocks-path');
    expect(legalWallPlacementsMulti(s).some((w) => w.orientation === 'h' && w.row === 1 && w.col === 0)).toBe(false);
    expect(checkWallMulti(s, hWall(5, 5))).toBe('ok');
  });

  it('does not count pawns as permanent obstacles when checking routes', () => {
    // Seat 2 (0,0) can only leave its pocket through (1,0) -> (2,0), where seat 1 stands.
    // Walls elsewhere stay legal (the pawn will move), sealing the pocket stays illegal.
    const s = four({
      pawns: [at(8, 4), at(1, 0), at(0, 0), at(4, 8)],
      walls: [{ orientation: 'v', row: 0, col: 0 }],
      firstPlayer: 0,
    });
    expect(checkWallMulti(s, hWall(5, 5))).toBe('ok');
    expect(checkWallMulti(s, hWall(1, 0))).toBe('blocks-path');
  });

  it('matches the brute-force wall legality on random four-player positions', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed * 31);
      let s: MultiState = four();
      for (let i = 0; i < 40 && s.winner === null; i++) {
        expect(sortedActions(legalWallPlacementsMulti(s))).toEqual(sortedActions(legalWallPlacementsMultiBruteForce(s)));
        const a = legalActionsMulti(s);
        s = applyActionMulti(s, a[Math.floor(r() * a.length)]);
      }
    }
  });

  it('allows only pawn moves once the walls are used up', () => {
    const s = four({ wallsRemaining: [0, 5, 5, 5] });
    const actions = legalActionsMulti(s);
    expect(actions.every((a) => a.type === 'move')).toBe(true);
    expect(checkWallMulti(s, hWall(3, 3))).toBe('no-walls-left');
    expect(isLegalActionMulti(s, hWall(3, 3))).toBe(false);
  });
});

describe('four-player win and end of game', () => {
  const goalCases = [
    { seat: 0, from: at(1, 4), to: at(0, 4) },
    { seat: 1, from: at(7, 4), to: at(8, 4) },
    { seat: 2, from: at(4, 7), to: at(4, 8) },
    { seat: 3, from: at(4, 1), to: at(4, 0) },
  ];
  for (const { seat, from, to } of goalCases) {
    it(`seat ${seat} wins on reaching its own goal line`, () => {
      // the other three pawns stand in the interior (no goal line there), out of the way
      const corners = [at(2, 2), at(6, 2), at(6, 6)];
      const pawns = Array.from({ length: 4 }, (_, i) => (i === seat ? from : corners.shift()!));
      const s = four({ pawns, firstPlayer: seat });
      const end = applyActionMulti(s, { type: 'move', to });
      expect(end.winner).toBe(seat);
      expect(end.currentPlayer).toBe(seat);
    });
  }

  it('does not give a win for reaching another player\'s goal line', () => {
    // seat 0 stepping onto row 8 (seat 1's goal) is no win
    const s = four({ pawns: [at(7, 4), at(0, 4), at(4, 0), at(4, 8)], firstPlayer: 0 });
    const next = applyActionMulti(s, { type: 'move', to: at(8, 4) });
    expect(next.winner).toBeNull();
    // seat 2 on col 0 (its own start edge) does not win either
    expect(four().winner).toBeNull();
  });

  it('accepts no further action after the win', () => {
    const s = four({ pawns: [at(1, 4), at(0, 3), at(4, 0), at(4, 8)], firstPlayer: 0 });
    const end = applyActionMulti(s, { type: 'move', to: at(0, 4) });
    expect(legalActionsMulti(end)).toEqual([]);
    expect(isLegalActionMulti(end, { type: 'move', to: at(1, 4) })).toBe(false);
    expect(checkWallMulti(end, hWall(3, 3))).toBe('game-over');
    expect(() => applyActionMulti(end, hWall(3, 3))).toThrow(IllegalMultiActionError);
  });

  it('finishes a full random four-player game with exactly one winner', () => {
    let finished = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = rng(seed * 977);
      let s: MultiState = four({ firstPlayer: seed % 4 });
      let turns = 0;
      const seen: number[] = [];
      while (s.winner === null && turns < 4000) {
        // lean towards advancing so games end: pick the move that shortens the path most, sometimes random
        const a = legalActionsMulti(s);
        const moves = a.filter((x) => x.type === 'move');
        const pick = r() < 0.8
          ? moves.reduce((best, m) => {
              const t = applyActionMulti(s, m);
              const d = goalDistanceMulti(t, s.currentPlayer);
              return d < best.d ? { m, d } : best;
            }, { m: moves[0], d: Infinity }).m
          : a[Math.floor(r() * a.length)];
        seen.push(s.currentPlayer);
        s = applyActionMulti(s, pick);
        turns++;
      }
      if (s.winner !== null) finished++;
      // the turn order was respected throughout
      for (let i = 1; i < seen.length; i++) expect(seen[i]).toBe(nextPlayer(FOUR_PLAYER_RULES, seen[i - 1]));
    }
    expect(finished).toBeGreaterThan(0);
  });
});

describe('multi engine on two-player rules equals the classic engine', () => {
  it('has the same initial position', () => {
    const m = createMultiState({ rules: TWO_PLAYER_RULES });
    const g = createInitialState();
    expect(m.pawns).toEqual(g.pawns);
    expect(m.wallsRemaining).toEqual(g.wallsRemaining);
    expect(m.currentPlayer).toBe(g.currentPlayer);
  });

  it('produces identical legal actions and states along random games', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const r = rng(seed * 7919);
      let g = createInitialState();
      let m = createMultiState({ rules: TWO_PLAYER_RULES });
      for (let i = 0; i < 90 && g.winner === null; i++) {
        const ga = legalActions(g);
        expect(legalActionsMulti(m).map((a) => JSON.stringify(a))).toEqual(ga.map((a) => JSON.stringify(a)));
        expect(keys(legalPawnMovesMulti(m))).toEqual(keys(legalPawnMoves(g)));
        const a = ga[Math.floor(r() * ga.length)];
        g = applyAction(g, a);
        m = applyActionMulti(m, a);
        expect(m.pawns).toEqual(g.pawns);
        expect(m.wallsRemaining).toEqual(g.wallsRemaining);
        expect(m.currentPlayer).toBe(g.currentPlayer);
        expect(m.winner).toBe(g.winner);
      }
    }
  });
});
