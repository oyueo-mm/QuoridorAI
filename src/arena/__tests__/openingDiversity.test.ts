import { describe, expect, it } from 'vitest';
import { distanceToRow, hashState, legalActions, legalPawnMoves } from '../../engine';
import { mirrorState, randomMixedOpening } from '../openings';
import { mirrorInvariantKey, openingState, schedule } from '../tournament';
import type { TournamentConfig } from '../tournament';

const base: TournamentConfig = {
  agents: [{ kind: 'bfs', depth: 0, simulations: 0 }, { kind: 'random', depth: 0, simulations: 0 }],
  budget: { mode: 'fixed', timeMs: 0 },
  pairs: 60,
  seed: 4242,
  openingMode: 'mixed',
  openingPlies: 6,
  openingWallProbability: 0.25,
  openingMaxImbalance: 2,
  uniqueOpenings: true,
  maxPlies: 300,
  repetitionLimit: 3,
  maxGameMs: null,
};

describe('mirror symmetry of openings', () => {
  it('mirroring is an involution and preserves the rules', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = randomMixedOpening({ seed, plies: 8, wallProbability: 0.4, maxImbalance: 3 }).state;
      const m = mirrorState(s);
      expect(hashState(mirrorState(m))).toEqual(hashState(s));
      expect(legalActions(m).length).toBe(legalActions(s).length);
      expect(legalPawnMoves(m).length).toBe(legalPawnMoves(s).length);
      for (const p of [0, 1] as const) {
        expect(distanceToRow(m, m.pawns[p], p === 0 ? 0 : 8)).toBe(distanceToRow(s, s.pawns[p], p === 0 ? 0 : 8));
      }
      expect(mirrorInvariantKey(m)).toBe(mirrorInvariantKey(s));
    }
  });

  it("'mirror' dedupe leaves no mirror-image duplicates; default schedules are unchanged", () => {
    const keys = (cfg: TournamentConfig) => schedule(cfg, 1000).filter((g) => g.aSeat === 0).map((g) => mirrorInvariantKey(openingState(g.opening)));
    const mirrored = keys({ ...base, openingDedupe: 'mirror' });
    expect(new Set(mirrored).size).toBe(mirrored.length);
    // Default ('exact') keeps exactly the old schedule.
    expect(schedule(base, 1000).map((g) => g.opening.moves.join(' '))).toEqual(schedule({ ...base, openingDedupe: 'exact' }, 1000).map((g) => g.opening.moves.join(' ')));
  });

  it('an exclusion set keeps the listed openings out of the schedule', () => {
    const cfg = { ...base, openingDedupe: 'mirror' as const };
    const first = new Set(schedule(cfg, 1000).map((g) => mirrorInvariantKey(openingState(g.opening))));
    const second = schedule({ ...cfg, excludeOpeningsFile: 'test-ledger' }, 1000, first);
    const keys = second.filter((g) => g.aSeat === 0).map((g) => mirrorInvariantKey(openingState(g.opening)));
    expect(keys.filter((k) => first.has(k))).toHaveLength(0);
    expect(new Set(keys).size).toBe(keys.length);
    expect(() => schedule({ ...cfg, excludeOpeningsFile: 'test-ledger' }, 1000)).toThrow(/pass its keys/);
  });

  it('variable opening length stays within the range and is deterministic', () => {
    const cfg = { ...base, openingPlies: 4, openingPliesMax: 10, openingDedupe: 'mirror' as const };
    const a = schedule(cfg, 1000);
    const lens = new Set(a.map((g) => g.opening.moves.length));
    for (const l of lens) expect(l >= 4 && l <= 10).toBe(true);
    expect(lens.size).toBeGreaterThan(4);
    expect(schedule(cfg, 1000).map((g) => g.opening.moves.join(' '))).toEqual(a.map((g) => g.opening.moves.join(' ')));
  });
});
