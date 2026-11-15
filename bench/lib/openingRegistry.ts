import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mirrorInvariantKey, openingState } from '../../src/arena/tournament';
import type { ScheduledGame, TournamentConfig } from '../../src/arena/tournament';
import { hashOf } from './provenance';
import { canonicalOpeningKey, OPENING_IDENTITY } from './openingIdentity';

export const fileSha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
export function configFiles(root = 'bench/results'): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? configFiles(join(root, entry.name)) : entry.name === 'config.json' ? [join(root, entry.name).replaceAll('\\', '/')] : []).sort();
}

export interface OpeningRegistry {
  identity: string;
  keys: string[];
  legacyMirrorKeys: string[];
  sources: Record<string, string>;
  experiments: { path: string; id: string; scheduled: string[]; observed: string[] }[];
}

export interface IndependentOpeningPlan {
  identity: string;
  config: TournamentConfig;
  registry: { file: string; sha256: string };
  resultDirectory: string;
  scheduled: ScheduledGame[];
  canonicalKeys: string[];
  maxAttempts: number;
  seedPolicy: string;
}

export function assertDisjointSchedule(games: readonly ScheduledGame[], excluded: ReadonlySet<string>, expectedPairs: number): string[] {
  if (games.length !== expectedPairs * 2) throw new Error('Incomplete independent schedule');
  const seen = new Set<string>();
  const keys: string[] = [];
  for (let pair = 0; pair < expectedPairs; pair++) {
    const a = games[2 * pair];
    const b = games[2 * pair + 1];
    if (a.index !== pair * 2 || b.index !== pair * 2 + 1 || a.pair !== pair || b.pair !== pair || a.aSeat !== 0 || b.aSeat !== 1 || JSON.stringify(a.opening) !== JSON.stringify(b.opening)) throw new Error(`Broken seat-swapped pair ${pair}`);
    const key = canonicalOpeningKey(openingState(a.opening));
    if (seen.has(key)) throw new Error(`Symmetric/identical opening repeated inside schedule at pair ${pair}`);
    if (excluded.has(key)) throw new Error(`Opening overlaps previous experiments at pair ${pair}`);
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/** Fail before a single game/config/session is written if evidence, registry or schedule changed. */
export function loadIndependentSchedule(config: TournamentConfig, maxGames: number): ScheduledGame[] {
  const pointer = config.independentOpeningPlan;
  if (!pointer) throw new Error('Missing independent opening plan');
  if (fileSha256(pointer.file) !== pointer.sha256) throw new Error('Independent opening plan checksum mismatch');
  const plan = JSON.parse(readFileSync(pointer.file, 'utf8')) as IndependentOpeningPlan;
  const { independentOpeningPlan: _pointer, ...base } = config;
  if (hashOf(base) !== hashOf(plan.config)) throw new Error('Independent plan config mismatch');
  if (plan.identity !== OPENING_IDENTITY) throw new Error('Independent plan identity mismatch');
  if (maxGames < plan.scheduled.length) throw new Error('Independent plan may not be truncated');
  if (fileSha256(plan.registry.file) !== plan.registry.sha256) throw new Error('Opening registry checksum mismatch');
  const registry = JSON.parse(readFileSync(plan.registry.file, 'utf8')) as OpeningRegistry;
  if (registry.identity !== OPENING_IDENTITY) throw new Error('Registry identity mismatch');
  for (const [path, sha] of Object.entries(registry.sources)) if (!existsSync(path) || fileSha256(path) !== sha) throw new Error(`Historical opening evidence changed: ${path}`);
  const own = `${plan.resultDirectory}/config.json`;
  for (const path of configFiles()) if (path !== own && !registry.sources[path]) throw new Error(`Unregistered prior experiment: ${path}`);
  const keys = assertDisjointSchedule(plan.scheduled, new Set(registry.keys), config.pairs);
  const legacy = new Set(registry.legacyMirrorKeys);
  if (plan.scheduled.some((game) => game.aSeat === 0 && legacy.has(mirrorInvariantKey(openingState(game.opening))))) throw new Error('Opening overlaps a historical legacy ledger');
  if (JSON.stringify(keys) !== JSON.stringify(plan.canonicalKeys)) throw new Error('Independent plan opening identity mismatch');
  return plan.scheduled;
}
