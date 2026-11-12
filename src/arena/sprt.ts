/**
 * Sequential probability ratio test (SPRT) on paired games.
 *
 * Unit of observation: an opening pair — the same start position played twice with the seats
 * swapped. A's pair score is 0 (lost both), ½ (one each) or 1 (won both). Games inside a pair
 * are not independent (the opening usually favours one seat), so the test works on pair scores
 * (a trinomial distribution), never on single games. Pairs containing a halted game have no
 * result and are excluded (reported separately).
 *
 * Hypotheses (logistic Elo of A relative to B, expected score s(E) = 1 / (1 + 10^(−E/400))):
 *   H0: E = elo0   (e.g. 0 — "no improvement")
 *   H1: E = elo1   (e.g. +30 — "the improvement we care about")
 * Statistic: generalized log-likelihood ratio (GSPRT): the trinomial distribution is fitted by
 * maximum likelihood under each hypothesis' mean constraint (as in Fishtest's pentanomial
 * SPRT); a normal approximation is provided for cross-checking.
 * Bounds (Wald): accept H1 when LLR ≥ ln((1−β)/α), accept H0 when LLR ≤ ln(β/(1−α)).
 * The test is evaluated after every pair once `minPairs` pairs exist; reaching `maxPairs`
 * without crossing a bound ends it as "inconclusive" — the data cannot separate H0 from H1.
 */

export interface SprtConfig {
  elo0: number;
  elo1: number;
  /** P(accept H1 | H0 true). */
  alpha: number;
  /** P(accept H0 | H1 true). */
  beta: number;
  /** No decision before this many valid pairs (the asymptotic LLR needs a few dozen). */
  minPairs: number;
  /** Truncation: "inconclusive" when reached without a decision. */
  maxPairs: number;
}

export const DEFAULT_SPRT: SprtConfig = { elo0: 0, elo1: 30, alpha: 0.05, beta: 0.05, minPairs: 30, maxPairs: 600 };

export type SprtStatus = 'accept-H1' | 'accept-H0' | 'continue' | 'inconclusive';

export interface PairCounts {
  /** A lost both games. */
  ll: number;
  /** One win each (the seat decided the pair). */
  split: number;
  /** A won both games. */
  ww: number;
}

export interface SprtResult {
  status: SprtStatus;
  /** Valid pairs the decision is based on. */
  pairs: number;
  counts: PairCounts;
  llr: number;
  llrNormal: number;
  lower: number;
  upper: number;
  /** Pair-score mean and 95 % interval, and the same as Elo. */
  score: number;
  scoreLow: number;
  scoreHigh: number;
  elo: number | null;
  eloLow: number | null;
  eloHigh: number | null;
  config: SprtConfig;
}

export const eloToScore = (elo: number) => 1 / (1 + Math.pow(10, -elo / 400));

export function scoreToElo(score: number): number | null {
  if (!(score > 0 && score < 1)) return null;
  return -400 * Math.log10(1 / score - 1);
}

export function sprtBounds(alpha: number, beta: number): { lower: number; upper: number } {
  return { lower: Math.log(beta / (1 - alpha)), upper: Math.log((1 - beta) / alpha) };
}

const VALUES = [0, 0.5, 1] as const;
/** Pseudo-count per category: keeps the constrained MLE defined when a category is empty. */
const PRIOR = 1e-3;

/**
 * λ of the constrained MLE p_j = q_j / (1 + λ (v_j − s)) with Σ p_j = 1, Σ p_j v_j = s,
 * found by bisection on the monotone function Σ q_j (v_j − s) / (1 + λ (v_j − s)).
 */
function tiltLambda(q: readonly number[], s: number): number {
  let lo = -1 / (1 - s) + 1e-12; // keeps 1 + λ (1 − s) > 0
  let hi = 1 / s - 1e-12; // keeps 1 + λ (0 − s) > 0
  const f = (l: number) => q.reduce((acc, qj, j) => acc + (qj * (VALUES[j] - s)) / (1 + l * (VALUES[j] - s)), 0);
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Generalized LLR of H1 vs H0 for trinomial pair counts. */
export function llrTrinomial(counts: PairCounts, elo0: number, elo1: number): number {
  const n = [counts.ll, counts.split, counts.ww];
  const total = n[0] + n[1] + n[2];
  if (total === 0) return 0;
  const q = n.map((x) => (x + PRIOR) / (total + 3 * PRIOR));
  const s0 = eloToScore(elo0);
  const s1 = eloToScore(elo1);
  const l0 = tiltLambda(q, s0);
  const l1 = tiltLambda(q, s1);
  let llr = 0;
  for (let j = 0; j < 3; j++) {
    if (n[j] === 0) continue;
    llr += n[j] * (Math.log(1 + l0 * (VALUES[j] - s0)) - Math.log(1 + l1 * (VALUES[j] - s1)));
  }
  return llr;
}

/** Normal approximation of the same LLR: n (s1 − s0)(2 x̄ − s0 − s1) / (2 σ²). */
export function llrNormal(counts: PairCounts, elo0: number, elo1: number): number {
  const total = counts.ll + counts.split + counts.ww;
  if (total < 2) return 0;
  const mean = (0.5 * counts.split + counts.ww) / total;
  const ex2 = (0.25 * counts.split + counts.ww) / total;
  const variance = Math.max(ex2 - mean * mean, 1e-6);
  const s0 = eloToScore(elo0);
  const s1 = eloToScore(elo1);
  return (total * (s1 - s0) * (2 * mean - s0 - s1)) / (2 * variance);
}

export function countPairs(scores: readonly number[]): PairCounts {
  const c: PairCounts = { ll: 0, split: 0, ww: 0 };
  for (const s of scores) {
    if (s === 0) c.ll++;
    else if (s === 1) c.ww++;
    else if (s === 0.5) c.split++;
    else throw new Error(`pair score must be 0, 0.5 or 1 (got ${s})`);
  }
  return c;
}

/** Pair-score mean with a normal 95 % interval (unit = pair), and the Elo equivalents. */
function pairInterval(c: PairCounts) {
  const n = c.ll + c.split + c.ww;
  const mean = n ? (0.5 * c.split + c.ww) / n : 0.5;
  const ex2 = n ? (0.25 * c.split + c.ww) / n : 0.25;
  const sd = n > 1 ? Math.sqrt(Math.max(0, ex2 - mean * mean) * (n / (n - 1))) : 0;
  const half = n > 1 ? (1.959964 * sd) / Math.sqrt(n) : 0.5;
  const low = Math.max(0, mean - half);
  const high = Math.min(1, mean + half);
  return { mean, low, high, elo: scoreToElo(mean), eloLow: scoreToElo(low), eloHigh: scoreToElo(high) };
}

function result(status: SprtStatus, c: PairCounts, config: SprtConfig): SprtResult {
  const { lower, upper } = sprtBounds(config.alpha, config.beta);
  const iv = pairInterval(c);
  return {
    status,
    pairs: c.ll + c.split + c.ww,
    counts: { ...c },
    llr: llrTrinomial(c, config.elo0, config.elo1),
    llrNormal: llrNormal(c, config.elo0, config.elo1),
    lower,
    upper,
    score: iv.mean,
    scoreLow: iv.low,
    scoreHigh: iv.high,
    elo: iv.elo,
    eloLow: iv.eloLow,
    eloHigh: iv.eloHigh,
    config,
  };
}

/**
 * Runs the sequential test over pair scores in schedule order (the caller passes the longest
 * prefix of consecutively completed pairs, so the decision never depends on which process
 * finished first). Stops at the first bound crossing at or after `minPairs`; pairs beyond the
 * stopping point do not change the decision.
 */
export function sequentialTest(pairScores: readonly number[], config: SprtConfig): SprtResult {
  if (config.elo1 <= config.elo0) throw new Error('SPRT needs elo1 > elo0');
  const { lower, upper } = sprtBounds(config.alpha, config.beta);
  const c: PairCounts = { ll: 0, split: 0, ww: 0 };
  for (let i = 0; i < pairScores.length && i < config.maxPairs; i++) {
    const s = pairScores[i];
    if (s === 0) c.ll++;
    else if (s === 1) c.ww++;
    else c.split++;
    if (i + 1 < config.minPairs) continue;
    const llr = llrTrinomial(c, config.elo0, config.elo1);
    if (llr >= upper) return result('accept-H1', c, config);
    if (llr <= lower) return result('accept-H0', c, config);
  }
  const n = c.ll + c.split + c.ww;
  return result(n >= config.maxPairs ? 'inconclusive' : 'continue', c, config);
}

export function describeSprt(r: SprtResult): string {
  const h = `H0: Elo=${r.config.elo0} vs H1: Elo=${r.config.elo1}, α=${r.config.alpha}, β=${r.config.beta}`;
  const f = (x: number | null) => (x === null ? '∞' : `${x >= 0 ? '+' : ''}${x.toFixed(0)}`);
  const verdict =
    r.status === 'accept-H1'
      ? 'H1 accepted — promote'
      : r.status === 'accept-H0'
        ? 'H0 accepted — reject'
        : r.status === 'inconclusive'
          ? `INCONCLUSIVE — ${r.config.maxPairs} pairs could not separate H0 from H1`
          : 'running — no decision yet';
  return `${verdict} · LLR ${r.llr.toFixed(2)} in [${r.lower.toFixed(2)}, ${r.upper.toFixed(2)}] · ${r.pairs} pairs (LL ${r.counts.ll} / split ${r.counts.split} / WW ${r.counts.ww}) · pair score ${r.score.toFixed(3)} (95% CI ${r.scoreLow.toFixed(3)}–${r.scoreHigh.toFixed(3)}) · Elo ${f(r.elo)} (${f(r.eloLow)} … ${f(r.eloHigh)}) · ${h}`;
}

// ---------------------------------------------------------------- simulation (validation)

/**
 * Pair outcome model for validation: every opening has a seat bias b ~ N(0, seatSigma) Elo;
 * A wins with A first with probability s(E + b) and with A second with s(E − b). Large
 * seatSigma produces many split pairs, as observed in real Quoridor games.
 */
export function simulatePairScore(elo: number, seatSigma: number, rng: () => number): number {
  // Box–Muller
  const u = Math.max(rng(), 1e-12);
  const b = seatSigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  const w1 = rng() < eloToScore(elo + b) ? 1 : 0;
  const w2 = rng() < eloToScore(elo - b) ? 1 : 0;
  return (w1 + w2) / 2;
}

/** Expected pair score of the model (numerical integration over the seat bias). */
export function modelPairScore(elo: number, seatSigma: number): number {
  if (seatSigma === 0) return eloToScore(elo);
  let acc = 0;
  let wsum = 0;
  for (let i = -400; i <= 400; i++) {
    const z = i / 100;
    const w = Math.exp(-0.5 * z * z);
    acc += w * 0.5 * (eloToScore(elo + seatSigma * z) + eloToScore(elo - seatSigma * z));
    wsum += w;
  }
  return acc / wsum;
}

/** Model Elo whose expected pair score equals s(targetElo) (the seat bias dilutes effects). */
export function calibrateModelElo(targetElo: number, seatSigma: number): number {
  const target = eloToScore(targetElo);
  let lo = -1000;
  let hi = 1000;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (modelPairScore(mid, seatSigma) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface SimulationSummary {
  runs: number;
  acceptH1: number;
  acceptH0: number;
  inconclusive: number;
  meanPairs: number;
  p90Pairs: number;
}

export function simulateSprt(trueElo: number, seatSigma: number, config: SprtConfig, runs: number, rng: () => number): SimulationSummary {
  const modelElo = calibrateModelElo(trueElo, seatSigma);
  const out = { runs, acceptH1: 0, acceptH0: 0, inconclusive: 0 };
  const lengths: number[] = [];
  const { lower, upper } = sprtBounds(config.alpha, config.beta);
  for (let r = 0; r < runs; r++) {
    // Same stopping rule as sequentialTest, evaluated incrementally.
    const c: PairCounts = { ll: 0, split: 0, ww: 0 };
    let status: SprtStatus = 'inconclusive';
    let n = 0;
    while (n < config.maxPairs) {
      const s = simulatePairScore(modelElo, seatSigma, rng);
      if (s === 0) c.ll++;
      else if (s === 1) c.ww++;
      else c.split++;
      n++;
      if (n < config.minPairs) continue;
      const llr = llrTrinomial(c, config.elo0, config.elo1);
      if (llr >= upper) {
        status = 'accept-H1';
        break;
      }
      if (llr <= lower) {
        status = 'accept-H0';
        break;
      }
    }
    lengths.push(n);
    if (status === 'accept-H1') out.acceptH1++;
    else if (status === 'accept-H0') out.acceptH0++;
    else out.inconclusive++;
  }
  lengths.sort((a, b) => a - b);
  return {
    ...out,
    meanPairs: lengths.reduce((a, b) => a + b, 0) / runs,
    p90Pairs: lengths[Math.floor(0.9 * (runs - 1))],
  };
}
