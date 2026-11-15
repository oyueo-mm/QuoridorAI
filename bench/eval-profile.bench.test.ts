/**
 * Stage 3-D: where does the E6 evaluation spend its time? (not part of `npm test`)
 *
 *   npx vitest run --config vitest.bench.config.ts bench/eval-profile.bench.test.ts
 *   env: PER_PHASE (default 30) · DEPTH (default 5)
 * → bench/results/stage3d/eval-profile-<timestamp>.md
 *
 * Per game phase (real positions): fixed-depth search with the default (C1) settings under the V8
 * sampling profiler (self time by function), the vulnerability cache's query/hit counts, the work
 * per cache miss (candidate walls, resumed BFS layers) and a micro replay of the recorded miss
 * queries split into path / candidate generation / prepare / resumed queries.
 * Timing shares are relative; run on AC power with the machine idle for absolute numbers.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEFAULT_MINIMAX_SETTINGS } from '../src/ai/minimaxAgent';
import { ALPHA_BETA_EVAL, createDistanceEvaluator, vulnerabilityFast, vulnerabilityReference } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import {
  extraWallCounters,
  goalRow,
  isWallAnchorInBounds,
  layeredCounters,
  prepareExtraWallDistances,
  preparedDistanceWithExtraWall,
  shortestPath,
  wallConflicts,
  wallsCuttingPath,
} from '../src/engine';
import type { GameState, PlayerId } from '../src/engine';
import { profileCpu } from './lib/cpuProfile';
import { collectProvenance } from './lib/provenance';
import { loadGames, samplePositions } from './lib/realPositions';

const cfg = (depth: number, evalKernel: 'fast' | 'reference' = (process.env.KERNEL as 'fast' | 'reference' | undefined) ?? 'reference') => ({ ...DEFAULT_MINIMAX_SETTINGS, evalKernel, wallFilter: 'opponent-path' as const, pathKernel: 'masked' as const, evaluation: ALPHA_BETA_EVAL, maxDepth: depth, timeLimitMs: 0 });

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1e-9, b)).toFixed(1)}%`;

it('E6 evaluation profile', async () => {
  const perPhase = Number(process.env.PER_PHASE ?? 30);
  const depth = Number(process.env.DEPTH ?? 5);
  const pos = samplePositions(loadGames(), perPhase);
  const prov = collectProvenance();
  const L: string[] = [
    '# Stage 3-D — E6 evaluation profile',
    '',
    `- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.dirty ? ' (dirty)' : ''} · power ${prov.power} · ${prov.cpu}`,
    `- fixed depth ${depth}, default (C1) settings, evaluation kernel ${process.env.KERNEL ?? 'reference'}, ${Object.entries(pos).map(([k, v]) => `${k} ${v.length}`).join(', ')} positions`,
    '',
  ];
  for (const [phase, ps] of Object.entries(pos)) {
    const misses: { state: GameState; player: PlayerId }[] = [];
    let queries = 0;
    let hits = 0;
    let sameLayout = 0;
    const probe = {
      query: (hit: boolean, layout: boolean) => {
        queries++;
        if (hit) hits++;
        if (layout) sameLayout++;
      },
      miss: (state: GameState, player: PlayerId) => misses.push({ state, player }),
    };
    let nodes = 0;
    let leaves = 0;
    const counters0 = { ...extraWallCounters };
    const { profile } = await profileCpu(() => {
      for (const s of ps) {
        const r = runSearch(s, cfg(depth), createDistanceEvaluator(ALPHA_BETA_EVAL, probe));
        nodes += r.stats.nodes;
        leaves += r.stats.leaves;
      }
    });
    const dc = Object.fromEntries(Object.entries(extraWallCounters).map(([k, v]) => [k, v - counters0[k as keyof typeof counters0]]));
    const total = profile.totalMs;
    L.push(`## ${phase}: ${ps.length} positions, ${nodes.toLocaleString('en-US')} nodes (${leaves.toLocaleString('en-US')} leaves), ${total.toFixed(0)} ms profiled`, '');
    L.push(`- vulnerability queries ${queries.toLocaleString('en-US')} (${(queries / nodes).toFixed(2)} per node): hit ${pct(hits, queries)}, same layout object as previous query ${pct(sameLayout, queries)}, misses ${misses.length.toLocaleString('en-US')} (${(misses.length / nodes).toFixed(2)} per node)`);
    L.push(`- per miss: prepare BFS layers ${(dc.prepareLayers / Math.max(1, dc.prepares)).toFixed(1)}, candidate-wall queries ${(dc.queries / Math.max(1, dc.prepares)).toFixed(1)}, resumed ${(dc.resumed / Math.max(1, dc.prepares)).toFixed(1)} (${pct(dc.resumed, dc.queries)} of queries), layers per resumed query ${(dc.resumedLayers / Math.max(1, dc.resumed)).toFixed(1)}`);
    L.push('', '| Inclusive / self time | ms | share |', '|---|---:|---:|');
    const incl = profile.inclusiveByFunction;
    for (const k of ['evaluate', 'childEvaluator', 'expand', 'materialize', 'shortestPath', 'distanceToRow', 'distanceMap', 'wallConflicts', 'hashState']) if (incl[k] !== undefined) L.push(`| inclusive ${k} | ${incl[k].toFixed(0)} | ${pct(incl[k], total)} |`);
    const sf = Object.entries(profile.selfByFunction).sort((a, b) => b[1] - a[1]).slice(0, 22);
    for (const [fn, ms] of sf) L.push(`| self ${fn} | ${ms.toFixed(0)} | ${pct(ms, total)} |`);
    const comp = Object.entries(profile.selfByComponent).sort((a, b) => b[1] - a[1]);
    L.push('', 'Self time by component: ' + comp.map(([k, v]) => `${k} ${pct(v, total)}`).join(' · '), '');

    // ---- micro replay of the recorded misses (what one vulnerability() costs, by part)
    const sample = misses.filter((_, i) => i % Math.max(1, Math.floor(misses.length / 3000)) === 0).slice(0, 3000);
    const reps = 5;
    const timeIt = (f: () => void) => {
      f();
      const t0 = performance.now();
      for (let r = 0; r < reps; r++) f();
      return ((performance.now() - t0) * 1000) / (reps * sample.length);
    };
    // Work per miss of the fast implementation (counters, independent of timing noise).
    const lc0 = { ...layeredCounters };
    sample.forEach((m) => vulnerabilityFast(m.state, m.player));
    const lc = Object.fromEntries(Object.entries(layeredCounters).map(([k, v]) => [k, v - lc0[k as keyof typeof lc0]]));
    L.push(`Fast implementation work per miss: candidate queries ${(lc.queries / sample.length).toFixed(2)} (${(lc.resumed / sample.length).toFixed(2)} resumed, ${(lc.layers / Math.max(1, lc.resumed)).toFixed(1)} layers each) — reference: candidate queries ${(dc.queries / Math.max(1, dc.prepares)).toFixed(2)}, layers ${(dc.resumedLayers / Math.max(1, dc.prepares)).toFixed(1)} per miss`);
    const full = timeIt(() => sample.forEach((m) => vulnerabilityReference(m.state, m.player)));
    const fullFast = timeIt(() => sample.forEach((m) => vulnerabilityFast(m.state, m.player)));
    const pathOnly = timeIt(() => sample.forEach((m) => shortestPath(m.state, m.state.pawns[m.player], goalRow(m.player))));
    const paths = sample.map((m) => shortestPath(m.state, m.state.pawns[m.player], goalRow(m.player)));
    const cands = timeIt(() => paths.forEach((p) => p && wallsCuttingPath(p)));
    const prep = timeIt(() => sample.forEach((m) => prepareExtraWallDistances(m.state, m.state.pawns[m.player], goalRow(m.player))));
    const conflicts = timeIt(() =>
      sample.forEach((m, i) => {
        const p = paths[i];
        if (!p) return;
        for (const w of wallsCuttingPath(p)) if (isWallAnchorInBounds(w.row, w.col)) wallConflicts(m.state, w.orientation, w.row, w.col);
      }),
    );
    const resume = timeIt(() =>
      sample.forEach((m, i) => {
        const p = paths[i];
        if (!p) return;
        prepareExtraWallDistances(m.state, m.state.pawns[m.player], goalRow(m.player));
        for (const w of wallsCuttingPath(p)) if (isWallAnchorInBounds(w.row, w.col)) preparedDistanceWithExtraWall(w.orientation, w.row, w.col);
      }),
    );
    // Distribution of the single-wall increase over the candidate walls (what a "no increase" prune could skip).
    const incHist = [0, 0, 0, 0, 0];
    let legalWalls = 0;
    sample.forEach((m, i) => {
      const p = paths[i];
      if (!p) return;
      const d = p.length - 1;
      prepareExtraWallDistances(m.state, m.state.pawns[m.player], goalRow(m.player));
      for (const w of wallsCuttingPath(p)) {
        if (!isWallAnchorInBounds(w.row, w.col) || wallConflicts(m.state, w.orientation, w.row, w.col)) continue;
        const d2 = preparedDistanceWithExtraWall(w.orientation, w.row, w.col);
        legalWalls++;
        incHist[Number.isFinite(d2) ? Math.min(4, d2 - d) : 4]++;
      }
    });
    L.push(`Increase of the candidate walls (${(legalWalls / sample.length).toFixed(1)} legal candidates per miss): +0 ${pct(incHist[0], legalWalls)} · +1 ${pct(incHist[1], legalWalls)} · +2 ${pct(incHist[2], legalWalls)} · +3 ${pct(incHist[3], legalWalls)} · ≥+4 or disconnecting ${pct(incHist[4], legalWalls)}`);
    const avgPath = paths.reduce((a, p) => a + (p ? p.length - 1 : 0), 0) / sample.length;
    L.push(`Micro replay of ${sample.length} cache misses (µs per miss; path length ${avgPath.toFixed(1)}): full vulnerability reference **${full.toFixed(2)}** / fast **${fullFast.toFixed(2)}** (×${(full / fullFast).toFixed(2)}) · shortestPath ${pathOnly.toFixed(2)} · wallsCuttingPath ${cands.toFixed(2)} (+conflict checks ${(conflicts - cands).toFixed(2)}) · prepare ${prep.toFixed(2)} · prepare + all candidate queries ${resume.toFixed(2)}`, '');
  }
  mkdirSync('bench/results/stage3d', { recursive: true });
  const out = `bench/results/stage3d/eval-profile-${prov.timestamp.replace(/[:.]/g, '-')}.md`;
  writeFileSync(out, L.join('\n') + '\n');
  process.stdout.write(L.join('\n') + `\n→ ${out}\n`);
}, 60 * 60 * 1000);
