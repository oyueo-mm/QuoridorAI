/**
 * Reproducibility audit for fixed-budget results (not part of `npm test`).
 *
 *   SUITE=stage1-fixed [SAMPLE=4] npx vitest run --config vitest.bench.config.ts bench/reproduce.bench.test.ts
 *
 * Re-plays SAMPLE recorded games per matchup (evenly spaced indices) from their recorded
 * schedule entry and seeds, and compares outcome and every move with the stored record.
 * Equal-time matchups are skipped: their moves depend on machine speed by design.
 * Writes bench/results/stage1/<suite>/REPRODUCIBILITY-<timestamp>.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { inProcessFactory } from '../src/arena/agentSpec';
import { playScheduledGame } from '../src/arena/tournament';
import { collectProvenance, hashOf } from './lib/provenance';
import { readGames, scheduleFor } from './lib/suite';
import { SUITES } from './stage1-suites';

it('reproducibility audit', async () => {
  const suiteId = process.env.SUITE ?? 'stage1-fixed';
  const suite = SUITES[suiteId];
  const root = join(process.env.OUT ?? 'bench/results/stage1', suiteId);
  const sample = Number(process.env.SAMPLE ?? 4);
  const prov = collectProvenance();
  const L = [`# Reproducibility audit — ${suiteId}`, '', `- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.srcDirty ? ' (+uncommitted src)' : ''} · ${prov.cpu}`, '', '| Matchup | Re-played games | Identical (outcome + all moves) |', '|---|---:|---:|'];
  let total = 0;
  let same = 0;
  for (const m of suite.matchups) {
    if (m.config.budget.mode !== 'fixed') continue;
    const hash = hashOf(m.config);
    const games = readGames(join(root, m.id)).filter((g) => g.configHash === hash);
    if (games.length === 0) continue;
    const scheduled = scheduleFor(m.config, suite.maxGames);
    const picks = Array.from({ length: Math.min(sample, games.length) }, (_, i) => games[Math.floor((i * games.length) / Math.min(sample, games.length))]);
    let ok = 0;
    for (const g of picks) {
      const again = await playScheduledGame(m.config, scheduled[g.index], inProcessFactory);
      if (again.outcome === g.outcome && again.moves.join(' ') === g.moves.join(' ')) ok++;
      else process.stdout.write(`MISMATCH ${m.id} game ${g.index}\n`);
    }
    total += picks.length;
    same += ok;
    L.push(`| ${m.id} | ${picks.length} | ${ok} |`);
  }
  L.push('', `Total: ${same}/${total} identical.`);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, `REPRODUCIBILITY-${prov.timestamp.replace(/[:.]/g, '-')}.md`), L.join('\n') + '\n');
  process.stdout.write(L.join('\n') + '\n');
  if (same !== total) throw new Error(`${total - same} games did not reproduce`);
}, 3 * 60 * 60 * 1000);
