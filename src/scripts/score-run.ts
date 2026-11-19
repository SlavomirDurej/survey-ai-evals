// Scores an exported run against gold on category sets, and writes reports.
//
// Scoring rules (all explicit, all switchable):
//   unit          one unique quote; AI labels = union of categories over the quote's segments (+ row-level ones)
//   --min-conf    drop AI categories below this confidence (default 0 = keep all)
//   --weighted    weight quotes by the sample's language post-stratification weight
//   --split       which gold split to score (default: every quote present in the run)
//
// Writes to <DATA_DIR>/runs/<run>/: joined.json, joined.xlsx (private, per quote) and scores.json (aggregates).
// With --public <file.md> it also writes an aggregate-only markdown summary (no quote text, category codes only).
// Usage: npm run score-run -- --run <name> --sample <sampleDir> [--split dev] [--min-conf 0.5] [--weighted]
//          [--cost <cost.json>] [--public results/<run>.md]
import nodefs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from '../lib/config.ts';
import { readJson, writeJson, writeSheet } from '../lib/io.ts';
import type { Category, GoldItem, OutputRow } from '../lib/types.ts';
import { rounded, score, type Item, type Scores } from '../metrics/multilabel.ts';

const { values: a } = parseArgs({ options: {
  run: { type: 'string' }, sample: { type: 'string' }, split: { type: 'string' }, 'min-conf': { type: 'string', default: '0' },
  weighted: { type: 'boolean', default: false }, cost: { type: 'string' }, public: { type: 'string' },
} });
if (!a.run || !a.sample) throw new Error('need --run <name> --sample <dir>');
const runDir = path.join(dataDir(), 'runs', a.run);
const sampleDir = path.isAbsolute(a.sample) ? a.sample : path.join(dataDir(), a.sample);
const minConf = Number(a['min-conf']);

const { rows } = readJson<{ rows: OutputRow[] }>(path.join(runDir, 'outputs.json'));
const gold = new Map(readJson<GoldItem[]>(path.join(sampleDir, 'gold.json')).map(g => [g.id, g]));
const cats = readJson<Category[]>(path.join(sampleDir, 'categories.json'));
const byNum = new Map(cats.map(c => [c.number, c]));

const keep = (c: { n: number; conf: number | null }) => (c.conf ?? 1) >= minConf;
const joined = rows.filter(r => gold.has(r.row_order) && (!a.split || gold.get(r.row_order)!.split === a.split)).map(r => {
  const g = gold.get(r.row_order)!;
  const ai = [...new Set([...r.segments.flatMap(s => s.categories.filter(keep).map(c => c.n)), ...r.row_categories.filter(keep).map(c => c.n)])].sort((x, y) => x - y);
  return { id: g.id, split: g.split, weight: g.weight, language: g.language, status: r.processing_status, error: r.processing_error,
    quote_original: g.quote_original, ai_cleaned: r.quote_cleaned, ai_translation: r.translation, human_translation: g.human_translation,
    ai_categories: ai, human_categories: g.human_categories, segments: r.segments.length, sentiment: r.sentiment };
});
if (!joined.length) throw new Error('no rows matched gold');

const items: Item<number>[] = joined.map(j => ({ id: j.id, gold: j.human_categories, pred: j.ai_categories, weight: a.weighted ? j.weight : 1 }));
const universe = cats.map(c => c.number);
const all = score(items, universe);
// indicator level: map every category to its indicator letter (A..J) and score the sets of letters
const letter = (n: number) => byNum.get(n)!.sorting[0];
const ind = score(items.map(i => ({ ...i, gold: [...new Set(i.gold.map(letter))], pred: [...new Set(i.pred.map(letter))] })));
const indicatorNames = Object.fromEntries(cats.map(c => [c.sorting[0], c.indicator]));
const count = <T>(xs: T[], f: (x: T) => string | number) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {} as Record<string, number>);

const report = {
  run: a.run, scored: new Date().toISOString(), rules: { unit: 'quote, union over segments', min_conf: minConf, weighted: a.weighted, split: a.split ?? 'all in run' },
  n: joined.length, status: count(joined, j => j.status), with_translation: joined.filter(j => j.ai_translation).length,
  ai_labels_per_quote: count(joined, j => j.ai_categories.length), human_labels_per_quote: count(joined, j => j.human_categories.length),
  category: { ...all, perLabel: new Map([...all.perLabel].map(([n, s]) => [byNum.get(n)!.sorting, s])) },
  indicator: { ...ind, perLabel: new Map([...ind.perLabel].map(([l, s]) => [`${l} ${indicatorNames[l]}`, s])) },
};
writeJson(path.join(runDir, 'joined.json'), joined);
writeSheet(path.join(runDir, 'joined.xlsx'), joined.map(j => ({ ...j, ai_categories: j.ai_categories.join(', '), human_categories: j.human_categories.join(', ') })), 'joined');
writeJson(path.join(runDir, 'scores.json'), rounded(report));

const f = (x: number) => x.toFixed(3);
console.log(`n=${report.n}  rules=${JSON.stringify(report.rules)}`);
for (const [name, s] of [['category', all], ['indicator', ind]] as const)
  console.log(`${name.padEnd(9)} micro P ${f(s.micro.precision)} R ${f(s.micro.recall)} F1 ${f(s.micro.f1)} | macro F1 ${f(s.macro.f1)} (${s.macro.labels} labels) | exact ${f(s.exactMatch)} | jaccard ${f(s.jaccard)} | empty ${f(s.emptyPred)} | labels/quote gold ${s.meanGoldSize.toFixed(2)} ai ${s.meanPredSize.toFixed(2)}`);

if (a.public) {
  const cost = a.cost ? readJson<any>(path.isAbsolute(a.cost) ? a.cost : path.join(runDir, a.cost)) : null;
  const row = (s: Scores<number> | Scores<string>) => `| ${f(s.micro.precision)} | ${f(s.micro.recall)} | ${f(s.micro.f1)} | ${f(s.macro.f1)} | ${f(s.exactMatch)} | ${f(s.jaccard)} |`;
  const perInd = [...ind.perLabel].sort((x, y) => String(x[0]).localeCompare(String(y[0])))
    .map(([l, s]) => `| ${l} ${indicatorNames[l]} | ${s.support} | ${s.predicted} | ${f(s.precision)} | ${f(s.recall)} | ${f(s.f1)} |`).join('\n');
  const worst = [...all.perLabel].filter(([, s]) => s.support >= 3).sort((x, y) => x[1].f1 - y[1].f1).slice(0, 8)
    .map(([n, s]) => `| ${byNum.get(n)!.sorting} | ${s.support} | ${s.predicted} | ${f(s.f1)} |`).join('\n');
  const md = `# Run ${a.run}

Aggregate results only. Quote text, translations and per-quote labels stay private.

- Quotes scored: ${report.n} (${report.rules.split} split), processing status: ${JSON.stringify(report.status)}
- Scoring rules: one unit per quote, AI labels = union over segments, min confidence ${minConf}, ${a.weighted ? 'language-weighted' : 'unweighted'}
- Labels per quote, mean: human ${all.meanGoldSize.toFixed(2)}, AI ${all.meanPredSize.toFixed(2)}; quotes with no AI label: ${(100 * all.emptyPred).toFixed(1)}%
${cost ? `- Measured cost: $${cost.total_usd.toFixed(2)} (${Object.entries(cost.stages).map(([k, v]: any) => `${k} $${v.usd.toFixed(2)}`).join(', ')}), from saved execution token counts at list prices\n` : ''}
## Category sets

| Level | Micro P | Micro R | Micro F1 | Macro F1 | Exact match | Jaccard |
|---|---|---|---|---|---|---|
| Category (50) | ${row(all).slice(2)}
| Indicator (10) | ${row(ind).slice(2)}

## Per indicator

| Indicator | Human labels | AI labels | P | R | F1 |
|---|---|---|---|---|---|
${perInd}

## Weakest categories (support of 3 or more)

| Category | Human labels | AI labels | F1 |
|---|---|---|---|
${worst}
`;
  nodefs.mkdirSync(path.dirname(a.public), { recursive: true });
  nodefs.writeFileSync(a.public, md);
  console.log('public summary ->', a.public);
}
