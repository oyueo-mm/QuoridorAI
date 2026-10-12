/**
 * Step-by-step evaluation of the Heuristic-Guided MCTS improvements (small scale).
 *
 *   BENCH_STEP=baseline|A|B|C npx vitest run --config vitest.bench.config.ts bench/mcts-improvement.test.ts
 *
 * Step A compares evaluation cut-offs after 0 / 2 / 4 rollout plies (UCT).
 * Step B adds PUCT with heuristic priors to the chosen A setting (BENCH_A_PLIES).
 * Step C adds value shaping to the chosen A+B setting (BENCH_B=puct|uct).
 *
 * Every configuration is measured on the same positions, seeds and time budget (200 ms per
 * decision): Alpha-Beta-loss proxy, root visit statistics, and small games against
 * Alpha-Beta 200 ms (wins, halts by repetition / ply limit, time). Two position sets:
 * "tuning" (already used in the diagnosis) and "held-out" (never looked at before).
 *
 * Results go to bench/results/mcts-improvement/<step>.{md,jsonl}; existing files are never
 * overwritten (a numeric suffix is added). Decisions taking > 5× the budget are flagged as
 * suspect (e.g. the laptop entered standby during the run).
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { it } from 'vitest';
import { createBfsAgent } from '../src/ai/bfsAgent';
import { createMctsAgent, decideMcts, resolveMctsSettings } from '../src/ai/mctsAgent';
import { DEFAULT_MINIMAX_SETTINGS, createMinimaxAgent } from '../src/ai/minimaxAgent';
import { createRng } from '../src/ai/rng';
import { DEFAULT_MINIMAX_EVAL, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { MctsSettings } from '../src/ai/types';
import { applyAction, createInitialState, formatAction, legalPawnMoves } from '../src/engine';
import type { GameState } from '../src/engine';
import { runMatch } from '../src/match/runMatch';

const STEP = (process.env.BENCH_STEP ?? 'A') as 'baseline' | 'A' | 'B' | 'C';
const A_PLIES = Number(process.env.BENCH_A_PLIES ?? 2);
const B_SELECTION = (process.env.BENCH_B ?? 'puct') as 'uct' | 'puct';
const TIME_MS = 200;
const SEEDS = [1, 2, 3];
const GAME_SEED = 11;
const SUSPECT_FACTOR = 5;
const OUT_DIR = 'bench/results/mcts-improvement';

function opening(seed: number, plies: number): GameState {
  const rng = createRng(seed);
  let s = createInitialState();
  for (let i = 0; i < plies; i++) {
    const moves = legalPawnMoves(s);
    s = applyAction(s, { type: 'move', to: moves[Math.floor(rng() * moves.length)] });
  }
  return s;
}
async function middlegame(seed: number, plies: number): Promise<GameState> {
  let s = opening(seed, 2);
  const agents = [createBfsAgent(), createBfsAgent()];
  for (let i = 0; i < plies && s.winner === null; i++) s = applyAction(s, (await agents[s.currentPlayer].decide(s)).action);
  return s;
}

const evaluator = createDistanceEvaluator(DEFAULT_MINIMAX_EVAL);
const ab = (s: GameState, depth: number, p: 0 | 1) => {
  if (s.winner !== null) return s.winner === p ? 10_000 : -10_000;
  const r = runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: depth, timeLimitMs: 0 }, evaluator);
  return s.currentPlayer === p ? r.score : -r.score;
};

const pure = (): Partial<MctsSettings> => ({ variant: 'pure' });
const stepA = (plies: number): Partial<MctsSettings> => ({ variant: 'pure', rolloutMaxPlies: plies, rolloutCutoff: 'evaluation' });

function configs(): [string, Partial<MctsSettings>][] {
  switch (STEP) {
    case 'baseline':
      return [['pure (baseline)', pure()]];
    case 'A':
      return [
        ['pure (baseline)', pure()],
        ['A: eval cut-off, 0 plies', stepA(0)],
        ['A: eval cut-off, 2 plies', stepA(2)],
        ['A: eval cut-off, 4 plies', stepA(4)],
      ];
    case 'B':
      return [
        [`A(${A_PLIES}) + UCT`, stepA(A_PLIES)],
        [`A(${A_PLIES}) + PUCT priors`, { ...stepA(A_PLIES), selection: 'puct' }],
      ];
    case 'C':
      return [
        [`A(${A_PLIES}) + ${B_SELECTION.toUpperCase()}`, { ...stepA(A_PLIES), selection: B_SELECTION }],
        [`A(${A_PLIES}) + ${B_SELECTION.toUpperCase()} + value shaping`, { ...stepA(A_PLIES), selection: B_SELECTION, valueShaping: true }],
      ];
  }
}

function uniquePath(base: string, ext: string): string {
  let p = `${base}.${ext}`;
  for (let i = 2; existsSync(p); i++) p = `${base}-${i}.${ext}`;
  return p;
}

const entropy = (ns: number[]) => {
  const total = ns.reduce((a, b) => a + b, 0);
  return total === 0 ? 0 : -ns.filter((n) => n > 0).reduce((h, n) => h + (n / total) * Math.log2(n / total), 0);
};
const f2 = (x: number) => x.toFixed(2);

it(`MCTS improvement step ${STEP}`, async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  const md = uniquePath(`${OUT_DIR}/step-${STEP}`, 'md');
  const jsonl = md.replace(/\.md$/, '.jsonl');
  const out: string[] = [];
  const log = (l = '') => {
    out.push(l);
    process.stdout.write(l + '\n');
    writeFileSync(md, out.join('\n') + '\n');
  };
  const record = (o: object) => appendFileSync(jsonl, JSON.stringify(o) + '\n');

  const sets: Record<'tuning' | 'held-out', [string, GameState][]> = {
    tuning: [
      ['start', createInitialState()],
      ['opening(1,2)', opening(1, 2)],
      ['opening(2,4)', opening(2, 4)],
      ['opening(3,6)', opening(3, 6)],
      ['opening(4,8)', opening(4, 8)],
    ],
    'held-out': [
      ['opening(10,2)', opening(10, 2)],
      ['opening(11,4)', opening(11, 4)],
      ['opening(12,6)', opening(12, 6)],
      ['middlegame(40,14)', await middlegame(40, 14)],
      ['middlegame(41,14)', await middlegame(41, 14)],
      ['middlegame(42,18)', await middlegame(42, 18)],
    ],
  };
  // Reference values are computed once per position (Alpha-Beta depth 4 / depth 3 after the move).
  const refBest = new Map<GameState, number>();
  for (const set of Object.values(sets)) for (const [, s] of set) refBest.set(s, ab(s, 4, s.currentPlayer));

  log(`# MCTS improvement — step ${STEP}`);
  log();
  log(`- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Node ${process.version} · ${cpus()[0]?.model ?? ''}`);
  log(`- Budget ${TIME_MS} ms per decision (iterations unlimited) · seeds ${SEEDS.join(', ')} · AB loss = Alpha-Beta d4 value of its best move − d3 value after MCTS's move (MCTS view; proxy, not ground truth).`);
  log(`- Games: vs Alpha-Beta ${TIME_MS} ms, openings (0,0), (1,2) [tuning] and (10,2) [held-out], both seats, MCTS seed ${GAME_SEED}, max 200 plies, halt on 3× repetition.`);
  log();
  record({ type: 'run', step: STEP, timeMs: TIME_MS, seeds: SEEDS, configs: configs().map(([n, c]) => ({ name: n, settings: resolveMctsSettings({ ...c, iterations: 1e9, timeLimitMs: TIME_MS }) })) });

  // ------------------------------------------------------------ position metrics
  log('## Decisions on fixed positions');
  log();
  log('| Config | Set | AB loss (mean) | Best-move agreement | Wall chosen | Sims/decision | Root moves visited | Top-move share | Visit entropy (bits) | Max tree depth | Suspect |');
  log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [name, cfg] of configs()) {
    const settings = resolveMctsSettings({ ...cfg, iterations: 1e9, timeLimitMs: TIME_MS });
    for (const [setName, set] of Object.entries(sets)) {
      let loss = 0, agree = 0, walls = 0, sims = 0, visited = 0, share = 0, ent = 0, depth = 0, suspect = 0, n = 0;
      for (const [pname, s] of set) {
        const me = s.currentPlayer;
        const bestRef = refBest.get(s)!;
        for (const seed of SEEDS) {
          const t = decideMcts(s, settings, seed);
          if (t.elapsedMs > SUSPECT_FACTOR * TIME_MS) suspect++;
          const chosen = t.candidates[0];
          const l = bestRef - ab(applyAction(s, chosen.action), 3, me);
          loss += l;
          if (l < 1e-9) agree++;
          if (chosen.action.type === 'wall') walls++;
          sims += t.simulations;
          visited += t.candidates.filter((c) => c.visits > 0).length;
          share += chosen.share;
          ent += entropy(t.candidates.map((c) => c.visits));
          depth += t.maxTreeDepth;
          n++;
          record({ type: 'decision', config: name, set: setName, position: pname, seed, chosen: chosen.notation, loss: l, sims: t.simulations, elapsedMs: t.elapsedMs, top: t.candidates.slice(0, 5).map((c) => [c.notation, c.visits, +c.q.toFixed(3), c.prior === undefined ? null : +c.prior.toFixed(3)]) });
        }
      }
      log(
        `| ${name} | ${setName} | ${f2(loss / n)} | ${agree}/${n} | ${walls}/${n} | ${Math.round(sims / n)} | ${f2(visited / n)} | ` +
          `${(100 * share / n).toFixed(0)}% | ${f2(ent / n)} | ${f2(depth / n)} | ${suspect} |`,
      );
    }
  }
  log();

  // ------------------------------------------------------------ games
  log('## Games vs Alpha-Beta 200 ms');
  log();
  log('| Config | Set | W | L | Halted (rep / plies) | Avg plies | MCTS ms/move | Sims/move | Suspect moves |');
  log('|---|---|---:|---:|---|---:|---:|---:|---:|');
  const gameOpenings: Record<string, [number, number][]> = { tuning: [[0, 0], [1, 2]], 'held-out': [[10, 2]] };
  for (const [name, cfg] of configs()) {
    for (const [setName, openings] of Object.entries(gameOpenings)) {
      let w = 0, l = 0, hr = 0, hp = 0, plies = 0, ms = 0, moves = 0, sims = 0, suspect = 0, games = 0;
      for (const [os, op] of openings) {
        const start = opening(os, op);
        for (const seat of [0, 1] as const) {
          const mcts = createMctsAgent({ ...cfg, iterations: 1e9, timeLimitMs: TIME_MS }, GAME_SEED);
          const alphaBeta = createMinimaxAgent({ maxDepth: 30, timeLimitMs: TIME_MS });
          const r = await runMatch(seat === 0 ? [mcts, alphaBeta] : [alphaBeta, mcts], { maxPlies: start.ply + 200, repetitionLimit: 3, initialState: start });
          games++;
          if (r.status.kind === 'win') r.status.winner === seat ? w++ : l++;
          else if (r.status.kind === 'halted' && r.status.reason === 'repetition') hr++;
          else hp++;
          plies += r.finalState.ply - start.ply;
          for (const m of r.moves) {
            if (m.player !== seat || m.trace.algorithm !== 'mcts') continue;
            ms += m.trace.elapsedMs;
            sims += m.trace.simulations;
            moves++;
            if (m.trace.elapsedMs > SUSPECT_FACTOR * TIME_MS) suspect++;
          }
          record({ type: 'game', config: name, set: setName, opening: [os, op], mctsSeat: seat, seed: GAME_SEED, status: r.status, plies: r.finalState.ply - start.ply, moves: r.moves.map((m) => formatAction(m.action)) });
        }
      }
      log(`| ${name} | ${setName} | ${w} | ${l} | ${hr} / ${hp} | ${(plies / games).toFixed(1)} | ${(ms / moves).toFixed(0)} | ${Math.round(sims / moves)} | ${suspect} |`);
    }
  }
  log();
  log(`Raw records: \`${jsonl.split('/').pop()}\`.`);
});
