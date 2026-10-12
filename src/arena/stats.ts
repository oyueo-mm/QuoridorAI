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
