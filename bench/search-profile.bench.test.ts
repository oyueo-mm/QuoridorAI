/**
 * Stage 3-C search profile on real game positions, by game phase (not part of `npm test`).
 *
 *   $env:VARIANTS='base,typed,pvs,typed+pvs,typed+pvs+partial'; npx vitest run --config vitest.bench.config.ts bench/search-profile.bench.test.ts
 *   env: TIME (ms, default 300) · DEPTH (fixed depth, default 5) · PER_PHASE (default 30) · SEQ=1 (persistent-table game replay)
 * → bench/results/stage3c/profile-<timestamp>.md
 *
 * Positions: 300 ms games of stage 3-B (T-E5-300: E5 vs v1, all four shards), split into
 *   opening (ply < 14), endgame (walls left in total ≤ 4, or a pawn ≤ 3 steps from its goal),
 *   middle (the rest). Every variant uses the adopted evaluation (E6) and default search settings.
 *
 * Fixed depth: nodes, time, and whether the root score equals the baseline's (it must).
 * 300 ms: completed depth, share of time spent in the discarded last iteration, TT hit rate,
 *   cutoffs per interior node, nodes per move, TT memory, interrupted-iteration switches.
 * Timed numbers depend on the machine: run on AC power with no other benchmark running
 * (power and CPU load are recorded); compare variants within one run only.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { it } from 'vitest';
import { DEFAULT_MINIMAX_SETTINGS, createMinimaxCache, decideMinimax } from '../src/ai/minimaxAgent';
import { ALPHA_BETA_EVAL, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { SearchResult } from '../src/ai/search/minimax';
import type { MinimaxSettings } from '../src/ai/types';
import { parseMoveList } from '../src/arena/openings';
import { openingState } from '../src/arena/tournament';
import { distanceToRow, goalRow } from '../src/engine';
import type { GameState } from '../src/engine';
import { collectProvenance } from './lib/provenance';

export const SEARCH_VARIANTS: Record<string, Partial<MinimaxSettings>> = {
  base: {},
  typed: { ttKind: 'typed' },
  pvs: { pvs: true },
  'typed+pvs': { ttKind: 'typed', pvs: true },
  'typed+pvs+partial': { ttKind: 'typed', pvs: true, partialIteration: true },
  partial: { partialIteration: true },
  'typed+pvs+persist': { ttKind: 'typed', pvs: true, ttPersist: true },
  'typed+pvs+persist+partial': { ttKind: 'typed', pvs: true, ttPersist: true, partialIteration: true },
  'typed+pvs+persist+deeper': { ttKind: 'typed', pvs: true, ttPersist: true, ttDeeper: true },
  'typed+pvs+persist+deeper+partial': { ttKind: 'typed', pvs: true, ttPersist: true, ttDeeper: true, partialIteration: true },
  'typed+pvs+deeper': { ttKind: 'typed', pvs: true, ttDeeper: true },
};

const GAMES_DIR = 'bench/results/stage3b/stage3b-time/T-E5-300';
type Phase = 'opening' | 'middle' | 'endgame';

function games(): GameState[][] {
  const out: GameState[][] = [];
  for (const f of readdirSync(GAMES_DIR).filter((n) => n.startsWith('games.') && n.endsWith('.jsonl')).sort()) {
    for (const line of readFileSync(join(GAMES_DIR, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { moves: string[]; opening: Parameters<typeof openingState>[0] };
      out.push(parseMoveList(r.moves.join(' '), openingState(r.opening)).positions.filter((s) => s.winner === null));
    }
  }
  return out;
}

function phaseOf(s: GameState): Phase {
  if (s.ply < 14) return 'opening';
  const d = [0, 1].map((p) => distanceToRow(s, s.pawns[p], goalRow(p as 0 | 1)));
  if (s.wallsRemaining[0] + s.wallsRemaining[1] <= 4 || Math.min(...d) <= 3) return 'endgame';
  return 'middle';
}

function sample(all: GameState[][], perPhase: number): Record<Phase, GameState[]> {
  const by: Record<Phase, GameState[]> = { opening: [], middle: [], endgame: [] };
  for (const g of all) for (const s of g) by[phaseOf(s)].push(s);
  const pick = (a: GameState[]) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / perPhase)) === 0).slice(0, perPhase);
  return { opening: pick(by.opening), middle: pick(by.middle), endgame: pick(by.endgame) };
}

const cfg = (patch: Partial<MinimaxSettings>): MinimaxSettings => ({ ...DEFAULT_MINIMAX_SETTINGS, wallFilter: 'opponent-path', pathKernel: 'masked', evaluation: ALPHA_BETA_EVAL, ...patch });

interface TimedRow {
  depth: number;
  wasted: number;
  ttHit: number;
  cutoffRatio: number;
  nodes: number;
  ttBytes: number;
  switched: number;
  timedOut: number;
}

function timedMetrics(rs: SearchResult[]): TimedRow {
  const n = rs.length;
  const sum = (f: (r: SearchResult) => number) => rs.reduce((a, r) => a + f(r), 0);
  return {
    depth: sum((r) => r.completedDepth) / n,
    wasted: sum((r) => (r.stats.elapsedMs - r.iterations.reduce((a, x) => a + x.elapsedMs, 0)) / Math.max(1, r.stats.elapsedMs)) / n,
    ttHit: sum((r) => r.stats.ttHits) / Math.max(1, sum((r) => r.stats.ttProbes)),
    cutoffRatio: sum((r) => r.stats.cutoffs) / Math.max(1, sum((r) => r.stats.nodes - r.stats.leaves - r.stats.terminals)),
    nodes: sum((r) => r.stats.nodes) / n,
    ttBytes: Math.max(...rs.map((r) => r.tt?.bytes ?? 0)),
    switched: sum((r) => (r.partial?.switched ? 1 : 0)) / n,
    timedOut: sum((r) => (r.timedOut ? 1 : 0)) / n,
  };
}

function cpuBusy<T>(f: () => T): { value: T; busy: number } {
  const snap = () => cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }), { idle: 0, total: 0 });
  const a = snap();
  const value = f();
  const b = snap();
  return { value, busy: 1 - (b.idle - a.idle) / Math.max(1, b.total - a.total) };
}

it('search profile', () => {
  const names = (process.env.VARIANTS ?? 'base,typed+pvs,typed+pvs+partial').split(',');
  const timeMs = Number(process.env.TIME ?? 300);
  const depth = Number(process.env.DEPTH ?? 5);
  const perPhase = Number(process.env.PER_PHASE ?? 30);
  const all = games();
  const pos = sample(all, perPhase);
  const prov = collectProvenance();
  const L: string[] = [
    '# Stage 3-C — search profile',
    '',
    `- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.dirty ? ' (dirty)' : ''} · power ${prov.power} · ${prov.cpu}`,
    `- positions per phase: ${Object.entries(pos).map(([k, v]) => `${k} ${v.length}`).join(', ')} (from ${GAMES_DIR}); evaluation E6; variants: ${names.join(', ')}`,
    '',
  ];
  const { value: _, busy } = cpuBusy(() => {
    // ---- fixed depth
    L.push(`## Fixed depth ${depth}: nodes · ms · root score equal to base`, '', '| Phase | ' + names.join(' | ') + ' |', '|---|' + names.map(() => '---:|').join(''));
    for (const [phase, ps] of Object.entries(pos)) {
      const base = ps.map((s) => runSearch(s, cfg({ maxDepth: depth, timeLimitMs: 0 }), createDistanceEvaluator(ALPHA_BETA_EVAL)));
      const cells = names.map((name) => {
        const t0 = performance.now();
        const rs = ps.map((s) => runSearch(s, cfg({ ...SEARCH_VARIANTS[name], maxDepth: depth, timeLimitMs: 0 }), createDistanceEvaluator(ALPHA_BETA_EVAL)));
        const ms = performance.now() - t0;
        const nodes = rs.reduce((a, r) => a + r.stats.nodes, 0);
        const baseNodes = base.reduce((a, r) => a + r.stats.nodes, 0);
        const same = rs.filter((r, i) => r.score === base[i].score).length;
        const sameMove = rs.filter((r, i) => JSON.stringify(r.bestAction) === JSON.stringify(base[i].bestAction)).length;
        return `${nodes.toLocaleString('en-US')} (${(nodes / baseNodes).toFixed(3)}) · ${ms.toFixed(0)} ms · score ${same}/${ps.length}, move ${sameMove}/${ps.length}`;
      });
      L.push(`| ${phase} | ${cells.join(' | ')} |`);
    }
    // ---- timed, interleaved per position so load drifts hit all variants alike
    L.push('', `## ${timeMs} ms per move`, '', '| Phase | Variant | completed depth | time in discarded iteration | timed out | TT hit | cutoffs / interior node | nodes / move | TT memory | partial switches |', '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const [phase, ps] of Object.entries(pos)) {
      const res: Record<string, SearchResult[]> = Object.fromEntries(names.map((n) => [n, []]));
      for (const s of ps) for (const name of names) res[name].push(runSearch(s, cfg({ ...SEARCH_VARIANTS[name], maxDepth: 30, timeLimitMs: timeMs }), createDistanceEvaluator(ALPHA_BETA_EVAL)));
      for (const name of names) {
        const m = timedMetrics(res[name]);
        L.push(`| ${phase} | ${name} | ${m.depth.toFixed(2)} | ${(100 * m.wasted).toFixed(1)}% | ${(100 * m.timedOut).toFixed(0)}% | ${(100 * m.ttHit).toFixed(1)}% | ${m.cutoffRatio.toFixed(3)} | ${m.nodes.toFixed(0)} | ${(m.ttBytes / 1048576).toFixed(1)} MB | ${(100 * m.switched).toFixed(1)}% |`);
      }
    }
    // ---- persistent table over whole games (one agent per side), timed
    if (process.env.SEQ) {
      const seqGames = all.filter((_, i) => i % 20 === 0).slice(0, Number(process.env.SEQ_GAMES ?? 6));
      L.push('', `## Persistent table over ${seqGames.length} replayed games (${timeMs} ms, one agent per side)`, '', '| Variant | completed depth | nodes / move | moves |', '|---|---:|---:|---:|');
      const seqVariants = (process.env.SEQ_VARIANTS ?? 'typed+pvs,typed+pvs+persist').split(',');
      for (const label of seqVariants) {
        const patch = SEARCH_VARIANTS[label];
        let d = 0;
        let nodes = 0;
        let moves = 0;
        for (const g of seqGames) {
          const caches = [createMinimaxCache(), createMinimaxCache()];
          for (const s of g) {
            const t = decideMinimax(s, cfg({ ...patch, maxDepth: 30, timeLimitMs: timeMs }), undefined, caches[s.currentPlayer]);
            d += t.completedDepth;
            nodes += t.stats.nodes;
            moves++;
          }
        }
        L.push(`| ${label} | ${(d / moves).toFixed(2)} | ${(nodes / moves).toFixed(0)} | ${moves} |`);
      }
    }
  });
  void _;
  L.splice(4, 0, `- machine CPU busy during the profile: ${(100 * busy).toFixed(0)}% (this process uses one of ${cpus().length} threads ≈ ${(100 / cpus().length).toFixed(0)}%)`);
  mkdirSync('bench/results/stage3c', { recursive: true });
  const out = `bench/results/stage3c/profile-${prov.timestamp.replace(/[:.]/g, '-')}.md`;
  writeFileSync(out, L.join('\n') + '\n');
  process.stdout.write(L.join('\n') + `\n→ ${out}\n`);
}, 3 * 60 * 60 * 1000);
