/**
 * Stage-1 bottleneck profile (not part of `npm test`).
 *
 *   npx vitest run --config vitest.bench.config.ts bench/profile.bench.test.ts
 *
 * 1. Micro costs of every engine/search primitive, per game phase (µs per call).
 * 2. CPU sampling profiles of real Alpha-Beta and MCTS searches (300 ms and 2 s per move),
 *    split by component and search phase, with search statistics, GC events and heap growth.
 *
 * Writes bench/results/stage1/profile/profile-<timestamp>.{md,json} (never overwrites).
 * Run it on an otherwise idle machine: concurrent load changes every timing.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import { it } from 'vitest';
import { createBfsAgent } from '../src/ai/bfsAgent';
import { DEFAULT_GUIDED_MCTS_SETTINGS, DEFAULT_MCTS_SETTINGS, decideMcts } from '../src/ai/mctsAgent';
import { DEFAULT_MINIMAX_SETTINGS, createMinimaxAgent } from '../src/ai/minimaxAgent';
import { pseudoCandidates } from '../src/ai/search/candidates';
import { RACE_EVAL_V1, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { MctsSettings, MinimaxSettings } from '../src/ai/types';
import { randomMixedOpening } from '../src/arena/openings';
import { percentile } from '../src/arena/stats';
import {
  WALL_GRID,
  applyAction,
  applyActionUnchecked,
  checkWallPlacement,
  createInitialState,
  distanceMap,
  distanceToRow,
  goalRow,
  hashState,
  legalActions,
  legalPawnMoves,
  legalWallPlacements,
  legalWallPlacementsBruteForce,
  shortestPath,
  wallConflicts,
} from '../src/engine';
import type { Action, GameState, Orientation } from '../src/engine';
import { runMatch } from '../src/match/runMatch';
import { profileCpu } from './lib/cpuProfile';
import type { ProfileBreakdown } from './lib/cpuProfile';
import { collectProvenance } from './lib/provenance';

const OUT = 'bench/results/stage1/profile';
const PHASES = ['initial', 'opening (0–3 walls on board)', 'early (4–8)', 'middle (9–14)', 'late (15–20)'] as const;
type Phase = (typeof PHASES)[number];

const wallsOnBoard = (s: GameState) => 20 - s.wallsRemaining[0] - s.wallsRemaining[1];
const phaseOf = (s: GameState): Phase => {
  const w = wallsOnBoard(s);
  return w <= 3 ? PHASES[1] : w <= 8 ? PHASES[2] : w <= 14 ? PHASES[3] : PHASES[4];
};

/** Positions from Alpha-Beta(2) vs BFS games after mixed openings, bucketed by walls on board. */
async function collectPositions(): Promise<Map<Phase, GameState[]>> {
  const buckets = new Map<Phase, GameState[]>(PHASES.map((p) => [p, []]));
  buckets.get('initial')!.push(createInitialState());
  for (let g = 0; g < 16; g++) {
    const { state: start } = randomMixedOpening({ seed: 9100 + g, plies: 6, wallProbability: 0.25, maxImbalance: 2 });
    const agents = [createMinimaxAgent({ maxDepth: 2, timeLimitMs: 0 }), createBfsAgent()] as const;
    const seats = g % 2 === 0 ? [agents[0], agents[1]] as const : [agents[1], agents[0]] as const;
    const states: GameState[] = [];
    await runMatch(seats, { initialState: start, maxPlies: start.ply + 200, repetitionLimit: 3, onMove: (_, s) => states.push(s) });
    for (const s of [start, ...states]) if (s.winner === null) buckets.get(phaseOf(s))!.push(s);
  }
  // Evenly spaced sample (deterministic) of at most 40 per bucket.
  for (const [p, xs] of buckets) {
    if (xs.length > 40) buckets.set(p, Array.from({ length: 40 }, (_, i) => xs[Math.floor((i * xs.length) / 40)]));
  }
  return buckets;
}

/** µs per call: repeats `body` over all positions until ≥ 60 ms, median of 5 such runs. */
function micro(states: readonly GameState[], body: (s: GameState) => unknown, callsPerState = 1): number {
  for (let i = 0; i < 3; i++) for (const s of states) body(s); // warm-up / JIT
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
    runs.push(((t - t0) * 1000) / (reps * states.length * callsPerState));
  }
  return percentile(runs, 0.5)!;
}

const ALL_SLOTS: { orientation: Orientation; row: number; col: number }[] = [];
for (const orientation of ['h', 'v'] as const) for (let row = 0; row < WALL_GRID; row++) for (let col = 0; col < WALL_GRID; col++) ALL_SLOTS.push({ orientation, row, col });

let sink = 0;

interface SearchRun {
  agent: string;
  phase: Phase;
  budgetMs: number;
  elapsedMs: number;
  stats: Record<string, number | string | boolean>;
  gc: { count: number; ms: number };
  heapDeltaMB: number;
  profile: ProfileBreakdown;
}

async function measureSearch(agent: string, phase: Phase, budgetMs: number, run: () => Record<string, number | string | boolean>): Promise<SearchRun> {
  const gcEvents: { duration: number }[] = [];
  const obs = new PerformanceObserver((list) => gcEvents.push(...list.getEntries()));
  obs.observe({ entryTypes: ['gc'] });
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const { result, profile } = await profileCpu(run);
  const elapsedMs = performance.now() - t0;
  const heapDeltaMB = (process.memoryUsage().heapUsed - heap0) / 2 ** 20;
  await new Promise((r) => setTimeout(r, 0)); // let the observer flush
  obs.disconnect();
  return {
    agent,
    phase,
    budgetMs,
    elapsedMs,
    stats: result,
    gc: { count: gcEvents.length, ms: gcEvents.reduce((s, e) => s + e.duration, 0) },
    heapDeltaMB,
    profile,
  };
}

it('stage-1 profile', async () => {
  const provenance = collectProvenance();
  const buckets = await collectPositions();
  const md: string[] = [];
  const log = (l = '') => {
    md.push(l);
    process.stdout.write(l + '\n');
  };
  const fmt = (x: number, d = 2) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

  log('# Stage 1 — bottleneck profile');
  log();
  log(`- ${provenance.timestamp} · commit ${provenance.git.commit?.slice(0, 10)}${provenance.git.srcDirty ? ' (+uncommitted src changes)' : ''} · Node ${provenance.node} · ${provenance.cpu} (${provenance.logicalCores} threads)`);
  log('- Positions: Alpha-Beta(2) vs BFS games from 16 mixed openings, bucketed by walls on the board (≤ 40 per bucket, evenly spaced).');
  log(`- Bucket sizes: ${PHASES.map((p) => `${p}: ${buckets.get(p)!.length}`).join(' · ')}`);
  log('- Micro timings: median of 5 runs of ≥ 60 ms each, µs per call, single thread. Absolute values are machine-specific; ratios are what matter.');
  log();

  // ---------------------------------------------------------------- 1. micro
  const evaluator = createDistanceEvaluator(RACE_EVAL_V1);
  type Op = [string, (s: GameState) => unknown, number?];
  // Actions are chosen before timing so the transition cost is measured alone.
  const moveOf = new Map<GameState, Action>();
  const wallOf = new Map<GameState, Action | null>();
  for (const xs of buckets.values()) {
    for (const s of xs) {
      moveOf.set(s, { type: 'move', to: legalPawnMoves(s)[0] });
      const walls = legalWallPlacements(s);
      wallOf.set(s, walls[Math.floor(walls.length / 2)] ?? null);
    }
  }
  const firstMove = (s: GameState): Action => moveOf.get(s)!;
  const firstWall = (s: GameState): Action | null => wallOf.get(s)!;
  const ops: Op[] = [
    ['legalPawnMoves', (s) => legalPawnMoves(s)],
    ['wallConflicts (per slot, 128 slots)', (s) => { for (const w of ALL_SLOTS) sink += wallConflicts(s, w.orientation, w.row, w.col) ? 1 : 0; }, 128],
    ['checkWallPlacement (per slot: conflicts + 2 BFS)', (s) => { for (const w of ALL_SLOTS) sink += checkWallPlacement(s, { type: 'wall', ...w }).length; }, 128],
    ['legalWallPlacements (path-cut shortcut)', (s) => legalWallPlacements(s)],
    ['legalWallPlacementsBruteForce', (s) => legalWallPlacementsBruteForce(s)],
    ['legalActions', (s) => legalActions(s)],
    ['pseudoCandidates (opponent-path filter)', (s) => pseudoCandidates(s, 'opponent-path')],
    ['distanceToRow (one player)', (s) => distanceToRow(s, s.pawns[0], goalRow(0))],
    ['shortestPath (one player)', (s) => shortestPath(s, s.pawns[0], goalRow(0))],
    ['distanceMap (one goal row)', (s) => distanceMap(s, goalRow(0))],
    ['applyActionUnchecked (pawn move)', (s) => applyActionUnchecked(s, firstMove(s))],
    ['applyAction (pawn move, legality checked)', (s) => applyAction(s, firstMove(s))],
    ['hashState', (s) => hashState(s)],
    ['evaluator.evaluate (2 BFS)', (s) => evaluator.evaluate(s, s.currentPlayer)],
    ['childEvaluator setup (2 distance maps)', (s) => evaluator.childEvaluator!(s, s.currentPlayer)],
  ];
  const wallOps: Op[] = [
    ['applyActionUnchecked (wall, copies a Uint8Array)', (s) => { const w = firstWall(s); return w ? applyActionUnchecked(s, w) : null; }],
  ];
  const results: Record<string, Record<string, number>> = {};
  log('## 1. Primitive costs by phase (µs per call)');
  log();
  log(`| Operation | ${PHASES.join(' | ')} |`);
  log(`|---|${PHASES.map(() => '---:|').join('')}`);
  for (const [name, body, per] of [...ops, ...wallOps]) {
    results[name] = {};
    const cells = PHASES.map((p) => {
      const states = buckets.get(p)!.filter((s) => (name.includes('wall,') ? s.wallsRemaining[s.currentPlayer] > 0 : true));
      if (states.length === 0) return '—';
      const us = micro(states, body, per ?? 1);
      results[name][p] = us;
      return fmt(us, us < 1 ? 3 : 2);
    });
    log(`| ${name} | ${cells.join(' | ')} |`);
  }
  log();
  // Context numbers: how many candidates each generator produces.
  log('| Candidates per position (mean) | ' + PHASES.join(' | ') + ' |');
  log(`|---|${PHASES.map(() => '---:|').join('')}`);
  const meanOf = (p: Phase, f: (s: GameState) => number) => {
    const xs = buckets.get(p)!.map(f);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  log(`| legal pawn moves | ${PHASES.map((p) => fmt(meanOf(p, (s) => legalPawnMoves(s).length), 1)).join(' | ')} |`);
  log(`| legal walls | ${PHASES.map((p) => fmt(meanOf(p, (s) => legalWallPlacements(s).length), 1)).join(' | ')} |`);
  log(`| search candidates (opponent-path) | ${PHASES.map((p) => fmt(meanOf(p, (s) => pseudoCandidates(s, 'opponent-path').length), 1)).join(' | ')} |`);
  log(`| shortest path lengths (P0 / P1) | ${PHASES.map((p) => `${fmt(meanOf(p, (s) => distanceToRow(s, s.pawns[0], 0)), 1)} / ${fmt(meanOf(p, (s) => distanceToRow(s, s.pawns[1], 8)), 1)}`).join(' | ')} |`);
  log();

  // ---------------------------------------------------------------- 2. searches
  const pick = (p: Phase, n: number) => {
    const xs = buckets.get(p)!;
    return Array.from({ length: Math.min(n, xs.length) }, (_, i) => xs[Math.floor(((i + 0.5) * xs.length) / Math.min(n, xs.length))]);
  };
  const runs: SearchRun[] = [];
  const ab = (ms: number): MinimaxSettings => ({ ...DEFAULT_MINIMAX_SETTINGS, maxDepth: 30, timeLimitMs: ms });
  const mcts = (base: MctsSettings, ms: number): MctsSettings => ({ ...base, iterations: 1e9, timeLimitMs: ms });
  for (const budgetMs of [300, 2000]) {
    for (const p of PHASES) {
      for (const s of pick(p, p === 'initial' ? 1 : 2)) {
        runs.push(
          await measureSearch('alphabeta', p, budgetMs, () => {
            const r = runSearch(s, ab(budgetMs), evaluator);
            return {
              depth: r.completedDepth,
              decided: r.decided,
              nodes: r.stats.nodes,
              leaves: r.stats.leaves,
              orderingEvals: r.stats.orderingEvals,
              cutoffs: r.stats.cutoffs,
              prunedMoves: r.stats.prunedMoves,
              ttProbes: r.stats.ttProbes,
              ttHits: r.stats.ttHits,
              ttCutoffs: r.stats.ttCutoffs,
              legal: r.legalActionCount,
              searched: r.searchedActionCount,
            };
          }),
        );
        for (const [name, base] of [['mcts-guided', DEFAULT_GUIDED_MCTS_SETTINGS], ['mcts-pure', DEFAULT_MCTS_SETTINGS]] as const) {
          if (name === 'mcts-pure' && budgetMs > 300) continue;
          runs.push(
            await measureSearch(name, p, budgetMs, () => {
              const t = decideMcts(s, mcts(base, budgetMs), 1);
              return {
                simulations: t.simulations,
                treeNodes: t.treeNodes,
                maxTreeDepth: t.maxTreeDepth,
                stopReason: t.stopReason,
                rollouts: t.rollouts.count,
                avgRolloutPlies: t.rollouts.avgPlies,
                legal: t.legalActionCount,
                searched: t.searchedActionCount,
                topShare: t.candidates[0] ? t.candidates[0].visits / Math.max(1, t.simulations) : 0,
              };
            }),
          );
        }
      }
    }
  }

  const sumBy = (xs: SearchRun[], f: (r: SearchRun) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const r of xs) for (const [k, v] of Object.entries(f(r))) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  const num = (r: SearchRun, k: string) => Number(r.stats[k] ?? 0);

  log('## 2. Search profiles');
  log();
  for (const agent of ['alphabeta', 'mcts-guided', 'mcts-pure']) {
    for (const budgetMs of [300, 2000]) {
      const rs = runs.filter((r) => r.agent === agent && r.budgetMs === budgetMs);
      if (rs.length === 0) continue;
      log(`### ${agent} — ${budgetMs} ms per move (${rs.length} positions)`);
      log();
      if (agent === 'alphabeta') {
        log('| Phase | Depth | Nodes | kNodes/s | µs/node | Evals/node | Cutoffs | TT hit | TT cutoffs | GC (n / ms) | Heap Δ MB |');
        log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
        for (const r of rs) {
          const nodes = num(r, 'nodes');
          log(`| ${r.phase} | ${r.stats.depth}${r.stats.decided ? ' (decided)' : ''} | ${fmt(nodes, 0)} | ${fmt(nodes / r.elapsedMs, 1)} | ${fmt((r.elapsedMs * 1000) / nodes, 1)} | ${fmt((num(r, 'leaves') + num(r, 'orderingEvals')) / nodes, 2)} | ${fmt(num(r, 'cutoffs'), 0)} | ${fmt((100 * num(r, 'ttHits')) / Math.max(1, num(r, 'ttProbes')), 1)}% | ${fmt(num(r, 'ttCutoffs'), 0)} | ${r.gc.count} / ${fmt(r.gc.ms, 1)} | ${fmt(r.heapDeltaMB, 1)} |`);
        }
      } else {
        log('| Phase | Simulations | sims/s | Tree nodes | Max depth | Rollout plies | Top visit share | GC (n / ms) | Heap Δ MB | KB / tree node |');
        log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
        for (const r of rs) {
          log(`| ${r.phase} | ${fmt(num(r, 'simulations'), 0)} | ${fmt((1000 * num(r, 'simulations')) / r.elapsedMs, 0)} | ${fmt(num(r, 'treeNodes'), 0)} | ${r.stats.maxTreeDepth} | ${fmt(num(r, 'avgRolloutPlies'), 1)} | ${fmt(100 * num(r, 'topShare'), 1)}% | ${r.gc.count} / ${fmt(r.gc.ms, 1)} | ${fmt(r.heapDeltaMB, 1)} | ${fmt((r.heapDeltaMB * 1024) / Math.max(1, num(r, 'treeNodes')), 2)} |`);
        }
      }
      log();
      const total = rs.reduce((s, r) => s + r.profile.totalMs, 0);
      const phases = sumBy(rs, (r) => r.profile.phases);
      const comps = sumBy(rs, (r) => r.profile.selfByComponent);
      const incl = sumBy(rs, (r) => r.profile.inclusiveByFunction);
      const table = (title: string, data: Record<string, number>, limit = 14) => {
        log(`| ${title} | ms | share |`);
        log('|---|---:|---:|');
        for (const [k, v] of Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, limit)) log(`| ${k} | ${fmt(v, 0)} | ${fmt((100 * v) / total, 1)}% |`);
        log();
      };
      table('Search phase (sampled)', phases);
      table('Component (self time)', comps);
      table('Function (inclusive)', incl, 18);
    }
  }

  mkdirSync(OUT, { recursive: true });
  const stamp = provenance.timestamp.replace(/[:.]/g, '-');
  let base = `${OUT}/profile-${stamp}`;
  for (let i = 2; existsSync(`${base}.md`); i++) base = `${OUT}/profile-${stamp}-${i}`;
  writeFileSync(`${base}.md`, md.join('\n') + '\n');
  writeFileSync(`${base}.json`, JSON.stringify({ provenance, micro: results, runs, sink }, null, 1) + '\n');
}, 30 * 60 * 1000);
