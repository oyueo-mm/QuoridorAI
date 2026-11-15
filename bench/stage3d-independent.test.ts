/** Offline preparation/analysis only. Run with INDEPENDENT=prepare or verify; never plays games. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { deriveSeed } from '../src/arena/agentSpec';
import { mirrorInvariantKey, openingState, schedule } from '../src/arena/tournament';
import type { ScheduledGame, TournamentConfig } from '../src/arena/tournament';
import { DEFAULT_SPRT, countPairs, llrTrinomial, sequentialTest } from '../src/arena/sprt';
import { canonicalOpeningKey, OPENING_IDENTITY } from './lib/openingIdentity';
import { assertDisjointSchedule, configFiles, fileSha256, loadIndependentSchedule } from './lib/openingRegistry';
import type { IndependentOpeningPlan, OpeningRegistry } from './lib/openingRegistry';
import { effectiveGames, pairPrefix, readGames, scheduleFor } from './lib/suite';
import { hashOf } from './lib/provenance';

const root = 'bench/results/stage3d-independent';
const id = 'C-D-300-independent-1';
const resultDirectory = `${root}/stage3d-independent/${id}`;
const registryFile = `${root}/opening-registry.json`;
const planFile = `${root}/opening-plan.json`;
const configFile = `${root}/frozen-config.json`;
const write = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });

function buildRegistry(): OpeningRegistry {
  const sources: Record<string, string> = {};
  const keys = new Set<string>();
  const legacyMirrorKeys = new Set<string>();
  const experiments = [];
  for (const path of configFiles()) {
    if (path === `${resultDirectory}/config.json`) throw new Error('Preparation refused: the one authorized new experiment already exists');
    sources[path] = fileSha256(path);
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    const dir = dirname(path);
    for (const file of readdirSync(dir).filter((name) => /^games.*\.jsonl$/.test(name))) sources[join(dir, file).replaceAll('\\', '/')] = fileSha256(join(dir, file));
    const games = effectiveGames(readGames(dir));
    const planned = scheduleFor(saved.config, saved.games);
    const observed = new Set<string>();
    const scheduled = new Set<string>();
    for (const game of games) {
      if (game.configHash !== saved.configHash) throw new Error(`Foreign config in historical record ${path}`);
      const state = openingState(game.opening);
      const key = canonicalOpeningKey(state);
      observed.add(key); keys.add(key); legacyMirrorKeys.add(mirrorInvariantKey(state));
    }
    for (const game of planned.filter((game) => game.aSeat === 0)) {
      const state = openingState(game.opening);
      const key = canonicalOpeningKey(state);
      scheduled.add(key); keys.add(key); legacyMirrorKeys.add(mirrorInvariantKey(state));
    }
    experiments.push({ path, id: saved.id, scheduled: [...scheduled].sort(), observed: [...observed].sort() });
  }
  // Preserve every historical hash ledger, including entries from experiments no longer on disk.
  for (const name of readdirSync('bench/openings').filter((name) => name.endsWith('.txt'))) {
    const path = `bench/openings/${name}`; sources[path] = fileSha256(path);
    for (const key of readFileSync(path, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))) legacyMirrorKeys.add(key);
  }
  return { identity: OPENING_IDENTITY, keys: [...keys].sort(), legacyMirrorKeys: [...legacyMirrorKeys].sort(), sources, experiments };
}

function oldCurve(registry: OpeningRegistry) {
  const oldDir = 'bench/results/stage3d/stage3d/C-D-300';
  const old = JSON.parse(readFileSync(`${oldDir}/config.json`, 'utf8'));
  const games = effectiveGames(readGames(oldDir));
  const prefix = pairPrefix(games, old.config.pairs);
  const prior = new Set(registry.experiments.filter((experiment) => experiment.path !== `${oldDir}/config.json`).flatMap((experiment) => experiment.observed));
  const rows = [];
  const acceptedKeys = new Set<string>();
  const scores: number[] = [];
  const originalScores: number[] = [];
  for (const pair of [...new Set(games.map((game) => game.pair))].sort((a, b) => a - b)) {
    const pg = games.filter((game) => game.pair === pair);
    const key = canonicalOpeningKey(openingState(pg[0].opening));
    const priorDuplicate = prior.has(key);
    const internalDuplicate = acceptedKeys.has(key);
    const usable = pg.length === 2 && pg.every((game) => !game.overBudgetMoves && ['a-win', 'b-win'].includes(game.outcome));
    const score = usable ? pg.filter((game) => game.outcome === 'a-win').length / 2 : null;
    const inPrefix = pair < prefix.nextPair;
    if (inPrefix && score !== null) originalScores.push(score);
    if (inPrefix && score !== null && !priorDuplicate && !internalDuplicate) scores.push(score);
    acceptedKeys.add(key);
    const counts = countPairs(scores);
    rows.push({ pair, key, rawOpening: pg[0].opening.moves.join(' '), priorDuplicate, internalDuplicate, usable, score, inPrefix,
      validPairs: scores.length, ...counts, llr: llrTrinomial(counts, 0, 30),
      originalLlr: llrTrinomial(countPairs(originalScores), 0, 30) });
  }
  write(`${root}/old-confirmation-llr.json`, { rule: 'Post-hoc audit only. Exclude all observed historical identical/4-symmetry states and within-C repeats. Follow complete consecutive pair prefix; never fill missing games.', prefix, rows,
    result: sequentialTest(scores, DEFAULT_SPRT), original: sequentialTest(originalScores, DEFAULT_SPRT),
    continuation: 'Not authorized as a continuation: original stopping time used contaminated data, outcomes already examined, and identity/exclusion changes were not prespecified. One fresh independent confirmation replaces it; no pooling or repeated attempts to pass.' });
  writeFileSync(`${root}/old-confirmation-llr.csv`, 'pair,inPrefix,priorDuplicate,internalDuplicate,usable,score,validPairs,ll,split,ww,llr,originalLlr\n' + rows.map((row) => [row.pair,row.inPrefix,row.priorDuplicate,row.internalDuplicate,row.usable,row.score ?? '',row.validPairs,row.ll,row.split,row.ww,row.llr,row.originalLlr].join(',')).join('\n') + '\n', { flag: 'wx' });
}

it('prepares or verifies exactly one independent confirmation without playing games', () => {
  if (process.env.INDEPENDENT === 'verify') {
    const config = JSON.parse(readFileSync(configFile, 'utf8')) as TournamentConfig;
    const games = loadIndependentSchedule(config, 1200);
    expect(games).toHaveLength(1200);
    console.log('PASS: immutable plan, all historical evidence, exact/symmetric independence, paired seats');
    return;
  }
  if (process.env.INDEPENDENT !== 'prepare') throw new Error('Set INDEPENDENT=prepare or verify (offline only)');
  if (existsSync(planFile) || existsSync(configFile)) throw new Error('Frozen plan already exists: do not select another seed or regenerate it');
  mkdirSync(root, { recursive: true });
  const registry = buildRegistry();
  write(registryFile, registry);
  oldCurve(registry);
  const overlaps = [];
  for (let a = 0; a < registry.experiments.length; a++) for (let b = a + 1; b < registry.experiments.length; b++) {
    const left = registry.experiments[a]; const right = registry.experiments[b];
    const rightKeys = new Set(right.observed);
    const intersection = left.observed.filter((key) => rightKeys.has(key));
    if (intersection.length) overlaps.push({ a: left.path, b: right.path, count: intersection.length, keys: intersection });
  }
  write(`${root}/historical-overlaps.json`, { identity: OPENING_IDENTITY, experiments: registry.experiments.length, canonicalKeys: registry.keys.length, legacyMirrorKeys: registry.legacyMirrorKeys.length, overlaps });
  const config = JSON.parse(readFileSync('bench/results/stage3d/stage3d/C-D-300/config.json', 'utf8')).config as TournamentConfig;
  config.seed = 98004; // First successor seed, fixed once. Not chosen using any new outcomes.
  const excluded = new Set(registry.keys);
  const legacy = new Set(registry.legacyMirrorKeys);
  const accepted = new Set<string>();
  const scheduled: ScheduledGame[] = [];
  let draws = 0;
  for (let pair = 0; pair < 600; pair++) {
    let chosen: ScheduledGame['opening'] | null = null;
    for (let attempt = 0; attempt < 2000; attempt++) {
      draws++;
      const candidate = schedule({ ...config, pairs: 1, seed: deriveSeed(config.seed, pair, attempt, 0x3d04), uniqueOpenings: false, excludeOpeningsFile: undefined }, 2)[0].opening;
      const state = openingState(candidate);
      const key = canonicalOpeningKey(state);
      if (!excluded.has(key) && !accepted.has(key) && !legacy.has(mirrorInvariantKey(state))) { chosen = candidate; accepted.add(key); break; }
    }
    if (!chosen) throw new Error(`Independent opening pool exhausted at pair ${pair}; abort, never accept a duplicate`);
    for (const aSeat of [0, 1] as const) {
      const index = scheduled.length;
      scheduled.push({ index, pair, aSeat, opening: chosen, agentSeeds: [deriveSeed(config.seed, index, 2), deriveSeed(config.seed, index, 3)] });
    }
  }
  const plan: IndependentOpeningPlan = { identity: OPENING_IDENTITY, config, registry: { file: registryFile, sha256: fileSha256(registryFile) }, resultDirectory, scheduled,
    canonicalKeys: assertDisjointSchedule(scheduled, excluded, 600), maxAttempts: 2000, seedPolicy: 'One fixed seed 98004; deterministic outcome-blind redraws only for opening collisions. No replacement confirmation regardless of result.' };
  write(planFile, plan);
  const frozen: TournamentConfig = { ...config, independentOpeningPlan: { file: planFile, sha256: fileSha256(planFile) } };
  write(configFile, frozen);
  write(`${root}/preregistration.json`, { id, timestamp: new Date().toISOString(), configHash: hashOf(frozen), planSha256: fileSha256(planFile), registrySha256: fileSha256(registryFile), source: '9c2d530 engine; only batch scheduling/preflight changes before measurement',
    hypotheses: DEFAULT_SPRT, pairedTimeMs: 300, shards: 4, power: 'AC only', candidate: 'E6+C1+fast', control: 'E6+C1+reference', draws, schedulePairs: 600,
    decision: 'First GSPRT boundary crossing in consecutive valid pairs, capped at 600 scheduled pairs. Accept H1 => adopt if correctness passes. H0 or inconclusive => keep reference. No retry of confirmation, no pooling with old C, no seed selection by outcome.',
    exclusions: 'Existing repetition/game-time/suspect/retry rules unchanged. New run additionally refuses non-AC/unknown before every game; mixed/unknown outcomes quarantined and retried by the same 3-attempt limit.' });
  expect(loadIndependentSchedule(frozen, 1200)).toHaveLength(1200);
  console.log(JSON.stringify({ experiments: registry.experiments.length, keys: registry.keys.length, pairs: 600, draws, configHash: hashOf(frozen) }));
}, 180_000);
