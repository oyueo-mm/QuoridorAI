import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { schedule } from '../../src/arena/tournament';
import type { TournamentConfig } from '../../src/arena/tournament';
import { OPENING_IDENTITY } from './openingIdentity';
import { assertDisjointSchedule, configFiles, fileSha256, loadIndependentSchedule } from './openingRegistry';
import type { IndependentOpeningPlan, OpeningRegistry } from './openingRegistry';
import { DEFAULT_SPRT } from '../../src/arena/sprt';
import { runMatchup } from './suite';

const temps: string[] = [];
afterEach(() => { for (const path of temps.splice(0)) rmSync(path, { recursive: true, force: true }); });
const base: TournamentConfig = {
  agents: [{ kind: 'bfs', depth: 0, simulations: 0 }, { kind: 'bfs', depth: 0, simulations: 0 }],
  budget: { mode: 'fixed', timeMs: 0 }, pairs: 2, seed: 9, openingMode: 'mixed', openingPlies: 4,
  uniqueOpenings: true, maxPlies: 100, repetitionLimit: 3, maxGameMs: null,
};
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'quoridor-independent-')); temps.push(dir);
  const registryFile = join(dir, 'registry.json');
  const planFile = join(dir, 'plan.json');
  const sources = Object.fromEntries(configFiles().map((path) => [path, fileSha256(path)]));
  const registry: OpeningRegistry = { identity: OPENING_IDENTITY, keys: [], legacyMirrorKeys: [], sources, experiments: [] };
  writeFileSync(registryFile, JSON.stringify(registry));
  const games = schedule(base, 4);
  const plan: IndependentOpeningPlan = { identity: OPENING_IDENTITY, config: base, registry: { file: registryFile, sha256: fileSha256(registryFile) }, resultDirectory: dir,
    scheduled: games, canonicalKeys: assertDisjointSchedule(games, new Set(), 2), maxAttempts: 2000, seedPolicy: 'fixture' };
  const pin = () => { writeFileSync(planFile, JSON.stringify(plan)); return { ...base, independentOpeningPlan: { file: planFile, sha256: fileSha256(planFile) } }; };
  return { dir, registry, registryFile, plan, planFile, pin };
}
it('validates a full frozen schedule, and refuses a truncated run or changed config', () => {
  const f = fixture(); const config = f.pin();
  expect(loadIndependentSchedule(config, 4)).toHaveLength(4);
  expect(() => loadIndependentSchedule(config, 2)).toThrow(/truncated/);
  expect(() => loadIndependentSchedule({ ...config, seed: 10 }, 4)).toThrow(/config mismatch/);
});
it('rejects plan and registry tampering before a game can start', () => {
  const f = fixture(); const config = f.pin();
  writeFileSync(f.planFile, readFileSync(f.planFile, 'utf8') + ' ');
  expect(() => loadIndependentSchedule(config, 4)).toThrow(/plan checksum/);
  const reset = f.pin();
  writeFileSync(f.registryFile, JSON.stringify({ ...f.registry, keys: ['tampered'] }));
  expect(() => loadIndependentSchedule(reset, 4)).toThrow(/registry checksum/);
});
it('rejects a new historical experiment missing from the registry inventory', () => {
  const f = fixture(); f.registry.sources = {};
  writeFileSync(f.registryFile, JSON.stringify(f.registry)); f.plan.registry.sha256 = fileSha256(f.registryFile);
  expect(() => loadIndependentSchedule(f.pin(), 4)).toThrow(/Unregistered prior experiment/);
});
it('rejects changed historical evidence and cross-experiment collisions', () => {
  const f = fixture(); const extra = join(f.dir, 'old-evidence.jsonl'); writeFileSync(extra, 'original');
  f.registry.sources[extra] = fileSha256(extra);
  writeFileSync(f.registryFile, JSON.stringify(f.registry)); f.plan.registry.sha256 = fileSha256(f.registryFile);
  const config = f.pin(); writeFileSync(extra, 'modified');
  expect(() => loadIndependentSchedule(config, 4)).toThrow(/Historical opening evidence changed/);
  writeFileSync(extra, 'original'); f.registry.keys = [f.plan.canonicalKeys[0]];
  writeFileSync(f.registryFile, JSON.stringify(f.registry)); f.plan.registry.sha256 = fileSha256(f.registryFile);
  expect(() => loadIndependentSchedule(f.pin(), 4)).toThrow(/overlaps previous/);
});
it('refuses a new unplanned SPRT before creating its config or playing games', async () => {
  const f = fixture();
  await expect(runMatchup({ id: 'new-sprt', question: 'fixture', config: base, sprt: DEFAULT_SPRT }, { root: f.dir, maxGames: 4, shard: { index: 0, count: 1 } })).rejects.toThrow(/NEW SPRT requires/);
});
