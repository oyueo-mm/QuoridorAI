/**
 * Stage 3-A validation of the evaluation system (not part of `npm test`).
 *
 *   npx vitest run --config vitest.bench.config.ts bench/stage3a.bench.test.ts
 *
 * 1. Monte Carlo: error rates and sample sizes of the default SPRT under a seat-biased model
 *    whose seat bias is estimated from the real stage 1–2 games.
 * 2. Retro-SPRT: the sequential test applied, pair by pair in schedule order, to every
 *    finished stage 1–2 experiment (no new games): decision and pairs needed vs fixed samples.
 * 3. Game-level vs pair-level statistics on the same data (why S3's conclusions differ).
 * 4. Opening audit: diversity (exact and mirror-invariant), balance, seat bias, novelty.
 *
 * Writes bench/results/stage3a/validation-<timestamp>.{md,json}.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { createRng } from '../src/ai/rng';
import { DEFAULT_SPRT, eloToScore, sequentialTest, simulateSprt } from '../src/arena/sprt';
import type { SprtConfig } from '../src/arena/sprt';
import { wilson } from '../src/arena/stats';
import { mirrorInvariantKey, openingState, schedule } from '../src/arena/tournament';
import type { TournamentConfig } from '../src/arena/tournament';
import { distanceToRow, hashState } from '../src/engine';
import { collectProvenance } from './lib/provenance';
import { effectiveGames, pairPrefix, readGames } from './lib/suite';
import type { RecordedGame } from './lib/suite';
import { SUITES } from './stage1-suites';

const ROOTS = ['bench/results/stage1/stage1-fixed', 'bench/results/stage1/stage1-time', 'bench/results/stage2/stage2', 'bench/results/stage2/stage2b'];
const SKIP = new Set(['S4-new-vs-stage1-300']); // planned stop after 15 games, never analysed

interface Experiment {
  id: string;
  root: string;
  config: TournamentConfig;
  games: RecordedGame[];
}

function experiments(): Experiment[] {
  const out: Experiment[] = [];
  for (const root of ROOTS) {
    if (!existsSync(root)) continue;
    for (const id of readdirSync(root).sort()) {
      const cfgPath = join(root, id, 'config.json');
      if (SKIP.has(id) || !existsSync(cfgPath)) continue;
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { configHash: string; config: TournamentConfig };
      const games = readGames(join(root, id)).filter((g) => g.configHash === cfg.configHash);
      if (games.length) out.push({ id, root, config: cfg.config, games: effectiveGames(games) });
    }
  }
  return out;
}

const z = 1.959964;
const f = (x: number | null | undefined, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)}%`;
/** Two-sided p-value of a standard normal statistic. */
const pNormal = (zz: number) => {
  // Abramowitz–Stegun erfc approximation
  const x = Math.abs(zz) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  return erfc;
};

it('stage 3-A validation', () => {
  const prov = collectProvenance();
  const exps = experiments();
  const L: string[] = [];
  const log = (l = '') => {
    L.push(l);
    process.stdout.write(l + '\n');
  };
  const json: Record<string, unknown> = { provenance: prov };
  log('# Stage 3-A — validation of the sequential evaluation system');
  log();
  log(`- ${prov.timestamp} · commit ${prov.git.commit?.slice(0, 10)}${prov.git.srcDirty ? ' (+uncommitted src)' : ''} · ${prov.cpu} · Node ${prov.node}`);
  log(`- Default SPRT: H0 Elo = ${DEFAULT_SPRT.elo0}, H1 Elo = +${DEFAULT_SPRT.elo1}, α = β = ${DEFAULT_SPRT.alpha}, min ${DEFAULT_SPRT.minPairs} / max ${DEFAULT_SPRT.maxPairs} pairs; unit = opening pair (seats swapped).`);
  log(`- Data: ${exps.length} finished experiments, ${exps.reduce((s, e) => s + e.games.length, 0)} games (S4 excluded: planned stop).`);
  log();

  // ---------------------------------------------------------------- seat bias estimate
  // Fraction of split pairs where the same seat won both games, across all experiments.
  let splits = 0;
  let pairsTotal = 0;
  for (const e of exps) {
    const p = pairPrefix(e.games, e.config.pairs, { noRetries: true });
    pairsTotal += p.scores.length;
    splits += p.scores.filter((s) => s === 0.5).length;
  }
  const splitRate = splits / Math.max(1, pairsTotal);
  // Seat-bias σ (Elo) for which the model reproduces this split rate between equal players.
  const splitFor = (sigma: number) => {
    const rng = createRng(7);
    let n = 0;
    for (let i = 0; i < 20000; i++) {
      const u = Math.max(rng(), 1e-12);
      const b = sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
      const w1 = rng() < eloToScore(b) ? 1 : 0;
      const w2 = rng() < eloToScore(-b) ? 1 : 0;
      if (w1 + w2 === 1) n++;
    }
    return n / 20000;
  };
  let sigma = 0;
  for (let s = 0; s <= 1200; s += 25) {
    sigma = s;
    if (splitFor(s) >= splitRate) break;
  }
  log('## 1. Monte Carlo validation of the default SPRT');
  log();
  log(`Observed split-pair rate in ${pairsTotal} real pairs: ${pct(splitRate)} → model seat bias σ ≈ ${sigma} Elo (equal players then split ${pct(splitFor(sigma))} of pairs).`);
  log();
  log('| True Elo | Runs | Accept H1 (promote) | Accept H0 (reject) | Inconclusive (600 pairs) | Mean pairs | P90 pairs |');
  log('|---:|---:|---:|---:|---:|---:|---:|');
  const sims: Record<string, unknown> = {};
  for (const elo of [-30, 0, 10, 15, 20, 30, 45]) {
    const r = simulateSprt(elo, sigma, DEFAULT_SPRT, 1000, createRng(1000 + elo));
    sims[elo] = r;
    log(`| ${elo >= 0 ? '+' : ''}${elo} | ${r.runs} | ${pct(r.acceptH1 / r.runs)} | ${pct(r.acceptH0 / r.runs)} | ${pct(r.inconclusive / r.runs)} | ${f(r.meanPairs, 0)} | ${r.p90Pairs} |`);
  }
  json.monteCarlo = { splitRate, sigma, sims };
  log();
  log(`Sampling error of each rate: ±${pct(z * Math.sqrt(0.05 * 0.95 / 1000))} around 5 %. Rows Elo 0 and +30 check α and β; Elo between the hypotheses mostly ends inconclusive or either way — that is by design.`);
  log();

  // ---------------------------------------------------------------- retro SPRT
  log('## 2. Retro-SPRT on finished experiments (pairs in schedule order, no new games)');
  log();
  log('| Experiment | Pairs available (valid) | Fixed-sample pair score (95% CI) | SPRT decision | Pairs needed | LLR | Excluded pairs (halt / suspect) |');
  log('|---|---:|---|---|---:|---:|---|');
  const retro: Record<string, unknown> = {};
  for (const e of exps) {
    const p = pairPrefix(e.games, e.config.pairs, { noRetries: true });
    if (p.scores.length < 10) continue;
    const cfg: SprtConfig = { ...DEFAULT_SPRT, maxPairs: Math.max(DEFAULT_SPRT.minPairs, p.scores.length) };
    const r = sequentialTest(p.scores, cfg);
    const whole = sequentialTest(p.scores, { ...cfg, minPairs: p.scores.length, maxPairs: p.scores.length });
    retro[e.id] = { decision: r, valid: p.scores.length, excludedHalted: p.excludedHalted, excludedSuspect: p.excludedSuspect };
    const verdict = r.status === 'accept-H1' ? '**promote (H1)**' : r.status === 'accept-H0' ? '**reject (H0)**' : r.status === 'inconclusive' ? 'inconclusive' : 'undecided';
    log(`| ${e.id} | ${p.scores.length} | ${f(whole.score, 3)} (${f(whole.scoreLow, 3)}–${f(whole.scoreHigh, 3)}) | ${verdict} | ${r.status === 'inconclusive' ? '—' : r.pairs} | ${f(r.llr, 2)} | ${p.excludedHalted} / ${p.excludedSuspect} |`);
  }
  json.retro = retro;
  log();
  log('"inconclusive" = all available pairs used without crossing a bound (the experiment was too small to decide between Elo 0 and +30). A is the first-named agent of each experiment.');
  log();

  // ---------------------------------------------------------------- game vs pair statistics
  log('## 3. Game-level vs pair-level statistics');
  log();
  log('| Experiment | Games (decisive) | A win rate (Wilson 95%) | game-level p | Pairs LL / split / WW | Pair score (95%) | pair-level p | Sign test WW vs LL p | Corr(game 1, game 2) | Design effect |');
  log('|---|---:|---|---:|---|---|---:|---:|---:|---:|');
  const gp: Record<string, unknown> = {};
  for (const e of exps.filter((x) => ['S3-defense-vs-path-d4', 'S6-defense3-vs-path-300', 'S1-masked-vs-reference-300', 'F3-ab4-vs-ab3', 'T300-ab-vs-guided', 'S7-masked-vs-guided-300'].includes(x.id))) {
    const dec = e.games.filter((g) => g.outcome === 'a-win' || g.outcome === 'b-win');
    const k = dec.filter((g) => g.outcome === 'a-win').length;
    const w = wilson(k, dec.length)!;
    const pGame = pNormal((k / dec.length - 0.5) / Math.sqrt(0.25 / dec.length));
    const p = pairPrefix(e.games, e.config.pairs, { noRetries: true });
    const n = p.scores.length;
    const ll = p.scores.filter((s) => s === 0).length;
    const sp = p.scores.filter((s) => s === 0.5).length;
    const ww = p.scores.filter((s) => s === 1).length;
    const m = (0.5 * sp + ww) / n;
    const v = ((0.25 * sp + ww) / n - m * m) * (n / (n - 1));
    const half = z * Math.sqrt(v / n);
    const pPair = pNormal((m - 0.5) / Math.sqrt(v / n));
    // Exact two-sided sign test on non-split pairs.
    const d = ww + ll;
    let tail = 0;
    const lo = Math.min(ww, ll);
    let c = 1;
    for (let i = 0; i <= d; i++) {
      if (i > 0) c = (c * (d - i + 1)) / i;
      if (i <= lo) tail += c;
    }
    const pSign = Math.min(1, (2 * tail) / Math.pow(2, d));
    // Correlation of A's results in the two games of a pair (values 0/1).
    const corr = (() => {
      const xs: [number, number][] = [];
      const byPair = new Map<number, RecordedGame[]>();
      for (const g of e.games) byPair.set(g.pair, [...(byPair.get(g.pair) ?? []), g]);
      for (const pg of byPair.values()) {
        if (pg.length !== 2 || !pg.every((g) => g.outcome === 'a-win' || g.outcome === 'b-win')) continue;
        const a = pg.find((g) => g.aSeat === 0)!;
        const b = pg.find((g) => g.aSeat === 1)!;
        xs.push([a.outcome === 'a-win' ? 1 : 0, b.outcome === 'a-win' ? 1 : 0]);
      }
      const mx = xs.reduce((s, x) => s + x[0], 0) / xs.length;
      const my = xs.reduce((s, x) => s + x[1], 0) / xs.length;
      const cov = xs.reduce((s, x) => s + (x[0] - mx) * (x[1] - my), 0) / xs.length;
      const sx = Math.sqrt(xs.reduce((s, x) => s + (x[0] - mx) ** 2, 0) / xs.length);
      const sy = Math.sqrt(xs.reduce((s, x) => s + (x[1] - my) ** 2, 0) / xs.length);
      return sx && sy ? cov / (sx * sy) : 0;
    })();
    const designEffect = 1 + corr; // variance of a pair mean relative to two independent games
    gp[e.id] = { games: dec.length, k, wilson: w, pGame, ll, sp, ww, mean: m, half, pPair, pSign, corr };
    log(`| ${e.id} | ${dec.length} | ${pct(w.p)} (${pct(w.low)}–${pct(w.high)}) | ${f(pGame, 3)} | ${ll} / ${sp} / ${ww} | ${f(m, 3)} (${f(m - half, 3)}–${f(m + half, 3)}) | ${f(pPair, 3)} | ${f(pSign, 3)} | ${f(corr, 2)} | ${f(designEffect, 2)} |`);
  }
  json.gameVsPair = gp;
  log();
  log('Corr < 0 means the seat decides many pairs (one win each): pairs then vary less than two independent games, so the pair-level interval is narrower than the game-level Wilson interval (design effect < 1). The game-level Wilson interval assumes independent games and is too wide here; the sign test uses only WW/LL pairs and is the most conservative.');
  log();

  // ---------------------------------------------------------------- opening audit
  log('## 4. Opening audit');
  log();
  log('| Experiment | Pairs | Distinct (exact) | Distinct (mirror-invariant) | New vs all earlier experiments | Plies | |d0−d1| mean | First-mover win rate (95%) | Split pairs |');
  log('|---|---:|---:|---:|---:|---|---:|---|---:|');
  const seenBefore = new Set<string>();
  const audit: Record<string, unknown> = {};
  for (const e of exps) {
    const openings = new Map<number, RecordedGame['opening']>();
    for (const g of e.games) openings.set(g.pair, g.opening);
    const states = [...openings.values()].map(openingState);
    const exact = new Set(states.map((s) => JSON.stringify(hashState(s))));
    const mirror = states.map(mirrorInvariantKey);
    const mirrorSet = new Set(mirror);
    const fresh = mirror.filter((k) => !seenBefore.has(k)).length;
    const imb = states.map((s) => Math.abs(distanceToRow(s, s.pawns[0], 0) - distanceToRow(s, s.pawns[1], 8)));
    const plies = [...openings.values()].map((o) => o.moves.length);
    const dec = e.games.filter((g) => g.outcome === 'a-win' || g.outcome === 'b-win');
    const first = dec.filter((g) => (g.outcome === 'a-win') === (g.aSeat === 0)).length;
    const fw = wilson(first, dec.length)!;
    const p = pairPrefix(e.games, e.config.pairs, { noRetries: true });
    const sp = p.scores.filter((s) => s === 0.5).length / Math.max(1, p.scores.length);
    audit[e.id] = { pairs: openings.size, exact: exact.size, mirror: mirrorSet.size, fresh, firstMover: fw, split: sp };
    log(`| ${e.id} | ${openings.size} | ${exact.size} | ${mirrorSet.size} | ${fresh} (${pct(fresh / openings.size, 0)}) | ${Math.min(...plies)}–${Math.max(...plies)} | ${f(imb.reduce((a, b) => a + b, 0) / imb.length, 2)} | ${pct(fw.p)} (${pct(fw.low, 0)}–${pct(fw.high, 0)}) | ${pct(sp, 0)} |`);
    for (const k of mirrorSet) seenBefore.add(k);
  }
  // The stage-3A schedule (not played yet): novelty against everything above.
  for (const m of SUITES['stage3a']?.matchups ?? []) {
    const sched = schedule(m.config, SUITES['stage3a'].maxGames).filter((g) => g.aSeat === 0);
    const keys = sched.map((g) => mirrorInvariantKey(openingState(g.opening)));
    const fresh = keys.filter((k) => !seenBefore.has(k)).length;
    log(`| (planned) ${m.id} | ${keys.length} | — | ${new Set(keys).size} | ${fresh} (${pct(fresh / keys.length, 0)}) | ${Math.min(...sched.map((g) => g.opening.moves.length))}–${Math.max(...sched.map((g) => g.opening.moves.length))} | — | — | — |`);
  }
  json.openings = audit;
  log();
  log('"New" counts openings whose mirror-invariant position never occurred in an earlier experiment (experiments in the order listed).');
  log();

  mkdirSync('bench/results/stage3a', { recursive: true });
  const stamp = prov.timestamp.replace(/[:.]/g, '-');
  writeFileSync(`bench/results/stage3a/validation-${stamp}.md`, L.join('\n') + '\n');
  writeFileSync(`bench/results/stage3a/validation-${stamp}.json`, JSON.stringify(json, null, 1) + '\n');
}, 60 * 60 * 1000);
