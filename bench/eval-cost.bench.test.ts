/**
 * Cost gate for an evaluation candidate, run BEFORE any games (not part of `npm test`):
 *   1. fixed depth 4: search time and nodes vs the baseline → cost per node
 *   2. 300 ms per move: nodes per move and completed depth vs the baseline → expected ply loss
 * on real mid-game positions (every 16th position of 10 recorded stage 3-B games). Interleaved
 * repetitions; ratios are what count (absolute times depend on load and power).
 *
 *   $env:EVAL='E6'; $env:BASE='E5'; npx vitest run --config vitest.bench.config.ts bench/eval-cost.bench.test.ts
 * → bench/results/stage3b/cost-gate-<EVAL>-<timestamp>.md
 *
 * Why: stage 3-B's synthetic cost benchmark (opening positions) put E4 at 3.8×; in real games it
 * cost 5× per node and lost 2 ply at 300 ms, which turned +84 Elo at depth 4 into −14 at 300 ms.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEFAULT_MINIMAX_SETTINGS } from '../src/ai/minimaxAgent';
import { ALPHA_BETA_EVAL, RACE_EVAL_V1, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { MinimaxEvalWeights } from '../src/ai/types';
import { parseMoveList } from '../src/arena/openings';
import { openingState } from '../src/arena/tournament';
import type { GameState } from '../src/engine';
import { collectProvenance } from './lib/provenance';
import { E6, EVAL_CANDIDATES } from './stage3b-candidates';

const NAMED: Record<string, MinimaxEvalWeights> = { v1: RACE_EVAL_V1, E5: ALPHA_BETA_EVAL, E6, ...EVAL_CANDIDATES };
const GAMES = 'bench/results/stage3b/stage3b-fixed/F-E4-d4/games.s0of3.jsonl';

function gamePositions(): GameState[] {
  const lines = readFileSync(GAMES, 'utf8').split('\n').filter(Boolean).slice(0, 10);
  return lines
    .flatMap((l) => {
      const r = JSON.parse(l) as { moves: string[]; opening: Parameters<typeof openingState>[0] };
      return parseMoveList(r.moves.join(' '), openingState(r.opening)).positions.filter((s) => s.winner === null);
    })
    .filter((_, i) => i % 16 === 0);
}

const SETTINGS = { ...DEFAULT_MINIMAX_SETTINGS, wallFilter: 'opponent-path' as const, pathKernel: 'masked' as const };

function fixedDepth(w: MinimaxEvalWeights, pos: GameState[]) {
  const ev = createDistanceEvaluator(w);
  let nodes = 0;
  const t0 = performance.now();
  for (const s of pos) nodes += runSearch(s, { ...SETTINGS, maxDepth: 4, timeLimitMs: 0, evaluation: w }, ev).stats.nodes;
  return { ms: performance.now() - t0, nodes };
}

function timed(w: MinimaxEvalWeights, pos: GameState[]) {
  let nodes = 0;
  let depth = 0;
  for (const s of pos) {
    const r = runSearch(s, { ...SETTINGS, maxDepth: 30, timeLimitMs: 300, evaluation: w }, createDistanceEvaluator(w));
    nodes += r.stats.nodes;
    depth += r.completedDepth;
  }
  return { nodes: nodes / pos.length, depth: depth / pos.length };
}

it('evaluation cost gate', () => {
  const id = process.env.EVAL ?? 'E6';
  const baseId = process.env.BASE ?? 'E5';
  const w = NAMED[id];
  const b = NAMED[baseId];
  if (!w || !b) throw new Error(`EVAL/BASE must be one of ${Object.keys(NAMED).join(', ')}`);
  const pos = gamePositions();
  const f = { cand: [] as { ms: number; nodes: number }[], base: [] as { ms: number; nodes: number }[] };
  const t = { cand: [] as { nodes: number; depth: number }[], base: [] as { nodes: number; depth: number }[] };
  for (let rep = 0; rep < 2; rep++) {
    f.base.push(fixedDepth(b, pos));
    f.cand.push(fixedDepth(w, pos));
    t.base.push(timed(b, pos));
    t.cand.push(timed(w, pos));
  }
  const best = (a: { ms: number; nodes: number }[]) => a.reduce((x, y) => (y.ms < x.ms ? y : x));
  const mean = (a: { nodes: number; depth: number }[]) => ({ nodes: a.reduce((s, x) => s + x.nodes, 0) / a.length, depth: a.reduce((s, x) => s + x.depth, 0) / a.length });
  const fc = best(f.cand);
  const fb = best(f.base);
  const tc = mean(t.cand);
  const tb = mean(t.base);
  const perNode = fc.ms / fc.nodes / (fb.ms / fb.nodes);
  const prov = collectProvenance();
  const L = [
    `# Cost gate — ${id} vs ${baseId}`,
    '',
    `- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.dirty ? ' (dirty)' : ''} · power ${prov.power} · ${prov.cpu}`,
    `- ${pos.length} real game positions (${GAMES}, every 16th position of 10 games); 2 interleaved repetitions.`,
    '',
    '| | ' + id + ' | ' + baseId + ' | ratio |',
    '|---|---:|---:|---:|',
    `| depth 4: time (ms, best of 2) | ${fc.ms.toFixed(0)} | ${fb.ms.toFixed(0)} | ${(fc.ms / fb.ms).toFixed(2)} |`,
    `| depth 4: nodes | ${fc.nodes} | ${fb.nodes} | ${(fc.nodes / fb.nodes).toFixed(2)} |`,
    `| depth 4: cost per node | | | **${perNode.toFixed(2)}×** |`,
    `| 300 ms: nodes per move | ${tc.nodes.toFixed(0)} | ${tb.nodes.toFixed(0)} | ${(tc.nodes / tb.nodes).toFixed(2)} |`,
    `| 300 ms: completed depth | ${tc.depth.toFixed(2)} | ${tb.depth.toFixed(2)} | **${(tc.depth - tb.depth >= 0 ? '+' : '') + (tc.depth - tb.depth).toFixed(2)} ply** |`,
  ];
  mkdirSync('bench/results/stage3b', { recursive: true });
  const out = `bench/results/stage3b/cost-gate-${id}-${prov.timestamp.replace(/[:.]/g, '-')}.md`;
  writeFileSync(out, L.join('\n') + '\n');
  process.stdout.write(L.join('\n') + `\n→ ${out}\n`);
}, 60 * 60 * 1000);
