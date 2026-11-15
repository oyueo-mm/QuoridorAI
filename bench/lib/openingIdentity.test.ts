import { describe, expect, it } from 'vitest';
import { createInitialState, applyActionUnchecked, legalActions } from '../../src/engine';
import { parseMoveList, mirrorState } from '../../src/arena/openings';
import { schedule } from '../../src/arena/tournament';
import { canonicalOpeningKey, exactOpeningKey, transformOpening } from './openingIdentity';
import { assertDisjointSchedule } from './openingRegistry';
import type { TournamentConfig } from '../../src/arena/tournament';

const state = () => parseMoveList('e2 e8 a3h f8').positions.at(-1)!;
const config: TournamentConfig = {
  agents: [{ kind: 'bfs', depth: 0, simulations: 0 }, { kind: 'bfs', depth: 0, simulations: 0 }],
  budget: { mode: 'fixed', timeMs: 0 }, pairs: 2, seed: 9, openingMode: 'mixed', openingPlies: 4,
  uniqueOpenings: true, maxPlies: 100, repetitionLimit: 3, maxGameMs: null,
};

describe('independent opening preflight', () => {
  it('identifies all four goal-preserving symmetries and makes each an involution', () => {
    const original = state();
    for (const rows of [false, true]) for (const cols of [false, true]) {
      const transformed = transformOpening(original, rows, cols);
      expect(canonicalOpeningKey(transformed)).toBe(canonicalOpeningKey(original));
      expect(transformOpening(transformed, rows, cols)).toEqual(original);
      expect(legalActions(transformed)).toHaveLength(legalActions(original).length);
    }
    expect(transformOpening(original, false, true)).toEqual(mirrorState(original));
  });
  it('includes side to move, player wall budgets and pawn identity, but ignores ply', () => {
    const original = state();
    expect(exactOpeningKey({ ...original, ply: original.ply + 4 })).toBe(exactOpeningKey(original));
    expect(exactOpeningKey({ ...original, currentPlayer: 1 })).not.toBe(exactOpeningKey(original));
    expect(exactOpeningKey({ ...original, wallsRemaining: [2, 9] })).not.toBe(exactOpeningKey(original));
    expect(exactOpeningKey({ ...original, pawns: [original.pawns[1], original.pawns[0]] })).not.toBe(exactOpeningKey(original));
  });
  it('collapses different legal move orders reaching the same board', () => {
    const a = parseMoveList('e2 e8 d2 d8');
    const b = parseMoveList('d1 d9 d2 d8');
    expect(a.error).toBeUndefined(); expect(b.error).toBeUndefined();
    expect(exactOpeningKey(a.positions.at(-1)!)).toBe(exactOpeningKey(b.positions.at(-1)!));
  });
  it('preserves the same legal continuation under rotation plus player exchange', () => {
    const original = state();
    for (const action of legalActions(original).slice(0, 12)) {
      const transformed = transformOpening(original, true, true);
      const mapped = action.type === 'move' ? { ...action, to: { row: 8 - action.to.row, col: 8 - action.to.col } } : { ...action, row: 7 - action.row, col: 7 - action.col };
      expect(exactOpeningKey(applyActionUnchecked(transformed, mapped))).toBe(exactOpeningKey(transformOpening(applyActionUnchecked(original, action), true, true)));
    }
  });
  it('fails closed for cross-experiment collisions, repeated pairs and broken seat swaps', () => {
    const games = schedule(config, 4);
    const keys = assertDisjointSchedule(games, new Set(), 2);
    expect(() => assertDisjointSchedule(games, new Set([keys[0]]), 2)).toThrow(/overlaps/);
    const duplicate = games.map((game) => ({ ...game, opening: games[0].opening }));
    expect(() => assertDisjointSchedule(duplicate, new Set(), 2)).toThrow(/repeated/);
    expect(() => assertDisjointSchedule(games.slice(0, 3), new Set(), 2)).toThrow(/Incomplete/);
    expect(() => assertDisjointSchedule(games.map((game) => ({ ...game, aSeat: 0 })), new Set(), 2)).toThrow(/seat-swapped/);
  });
  it('never conflates a changed wall orientation', () => {
    const s = createInitialState();
    const a = applyActionUnchecked(s, { type: 'wall', orientation: 'h', row: 2, col: 3 });
    const b = applyActionUnchecked(s, { type: 'wall', orientation: 'v', row: 2, col: 3 });
    expect(canonicalOpeningKey(a)).not.toBe(canonicalOpeningKey(b));
  });
});
