/**
 * Stage-5 experiments with the same tournament core the browser uses (in-process agents).
 * Run: `npm run bench:arena` (≈ 10–15 min). Small samples by design.
 *
 * Writes bench/results/arena/<experiment>.{json,csv} and summary.md — never overwriting
 * existing files (a numeric suffix is added). Equal-time decisions that took > 5× their
 * budget are counted as "suspect" (e.g. the machine went to standby).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { it } from 'vitest';
import { defaultSpec, inProcessFactory } from '../src/arena/agentSpec';
import { tournamentToCsv, tournamentToJson } from '../src/arena/exportResults';
import { formatProportion } from '../src/arena/stats';
import { TournamentRunner, playScheduledGame, schedule, summarize } from '../src/arena/tournament';
import type { TournamentConfig, TournamentGame } from '../src/arena/tournament';

const DIR = 'bench/results/arena';
const unique = (base: string, ext: string) => {
  let p = `${base}.${ext}`;
  for (let i = 2; existsSync(p); i++) p = `${base}-${i}.${ext}`;
  return p;
};
const guards = { maxPlies: 200, repetitionLimit: 3, maxGameMs: 120_000, openingPlies: 4 } as const;

const EXPERIMENTS: { id: string; question: string; config: TournamentConfig }[] = [
  {
    id: 'E1-pure-vs-guided-equal-time',
    question: 'Pure MCTS vs Guided MCTS — equal time 300 ms',
    config: { ...guards, agents: [defaultSpec('mcts'), defaultSpec('mcts-guided')], budget: { mode: 'equal-time', timeMs: 300 }, pairs: 4, seed: 7001 },
  },
  {
    id: 'E2-bfs-vs-alphabeta-fixed',
    question: 'BFS vs Alpha-Beta — fixed budget (depth 3)',
    config: { ...guards, agents: [defaultSpec('bfs'), { ...defaultSpec('alphabeta'), depth: 3 }], budget: { mode: 'fixed', timeMs: 0 }, pairs: 4, seed: 7002 },
  },
  {
    id: 'E3-alphabeta-vs-guided-equal-time',
    question: 'Alpha-Beta vs Guided MCTS — equal time 300 ms',
    config: { ...guards, agents: [defaultSpec('alphabeta'), defaultSpec('mcts-guided')], budget: { mode: 'equal-time', timeMs: 300 }, pairs: 4, seed: 7003 },
  },
  {
    id: 'E4-alphabeta-vs-guided-fixed',
    question: 'Alpha-Beta (depth 4) vs Guided MCTS (3000 simulations) — fixed budget',
    config: { ...guards, agents: [{ ...defaultSpec('alphabeta'), depth: 4 }, { ...defaultSpec('mcts-guided'), simulations: 3000 }], budget: { mode: 'fixed', timeMs: 0 }, pairs: 4, seed: 7004 },
  },
];

const signature = (games: readonly TournamentGame[]) => games.map((g) => `${g.outcome}:${g.moves.join(' ')}`).join('\n');

it('stage-5 arena experiments', async () => {
  mkdirSync(DIR, { recursive: true });
  const md: string[] = [];
  const log = (l = '') => {
    md.push(l);
    process.stdout.write(l + '\n');
  };
  log('# Stage 5 — Arena experiments (small samples)');
  log();
  log(`- ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · Node ${process.version} · ${cpus()[0]?.model ?? ''}`);
  log('- Paired matches: every opening is played twice with seats swapped. Openings: 4 random pawn plies from new seeds (7001–7004), never used before.');
  log('- Win rate = share of decisive games (rule wins); halts (repetition / max plies / time / user) are reported separately and excluded. 95 % Wilson intervals.');
  log('- Equal Time and Fixed Budget experiments are separate and must not be pooled.');
  log();

  for (const exp of EXPERIMENTS) {
    const t0 = performance.now();
    const runner = new TournamentRunner(exp.config, inProcessFactory);
    runner.start();
    await runner.idle();
    const { games } = runner.getSnapshot();
    const s = summarize(exp.config, games);
    const suspect =
      exp.config.budget.mode === 'equal-time'
        ? games.reduce((n, g) => n + g.agents.flatMap((a) => a.moves).filter((m) => m.ms > 5 * exp.config.budget.timeMs).length, 0)
        : 0;

    // Reproducibility: fixed-budget games must replay identically.
    let repro = 'n/a (equal time is machine-dependent)';
    if (exp.config.budget.mode === 'fixed') {
      const again = await playScheduledGame(exp.config, schedule(exp.config)[0], inProcessFactory);
      repro = signature([again]) === signature([games[0]]) ? 'identical replay of game 1 ✓' : 'DIFFERENT ✗';
    }

    const base = `${DIR}/${exp.id}`;
    writeFileSync(unique(base, 'json'), tournamentToJson(exp.config, games, { experiment: exp.id, question: exp.question, suspectDecisions: suspect, reproducibility: repro }));
    writeFileSync(unique(base, 'csv'), tournamentToCsv(exp.config, games));

    const [a, b] = s.agents;
    log(`## ${exp.id}: ${exp.question}`);
    log();
    log(`| | ${a.label} (A) | ${b.label} (B) |`);
    log('|---|---:|---:|');
    log(`| Wins (as first / second) | ${a.wins} (${a.winsAsFirst}/${a.winsAsSecond}) | ${b.wins} (${b.winsAsFirst}/${b.winsAsSecond}) |`);
    const f = (x: number | null, d = 0) => (x === null ? '—' : x.toFixed(d));
    log(`| Decision ms mean / median | ${f(a.decisionMsMean)} / ${f(a.decisionMsMedian)} | ${f(b.decisionMsMean)} / ${f(b.decisionMsMedian)} |`);
    log(`| Walls used per game | ${f(a.wallsUsedMean, 1)} | ${f(b.wallsUsedMean, 1)} |`);
    log(`| Nodes / simulations / depth per move | ${f(a.nodesMean)} / ${f(a.simulationsMean)} / ${f(a.depthMean, 1)} | ${f(b.nodesMean)} / ${f(b.simulationsMean)} / ${f(b.depthMean, 1)} |`);
    log();
    log(`- Games ${s.games}, decisive ${s.decisive}, halted: repetition ${s.halted.repetition}, max plies ${s.halted['max-plies']}, time ${s.halted['time-limit']}, user ${s.halted['user-stopped']}`);
    log(`- **A win rate: ${formatProportion(s.aWinRate)}**`);
    log(`- First-mover win rate: ${formatProportion(s.firstMoverWinRate)} · pairs: A swept ${s.pairs.aSweeps}, B swept ${s.pairs.bSweeps}, split ${s.pairs.split}, with halt ${s.pairs.withHalt}`);
    log(`- Plies mean / median: ${f(s.avgPlies, 1)} / ${f(s.medianPlies, 1)} · wall time ${((performance.now() - t0) / 60000).toFixed(1)} min · suspect decisions ${suspect} · reproducibility: ${repro}`);
    log();
    // Intermediate copy after every experiment (the final summary gets a unique name).
    writeFileSync(`${DIR}/summary.partial.md`, md.join('\n') + '\n');
  }
  writeFileSync(unique(`${DIR}/summary`, 'md'), md.join('\n') + '\n');
  rmSync(`${DIR}/summary.partial.md`, { force: true });
});
