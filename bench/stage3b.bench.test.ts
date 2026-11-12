/**
 * Stage 3-B tooling (not part of `npm test`). STAGE3B=ledger | e5fit | cost
 *
 *   ledger  bench/openings/ledger-<sha8>.txt: mirror-invariant keys of every opening used by an
 *           earlier experiment (stage 1, 2, 3-A incl. the full V2 schedule). 3-B schedules exclude
 *           them, so confirmation openings are new and disjoint from E5's training games.
 *   e5fit   E5: fits the existing linear evaluation weights to recorded game outcomes
 *           (logistic regression). Train/validation split by mirror-invariant OPENING (both games
 *           of a pair, mirrored and repeated openings stay on one side); validation positions whose
 *           mirror-invariant key occurs in training are dropped. Labels are outcomes, never moves.
 *           → bench/results/stage3b/e5-fit-<timestamp>.{md,json}
 *   cost    evaluation cost (µs) and fixed-depth search cost of every candidate
 *           → bench/results/stage3b/cost-<timestamp>.md
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { DEFAULT_MINIMAX_SETTINGS } from '../src/ai/minimaxAgent';
import { RACE_EVAL_V1, createDistanceEvaluator } from '../src/ai/search/evaluation';
import { runSearch } from '../src/ai/search/minimax';
import type { MinimaxEvalWeights } from '../src/ai/types';
import { parseMoveList, randomMixedOpening } from '../src/arena/openings';
import { percentile } from '../src/arena/stats';
import { mirrorInvariantKey, openingState } from '../src/arena/tournament';
import type { TournamentConfig } from '../src/arena/tournament';
import { applyActionUnchecked, distanceToRow, goalRow, opponentOf } from '../src/engine';
import type { GameState, PlayerId } from '../src/engine';
import { collectProvenance } from './lib/provenance';
import { hashOf } from './lib/provenance';
import { effectiveGames, pairPrefix, readGames, scheduleFor, sprtStatus } from './lib/suite';
import { describeSprt } from '../src/arena/sprt';
import type { RecordedGame } from './lib/suite';
import { EVAL_CANDIDATES } from './stage3b-candidates';
import { SUITES } from './stage1-suites';

const ROOTS = ['bench/results/stage1/stage1-fixed', 'bench/results/stage1/stage1-time', 'bench/results/stage2/stage2', 'bench/results/stage2/stage2b', 'bench/results/stage3a/stage3a'];

/** Stage 3-B result roots: added to the follow-up ledger (not to E5's training data). */
const ROOTS_3B = ['bench/results/stage3b/stage3b-fixed', 'bench/results/stage3b/stage3b-time'];

function recorded(includeRunning: boolean, roots: readonly string[] = ROOTS): { id: string; config: TournamentConfig; games: RecordedGame[] }[] {
  const out = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root).sort()) {
      const p = join(root, id, 'config.json');
      if (!existsSync(p)) continue;
      if (!includeRunning && id.startsWith('V2-')) continue; // still running when 3-B started
      const cfg = JSON.parse(readFileSync(p, 'utf8')) as { configHash: string; config: TournamentConfig };
      out.push({ id, config: cfg.config, games: effectiveGames(readGames(join(root, id)).filter((g) => g.configHash === cfg.configHash)) });
    }
  }
  return out;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---------------------------------------------------------------- ledger
function buildLedger(upTo3B: boolean) {
  const keys = new Set<string>();
  for (const e of recorded(true, upTo3B ? [...ROOTS, ...ROOTS_3B] : ROOTS)) for (const g of e.games) keys.add(mirrorInvariantKey(openingState(g.opening)));
  // Full schedules of stage-3A matchups (V2 may still be adding pairs).
  for (const m of SUITES['stage3a'].matchups) for (const g of scheduleFor(m.config, SUITES['stage3a'].maxGames)) keys.add(mirrorInvariantKey(openingState(g.opening)));
  const sorted = [...keys].sort();
  const body = sorted.join('\n') + '\n';
  const sha = createHash('sha256').update(body).digest('hex').slice(0, 8);
  mkdirSync('bench/openings', { recursive: true });
  const path = `bench/openings/ledger-${sha}.txt`;
  writeFileSync(path, `# Mirror-invariant keys of every opening used up to stage 3-A (${sorted.length}). Content hash ${sha}. Do not edit.\n` + body);
  process.stdout.write(`ledger ${path} with ${sorted.length} keys\n`);
}

// ---------------------------------------------------------------- E5 fit
interface Sample {
  x: number[]; // [1 (side to move), dOpp, dSelf, wallsSelf − wallsOpp] from the side to move's view
  y: number; // 1 = side to move won the game
  key: string; // mirror-invariant position key
}

function samplesOf(g: RecordedGame): Sample[] {
  if (g.outcome !== 'a-win' && g.outcome !== 'b-win') return [];
  const winnerSeat: PlayerId = g.outcome === 'a-win' ? g.aSeat : g.aSeat === 0 ? 1 : 0;
  const parsed = parseMoveList([...g.opening.moves, ...g.moves].join(' '));
  if (parsed.error) return [];
  const out: Sample[] = [];
  parsed.positions.forEach((s, i) => {
    if (i < g.opening.moves.length || s.winner !== null) return;
    const me = s.currentPlayer;
    const opp = opponentOf(me);
    out.push({
      x: [1, distanceToRow(s, s.pawns[opp], goalRow(opp)), distanceToRow(s, s.pawns[me], goalRow(me)), s.wallsRemaining[me] - s.wallsRemaining[opp]],
      y: me === winnerSeat ? 1 : 0,
      key: mirrorInvariantKey(s),
    });
  });
  return out;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** L2-regularised logistic regression by Newton's method (4 parameters). */
function fitLogistic(data: Sample[], lambda = 1e-3): number[] {
  const k = data[0].x.length;
  let b = new Array(k).fill(0);
  for (let iter = 0; iter < 50; iter++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const d of data) {
      const p = sigmoid(d.x.reduce((s, xi, i) => s + xi * b[i], 0));
      const w = p * (1 - p);
      for (let i = 0; i < k; i++) {
        g[i] += (d.y - p) * d.x[i];
        for (let j = 0; j < k; j++) H[i][j] += w * d.x[i] * d.x[j];
      }
    }
    for (let i = 0; i < k; i++) {
      g[i] -= lambda * data.length * b[i];
      H[i][i] += lambda * data.length;
    }
    const step = solve(H, g);
    b = b.map((bi, i) => bi + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return b;
}

function solve(A: number[][], y: number[]): number[] {
  const n = y.length;
  const M = A.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

const logLoss = (data: Sample[], f: (x: number[]) => number) =>
  data.reduce((s, d) => {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(f(d.x))));
    return s - (d.y * Math.log(p) + (1 - d.y) * Math.log(1 - p));
  }, 0) / data.length;

function e5fit() {
  const prov = collectProvenance();
  const exps = recorded(false);
  // Split by opening (mirror-invariant), deterministic: hash of the key.
  const fold = (openingKey: string) => parseInt(createHash('sha256').update(openingKey).digest('hex').slice(0, 8), 16) % 5 === 0 ? 'val' : 'train';
  const train: Sample[] = [];
  const valAll: Sample[] = [];
  let games = 0;
  const openingsBySide = { train: new Set<string>(), val: new Set<string>() };
  for (const e of exps) {
    for (const g of e.games) {
      const ok = mirrorInvariantKey(openingState(g.opening));
      const side = fold(ok);
      openingsBySide[side].add(ok);
      const s = samplesOf(g);
      if (s.length) games++;
      (side === 'train' ? train : valAll).push(...s);
    }
  }
  const trainKeys = new Set(train.map((s) => s.key));
  const val = valAll.filter((s) => !trainKeys.has(s.key));
  const overlap = [...openingsBySide.val].filter((k) => openingsBySide.train.has(k)).length;
  if (overlap !== 0) throw new Error('opening leaked across the split');

  // Baseline: current weights, one fitted scale k (training data only).
  const base = RACE_EVAL_V1;
  const baseScore = (x: number[]) => base.tempo * x[0] + base.opponentDistance * x[1] - base.selfDistance * x[2] + base.wallDifference * x[3];
  let k = 0.1;
  {
    let lo = 0.001;
    let hi = 3;
    for (let i = 0; i < 80; i++) {
      const m1 = lo + (hi - lo) / 3;
      const m2 = hi - (hi - lo) / 3;
      if (logLoss(train, (x) => m1 * baseScore(x)) < logLoss(train, (x) => m2 * baseScore(x))) hi = m2;
      else lo = m1;
    }
    k = (lo + hi) / 2;
  }
  const beta = fitLogistic(train);
  const fitted = (x: number[]) => beta.reduce((s, b, i) => s + b * x[i], 0);
  const constant = (() => {
    const p = train.reduce((s, d) => s + d.y, 0) / train.length;
    return () => Math.log(p / (1 - p));
  })();
  // Map to evaluation weights: tempo·1 + opp·dOpp − self·dSelf + wall·Δwalls, scaled so opponentDistance = 1.
  const scale = beta[1];
  const weights: MinimaxEvalWeights = {
    tempo: round(beta[0] / scale),
    opponentDistance: 1,
    selfDistance: round(-beta[2] / scale),
    wallDifference: round(beta[3] / scale),
  };
  const out = {
    provenance: prov,
    experiments: exps.map((e) => e.id),
    games,
    positions: { train: train.length, validation: val.length, droppedAsDuplicates: valAll.length - val.length },
    openings: { train: openingsBySide.train.size, validation: openingsBySide.val.size, overlap },
    baselineScale: k,
    coefficients: beta,
    weights,
    validationLogLoss: { constant: logLoss(val, constant), baseline: logLoss(val, (x) => k * baseScore(x)), fitted: logLoss(val, fitted) },
    trainLogLoss: { baseline: logLoss(train, (x) => k * baseScore(x)), fitted: logLoss(train, fitted) },
  };
  mkdirSync('bench/results/stage3b', { recursive: true });
  const st = stamp();
  writeFileSync(`bench/results/stage3b/e5-fit-${st}.json`, JSON.stringify(out, null, 1) + '\n');
  const L = [
    '# E5 — evaluation weights fitted to recorded outcomes',
    '',
    `- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)} · ${games} decisive games from ${exps.length} experiments (stage 1, 2, 3-A V1/V1b; V2 excluded while running)`,
    `- Split by mirror-invariant opening (20 % validation): ${out.openings.train} / ${out.openings.validation} openings, overlap ${overlap}. Validation positions also seen in training (mirror-invariant) dropped: ${out.positions.droppedAsDuplicates}.`,
    `- Positions: train ${train.length}, validation ${val.length}. Features from the side to move: 1, d_opp, d_self, walls_self − walls_opp. Label: the side to move won the game.`,
    '',
    '| Model | Validation log-loss | Training log-loss |',
    '|---|---:|---:|',
    `| constant (base rate) | ${out.validationLogLoss.constant.toFixed(4)} | — |`,
    `| current weights × fitted scale k = ${k.toFixed(3)} | ${out.validationLogLoss.baseline.toFixed(4)} | ${out.trainLogLoss.baseline.toFixed(4)} |`,
    `| fitted weights | ${out.validationLogLoss.fitted.toFixed(4)} | ${out.trainLogLoss.fitted.toFixed(4)} |`,
    '',
    `Fitted evaluation weights (opponentDistance normalised to 1): \`${JSON.stringify(weights)}\` — current: \`${JSON.stringify(RACE_EVAL_V1)}\`.`,
    '',
    'Caveat: labels are outcomes of games between these engines. A lower log-loss means the weights *predict* those outcomes better; it is not evidence that moves chosen with them are better. Only the SPRT games decide.',
  ];
  writeFileSync(`bench/results/stage3b/e5-fit-${st}.md`, L.join('\n') + '\n');
  process.stdout.write(L.join('\n') + '\n');
}

const round = (x: number) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------- cost
function cost() {
  const prov = collectProvenance();
  const positions: GameState[] = [];
  for (let seed = 1; positions.length < 120; seed++) {
    let s = randomMixedOpening({ seed: 500 + seed, plies: 8, wallProbability: 0.35, maxImbalance: 3 }).state;
    for (let i = 0; i < 20 && s.winner === null; i++) {
      if (i % 4 === 0) positions.push(s);
      s = applyActionUnchecked(s, runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: 2, timeLimitMs: 0 }, createDistanceEvaluator(RACE_EVAL_V1)).bestAction);
    }
  }
  const L = ['# Stage 3-B — evaluation cost per candidate', '', `- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)} · power ${prov.power} · ${prov.cpu}`, `- ${positions.length} positions; µs = median of 5 timing runs; search: depth 4, opponent-path, 12 positions.`, '', '| Candidate | evaluate µs | ×base | depth-4 search: nodes | ms | ×base time |', '|---|---:|---:|---:|---:|---:|'];
  let baseUs = 0;
  let baseMs = 0;
  for (const [id, w] of Object.entries({ base: RACE_EVAL_V1, ...EVAL_CANDIDATES })) {
    const ev = createDistanceEvaluator(w);
    const runs: number[] = [];
    for (let r = 0; r < 6; r++) {
      const t0 = performance.now();
      let n = 0;
      while (performance.now() - t0 < 80) {
        for (const s of positions) ev.evaluate(s, s.currentPlayer);
        n += positions.length;
      }
      if (r > 0) runs.push(((performance.now() - t0) * 1000) / n);
    }
    const us = percentile(runs, 0.5)!;
    let nodes = 0;
    const t0 = performance.now();
    for (const s of positions.slice(0, 12)) nodes += runSearch(s, { ...DEFAULT_MINIMAX_SETTINGS, maxDepth: 4, timeLimitMs: 0, evaluation: w }, ev).stats.nodes;
    const ms = performance.now() - t0;
    if (id === 'base') {
      baseUs = us;
      baseMs = ms;
    }
    L.push(`| ${id} | ${us.toFixed(2)} | ${(us / baseUs).toFixed(2)} | ${nodes.toLocaleString('en-US')} | ${ms.toFixed(0)} | ${(ms / baseMs).toFixed(2)} |`);
  }
  mkdirSync('bench/results/stage3b', { recursive: true });
  writeFileSync(`bench/results/stage3b/cost-${stamp()}.md`, L.join('\n') + '\n');
  process.stdout.write(L.join('\n') + '\n');
}

/** Candidates whose fixed-depth SPRT accepted H1 → bench/results/stage3b/promoted-fixed.txt. */
function select() {
  const root = 'bench/results/stage3b/stage3b-fixed';
  const lines: string[] = [];
  const promoted: string[] = [];
  for (const m of SUITES['stage3b-fixed'].matchups) {
    const games = readGames(join(root, m.id)).filter((g) => g.configHash === hashOf(m.config));
    const st = sprtStatus(m, games);
    lines.push(`${m.id}: ${st ? describeSprt(st) : 'no data'}`);
    if (st?.status === 'accept-H1') promoted.push(m.id.split('-')[1]);
  }
  mkdirSync('bench/results/stage3b', { recursive: true });
  const NL = String.fromCharCode(10);
  writeFileSync('bench/results/stage3b/promoted-fixed.txt', promoted.join(',') + NL);
  writeFileSync('bench/results/stage3b/fixed-decisions.txt', lines.join(NL) + NL);
  process.stdout.write(lines.join(NL) + `${NL}promoted: ${promoted.join(',') || '(none)'}${NL}`);
}

/**
 * Pilot gate for T-E6-300 (rule fixed before the pilot): STOP only on clear harm — the pilot's
 * pair-score 95% CI lies entirely below 0.5 — or when over 10 % of pilot pairs are unusable
 * (halts / suspect games: an engineering problem). Otherwise GO. The pilot never enters the SPRT
 * (different seed and openings) and the SPRT bounds are unchanged; "no significant pilot result"
 * is the expected outcome for a small effect and is not a reason to stop.
 * → bench/results/stage3b/gate-E6.txt ("go" or "stop" on the first line, then the reason).
 */
function gate() {
  const m = SUITES['stage3b-next'].matchups.find((x) => x.id === 'P-E6-300')!;
  const games = readGames(join('bench/results/stage3b/stage3b-next', m.id)).filter((g) => g.configHash === hashOf(m.config));
  const pre = pairPrefix(games, m.config.pairs);
  const n = pre.scores.length;
  const unusable = pre.excludedHalted + pre.excludedSuspect;
  const NL = String.fromCharCode(10);
  let verdict = 'go';
  let reason: string;
  if (pre.nextPair < m.config.pairs) {
    verdict = 'stop';
    reason = `pilot incomplete: ${pre.nextPair}/${m.config.pairs} pairs`;
  } else {
    const mean = pre.scores.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(pre.scores.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
    const hi = mean + (1.96 * sd) / Math.sqrt(n);
    const lo = mean - (1.96 * sd) / Math.sqrt(n);
    reason = `pilot ${n} valid pairs, pair score ${mean.toFixed(3)} (95% CI ${lo.toFixed(3)}–${hi.toFixed(3)}), unusable pairs ${unusable}`;
    if (hi < 0.5) verdict = 'stop';
    if (unusable > 0.1 * m.config.pairs) verdict = 'stop';
  }
  mkdirSync('bench/results/stage3b', { recursive: true });
  writeFileSync('bench/results/stage3b/gate-E6.txt', verdict + NL + reason + NL);
  process.stdout.write(`gate: ${verdict} — ${reason}${NL}`);
}

it('stage 3-B tooling', () => {
  const mode = process.env.STAGE3B ?? '';
  if (mode === 'ledger') buildLedger(false);
  else if (mode === 'ledger3b') buildLedger(true);
  else if (mode === 'e5fit') e5fit();
  else if (mode === 'cost') cost();
  else if (mode === 'select') select();
  else if (mode === 'gate') gate();
  else throw new Error('STAGE3B must be ledger, ledger3b, e5fit, cost, select or gate');
}, 60 * 60 * 1000);
