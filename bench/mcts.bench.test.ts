/**
 * MCTS match evaluation (not part of `npm test`). Run: `npm run bench:mcts`.
 *
 * Robust long-running harness:
 *  - every finished game is appended to bench/results/mcts-benchmark.jsonl immediately
 *    (settings, seeds, opening, result, timings, moves), and the Markdown summary is rebuilt
 *    after every game — interrupting the run never loses finished games;
 *  - one progress line per game (stdout + bench/results/mcts-benchmark.progress.log);
 *  - per-game wall-clock limit, ply limit and repeated-position detection (halts are recorded
 *    with their reason and never counted as wins);
 *  - an overall time budget: when it is used up the run stops cleanly and the summary says
 *    which games were skipped.
 *
 * Environment overrides: BENCH_BUDGET_MIN (overall, default 40), BENCH_GAME_LIMIT_S (per game,
 * default 90), BENCH_ROWS (comma-separated row ids to run, default all).
 *
 * Comparisons: "individual" rows give each agent its own work budget (simulations / depth;
 * deterministic for the recorded seeds). "equal-time" rows give both the same ms per move
 * (machine- and load-dependent, not exactly reproducible).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { it } from 'vitest';
import { createBfsAgent } from '../src/ai/bfsAgent';
import { createMctsAgent, resolveMctsSettings } from '../src/ai/mctsAgent';
import { createMinimaxAgent, resolveMinimaxSettings } from '../src/ai/minimaxAgent';
import { createRng } from '../src/ai/rng';
import type { Agent, MctsSettings, MinimaxSettings } from '../src/ai/types';
import { applyAction, createInitialState, formatAction, legalPawnMoves } from '../src/engine';
import type { GameState } from '../src/engine';
import { runMatch } from '../src/match/runMatch';

const RESULTS = 'bench/results';
const JSONL = `${RESULTS}/mcts-benchmark.jsonl`;
const SUMMARY = `${RESULTS}/mcts-benchmark.md`;
const PROGRESS = `${RESULTS}/mcts-benchmark.progress.log`;

const BUDGET_MS = Number(process.env.BENCH_BUDGET_MIN ?? 40) * 60_000;
const GAME_LIMIT_MS = Number(process.env.BENCH_GAME_LIMIT_S ?? 90) * 1000;
const MAX_PLIES = 200;
const REPETITION_LIMIT = 3;
const MCTS_SEEDS = [11, 23];
/** Openings: [seed, random pawn plies]; seed 0 = the standard start. */
const OPENINGS: [number, number][] = [
  [0, 0],
  [1, 2],
  [2, 4],
];

function opening(seed: number, plies: number): GameState {
  const rng = createRng(seed);
  let s = createInitialState();
  for (let i = 0; i < plies; i++) {
    const moves = legalPawnMoves(s);
    s = applyAction(s, { type: 'move', to: moves[Math.floor(rng() * moves.length)] });
  }
  return s;
}

type Spec = { kind: 'minimax'; settings: Partial<MinimaxSettings> } | { kind: 'bfs' };

interface Row {
  id: string;
  label: string;
  budget: 'individual' | 'equal-time';
  mcts: Partial<MctsSettings>;
  opponent: Spec;
  opponentLabel: string;
}

const ROWS: Row[] = [
  { id: 'h300-bfs', label: 'MCTS heuristic 300 sims', budget: 'individual', mcts: { iterations: 300, timeLimitMs: 0 }, opponent: { kind: 'bfs' }, opponentLabel: 'BFS' },
  { id: 'h1000-bfs', label: 'MCTS heuristic 1000 sims', budget: 'individual', mcts: { iterations: 1000, timeLimitMs: 0 }, opponent: { kind: 'bfs' }, opponentLabel: 'BFS' },
  { id: 'b1000-bfs', label: 'MCTS balanced 1000 sims', budget: 'individual', mcts: { iterations: 1000, timeLimitMs: 0, rollout: 'balanced' }, opponent: { kind: 'bfs' }, opponentLabel: 'BFS' },
  { id: 'u1000-bfs', label: 'MCTS uniform 1000 sims', budget: 'individual', mcts: { iterations: 1000, timeLimitMs: 0, rollout: 'uniform' }, opponent: { kind: 'bfs' }, opponentLabel: 'BFS' },
  { id: 'h1000-ab3', label: 'MCTS heuristic 1000 sims', budget: 'individual', mcts: { iterations: 1000, timeLimitMs: 0 }, opponent: { kind: 'minimax', settings: { maxDepth: 3, timeLimitMs: 0 } }, opponentLabel: 'Alpha-Beta depth 3' },
  { id: 'h1000-ab5', label: 'MCTS heuristic 1000 sims', budget: 'individual', mcts: { iterations: 1000, timeLimitMs: 0 }, opponent: { kind: 'minimax', settings: { maxDepth: 5, timeLimitMs: 0 } }, opponentLabel: 'Alpha-Beta depth 5' },
  { id: 't200-ab', label: 'MCTS heuristic 200 ms', budget: 'equal-time', mcts: { iterations: 1e9, timeLimitMs: 200 }, opponent: { kind: 'minimax', settings: { maxDepth: 30, timeLimitMs: 200 } }, opponentLabel: 'Alpha-Beta 200 ms' },
  { id: 't500-ab', label: 'MCTS heuristic 500 ms', budget: 'equal-time', mcts: { iterations: 1e9, timeLimitMs: 500 }, opponent: { kind: 'minimax', settings: { maxDepth: 30, timeLimitMs: 500 } }, opponentLabel: 'Alpha-Beta 500 ms' },
];

type Result = 'mcts-win' | 'mcts-loss' | 'halted-max-plies' | 'halted-repetition' | 'halted-time-limit';

interface GameRecord {
  row: string;
  opening: [number, number];
  mctsSeat: 0 | 1;
  mctsSeed: number;
  result: Result;
  plies: number;
  elapsedMs: number;
  mcts: { moves: number; avgMs: number; avgSimulations: number; avgTreeNodes: number };
  opponent: { moves: number; avgMs: number; avgNodes: number | null };
  moves: string[];
}

const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const stamp = () => new Date().toISOString().slice(11, 19);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function progress(line: string) {
  const l = `[${stamp()}] ${line}`;
  process.stdout.write(l + '\n');
  appendFileSync(PROGRESS, l + '\n');
}

function writeSummary(rows: Row[], games: GameRecord[], notes: string[]) {
  const out: string[] = [];
  const log = (l = '') => out.push(l);
  log('# MCTS match evaluation');
  log();
  log(`- Date: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Node ${process.version} · CPU: ${cpus()[0]?.model ?? 'unknown'}`);
  log(`- Openings (seed, random pawn plies): ${OPENINGS.map((o) => `(${o[0]}, ${o[1]})`).join(', ')} · MCTS seeds ${MCTS_SEEDS.join(', ')} · both seats → up to ${OPENINGS.length * 2 * MCTS_SEEDS.length} games per row`);
  log(`- Per game: max ${MAX_PLIES} plies, ${GAME_LIMIT_MS / 1000} s wall clock, halt on ${REPETITION_LIMIT}× repeated position. Halts have no winner.`);
  log('- MCTS defaults unless noted: UCT C = 1.4, heuristic rollout (walls only when the opponent leads), rollout max 100 plies, distance cutoff, wall filter opponent-path.');
  log(`- Every game with settings, seeds and moves: \`mcts-benchmark.jsonl\` (one JSON object per line).`);
  for (const n of notes) log(`- **${n}**`);
  log();
  for (const budget of ['individual', 'equal-time'] as const) {
    log(budget === 'individual' ? '## Individual search budgets (deterministic)' : '## Equal time per move (machine-dependent)');
    log();
    log('| MCTS | Opponent | Games | MCTS W | L | Halted (plies/rep/time) | Win rate | MCTS ms/move | Opp. ms/move | Sims/move | Tree nodes/move | Opp. nodes/move | Avg plies |');
    log('|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const row of rows.filter((r) => r.budget === budget)) {
      const gs = games.filter((g) => g.row === row.id);
      if (gs.length === 0) {
        log(`| ${row.label} | ${row.opponentLabel} | 0 | — | — | — | — | — | — | — | — | — | — |`);
        continue;
      }
      const c = (r: Result) => gs.filter((g) => g.result === r).length;
      const mean = (f: (g: GameRecord) => number) => avg(gs.map(f));
      log(
        `| ${row.label} | ${row.opponentLabel} | ${gs.length} | ${c('mcts-win')} | ${c('mcts-loss')} | ` +
          `${c('halted-max-plies')}/${c('halted-repetition')}/${c('halted-time-limit')} | ${fmt((100 * c('mcts-win')) / gs.length)}% | ` +
          `${fmt(mean((g) => g.mcts.avgMs), 1)} | ${fmt(mean((g) => g.opponent.avgMs), 1)} | ${fmt(mean((g) => g.mcts.avgSimulations))} | ` +
          `${fmt(mean((g) => g.mcts.avgTreeNodes))} | ${row.opponent.kind === 'minimax' ? fmt(mean((g) => g.opponent.avgNodes ?? 0)) : '—'} | ${fmt(mean((g) => g.plies), 1)} |`,
      );
    }
    log();
  }
  log('## Per-game results');
  log();
  log('| Row | Opening | MCTS seat | Seed | Result | Plies | Seconds |');
  log('|---|---|---:|---:|---|---:|---:|');
  for (const g of games) {
    log(`| ${g.row} | (${g.opening.join(', ')}) | P${g.mctsSeat + 1} | ${g.mctsSeed} | ${g.result} | ${g.plies} | ${fmt(g.elapsedMs / 1000, 1)} |`);
  }
  writeFileSync(SUMMARY, out.join('\n') + '\n');
}

it('MCTS match evaluation', async () => {
  mkdirSync(RESULTS, { recursive: true });
  const runStart = performance.now();
  // BENCH_ROWS selects rows and sets their order (most important first under a budget).
  const selected = process.env.BENCH_ROWS
    ? process.env.BENCH_ROWS.split(',').flatMap((id) => ROWS.filter((r) => r.id === id.trim()))
    : ROWS;
  const games: GameRecord[] = [];
  const notes: string[] = [];
  const total = selected.length * OPENINGS.length * 2 * MCTS_SEEDS.length;
  writeFileSync(JSONL, '');
  writeFileSync(PROGRESS, '');
  appendFileSync(
    JSONL,
    JSON.stringify({
      type: 'run',
      started: new Date().toISOString(),
      budgetMs: BUDGET_MS,
      gameLimitMs: GAME_LIMIT_MS,
      maxPlies: MAX_PLIES,
      repetitionLimit: REPETITION_LIMIT,
      openings: OPENINGS,
      mctsSeeds: MCTS_SEEDS,
      rows: selected.map((r) => ({
        ...r,
        mctsSettings: resolveMctsSettings(r.mcts),
        opponentSettings: r.opponent.kind === 'minimax' ? resolveMinimaxSettings(r.opponent.settings) : 'BFS default weights',
      })),
    }) + '\n',
  );
  progress(`start: ${selected.length} rows, ${total} games, budget ${BUDGET_MS / 60000} min, per game ${GAME_LIMIT_MS / 1000} s`);

  let done = 0;
  let stopped = false;
  for (const row of selected) {
    if (stopped) break;
    for (const [oSeed, oPlies] of OPENINGS) {
      if (stopped) break;
      const start = opening(oSeed, oPlies);
      for (const mctsSeat of [0, 1] as const) {
        if (stopped) break;
        for (const seed of MCTS_SEEDS) {
          if (performance.now() - runStart > BUDGET_MS) {
            stopped = true;
            notes.push(`Overall budget of ${BUDGET_MS / 60000} min used up after ${done}/${total} games; remaining games were skipped.`);
            progress(`budget exhausted after ${done}/${total} games — stopping`);
            break;
          }
          const mcts = createMctsAgent(row.mcts, seed);
          const opp: Agent = row.opponent.kind === 'minimax' ? createMinimaxAgent(row.opponent.settings) : createBfsAgent();
          const r = await runMatch(mctsSeat === 0 ? [mcts, opp] : [opp, mcts], {
            maxPlies: start.ply + MAX_PLIES,
            maxGameMs: GAME_LIMIT_MS,
            repetitionLimit: REPETITION_LIMIT,
            initialState: start,
          });
          const mine = r.moves.filter((m) => m.player === mctsSeat);
          const theirs = r.moves.filter((m) => m.player !== mctsSeat);
          const result: Result =
            r.status.kind === 'win'
              ? r.status.winner === mctsSeat
                ? 'mcts-win'
                : 'mcts-loss'
              : r.status.kind === 'halted'
                ? (`halted-${r.status.reason}` as Result)
                : 'halted-max-plies';
          const record: GameRecord = {
            row: row.id,
            opening: [oSeed, oPlies],
            mctsSeat,
            mctsSeed: seed,
            result,
            plies: r.finalState.ply - start.ply,
            elapsedMs: r.elapsedMs,
            mcts: {
              moves: mine.length,
              avgMs: avg(mine.map((m) => m.trace.elapsedMs)),
              avgSimulations: avg(mine.map((m) => (m.trace.algorithm === 'mcts' ? m.trace.simulations : 0))),
              avgTreeNodes: avg(mine.map((m) => (m.trace.algorithm === 'mcts' ? m.trace.treeNodes : 0))),
            },
            opponent: {
              moves: theirs.length,
              avgMs: avg(theirs.map((m) => m.trace.elapsedMs)),
              avgNodes: row.opponent.kind === 'minimax' ? avg(theirs.map((m) => (m.trace.algorithm === 'minimax' ? m.trace.stats.nodes : 0))) : null,
            },
            moves: r.moves.map((m) => formatAction(m.action)),
          };
          games.push(record);
          done++;
          appendFileSync(JSONL, JSON.stringify({ type: 'game', ...record }) + '\n');
          writeSummary(selected, games, notes);
          const rowGames = games.filter((g) => g.row === row.id);
          progress(
            `${done}/${total} ${row.id} opening(${oSeed},${oPlies}) P${mctsSeat + 1} seed ${seed}: ${result} in ${record.plies} plies, ` +
              `${fmt(r.elapsedMs / 1000, 1)}s · row ${rowGames.filter((g) => g.result === 'mcts-win').length}/${rowGames.length}`,
          );
        }
      }
    }
  }
  writeSummary(selected, games, notes);
  progress(`finished: ${done}/${total} games in ${fmt((performance.now() - runStart) / 60000, 1)} min`);
});
