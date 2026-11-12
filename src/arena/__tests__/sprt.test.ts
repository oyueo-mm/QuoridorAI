import { describe, expect, it } from 'vitest';
import { createRng } from '../../ai/rng';
import {
  DEFAULT_SPRT,
  calibrateModelElo,
  countPairs,
  eloToScore,
  llrNormal,
  llrTrinomial,
  modelPairScore,
  scoreToElo,
  sequentialTest,
  simulateSprt,
  sprtBounds,
} from '../sprt';
import type { SprtConfig } from '../sprt';

describe('SPRT basics', () => {
  it('Elo ↔ score and Wald bounds', () => {
    for (const e of [-300, -30, 0, 17, 250]) expect(scoreToElo(eloToScore(e))!).toBeCloseTo(e, 8);
    expect(scoreToElo(1)).toBeNull();
    const b = sprtBounds(0.05, 0.05);
    expect(b.upper).toBeCloseTo(Math.log(19), 10);
    expect(b.lower).toBeCloseTo(-Math.log(19), 10);
  });

  it('LLR points the right way and agrees with the normal approximation for large samples', () => {
    const atNull = { ll: 120, split: 260, ww: 120 }; // mean exactly 0.5
    expect(llrTrinomial(atNull, 0, 30)).toBeLessThan(0);
    const better = { ll: 90, split: 260, ww: 150 }; // mean 0.56 ≈ +42 Elo
    expect(llrTrinomial(better, 0, 30)).toBeGreaterThan(0);
    for (const c of [atNull, better, { ll: 100, split: 280, ww: 120 }]) {
      const exact = llrTrinomial(c, 0, 30);
      const approx = llrNormal(c, 0, 30);
      expect(Math.abs(exact - approx)).toBeLessThan(0.05 * Math.max(1, Math.abs(exact)));
    }
    // More wins can only increase the evidence for H1.
    expect(llrTrinomial({ ll: 10, split: 30, ww: 20 }, 0, 30)).toBeGreaterThan(llrTrinomial({ ll: 10, split: 30, ww: 19 }, 0, 30));
    // Empty categories are handled (regularised MLE), no NaN.
    expect(Number.isFinite(llrTrinomial({ ll: 0, split: 0, ww: 25 }, 0, 30))).toBe(true);
    expect(Number.isFinite(llrTrinomial({ ll: 0, split: 40, ww: 0 }, 0, 30))).toBe(true);
  });

  it('pair counts reject anything but 0, ½, 1', () => {
    expect(countPairs([0, 0.5, 1, 1])).toEqual({ ll: 1, split: 1, ww: 2 });
    expect(() => countPairs([0.25])).toThrow();
  });
});

describe('sequential decision rule', () => {
  const cfg: SprtConfig = { elo0: 0, elo1: 30, alpha: 0.05, beta: 0.05, minPairs: 30, maxPairs: 200 };

  it('stops at the first crossing; later pairs do not change the decision', () => {
    const strong = Array.from({ length: 150 }, (_, i) => (i % 3 === 0 ? 0.5 : 1));
    const r = sequentialTest(strong, cfg);
    expect(r.status).toBe('accept-H1');
    expect(r.pairs).toBeGreaterThanOrEqual(cfg.minPairs); // never before minPairs
    expect(r.pairs).toBeLessThan(60);
    // Stopping exactly at the first crossing: one pair fewer is still undecided.
    expect(sequentialTest(strong.slice(0, r.pairs - 1), cfg).status).toBe('continue');
    const r2 = sequentialTest([...strong, ...Array.from({ length: 50 }, () => 0)], cfg);
    expect(r2).toEqual(r);
  });

  it('continues below the bounds, and is inconclusive at maxPairs', () => {
    const mixed = Array.from({ length: 40 }, (_, i) => [0, 0.5, 0.5, 1][i % 4]);
    expect(sequentialTest(mixed, cfg).status).toBe('continue');
    // Mean slightly above 0.5 but between the hypotheses: neither bound within 200 pairs.
    const between = Array.from({ length: 200 }, (_, i) => (i % 10 === 0 ? 1 : i % 10 === 1 ? 0 : 0.5));
    const r = sequentialTest(between, { ...cfg, maxPairs: 60 });
    expect(r.status).toBe('inconclusive');
    expect(r.pairs).toBe(60);
  });

  it('requires elo1 > elo0', () => {
    expect(() => sequentialTest([1], { ...cfg, elo1: 0 })).toThrow();
  });
});

describe('Monte Carlo validation of error rates (seat-biased pair model)', () => {
  const seatSigma = 150; // realistic: many split pairs
  const cfg: SprtConfig = { elo0: 0, elo1: 40, alpha: 0.05, beta: 0.05, minPairs: 20, maxPairs: 5000 };
  const runs = 600;
  const tol = 3 * Math.sqrt((0.05 * 0.95) / runs);

  it('the model is calibrated so that the mean pair score matches the hypothesis', () => {
    expect(modelPairScore(0, seatSigma)).toBeCloseTo(0.5, 10);
    expect(modelPairScore(calibrateModelElo(40, seatSigma), seatSigma)).toBeCloseTo(eloToScore(40), 6);
  });

  it('false promotion rate under H0 is at most α (+ sampling tolerance)', () => {
    const s = simulateSprt(0, seatSigma, cfg, runs, createRng(101));
    expect(s.acceptH1 / runs).toBeLessThanOrEqual(cfg.alpha + tol);
    expect(s.inconclusive).toBe(0);
  });

  it('false rejection rate under H1 is at most β (+ sampling tolerance)', () => {
    const s = simulateSprt(40, seatSigma, cfg, runs, createRng(202));
    expect(s.acceptH0 / runs).toBeLessThanOrEqual(cfg.beta + tol);
  });

  it('truncation turns undecided runs into "inconclusive" instead of a verdict', () => {
    const s = simulateSprt(20, seatSigma, { ...cfg, maxPairs: 60 }, 200, createRng(303));
    expect(s.inconclusive).toBeGreaterThan(0);
    expect(s.acceptH0 + s.acceptH1 + s.inconclusive).toBe(200);
    expect(s.meanPairs).toBeLessThanOrEqual(60);
  });

  it('default configuration is sane', () => {
    expect(DEFAULT_SPRT.elo1).toBeGreaterThan(DEFAULT_SPRT.elo0);
    expect(DEFAULT_SPRT.minPairs).toBeLessThan(DEFAULT_SPRT.maxPairs);
  });
});
