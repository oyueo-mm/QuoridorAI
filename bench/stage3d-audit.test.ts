/** Offline audit of the completed Stage 3-D records. Never starts a search or a game.
 * npx vitest run --config vitest.bench.config.ts bench/stage3d-audit.test.ts
 * Only writes audit.json; original records and summaries remain untouched.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { countPairs, llrTrinomial, sequentialTest } from '../src/arena/sprt';
import { mirrorInvariantKey, openingState } from '../src/arena/tournament';
import { effectiveGames, isSuspect, pairPrefix, readGames, scheduleFor } from './lib/suite';
import { SUITES } from './stage1-suites';

const root = 'bench/results/stage3d';
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const intersect = (a: Set<string>, b: Set<string>) => [...a].filter((key) => b.has(key));

function sourceAudit() {
  const before = 'c0492f1';
  const measured = '132250d';
  const show = (ref: string, file: string) => execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  const body = (source: string, name: string) => {
    const start = source.indexOf('{', source.indexOf(`function ${name}(`));
    let depth = 1;
    let end = start + 1;
    while (depth && end < source.length) {
      if (source[end] === '{') depth++;
      if (source[end] === '}') depth--;
      end++;
    }
    return source.slice(start, end).replace(/extraWallCounters\.\w+\+\+;/g, '').replace(/\s+/g, '');
  };
  const exactFunctions = [
    ['src/ai/search/evaluation.ts', 'vulnerability', 'vulnerabilityReference'],
    ['src/engine/rowMasks.ts', 'prepareExtraWallDistances', 'prepareExtraWallDistances'],
    ['src/engine/rowMasks.ts', 'preparedDistanceWithExtraWall', 'preparedDistanceWithExtraWall'],
  ].map(([file, oldName, newName]) => {
    const equalIgnoringCountersAndWhitespace = body(show(before, file), oldName) === body(show(measured, file), newName);
    expect(equalIgnoringCountersAndWhitespace).toBe(true);
    return { file, oldName, newName, equalIgnoringCountersAndWhitespace };
  });
  const unchangedFiles = ['src/ai/minimaxAgent.ts', 'src/ai/search/candidates.ts', 'src/ai/search/transposition.ts'];
  for (const file of unchangedFiles) expect(show(before, file)).toBe(show(measured, file));
  return {
    before: execFileSync('git', ['rev-parse', before], { encoding: 'utf8' }).trim(),
    measured: execFileSync('git', ['rev-parse', measured], { encoding: 'utf8' }).trim(),
    exactFunctions, unchangedFiles,
    sharedChanges: ['wall-driven row-mask construction and last-layout memo', 'exact vulnerability cache changed from string keys to hashed collision chains', 'reference extra-wall diagnostic counters'],
    fastOnly: ['layered padded row windows', 'allocation-free path/candidate loop and proven cheap-detour deferral', 'memoised goal-row maps used by childEvaluator'],
    memory: { measuredRssHeapPeak: false, ttPayloadBytesPerAgent: (2 ** 19) * 21, extraModuleScratchBytesVs3C: 8946, lazyGoalMapPayloadBytesPerLayout: 324, vulnerabilityPayloadBytesPerLayout: 162, vulnerabilityCacheLayoutLimitPerEvaluator: 100000,
      caveat: 'Static typed-array payload counts only, not measured RSS/heap. Both kernels load the same module scratch; only fast requests shared goal maps. JS objects, collision chains, weak-map retention and GC overhead are not bounded by these figures.' },
  };
}

it('audits the immutable Stage 3-D inputs, pair decisions, power and opening independence', () => {
  const inputs: Record<string, string> = {};
  const observed = new Map<string, Set<string>>();
  const scheduled = new Map<string, Set<string>>();
  const pairDetails = new Map<string, { pair: number; key: string; score: number | null }[]>();
  const results = [];
  for (const matchup of SUITES.stage3d.matchups) {
    const dir = join(root, 'stage3d', matchup.id);
    for (const name of readdirSync(dir).filter((name) => /^(games\.s.*\.jsonl|sessions\.jsonl|config\.json|summary\.json)$/.test(name))) {
      const path = join(dir, name).replaceAll('\\', '/');
      inputs[path] = sha256(path);
    }
    const config = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    // Only serialized settings are used: future engine defaults cannot redefine this audit.
    expect(config.config).toEqual(matchup.config);
    const summary = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    const raw = readGames(dir);
    expect(raw.every((game) => game.configHash === config.configHash)).toBe(true);
    const games = effectiveGames(raw);
    expect(games.length).toBe(summary.completed);
    const schedule = scheduleFor(config.config, SUITES.stage3d.maxGames);
    const allKeys = new Set(schedule.filter((game) => game.aSeat === 0).map((game) => mirrorInvariantKey(openingState(game.opening))));
    expect(allKeys.size).toBe(config.config.pairs);
    scheduled.set(matchup.id, allKeys);
    const keys = new Set<string>();
    const power: Record<string, number> = {};
    for (const game of games) {
      const expected = schedule[game.index];
      expect(game.opening).toEqual(expected.opening);
      expect(game.pair).toBe(expected.pair);
      expect(game.aSeat).toBe(expected.aSeat);
      keys.add(mirrorInvariantKey(openingState(game.opening)));
      power[game.power ?? 'missing'] = (power[game.power ?? 'missing'] ?? 0) + 1;
    }
    observed.set(matchup.id, keys);
    const prefix = pairPrefix(raw, config.config.pairs);
    const pairs = [...new Set(games.map((game) => game.pair))].map((pair) => {
      const records = games.filter((game) => game.pair === pair);
      return { pair, key: mirrorInvariantKey(openingState(records[0].opening)), score: records.length === 2 && records.every((game) => !isSuspect(game) && ['a-win', 'b-win'].includes(game.outcome)) ? records.filter((game) => game.outcome === 'a-win').length / 2 : null };
    });
    pairDetails.set(matchup.id, pairs);
    const retries = raw.filter((game) => (game.attempt ?? 1) > 1);
    const oldSuspect = raw.filter(isSuspect);
    for (const game of raw) {
      const overBudget = game.agents.flatMap((agent) => agent.moves).filter((move) => move.ms > 3 * config.config.budget.timeMs).length;
      expect(game.overBudgetMoves).toBe(overBudget);
    }
    const decisions = games.flatMap((game) => game.agents.flatMap((agent) => agent.moves.map((move) => move.ms)));
    const sessions = readFileSync(join(dir, 'sessions.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(sessions.every((session) => session.provenance.git.srcDirty === false)).toBe(true);
    expect(games.every((game) => sessions.some((session) => session.session === game.session))).toBe(true);
    expect(power).toEqual({ ac: games.length });
    expect(games.filter(isSuspect)).toHaveLength(0);
    const sprt = matchup.sprt ? sequentialTest(prefix.scores, matchup.sprt) : null;
    expect(sprt).toEqual(summary.sprt);
    let decisivePrefixWins: number | null = null;
    if (sprt && matchup.sprt) {
      expect(sprt.status).toBe('accept-H1');
      // The decision must be the first crossing, not a favourable later checkpoint.
      const before = countPairs(prefix.scores.slice(0, sprt.pairs - 1));
      expect(llrTrinomial(before, matchup.sprt.elo0, matchup.sprt.elo1)).toBeLessThan(sprt.upper);
      decisivePrefixWins = sprt.counts.split + 2 * sprt.counts.ww;
    }
    const progress = readdirSync(join(root, 'stage3d')).filter((name) => /^progress\.s.*\.log$/.test(name));
    const gaps = [];
    for (const file of progress) {
      const timestamps = readFileSync(join(root, 'stage3d', file), 'utf8').split('\n')
        .filter((line) => line.includes(`[${matchup.id}] game `)).map((line) => Date.parse(line.slice(0, 24)));
      for (let i = 1; i < timestamps.length; i++) gaps.push((timestamps[i] - timestamps[i - 1]) / 1000);
    }
    results.push({
      id: matchup.id, configHash: config.configHash, seed: config.config.seed,
      rawRecords: raw.length, effectiveGames: games.length, observedOpenings: keys.size,
      prefix: { nextPair: prefix.nextPair, validPairs: prefix.scores.length, excludedHalted: prefix.excludedHalted, excludedSuspect: prefix.excludedSuspect },
      sprt, decisivePrefixWins, decisivePrefixGames: sprt ? 2 * sprt.pairs : null,
      afterDecisionValidPairs: sprt ? prefix.scores.length - sprt.pairs : null,
      power, rawPower: Object.fromEntries([...new Set(raw.map((game) => game.power))].map((p) => [p ?? 'missing', raw.filter((game) => game.power === p).length])),
      retries: retries.map((game) => ({ index: game.index, attempt: game.attempt, outcome: game.outcome, overBudgetMoves: game.overBudgetMoves, power: game.power })),
      discardedSuspect: oldSuspect.map((game) => ({ index: game.index, attempt: game.attempt, outcome: game.outcome, durationMs: game.durationMs, overBudgetMoves: game.overBudgetMoves, power: game.power, maxDecisionMs: Math.max(...game.agents.flatMap((agent) => agent.moves.map((move) => move.ms))) })),
      maxDecisionMs: Math.max(...decisions), maxGameDurationMs: Math.max(...games.map((game) => game.durationMs)),
      maxProgressGapSeconds: Math.max(...gaps),
      sessionCommits: [...new Set(sessions.map((session) => session.provenance.git.commit))],
      sourceDirty: sessions.some((session) => session.provenance.git.srcDirty),
      descriptiveAllGames: { wins: summary.summary.aWinRate, pairScore: summary.summary.aPairScore, halted: summary.summary.halted, agents: summary.summary.agents, cpuBusy: summary.cpuBusy },
    });
  }
  const ledgerPath = 'bench/openings/ledger-1ef90bb0.txt';
  inputs[ledgerPath] = sha256(ledgerPath);
  const ledger = new Set(readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter((line) => line && !line.startsWith('#')));
  const overlaps = [];
  for (const [id, keys] of observed) {
    const used = intersect(keys, ledger);
    expect(used).toHaveLength(0);
    overlaps.push({ a: id, b: 'pre-3D ledger', scope: 'observed', count: used.length });
    for (const [other, otherKeys] of observed) if (id < other) {
      const actual = intersect(keys, otherKeys);
      // Different seeds are not proof of independence: retain any collisions for review.
      overlaps.push({ a: id, b: other, scope: 'observed', count: actual.length, keys: actual,
        pairsA: pairDetails.get(id)!.filter((pair) => actual.includes(pair.key)),
        pairsB: pairDetails.get(other)!.filter((pair) => actual.includes(pair.key)),
      });
    }
    for (const [other, otherKeys] of scheduled) if (id < other) {
      overlaps.push({ a: id, b: other, scope: 'full scheduled', count: intersect(scheduled.get(id)!, otherKeys).length });
    }
  }
  // Outcome-blind sensitivity check, restricted to each ORIGINAL stopping prefix.
  // No post-stop games may supply a more favourable re-decision.
  const sensitivity = [];
  for (const id of ['T-D-300', 'C-D-300']) {
    const recorded = results.find((result) => result.id === id)!;
    const priorIds = id === 'T-D-300' ? ['P-D-300'] : ['P-D-300', 'T-D-300'];
    for (const scope of ['observed', 'full scheduled'] as const) {
      const priorKeys = new Set(priorIds.flatMap((prior) => [...(scope === 'observed' ? observed : scheduled).get(prior)!]));
      const pairs = pairDetails.get(id)!;
      let n = 0;
      const stopPair = pairs.find((pair) => pair.score !== null && ++n === recorded.sprt!.pairs)!.pair;
      const throughStop = pairs.filter((pair) => pair.pair <= stopPair && pair.score !== null);
      const excluded = throughStop.filter((pair) => priorKeys.has(pair.key));
      const clean = throughStop.filter((pair) => !priorKeys.has(pair.key)).map((pair) => pair.score!);
      sensitivity.push({ id, scope, originalStopPair: stopPair, excludedPairs: excluded, result: sequentialTest(clean, recorded.sprt!.config) });
    }
  }
  // Hash the original files again to prove that this audit did not rewrite evidence.
  for (const [file, hash] of Object.entries(inputs)) expect(sha256(file)).toBe(hash);
  const confirmationOverlap = overlaps.filter((overlap) => overlap.a === 'C-D-300' && overlap.scope === 'observed' && overlap.b !== 'pre-3D ledger').reduce((sum, overlap) => sum + overlap.count, 0);
  const audit = {
    method: 'Offline record replay for opening keys and sequential statistics; no searches or games run',
    source: sourceAudit(),
    promotion: {
      eligible: confirmationOverlap === 0,
      decision: confirmationOverlap === 0 ? 'review remaining gates before adoption' : 'hold; keep reference default',
      reason: 'Original C-D-300 overlaps earlier observed openings. Removing these within the original stopping prefix does not accept H1. Post-hoc alternative filters are sensitivity analyses, not a preregistered independent confirmation.',
    },
    ledgerKeys: ledger.size, results, overlaps, sensitivity, inputSha256: inputs,
  };
  writeFileSync(join(root, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify({ results: results.map(({ descriptiveAllGames: _all, ...result }) => result), overlaps }, null, 2));
}, 120_000);
