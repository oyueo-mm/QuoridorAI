import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TournamentConfig } from '../../src/arena/tournament';
import { hashOf, stableStringify } from './provenance';
import { buildReport, effectiveGames, gamesCsv, inShard, pairPrefix, parseShard, readGames, runMatchup } from './suite';
import type { Matchup, RecordedGame } from './suite';

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
const matchup: Matchup = { id: 'm', question: 'test', config };
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'qz-suite-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('provenance helpers', () => {
  it('stable stringify ignores key order and undefined', () => {
    expect(stableStringify({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe('{"a":[2,{"c":3}],"b":1}');
    expect(hashOf({ x: 1, y: 2 })).toBe(hashOf({ y: 2, x: 1 }));
    expect(hashOf({ x: 1 })).not.toBe(hashOf({ x: 2 }));
  });
});

describe('pair prefix, retries and SPRT stop', () => {
  const rec = (index: number, outcome: RecordedGame['outcome'], extra: Partial<RecordedGame> = {}): RecordedGame =>
    ({ index, pair: Math.floor(index / 2), aSeat: (index % 2) as 0 | 1, outcome, overBudgetMoves: 0, ...extra }) as RecordedGame;

  it('uses the latest attempt and the consecutive prefix of final pairs', () => {
    const games = [
      rec(0, 'a-win'), rec(1, 'a-win'), // pair 0: WW
      rec(2, 'b-win', { overBudgetMoves: 1 }), rec(2, 'a-win', { attempt: 2 }), rec(3, 'b-win'), // pair 1: split after retry
      rec(4, 'halted-repetition'), rec(5, 'a-win'), // pair 2: halted → excluded
      rec(6, 'a-win', { overBudgetMoves: 2 }), rec(7, 'a-win'), // pair 3: suspect, retries left → not final
      rec(8, 'a-win'), rec(9, 'a-win'), // pair 4: beyond the prefix
    ];
    expect(effectiveGames(games).find((g) => g.index === 2)!.attempt).toBe(2);
    const p = pairPrefix(games, 10);
    expect(p.scores).toEqual([1, 0.5]);
    expect(p.excludedHalted).toBe(1);
    expect(p.nextPair).toBe(3);
    // Out of attempts: the pair is final but excluded as suspect, and the prefix moves on.
    const exhausted = [...games, rec(6, 'a-win', { attempt: 2, overBudgetMoves: 1 }), rec(6, 'b-win', { attempt: 3, overBudgetMoves: 1 })];
    const q = pairPrefix(exhausted, 10);
    expect(q.excludedSuspect).toBe(1);
    expect(q.scores).toEqual([1, 0.5, 1]);
  });

});

describe('batch runner', () => {
  it('parses shards and keeps both games of a pair together', () => {
    expect(parseShard(undefined)).toEqual({ index: 0, count: 1 });
    expect(parseShard('2/3')).toEqual({ index: 2, count: 3 });
    expect(() => parseShard('3/3')).toThrow();
    const g = (pair: number) => ({ index: 0, pair, aSeat: 0 as const, opening: { seed: 0, plies: 0, moves: [] }, agentSeeds: [0, 0] as [number, number] });
    expect(inShard(g(4), { index: 1, count: 3 })).toBe(true);
    expect(inShard(g(4), { index: 0, count: 3 })).toBe(false);
  });

  it('runs shards, resumes without replaying, and refuses a changed config', async () => {
    const root = tmp();
    expect(await runMatchup(matchup, { root, shard: { index: 0, count: 2 }, maxGames: 100 })).toBe(4); // pairs 0, 2
    expect(await runMatchup(matchup, { root, shard: { index: 0, count: 2 }, maxGames: 100 })).toBe(0); // resume: nothing left
    expect(await runMatchup(matchup, { root, shard: { index: 1, count: 2 }, maxGames: 100, limit: 1 })).toBe(1); // staged
    expect(await runMatchup(matchup, { root, shard: { index: 1, count: 2 }, maxGames: 100 })).toBe(1);
    const games = readGames(join(root, 'm'));
    expect(games.map((g) => g.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(readdirSync(join(root, 'm')).filter((f) => f.startsWith('games.')).sort()).toEqual(['games.s0of2.jsonl', 'games.s1of2.jsonl']);
    expect(readFileSync(join(root, 'm', 'sessions.jsonl'), 'utf8').trim().split('\n')).toHaveLength(4);

    const report = buildReport(matchup, root, 100);
    expect(report.completed).toBe(6);
    expect(report.scheduled).toBe(6);
    expect(report.summary.games).toBe(6);
    expect(report.openings).toHaveLength(3);
    expect(report.summary.uniqueOpenings).toBe(3);
    const decisive = report.summary.decisive;
    expect(report.summary.agents[0].wins + report.summary.agents[1].wins).toBe(decisive);
    expect(report.strategy[0].totals.moves + report.strategy[1].totals.moves).toBe(games.reduce((s, g) => s + g.moves.length, 0));
    expect(gamesCsv(games).trim().split('\n')).toHaveLength(7);

    // Deterministic agents: a fresh run reproduces every game move for move.
    const again = tmp();
    await runMatchup(matchup, { root: again, shard: { index: 0, count: 1 }, maxGames: 100 });
    expect(readGames(join(again, 'm')).map((g) => g.moves.join(' '))).toEqual(games.map((g) => g.moves.join(' ')));

    await expect(runMatchup({ ...matchup, config: { ...config, seed: 6 } }, { root, shard: { index: 0, count: 1 }, maxGames: 100 })).rejects.toThrow(/different config/);
  }, 60_000);
});
