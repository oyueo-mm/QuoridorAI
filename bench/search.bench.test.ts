/**
 * Search benchmark (not part of `npm test`). Run: `npm run bench`.
 * Writes bench/results/search-benchmark.md. Timings depend on the machine; node counts
 * and game results are deterministic.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { it } from 'vitest';
import { createBfsAgent } from '../src/ai/bfsAgent';
import { DEFAULT_MINIMAX_SETTINGS, createMinimaxAgent } from '../src/ai/minimaxAgent';
import { createRng } from '../src/ai/rng';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { SearchHooks } from '../src/ai/search/minimax';
import type { MinimaxSettings } from '../src/ai/types';
import {
  applyAction,
  createInitialState,
  legalPawnMoves,
  legalWallPlacements,
  legalWallPlacementsBruteForce,
} from '../src/engine';
import type { GameState } from '../src/engine';
import { runMatch } from '../src/match/runMatch';

const out: string[] = [];
const log = (line = '') => {
  out.push(line);
  process.stdout.write(line + '\n');
};
const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

function opening(seed: number, plies: number): GameState {
  const rng = createRng(seed);
  let s = createInitialState();
  for (let i = 0; i < plies; i++) {
    const moves = legalPawnMoves(s);
    s = applyAction(s, { type: 'move', to: moves[Math.floor(rng() * moves.length)] });
  }
  return s;
}

/** Realistic middlegame: BFS vs BFS for a few plies after an opening (walls appear). */
async function middlegame(seed: number, plies: number): Promise<GameState> {
  let s = opening(seed, 2);
  const agents = [createBfsAgent(), createBfsAgent()];
  for (let i = 0; i < plies && s.winner === null; i++) s = applyAction(s, (await agents[s.currentPlayer].decide(s)).action);
  return s;
}

const evaluator = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);
const search = (s: GameState, patch: Partial<MinimaxSettings>, hooks: SearchHooks = {}) =>
  runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, timeLimitMs: 0, ...patch }, evaluator, hooks);

it('search benchmark', async () => {
  const afterE2E8 = applyAction(
    applyAction(createInitialState(), { type: 'move', to: { row: 7, col: 4 } }),
    { type: 'move', to: { row: 1, col: 4 } },
  );
  const positions: [string, GameState][] = [
    ['opening (after e2 e8)', afterE2E8],
    ['early (seed 3)', opening(3, 4)],
    ['middlegame A', await middlegame(5, 12)],
    ['middlegame B', await middlegame(8, 18)],
  ];

  log('# Search benchmark');
  log();
  log(`- Date: ${new Date().toISOString().slice(0, 10)} · Node ${process.version} · CPU: ${cpus()[0]?.model ?? 'unknown'}`);
  log(`- Evaluation: distance race, weights \`${JSON.stringify(DEFAULT_MINIMAX_EVAL)}\``);
  log('- Node counts include every iteration of iterative deepening (depth 1..d). Timings are single runs (ms).');
  log();

  // ---------------------------------------------------------------- 1. engine
  log('## 1. Legal wall generation (engine optimisation)');
  log();
  const states: GameState[] = [];
  for (let g = 0; g < 4; g++) {
    let s = opening(20 + g, 2);
    const agents = [createBfsAgent(), createBfsAgent()];
    for (let i = 0; i < 40 && s.winner === null; i++) {
      states.push(s);
      s = applyAction(s, (await agents[s.currentPlayer].decide(s)).action);
    }
  }
  const time = (f: () => void, reps: number) => {
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) f();
    return (performance.now() - t0) / reps;
  };
  time(() => states.forEach((s) => legalWallPlacements(s)), 2); // warm-up
  const brute = time(() => states.forEach((s) => legalWallPlacementsBruteForce(s)), 5) / states.length;
  const fast = time(() => states.forEach((s) => legalWallPlacements(s)), 5) / states.length;
  log('| Implementation | µs / position | Speed-up |');
  log('|---|---:|---:|');
  log(`| Brute force (BFS per wall) | ${fmt(brute * 1000, 1)} | 1.0× |`);
  log(`| Path-cut shortcut | ${fmt(fast * 1000, 1)} | ${fmt(brute / fast, 1)}× |`);
  log();
  log(`${states.length} positions from BFS self-play; both implementations return identical lists (unit-tested).`);
  log();

  // ---------------------------------------------------------------- 2. algorithms
  log('## 2. Minimax vs Alpha-Beta (same depth, same evaluation, wall filter: opponent-path)');
  log();
  const configs: [string, Partial<MinimaxSettings>, number][] = [
    ['Minimax', { algorithm: 'minimax', moveOrdering: false, transpositionTable: false }, 4],
    ['Alpha-Beta', { algorithm: 'alphabeta', moveOrdering: false, transpositionTable: false }, 5],
    ['+ordering', { algorithm: 'alphabeta', moveOrdering: true, transpositionTable: false }, 5],
    ['+ordering+TT', { algorithm: 'alphabeta', moveOrdering: true, transpositionTable: true }, 5],
  ];
  for (const [name, s] of positions) {
    log(`### ${name}`);
    log();
    log('| Depth | ' + configs.map(([c]) => `${c} nodes`).join(' | ') + ' | ' + configs.map(([c]) => `${c} ms`).join(' | ') + ' | Same score |');
    log('|---|' + configs.map(() => '---:|').join('') + configs.map(() => '---:|').join('') + '---|');
    for (let depth = 1; depth <= 5; depth++) {
      const rs = configs.map(([, cfg, max]) => (depth <= max ? search(s, { ...cfg, maxDepth: depth }) : null));
      const scores = rs.filter((r) => r !== null).map((r) => r!.score);
      const same = scores.every((x) => Math.abs(x - scores[0]) < 1e-9);
      log(
        `| ${depth} | ` +
          rs.map((r) => (r ? fmt(r.stats.nodes) : '—')).join(' | ') +
          ' | ' +
          rs.map((r) => (r ? fmt(r.stats.elapsedMs) : '—')).join(' | ') +
          ` | ${same ? '✓' : '✗'} |`,
      );
    }
    log();
  }

  // ---------------------------------------------------------------- 3. ablation
  log('## 3. Search implementation optimisations (Alpha-Beta + ordering + TT, depth 5)');
  log();
  log('| Position | Eager legality, full eval | + incremental eval | + lazy legality (default) | Nodes |');
  log('|---|---:|---:|---:|---:|');
  for (const [name, s] of positions) {
    const a = search(s, { maxDepth: 5 }, { disableLazyLegality: true, disableIncrementalEval: true });
    const b = search(s, { maxDepth: 5 }, { disableLazyLegality: true });
    const c = search(s, { maxDepth: 5 });
    log(`| ${name} | ${fmt(a.stats.elapsedMs)} ms | ${fmt(b.stats.elapsedMs)} ms | ${fmt(c.stats.elapsedMs)} ms | ${fmt(c.stats.nodes)} |`);
  }
  log();
  log('All three variants visit exactly the same nodes and return the same result (unit-tested).');
  log();
  log('### Static-evaluation ordering threshold (depth 6)');
  log();
  log('| Position | off | remaining depth ≥ 2 | ≥ 3 (default) |');
  log('|---|---:|---:|---:|');
  for (const [name, s] of positions) {
    const cells = [99, 2, 3].map((d) => {
      const r = search(s, { maxDepth: 6 }, { staticOrderingMinDepth: d });
      return `${fmt(r.stats.nodes)} nodes / ${fmt(r.stats.elapsedMs)} ms`;
    });
    log(`| ${name} | ${cells.join(' | ')} |`);
  }
  log();

  // ---------------------------------------------------------------- 4. time limit
  log('## 4. Depth reached under a time limit (Alpha-Beta defaults, max depth 12)');
  log();
  log('| Position | 250 ms | 500 ms | 1000 ms | 2000 ms |');
  log('|---|---:|---:|---:|---:|');
  for (const [name, s] of positions) {
    const cells = [250, 500, 1000, 2000].map((ms) => {
      const r = runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: 12, timeLimitMs: ms }, evaluator);
      return `depth ${r.completedDepth}${r.decided ? ' (decided)' : ''}, ${fmt(r.stats.elapsedMs)} ms`;
    });
    log(`| ${name} | ${cells.join(' | ')} |`);
  }
  log();
  log('The interrupted iteration is discarded; the move comes from the last completed depth.');
  log();

  // ---------------------------------------------------------------- 5. matches
  log('## 5. Games against the BFS AI');
  log();
  const starts = [createInitialState(), ...[1, 2, 3, 4, 5].map((i) => opening(i, 2 + (i % 3) * 2))];
  log(`${starts.length} openings × 2 seats = ${starts.length * 2} games per row (both agents deterministic). Max 300 plies.`);
  log();
  log('| Minimax setting | W | L | Halted | Avg ms per Minimax move | Avg plies |');
  log('|---|---:|---:|---:|---:|---:|');
  const rows: [string, Partial<MinimaxSettings>][] = [
    ['depth 1', { maxDepth: 1 }],
    ['depth 2', { maxDepth: 2 }],
    ['depth 3', { maxDepth: 3 }],
    ['depth 4', { maxDepth: 4 }],
    ['default (depth 5, 2000 ms)', { maxDepth: 5, timeLimitMs: 2000 }],
    ['depth 3, wall value 0.4 (before tuning)', { maxDepth: 3, evaluation: { ...DEFAULT_MINIMAX_EVAL, wallDifference: 0.4 } }],
    ['depth 4, wall value 0.4 (before tuning)', { maxDepth: 4, evaluation: { ...DEFAULT_MINIMAX_EVAL, wallDifference: 0.4 } }],
  ];
  for (const [label, patch] of rows) {
    let w = 0;
    let l = 0;
    let h = 0;
    let mmMs = 0;
    let mmMoves = 0;
    let plies = 0;
    for (const start of starts) {
      for (const seat of [0, 1] as const) {
        const mm = createMinimaxAgent({ timeLimitMs: 0, ...patch });
        const r = await runMatch(seat === 0 ? [mm, createBfsAgent()] : [createBfsAgent(), mm], { maxPlies: 300, initialState: start });
        for (const m of r.moves) {
          if (m.player === seat) {
            mmMs += m.trace.elapsedMs;
            mmMoves++;
          }
        }
        plies += r.finalState.ply - start.ply;
        if (r.status.kind === 'win') {
          if (r.status.winner === seat) w++;
          else l++;
        } else h++;
      }
    }
    log(`| ${label} | ${w} | ${l} | ${h} | ${fmt(mmMs / mmMoves, 1)} | ${fmt(plies / (starts.length * 2), 1)} |`);
  }
  log();

  mkdirSync('bench/results', { recursive: true });
  writeFileSync('bench/results/search-benchmark.md', out.join('\n') + '\n');
});
