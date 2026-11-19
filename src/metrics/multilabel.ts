// Multi-label classification metrics: each item has a SET of gold labels and a SET of predicted labels.
//
// Definitions follow the usual ones (as in scikit-learn's precision_recall_fscore_support, jaccard_score
// and hamming_loss on a multi-label indicator matrix):
//   per item:   tp = |gold ∩ pred|, fp = |pred \ gold|, fn = |gold \ pred|
//   micro:      pool tp/fp/fn over all items, then P = tp/(tp+fp), R = tp/(tp+fn), F1 = 2PR/(P+R)
//   macro:      compute P/R/F1 per label, then take the unweighted mean over labels
//   exact:      share of items where pred equals gold
//   jaccard:    mean over items of |gold ∩ pred| / |gold ∪ pred|
//   hamming:    wrong (label, item) cells / (items × labels in the universe)
// Zero-division convention: a ratio with a zero denominator counts as 0 (scikit-learn zero_division=0),
// except jaccard when both sets are empty, which counts as 1 (nothing to get wrong).
// Optional per-item weights scale every count (e.g. post-stratification weights).

export type Label = number | string;

export interface Item<L extends Label = Label> {
  id: string | number;
  gold: readonly L[];
  pred: readonly L[];
  weight?: number;
}

export interface Prf { precision: number; recall: number; f1: number }
export interface Counts { tp: number; fp: number; fn: number }
export interface LabelScore extends Prf, Counts { support: number; predicted: number }

export interface Scores<L extends Label = Label> {
  n: number;
  micro: Prf & Counts;
  macro: Prf & { labels: number };
  exactMatch: number;
  jaccard: number;
  hammingLoss: number;
  anyOverlap: number;
  emptyPred: number;
  meanGoldSize: number;
  meanPredSize: number;
  perLabel: Map<L, LabelScore>;
}

const div = (a: number, b: number) => (b === 0 ? 0 : a / b);
export const prf = ({ tp, fp, fn }: Counts): Prf => {
  const precision = div(tp, tp + fp), recall = div(tp, tp + fn);
  return { precision, recall, f1: div(2 * precision * recall, precision + recall) };
};

export function itemCounts<L extends Label>(gold: readonly L[], pred: readonly L[]): Counts & { jaccard: number; exact: boolean } {
  const g = new Set(gold), p = new Set(pred);
  let tp = 0;
  for (const x of p) if (g.has(x)) tp++;
  const fp = p.size - tp, fn = g.size - tp, union = g.size + p.size - tp;
  return { tp, fp, fn, jaccard: union === 0 ? 1 : tp / union, exact: fp === 0 && fn === 0 };
}

/**
 * Scores a list of items. `labels` is the label universe for macro averaging and Hamming loss;
 * if omitted it is every label seen in gold or pred. Pass the full taxonomy to include labels
 * that never occur (they then score 0 and pull the macro average down, as in scikit-learn).
 */
export function score<L extends Label>(items: readonly Item<L>[], labels?: readonly L[]): Scores<L> {
  const universe = labels ? [...new Set(labels)] : [...new Set(items.flatMap(i => [...i.gold, ...i.pred]))];
  const per = new Map<L, Counts & { support: number; predicted: number }>(universe.map(l => [l, { tp: 0, fp: 0, fn: 0, support: 0, predicted: 0 }]));
  const micro: Counts = { tp: 0, fp: 0, fn: 0 };
  let W = 0, exact = 0, jac = 0, overlap = 0, empty = 0, goldSize = 0, predSize = 0;

  for (const it of items) {
    const w = it.weight ?? 1, c = itemCounts(it.gold, it.pred), g = new Set(it.gold), p = new Set(it.pred);
    W += w; micro.tp += w * c.tp; micro.fp += w * c.fp; micro.fn += w * c.fn;
    exact += w * Number(c.exact); jac += w * c.jaccard; overlap += w * Number(c.tp > 0); empty += w * Number(p.size === 0);
    goldSize += w * g.size; predSize += w * p.size;
    for (const l of new Set([...g, ...p])) {
      let s = per.get(l);
      if (!s) { if (labels) continue; s = { tp: 0, fp: 0, fn: 0, support: 0, predicted: 0 }; per.set(l, s); }
      const inG = g.has(l), inP = p.has(l);
      if (inG) s.support += w;
      if (inP) s.predicted += w;
      if (inG && inP) s.tp += w; else if (inP) s.fp += w; else s.fn += w;
    }
  }

  const perLabel = new Map<L, LabelScore>([...per].map(([l, s]) => [l, { ...s, ...prf(s) }]));
  const ls = [...perLabel.values()], k = ls.length;
  const mean = (f: (s: LabelScore) => number) => div(ls.reduce((a, s) => a + f(s), 0), k);
  const wrongCells = micro.fp + micro.fn;
  return {
    n: items.length,
    micro: { ...micro, ...prf(micro) },
    macro: { precision: mean(s => s.precision), recall: mean(s => s.recall), f1: mean(s => s.f1), labels: k },
    exactMatch: div(exact, W), jaccard: div(jac, W), hammingLoss: div(wrongCells, W * k), anyOverlap: div(overlap, W),
    emptyPred: div(empty, W), meanGoldSize: div(goldSize, W), meanPredSize: div(predSize, W), perLabel,
  };
}

/** Rounds every number in a plain object tree, for stable reports. Maps become objects. */
export function rounded(v: unknown, dp = 3): unknown {
  if (typeof v === 'number') return Number.isInteger(v) ? v : Number(v.toFixed(dp));
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), rounded(x, dp)]));
  if (Array.isArray(v)) return v.map(x => rounded(x, dp));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rounded(x, dp)]));
  return v;
}
