// Paired bootstrap for comparing two systems scored on the same items.
// Resample items with replacement B times; each time compute the metric for both systems on the same resample.
// The spread of the differences gives a confidence interval: if it excludes 0, the difference is unlikely to be
// sampling noise from this particular set of items. It says nothing about noise from re-running the model.
import { makeRng } from '../lib/rng.ts';

/** Percentile bootstrap interval for one metric computed over resampled item indices. */
export function bootstrapCI(n: number, metric: (idx: number[]) => number, B = 2000, seed = 1, alpha = 0.05) {
  const r = pairedBootstrap(n, idx => [0, metric(idx)], B, seed, alpha);
  return { value: r.diff, lo: r.lo, hi: r.hi };
}

export interface PairedResult { diff: number; lo: number; hi: number; pBetter: number }

/**
 * @param n        number of items
 * @param metric   computes the metric from a list of item indices (with repeats), for system A and B
 * @returns        observed difference B - A, a (1 - alpha) percentile interval, and the share of resamples where B > A
 */
export function pairedBootstrap(n: number, metric: (idx: number[]) => [number, number], B = 2000, seed = 1, alpha = 0.05): PairedResult {
  const { rnd } = makeRng(seed);
  const all = Array.from({ length: n }, (_, i) => i);
  const [a0, b0] = metric(all);
  const diffs: number[] = [];
  for (let b = 0; b < B; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rnd() * n));
    const [a, bb] = metric(idx);
    diffs.push(bb - a);
  }
  diffs.sort((x, y) => x - y);
  const q = (p: number) => diffs[Math.min(B - 1, Math.max(0, Math.floor(p * B)))];
  return { diff: b0 - a0, lo: q(alpha / 2), hi: q(1 - alpha / 2), pBetter: diffs.filter(d => d > 0).length / B };
}
