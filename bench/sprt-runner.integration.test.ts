/**
 * Integration test of the SPRT runner with real games (BFS vs Random). Run with the bench
 * configuration so it does not load `npm test` (whose obstacle-map test is close to its time
 * limit on a throttled laptop):
 *   npx vitest run --config vitest.bench.config.ts bench/sprt-runner.integration.test.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TournamentConfig } from '../src/arena/tournament';
import { buildReport, readGames, runMatchup, sprtStatus } from './lib/suite';
import type { Matchup } from './lib/suite';

const config: TournamentConfig = {
  agents: [{ kind: 'alphabeta', depth: 1, simulations: 0 }, { kind: 'bfs', depth: 0, simulations: 0 }],
  budget: { mode: 'fixed', timeMs: 0 },
  pairs: 3,
  seed: 5,
  openingMode: 'mixed',
  openingPlies: 4,
  uniqueOpenings: true,
  maxPlies: 200,
  repetitionLimit: 3,
  maxGameMs: null,
};
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'qz-sprt-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('SPRT runner (real games)', () => {
  const sprtMatchup: Matchup = {
    id: 'sprt',
    question: 'BFS vs Random under SPRT',
    config: { ...config, agents: [{ kind: 'bfs', depth: 0, simulations: 0 }, { kind: 'random', depth: 0, simulations: 0 }], pairs: 200, seed: 9 },
    sprt: { elo0: 0, elo1: 200, alpha: 0.05, beta: 0.05, minPairs: 5, maxPairs: 200 },
  };

  it('stops at the SPRT decision, identically with one or two shards', async () => {
    const one = tmp();
    await runMatchup(sprtMatchup, { root: one, shard: { index: 0, count: 1 }, maxGames: 1000 });
    const s1 = sprtStatus(sprtMatchup, readGames(join(one, 'sprt')))!;
    expect(s1.status).toBe('accept-H1');
    expect(readGames(join(one, 'sprt')).length).toBe(2 * s1.pairs); // stopped right at the decision
    expect(s1.pairs).toBeLessThan(200);

    const two = tmp();
    await Promise.all([0, 1].map((index) => runMatchup(sprtMatchup, { root: two, shard: { index, count: 2 }, maxGames: 1000 })));
    const s2 = sprtStatus(sprtMatchup, readGames(join(two, 'sprt')))!;
    expect(s2).toEqual(s1); // prefix rule: same decision, same pair count
    const report = buildReport(sprtMatchup, two, 1000);
    expect(report.sprt!.status).toBe('accept-H1');
  }, 60_000);

  it('refuses an SPRT matchup whose schedule does not match maxPairs', async () => {
    await expect(runMatchup({ ...sprtMatchup, config: { ...sprtMatchup.config, pairs: 50 } }, { root: tmp(), shard: { index: 0, count: 1 }, maxGames: 1000 })).rejects.toThrow(/maxPairs/);
  });
});
