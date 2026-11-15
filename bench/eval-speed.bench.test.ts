/**
 * Stage 3-D speed A/B of the exact evaluation optimizations (not part of `npm test`):
 * the stage 3-B/3-C implementation ('reference') against the stage 3-D one ('fast'), same search
 * settings (default C1), same positions, interleaved per position so load drift hits both alike.
 *
 *   npx vitest run --config vitest.bench.config.ts bench/eval-speed.bench.test.ts
 *   env: PER_PHASE (default 30) · DEPTH (default 5) · TIME (ms, default 300) · REPS (default 3) · SEQ_GAMES (default 6)
 * → bench/results/stage3d/eval-speed-<timestamp>.md
 *
 *  1. fixed depth: CPU time per search and per node; node counts, root scores and best moves must be
 *     identical (counted, not assumed);
 *  2. 300 ms per move: completed depth and nodes per move, searches started cold (no table kept);
 *  3. persistent tables over replayed games (one agent per side, as in play): completed depth.
 * Absolute times depend on power and load (recorded); only the ratio between variants is comparable.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { it } from 'vitest';
import { DEFAULT_MINIMAX_SETTINGS, createMinimaxCache, decideMinimax } from '../src/ai/minimaxAgent';
import { ALPHA_BETA_EVAL, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { MinimaxSettings } from '../src/ai/types';
import type { GameState } from '../src/engine';
import { collectProvenance } from './lib/provenance';
import { loadGames, samplePositions } from './lib/realPositions';

type Kernel = 'reference' | 'fast';
const KERNELS: Kernel[] = ['reference', 'fast'];
const cfg = (kernel: Kernel, patch: Partial<MinimaxSettings> = {}): MinimaxSettings => ({
  ...DEFAULT_MINIMAX_SETTINGS,
  wallFilter: 'opponent-path',
  pathKernel: 'masked',
  evaluation: ALPHA_BETA_EVAL,
  evalKernel: kernel,
  ...patch,
});

it('evaluation speed A/B', () => {
  const perPhase = Number(process.env.PER_PHASE ?? 30);
  const depth = Number(process.env.DEPTH ?? 5);
  const timeMs = Number(process.env.TIME ?? 300);
  const reps = Number(process.env.REPS ?? 3);
  const all = loadGames();
  const pos = samplePositions(all, perPhase);
  const prov = collectProvenance();
  const L: string[] = [
    '# Stage 3-D — evaluation speed A/B (reference vs fast)',
    '',
    `- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.dirty ? ' (dirty)' : ''} · power ${prov.power} · ${prov.cpu}`,
    `- ${Object.entries(pos).map(([k, v]) => `${k} ${v.length}`).join(', ')} positions · default (C1) search · evaluation E6 · ${reps} interleaved repetitions`,
    '',
    `## Fixed depth ${depth}`,
    '',
    '| Phase | ref ms | fast ms | speed-up | nodes | node/score/move/PV identical | ref µs/node | fast µs/node |',
    '|---|---:|---:|---:|---:|---|---:|---:|',
  ];
  for (const [phase, ps] of Object.entries(pos)) {
    const ms: Record<Kernel, number[]> = { reference: [], fast: [] };
    let nodes = 0;
    let same = 0;
    let checked = 0;
    for (let r = 0; r < reps; r++) {
      const res: Record<Kernel, ReturnType<typeof runSearch>[]> = { reference: [], fast: [] };
      const t: Record<Kernel, number> = { reference: 0, fast: 0 };
      for (const s of ps) {
        for (const k of r % 2 === 0 ? KERNELS : [...KERNELS].reverse()) {
          const t0 = performance.now();
          res[k].push(runSearch(s, cfg(k, { maxDepth: depth, timeLimitMs: 0 }), createDistanceEvaluator(ALPHA_BETA_EVAL)));
          t[k] += performance.now() - t0;
        }
      }
      for (const k of KERNELS) ms[k].push(t[k]);
      if (r === 0) {
        nodes = res.reference.reduce((a, x) => a + x.stats.nodes, 0);
        res.reference.forEach((a, i) => {
          const b = res.fast[i];
          checked++;
          if (a.stats.nodes === b.stats.nodes && a.score === b.score && JSON.stringify(a.bestAction) === JSON.stringify(b.bestAction) && JSON.stringify(a.pv) === JSON.stringify(b.pv)) same++;
        });
      }
    }
    const best = (a: number[]) => Math.min(...a);
    const r = best(ms.reference);
    const f = best(ms.fast);
    L.push(`| ${phase} | ${r.toFixed(0)} | ${f.toFixed(0)} | **×${(r / f).toFixed(2)}** | ${nodes.toLocaleString('en-US')} | ${same}/${checked} | ${((1000 * r) / nodes).toFixed(2)} | ${((1000 * f) / nodes).toFixed(2)} |`);
  }

  L.push('', `## ${timeMs} ms per move, cold start (no table kept between moves)`, '', '| Phase | Variant | completed depth | nodes / move |', '|---|---|---:|---:|');
  for (const [phase, ps] of Object.entries(pos)) {
    const acc: Record<Kernel, { d: number; n: number }> = { reference: { d: 0, n: 0 }, fast: { d: 0, n: 0 } };
    for (let r = 0; r < reps; r++) {
      for (const s of ps) {
        for (const k of r % 2 === 0 ? KERNELS : [...KERNELS].reverse()) {
          const res = runSearch(s, cfg(k, { maxDepth: 30, timeLimitMs: timeMs }), createDistanceEvaluator(ALPHA_BETA_EVAL));
          acc[k].d += res.completedDepth;
          acc[k].n += res.stats.nodes;
        }
      }
    }
    const cnt = reps * ps.length;
    for (const k of KERNELS) L.push(`| ${phase} | ${k} | ${(acc[k].d / cnt).toFixed(2)} | ${(acc[k].n / cnt).toFixed(0)} |`);
  }

  const seqGames = all.filter((_, i) => i % 20 === 0).slice(0, Number(process.env.SEQ_GAMES ?? 6));
  L.push('', `## Persistent tables over ${seqGames.length} replayed games (${timeMs} ms, one agent per side, as in play)`, '', '| Variant | completed depth | nodes / move | moves |', '|---|---:|---:|---:|');
  for (const k of KERNELS) {
    let d = 0;
    let nodes = 0;
    let moves = 0;
    for (const g of seqGames) {
      const caches = [createMinimaxCache(), createMinimaxCache()];
      for (const s of g as GameState[]) {
        const tr = decideMinimax(s, cfg(k, { maxDepth: 30, timeLimitMs: timeMs }), undefined, caches[s.currentPlayer]);
        d += tr.completedDepth;
        nodes += tr.stats.nodes;
        moves++;
      }
    }
    L.push(`| ${k} | ${(d / moves).toFixed(2)} | ${(nodes / moves).toFixed(0)} | ${moves} |`);
  }
  L.splice(3, 0, `- machine CPU threads ${cpus().length} (this process uses one)`);
  mkdirSync('bench/results/stage3d', { recursive: true });
  const out = `bench/results/stage3d/eval-speed-${prov.timestamp.replace(/[:.]/g, '-')}.md`;
  writeFileSync(out, L.join('\n') + '\n');
  process.stdout.write(L.join('\n') + `\n→ ${out}\n`);
}, 3 * 60 * 60 * 1000);
