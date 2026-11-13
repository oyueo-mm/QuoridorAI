/**
 * Stage-1 batch tournaments (resumable, shardable). Not part of `npm test`.
 *
 *   SUITE=stage1-fixed npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts
 *
 * Environment:
 *   SUITE      suite id from bench/stage1-suites.ts (required)
 *   MATCHUPS   comma-separated matchup ids (default: all of the suite)
 *   SHARD      "i/n": this process plays the pairs with pair % n === i (default 0/1)
 *   LIMIT      stop after this many new games per matchup (staged runs)
 *   REPORT     "only" = just regenerate reports from the raw files
 *   OUT        results root (default bench/results/stage1)
 *
 * Re-running the same command resumes: finished games are skipped. Run several shards in
 * parallel for fixed-budget suites; for equal-time suites parallel processes compete for
 * CPU, which changes what each agent can do in its time — record and report that.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { parseShard, reportMarkdown, runMatchup, writeReports } from './lib/suite';
import { SUITES } from './stage1-suites';

it('stage-1 suite', async () => {
  const suiteId = process.env.SUITE ?? '';
  const suite = SUITES[suiteId];
  if (!suite) throw new Error(`SUITE must be one of: ${Object.keys(SUITES).join(', ')}`);
  const root = join(process.env.OUT ?? 'bench/results/stage1', suiteId);
  mkdirSync(root, { recursive: true });
  const filter = process.env.MATCHUPS?.split(',').map((s) => s.trim()).filter(Boolean);
  const matchups = suite.matchups.filter((m) => !filter || filter.includes(m.id));
  const shard = parseShard(process.env.SHARD);
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
  const logFile = join(root, `progress.s${shard.index}of${shard.count}.log`);
  const log = (line: string) => {
    const l = `${new Date().toISOString()} ${line}`;
    process.stdout.write(l + '\n');
    appendFileSync(logFile, l + '\n');
  };

  if (process.env.REPORT !== 'only') {
    for (const m of matchups) await runMatchup(m, { root, shard, maxGames: suite.maxGames, limit, log });
  }
  const md = [`# ${suiteId}`, '', suite.description, ''];
  for (const m of suite.matchups) {
    if (!existsSync(join(root, m.id))) continue;
    const r = writeReports(m, root, suite.maxGames);
    if (r.completed > 0) md.push(reportMarkdown(r));
  }
  writeFileSync(join(root, 'REPORT.md'), md.join('\n') + '\n');
}, 24 * 60 * 60 * 1000); // long SPRTs: the 3 h default failed a finished run (stage 3-C)
