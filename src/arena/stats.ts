/** Small statistics helpers for tournament summaries. */

export function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Proportion {
  successes: number;
  trials: number;
  p: number;
  /** Wilson score interval (default 95 %). */
  low: number;
  high: number;
}

/**
 * Wilson score interval for k successes in n trials. Well-behaved for small n and for
 * k = 0 or k = n, unlike the normal approximation. null when n = 0.
 */
export function wilson(k: number, n: number, z = 1.959964): Proportion | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { successes: k, trials: n, p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export function formatProportion(x: Proportion | null): string {
  if (!x) return '—';
  const pct = (v: number) => `${(100 * v).toFixed(0)}%`;
  return `${pct(x.p)} (${x.successes}/${x.trials}, 95% CI ${pct(x.low)}–${pct(x.high)})`;
}

/** q-quantile (0 ≤ q ≤ 1) with linear interpolation between order statistics; null when empty. */
export function percentile(xs: readonly number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = Math.min(1, Math.max(0, q)) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Logistic Elo difference implied by an expected score p (0 < p < 1).
 * Returns ±Infinity at p = 1 / p = 0: a perfect score only bounds the difference from one side.
 */
export function eloFromScore(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  return -400 * Math.log10(1 / p - 1);
}

export interface EloEstimate {
  /** Elo of A relative to B; null when unbounded (A won or lost every decisive game). */
  elo: number | null;
  /** 95 % interval from the Wilson bounds of the score; null = unbounded on that side. */
  low: number | null;
  high: number | null;
  /** Decisive games the estimate rests on. */
  n: number;
}

const finiteOrNull = (x: number) => (Number.isFinite(x) ? x : null);

/**
 * Elo difference from decisive games only (halted games have no result and are excluded).
 * The interval maps the Wilson score interval through the logistic curve, so it is
 * asymmetric and never claims a finite bound that the data cannot support.
 */
export function eloEstimate(wins: number, decisive: number): EloEstimate | null {
  const w = wilson(wins, decisive);
  if (!w) return null;
  // A perfect (or zero) score leaves that side unbounded; don't let rounding of the Wilson
  // bound (0.99999…) turn it into a huge finite number.
  return {
    elo: finiteOrNull(eloFromScore(w.p)),
    low: wins === 0 ? null : finiteOrNull(eloFromScore(w.low)),
    high: wins === decisive ? null : finiteOrNull(eloFromScore(w.high)),
    n: decisive,
  };
}

export interface MeanInterval {
  mean: number;
  /** Normal-approximation 95 % interval of the mean (t ≈ z; use only for n ≳ 20). */
  low: number;
  high: number;
  n: number;
  sd: number;
}

/**
 * Mean of per-pair scores (0, 0.5 or 1 for a pair of games with seats swapped) with a 95 %
 * interval. Treating the pair as the unit respects the correlation between the two games of
 * one opening, which a per-game Wilson interval ignores.
 */
export function meanInterval(xs: readonly number[], z = 1.959964): MeanInterval | null {
  if (!xs.length) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : 0;
  const half = xs.length > 1 ? (z * sd) / Math.sqrt(xs.length) : Infinity;
  return { mean: m, low: Math.max(0, m - half), high: Math.min(1, m + half), n: xs.length, sd };
}

export function formatElo(e: EloEstimate | null): string {
  if (!e) return '—';
  const f = (x: number | null, inf: string) => (x === null ? inf : `${x >= 0 ? '+' : ''}${x.toFixed(0)}`);
  return `${f(e.elo, e.high === null ? '+∞' : '−∞')} (95% CI ${f(e.low, '−∞')} … ${f(e.high, '+∞')}, n=${e.n})`;
}
