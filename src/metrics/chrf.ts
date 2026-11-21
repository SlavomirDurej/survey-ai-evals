// chrF: character n-gram F-score between a hypothesis and a reference translation (Popovic 2015).
// Matches sacrebleu's CHRF defaults: character n-grams of order 1..6, no word n-grams, beta = 2 (recall weighted
// twice as much as precision), whitespace removed, case kept, no epsilon smoothing.
//   per order n: precision_n = matched n-grams / hypothesis n-grams, recall_n = matched / reference n-grams
//   P and R = means over the orders where both sides have n-grams; chrF = 100 * (1+b^2) P R / (b^2 P + R)
// Corpus chrF sums the n-gram statistics over all segments first, then computes one score
// (it is not the mean of sentence scores).

export interface ChrfOptions { order?: number; beta?: number }
/** For each order: [hypothesis n-grams, reference n-grams, matched n-grams] */
export type ChrfStats = [number, number, number][];

const ngrams = (s: string, n: number) => {
  const m = new Map<string, number>();
  const chars = Array.from(s); // code points, so CJK and emoji count as one character
  for (let i = 0; i + n <= chars.length; i++) {
    const g = chars.slice(i, i + n).join('');
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
};

export function chrfStats(hyp: string, ref: string, { order = 6 }: ChrfOptions = {}): ChrfStats {
  const h = hyp.replace(/\s+/g, ''), r = ref.replace(/\s+/g, '');
  const stats: ChrfStats = [];
  for (let n = 1; n <= order; n++) {
    const hg = ngrams(h, n), rg = ngrams(r, n);
    let hc = 0, rc = 0, match = 0;
    for (const c of hg.values()) hc += c;
    for (const c of rg.values()) rc += c;
    for (const [g, c] of hg) match += Math.min(c, rg.get(g) ?? 0);
    stats.push([hc, rc, match]);
  }
  return stats;
}

export function chrfFromStats(stats: ChrfStats, { beta = 2 }: ChrfOptions = {}): number {
  let p = 0, r = 0, k = 0;
  for (const [hc, rc, match] of stats) {
    if (hc > 0 && rc > 0) { p += match / hc; r += match / rc; k++; }
  }
  if (k === 0) return 0;
  p /= k; r /= k;
  const b2 = beta * beta;
  return p + r === 0 ? 0 : (100 * (1 + b2) * p * r) / (b2 * p + r);
}

export const sentenceChrf = (hyp: string, ref: string, o: ChrfOptions = {}) => chrfFromStats(chrfStats(hyp, ref, o), o);

export function corpusChrf(pairs: readonly { hyp: string; ref: string }[], o: ChrfOptions = {}): number {
  const total: ChrfStats = [];
  for (const { hyp, ref } of pairs) {
    chrfStats(hyp, ref, o).forEach((s, i) => {
      total[i] ??= [0, 0, 0];
      total[i][0] += s[0]; total[i][1] += s[1]; total[i][2] += s[2];
    });
  }
  return chrfFromStats(total, o);
}
