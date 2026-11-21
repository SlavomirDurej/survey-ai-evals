// Re-scores one exported run under different post-processing rules, without calling any model.
// Answers: how much do scoring and selection rules alone move the numbers, and is any rule a real gain?
// Each rule is compared with the baseline by a paired bootstrap on micro F1 (category level).
//
// Rules are chosen to be deployable (they only use the model's own output), except the "oracle" rows,
// which use the number of human labels and only show how good the model's ranking is.
//
// Usage: npm run rule-sweep -- --run <name> --sample <dir> [--split dev] [--public results/<file>.md]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from '../lib/config.ts';
import { readJson, writeJson } from '../lib/io.ts';
import type { Category, GoldItem, OutputRow } from '../lib/types.ts';
import { pairedBootstrap } from '../metrics/bootstrap.ts';
import { rounded, score, type Item } from '../metrics/multilabel.ts';

const { values: a } = parseArgs({ options: { run: { type: 'string' }, sample: { type: 'string' }, split: { type: 'string' }, public: { type: 'string' } } });
if (!a.run || !a.sample) throw new Error('need --run <name> --sample <dir>');
const runDir = path.join(dataDir(), 'runs', a.run);
const sampleDir = path.isAbsolute(a.sample) ? a.sample : path.join(dataDir(), a.sample);
const { rows } = readJson<{ rows: OutputRow[] }>(path.join(runDir, 'outputs.json'));
const gold = new Map(readJson<GoldItem[]>(path.join(sampleDir, 'gold.json')).map(g => [g.id, g]));
const cats = readJson<Category[]>(path.join(sampleDir, 'categories.json'));
const letter = new Map(cats.map(c => [c.number, c.sorting[0]]));
const universe = cats.map(c => c.number);
const used = rows.filter(r => gold.has(r.row_order) && (!a.split || gold.get(r.row_order)!.split === a.split));

// every AI label of a row, ranked: highest confidence first, then earlier segment, then category number
interface Cand { n: number; conf: number; seg: number }
const ranked = (r: OutputRow): Cand[] => {
  const best = new Map<number, Cand>();
  for (const s of r.segments) for (const c of s.categories) {
    const x = { n: c.n, conf: c.conf ?? 0, seg: s.order }, prev = best.get(c.n);
    if (!prev || x.conf > prev.conf || (x.conf === prev.conf && x.seg < prev.seg)) best.set(c.n, x);
  }
  return [...best.values()].sort((p, q) => q.conf - p.conf || p.seg - q.seg || p.n - q.n);
};

type Rule = { name: string; deployable: boolean; pick: (r: OutputRow, g: GoldItem) => number[] };
const all = (r: OutputRow) => ranked(r).map(c => c.n);
const rules: Rule[] = [
  { name: 'baseline: union over segments', deployable: true, pick: all },
  { name: 'confidence >= 0.8', deployable: true, pick: r => ranked(r).filter(c => c.conf >= 0.8).map(c => c.n) },
  { name: 'confidence >= 0.9', deployable: true, pick: r => ranked(r).filter(c => c.conf >= 0.9).map(c => c.n) },
  { name: 'top 1 by confidence', deployable: true, pick: r => all(r).slice(0, 1) },
  { name: 'top 2 by confidence', deployable: true, pick: r => all(r).slice(0, 2) },
  { name: 'top 3 by confidence', deployable: true, pick: r => all(r).slice(0, 3) },
  { name: 'first segment only', deployable: true, pick: r => [...new Set((r.segments.find(s => s.categories.length)?.categories ?? []).map(c => c.n))] },
  { name: 'oracle: top k, k = number of human labels', deployable: false, pick: (r, g) => all(r).slice(0, g.human_categories.length) },
];

const goldOf = (r: OutputRow) => gold.get(r.row_order)!;
const itemsFor = (rule: Rule): Item<number>[] => used.map(r => ({ id: r.row_order, gold: goldOf(r).human_categories, pred: rule.pick(r, goldOf(r)) }));
const toInd = (it: Item<number>): Item<string> => ({ ...it, gold: [...new Set(it.gold.map(n => letter.get(n)!))], pred: [...new Set(it.pred.map(n => letter.get(n)!))] });
const base = itemsFor(rules[0]);
const microF1 = (items: Item<number>[], idx: number[]) => score(idx.map(i => items[i])).micro.f1;

const out = rules.map(rule => {
  const items = itemsFor(rule), s = score(items, universe), si = score(items.map(toInd));
  const bs = pairedBootstrap(items.length, idx => [microF1(base, idx), microF1(items, idx)], 2000, 1);
  return { rule: rule.name, deployable: rule.deployable, n: items.length,
    labels_per_quote: s.meanPredSize, empty: s.emptyPred,
    micro_p: s.micro.precision, micro_r: s.micro.recall, micro_f1: s.micro.f1, macro_f1: s.macro.f1, exact: s.exactMatch, jaccard: s.jaccard,
    indicator_micro_f1: si.micro.f1, indicator_exact: si.exactMatch,
    vs_baseline_f1: bs.diff, ci95: [bs.lo, bs.hi], p_better: bs.pBetter };
});
// calibration: of the AI labels at each stated confidence, how many are in the human set?
const BANDS: [string, number][] = [['below 0.80', 0.8], ['0.80 to 0.89', 0.9], ['0.90 to 0.94', 0.95], ['0.95 and above', Infinity]];
const calib = BANDS.map(([band]) => ({ band, labels: 0, correct: 0 }));
for (const r of used) for (const c of ranked(r)) {
  const s = calib[BANDS.findIndex(([, upper]) => c.conf < upper - 1e-9)];
  s.labels++; if (goldOf(r).human_categories.includes(c.n)) s.correct++;
}
const calibration = calib.filter(s => s.labels).map(s => ({ conf: s.band, labels: s.labels, precision: s.correct / s.labels }));
writeJson(path.join(runDir, 'rule-sweep.json'), rounded({ rules: out, calibration }));

const f = (x: number) => x.toFixed(3), sg = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(3);
const lines = out.map(o => `| ${o.rule}${o.deployable ? '' : ' *'} | ${o.labels_per_quote.toFixed(2)} | ${f(o.micro_p)} | ${f(o.micro_r)} | ${f(o.micro_f1)} | ${f(o.macro_f1)} | ${f(o.exact)} | ${f(o.indicator_micro_f1)} | ${o.rule.startsWith('baseline') ? '' : `${sg(o.vs_baseline_f1)} [${sg(o.ci95[0])}, ${sg(o.ci95[1])}]`} |`);
const table = `| Rule | Labels/quote | Micro P | Micro R | Micro F1 | Macro F1 | Exact | Indicator F1 | F1 vs baseline [95% CI] |
|---|---|---|---|---|---|---|---|---|
${lines.join('\n')}`;
const calibTable = `| Stated confidence | AI labels | Share in human set |
|---|---|---|
${calibration.map(c => `| ${c.conf} | ${c.labels} | ${f(c.precision)} |`).join('\n')}`;
console.log(table + '\n\n' + calibTable);
if (a.public) {
  fs.mkdirSync(path.dirname(a.public), { recursive: true });
  fs.writeFileSync(a.public, `# Rule sweep on run ${a.run}

Same model outputs, different post-processing rules. No model calls. ${out[0].n} quotes, ${a.split ?? 'all'} split.
Human labels per quote: ${score(base).meanGoldSize.toFixed(2)}. Category-level metrics unless the column says otherwise.
The interval is a paired bootstrap (2,000 resamples of quotes) on the micro F1 difference against the baseline.
Rows marked * use the number of human labels, so they are diagnostics, not usable rules.

${table}

## Calibration

If the model's confidence meant something, labels with higher stated confidence would be right more often.

${calibTable}
`);
  console.log('public ->', a.public);
}
