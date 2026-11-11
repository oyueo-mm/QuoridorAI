/**
 * Stage-2 component benchmark (not part of `npm test`): row-mask BFS vs reference BFS, and
 * the 'path-defense' wall filter vs 'opponent-path', measured separately.
 *
 *   npx vitest run --config vitest.bench.config.ts bench/stage2.bench.test.ts
 *
 * Writes bench/results/stage2/components-<timestamp>.{md,json}. Run on an idle machine.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createBfsAgent } from '../src/ai/bfsAgent';
import { DEFAULT_MINIMAX_SETTINGS, createMinimaxAgent } from '../src/ai/minimaxAgent';
import { pseudoCandidates } from '../src/ai/search/candidates';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { MinimaxSettings } from '../src/ai/types';
import { randomMixedOpening } from '../src/arena/openings';
import { percentile } from '../src/arena/stats';
import {
  createInitialState,
  distanceMap,
  distanceToRow,
  goalRow,
  hasPathToRow,
  legalWallPlacements,
  shortestPath,
  withPathKernel,
} from '../src/engine';
import type { GameState, PathKernel } from '../src/engine';
import { runMatch } from '../src/match/runMatch';
import { collectProvenance } from './lib/provenance';

const PHASES = ['opening (0–3 walls)', 'early (4–8)', 'middle (9–14)', 'late (15–20)'] as const;
type Phase = (typeof PHASES)[number];
const phaseOf = (s: GameState): Phase => {
  const w = 20 - s.wallsRemaining[0] - s.wallsRemaining[1];
  return w <= 3 ? PHASES[0] : w <= 8 ? PHASES[1] : w <= 14 ? PHASES[2] : PHASES[3];
};

/** Same position source as bench/profile (Alpha-Beta(2) vs BFS after mixed openings). */
async function collect(): Promise<Map<Phase, GameState[]>> {
  const b = new Map<Phase, GameState[]>(PHASES.map((p) => [p, []]));
  for (let g = 0; g < 16; g++) {
    const { state: start } = randomMixedOpening({ seed: 9100 + g, plies: 6, wallProbability: 0.25, maxImbalance: 2 });
    const ab = createMinimaxAgent({ maxDepth: 2, timeLimitMs: 0 });
    const seats = g % 2 === 0 ? [ab, createBfsAgent()] as const : [createBfsAgent(), ab] as const;
    const states: GameState[] = [];
    await runMatch(seats, { initialState: start, maxPlies: start.ply + 200, repetitionLimit: 3, onMove: (_, s) => states.push(s) });
    for (const s of [start, ...states]) if (s.winner === null) b.get(phaseOf(s))!.push(s);
  }
  for (const [p, xs] of b) if (xs.length > 40) b.set(p, Array.from({ length: 40 }, (_, i) => xs[Math.floor((i * xs.length) / 40)]));
  return b;
}

function micro(states: readonly GameState[], body: (s: GameState) => unknown): number {
  for (let i = 0; i < 3; i++) for (const s of states) body(s);
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    let reps = 0;
    const t0 = performance.now();
    let t = t0;
    while (t - t0 < 60) {
      for (const s of states) body(s);
      reps++;
      t = performance.now();
    }
    runs.push(((t - t0) * 1000) / (reps * states.length));
  }
  return percentile(runs, 0.5)!;
}

/** States after one wall: new wall arrays, so the mask cache misses (the cost inside wall legality). */
function withFreshWall(states: readonly GameState[]): GameState[] {
  return states.map((s) => {
    const w = legalWallPlacements(s)[0];
    if (!w) return s;
    const hWalls = w.orientation === 'h' ? s.hWalls.slice() : s.hWalls;
    const vWalls = w.orientation === 'v' ? s.vWalls.slice() : s.vWalls;
    (w.orientation === 'h' ? hWalls : vWalls)[w.row * 8 + w.col] = 1;
    return { ...s, hWalls, vWalls };
  });
}

it('stage-2 components', async () => {
  const prov = collectProvenance();
  const buckets = await collect();
  const L: string[] = [];
  const log = (l = '') => {
    L.push(l);
    process.stdout.write(l + '\n');
  };
  const f = (x: number, d = 2) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  log('# Stage 2 — component benchmark');
  log();
  log(`- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.srcDirty ? ' (+uncommitted src)' : ''} · Node ${prov.node} · ${prov.cpu}`);
  log('- Positions: same generator as bench/profile (16 Alpha-Beta(2) vs BFS games after mixed openings), ≤ 40 per phase.');
  log();

  // ---------------------------------------------------------------- 1. primitives
  log('## 1. BFS primitives: reference (cell by cell) vs masked (row bitboards), µs per call');
  log();
  log(`| Operation | ${PHASES.map((p) => `${p} ref / masked / ×`).join(' | ')} |`);
  log(`|---|${PHASES.map(() => '---:|').join('')}`);
  const ops: [string, (s: GameState) => unknown, boolean][] = [
    ['distanceToRow (cached layout)', (s) => distanceToRow(s, s.pawns[0], goalRow(0)), false],
    ['hasPathToRow (cached layout)', (s) => hasPathToRow(s, s.pawns[1], goalRow(1)), false],
    ['distanceMap', (s) => distanceMap(s, goalRow(0)), false],
    ['shortestPath', (s) => shortestPath(s, s.pawns[0], goalRow(0)), false],
    ['distanceToRow (new layout, mask build included)', (s) => distanceToRow(s, s.pawns[0], goalRow(0)), true],
  ];
  const micros: Record<string, Record<string, [number, number]>> = {};
  for (const [name, body, fresh] of ops) {
    micros[name] = {};
    const cells = PHASES.map((p) => {
      const base = buckets.get(p)!;
      const timeWith = (k: PathKernel) =>
        withPathKernel(k, () => {
          // Fresh copies per measurement so every call misses the cache.
          if (!fresh) return micro(base, body);
          let pool = withFreshWall(base);
          return micro(base, (s) => {
            void s;
            const x = pool.pop() ?? (pool = withFreshWall(base)).pop()!;
            return body(x);
          });
        });
      const ref = timeWith('reference');
      const msk = timeWith('masked');
      micros[name][p] = [ref, msk];
      return `${f(ref)} / ${f(msk)} / ${f(ref / msk, 1)}×`;
    });
    log(`| ${name} | ${cells.join(' | ')} |`);
  }
  log();
  log('"new layout" rows rebuild the masks on every call (each child after a wall has new arrays); they include allocating the copied position, so they are an upper bound.');
  log();

  // ---------------------------------------------------------------- 2. fixed-depth search
  const evaluator = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);
  const pick = (p: Phase, n: number) => {
    const xs = buckets.get(p)!;
    return Array.from({ length: n }, (_, i) => xs[Math.floor(((i + 0.5) * xs.length) / n)]);
  };
  const positions: [string, GameState][] = [['initial', createInitialState()], ...PHASES.flatMap((p) => pick(p, 2).map((s, i) => [`${p} #${i + 1}`, s] as [string, GameState]))];
  const search = (s: GameState, patch: Partial<MinimaxSettings>) => runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, timeLimitMs: 0, ...patch }, evaluator);

  log('## 2. Fixed-depth Alpha-Beta (depth 5): kernel × wall filter');
  log();
  log('| Position | opp-path ref: nodes / ms | opp-path masked: ms (×) | path-defense masked: nodes / ms | candidates opp-path → path-defense (root) |');
  log('|---|---:|---:|---:|---:|');
  const searchRows: Record<string, unknown>[] = [];
  let sumRef = 0;
  let sumMask = 0;
  let sumDef = 0;
  let nodesRef = 0;
  let nodesDef = 0;
  for (const [name, s] of positions) {
    search(s, { maxDepth: 3, pathKernel: 'reference' }); // warm-up
    search(s, { maxDepth: 3, pathKernel: 'masked' });
    const a = search(s, { maxDepth: 5, wallFilter: 'opponent-path', pathKernel: 'reference' });
    const b = search(s, { maxDepth: 5, wallFilter: 'opponent-path', pathKernel: 'masked' });
    const c = search(s, { maxDepth: 5, wallFilter: 'path-defense', pathKernel: 'masked' });
    if (a.stats.nodes !== b.stats.nodes || a.score !== b.score) throw new Error(`kernel changed the search at ${name}`);
    sumRef += a.stats.elapsedMs;
    sumMask += b.stats.elapsedMs;
    sumDef += c.stats.elapsedMs;
    nodesRef += a.stats.nodes;
    nodesDef += c.stats.nodes;
    const cand = (flt: MinimaxSettings['wallFilter']) => pseudoCandidates(s, flt).length;
    searchRows.push({ name, ref: a.stats, masked: b.stats, defense: c.stats, scoreSame: a.score === c.score });
    log(`| ${name} | ${f(a.stats.nodes, 0)} / ${f(a.stats.elapsedMs, 0)} | ${f(b.stats.elapsedMs, 0)} (${f(a.stats.elapsedMs / b.stats.elapsedMs, 1)}×) | ${f(c.stats.nodes, 0)} / ${f(c.stats.elapsedMs, 0)} | ${cand('opponent-path')} → ${cand('path-defense')} |`);
  }
  log(`| **total** | ${f(nodesRef, 0)} / ${f(sumRef, 0)} | ${f(sumMask, 0)} (${f(sumRef / sumMask, 2)}×) | ${f(nodesDef, 0)} / ${f(sumDef, 0)} | |`);
  log();
  log('Masked and reference searches visited identical node counts with identical scores at every position (checked above; the run aborts otherwise).');
  log();

  // ---------------------------------------------------------------- 3. depth under a time limit
  log('## 3. Completed depth and nodes/s under a time limit (mean over the positions above)');
  log();
  log('| Variant | 300 ms: depth / kNodes/s | 2000 ms: depth / kNodes/s |');
  log('|---|---:|---:|');
  const variants: [string, Partial<MinimaxSettings>][] = [
    ['opponent-path, reference BFS (stage 1)', { wallFilter: 'opponent-path', pathKernel: 'reference' }],
    ['opponent-path, masked BFS', { wallFilter: 'opponent-path', pathKernel: 'masked' }],
    ['path-defense, masked BFS', { wallFilter: 'path-defense', pathKernel: 'masked' }],
  ];
  const timed: Record<string, unknown> = {};
  for (const [label, patch] of variants) {
    const cells = [300, 2000].map((ms) => {
      let depth = 0;
      let rate = 0;
      for (const [, s] of positions) {
        const r = runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: 30, timeLimitMs: ms, ...patch }, evaluator);
        depth += r.completedDepth;
        rate += r.stats.nodes / r.stats.elapsedMs;
      }
      timed[`${label}@${ms}`] = { depth: depth / positions.length, kNodesPerSec: rate / positions.length };
      return `${f(depth / positions.length, 2)} / ${f(rate / positions.length, 1)}`;
    });
    log(`| ${label} | ${cells.join(' | ')} |`);
  }
  log();

  mkdirSync('bench/results/stage2', { recursive: true });
  const stamp = prov.timestamp.replace(/[:.]/g, '-');
  writeFileSync(`bench/results/stage2/components-${stamp}.md`, L.join('\n') + '\n');
  writeFileSync(`bench/results/stage2/components-${stamp}.json`, JSON.stringify({ provenance: prov, micros, searchRows, timed }, null, 1) + '\n');
}, 60 * 60 * 1000);
