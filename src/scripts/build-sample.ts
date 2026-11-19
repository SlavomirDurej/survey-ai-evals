// Builds a stratified, seeded eval sample from a human-translated and human-categorised survey sheet.
//
// The source sheet is in "export" shape: a quote with several human categories appears once per
// category (same respondent, same text). So the unit here is one unique quote (respondent id +
// normalised text) and the gold label is the SET of human categories.
//
// Outputs (private client data, keep under DATA_DIR):
//   upload xlsx      input for the app's normal "new survey" upload, with no human answers.
//                    Order = sample id (1..N) = the join key back to gold (survey_rows.row_order).
//   gold.json/.xlsx  human translation + human category set per sample id, split, stratum weight
//   manifest.json    seed, source hash, method, counts
//
// Usage: npm run build-sample -- --source <sheet.xlsx> --categories <categories.json> --out <dir>
//          [--sheet 2024] [--size 400] [--seed 20261119] [--upload-name upload.xlsx]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readXlsx, writeJson, writeSheet, XLSX } from '../lib/io.ts';
import { makeRng } from '../lib/rng.ts';
import type { Category, GoldItem } from '../lib/types.ts';

const { values: a } = parseArgs({ options: {
  source: { type: 'string' }, categories: { type: 'string' }, out: { type: 'string' }, sheet: { type: 'string', default: '2024' },
  size: { type: 'string', default: '400' }, seed: { type: 'string', default: '20261119' }, 'upload-name': { type: 'string', default: 'upload.xlsx' },
} });
if (!a.source || !a.categories || !a.out) throw new Error('need --source, --categories, --out');
const TARGET = Number(a.size), SEED = Number(a.seed), LANG_MIN = 8, CAT_MIN = 6;
const { rnd, shuffle } = makeRng(SEED);

const cats: Record<number, Category> = Object.fromEntries((JSON.parse(fs.readFileSync(a.categories, 'utf8')) as Category[]).map(c => [c.number, c]));
const wb = readXlsx(a.source, { cellDates: true });
const raw = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[a.sheet!], { header: 1, defval: null, blankrows: false });
const H = (raw[1] as unknown[]).map(c => (c == null ? '' : String(c).trim()));
const col = (n: string) => { const i = H.indexOf(n); if (i < 0) throw new Error('missing column ' + n); return i; };
const C = { order: col('ORDER'), question: col('QUESTION'), resp: 2, collector: col('Collector ID'), date: col('Date'),
  spec: col('Speciality'), country: col('Country'), reach: col('Reach'), quote: col('QUOTES'), tr: col('TRANSLATION'), cat: col('CATEGORISATION') };
const str = (v: unknown) => (v == null ? null : String(v).trim() || null);
const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
const toDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : str(v));

interface Unit {
  first: any[]; sourceRows: number[]; language: string; quote: string; categories: number[];
  translation: string | null; translationVariants: number; questions: (string | null)[];
  split?: 'dev' | 'test'; id?: number; weight?: number;
}

// ---- population of unique quotes
const rows = raw.slice(2).map((r, i) => ({ r, sourceRow: i + 3 })).filter(({ r }) => str(r[C.quote]));
const unitsByKey: Record<string, typeof rows> = {};
for (const x of rows) (unitsByKey[str(x.r[C.resp]) + '|' + norm(str(x.r[C.quote])!)] ||= []).push(x);
const units: Unit[] = Object.values(unitsByKey).map(g => {
  const first = g[0].r;
  const translations = [...new Set(g.map(x => str(x.r[C.tr])).filter(Boolean))] as string[];
  return {
    first, sourceRows: g.map(x => x.sourceRow), language: str(first[C.collector])!, quote: str(first[C.quote])!,
    categories: [...new Set(g.map(x => Number(x.r[C.cat])))], translation: translations[0] || null, translationVariants: translations.length,
    questions: [...new Set(g.map(x => str(x.r[C.question])))],
  };
});
// two identical texts from different respondents: keep only one of them in the sample
const textSeen = new Set<string>();

// 1) language strata: proportional allocation with a floor
const langs: Record<string, Unit[]> = {};
for (const u of units) (langs[u.language] ||= []).push(u);
const picked = new Set<Unit>();
const take = (u: Unit) => { const t = norm(u.quote); if (textSeen.has(t)) return false; textSeen.add(t); picked.add(u); return true; };
for (const list of Object.values(langs)) {
  const want = Math.max(Math.min(list.length, LANG_MIN), Math.round(TARGET * list.length / units.length));
  let n = 0;
  for (const u of shuffle(list)) { if (n >= want) break; if (take(u)) n++; }
}
// 2) category floor: every category appears in at least CAT_MIN sampled quotes
const has = (u: Unit, n: number) => u.categories.includes(n);
const topped: Record<number, number> = {};
for (let n = 1; n <= 50; n++) {
  let have = [...picked].filter(u => has(u, n)).length;
  for (const u of shuffle(units.filter(u => has(u, n) && !picked.has(u)))) {
    if (have >= CAT_MIN) break;
    if (take(u)) { have++; topped[n] = (topped[n] || 0) + 1; }
  }
}
// 3) dev/test split: greedy, rarest category first, put each quote where that category is short
const freq: Record<number, number> = {};
for (const u of picked) for (const c of u.categories) freq[c] = (freq[c] || 0) + 1;
const tally = { dev: {} as Record<number, number>, test: {} as Record<number, number> }, size = { dev: 0, test: 0 };
const ordered = shuffle([...picked]).sort((x, y) => Math.min(...x.categories.map(c => freq[c])) - Math.min(...y.categories.map(c => freq[c])));
for (const u of ordered) {
  const rare = u.categories.reduce((m, c) => (freq[c] < freq[m] ? c : m), u.categories[0]);
  const d = tally.dev[rare] || 0, t = tally.test[rare] || 0;
  u.split = d < t ? 'dev' : t < d ? 'test' : size.dev < size.test ? 'dev' : size.test < size.dev ? 'test' : rnd() < 0.5 ? 'dev' : 'test';
  size[u.split]++;
  for (const c of u.categories) tally[u.split][c] = (tally[u.split][c] || 0) + 1;
}
const final = shuffle([...picked]).map((u, i) => ({ ...u, id: i + 1 }));
const langCount: Record<string, number> = {};
final.forEach(u => (langCount[u.language] = (langCount[u.language] || 0) + 1));
final.forEach(u => { u.weight = Number((langs[u.language].length / langCount[u.language]).toFixed(4)); });

// ---- outputs
const OUT = a.out;
fs.mkdirSync(OUT, { recursive: true });
writeSheet(path.join(OUT, a['upload-name']!), final.map(u => ({
  Order: u.id, Question: str(u.first[C.question]), 'Respondent ID': str(u.first[C.resp]), 'Collector ID': u.language,
  Date: toDate(u.first[C.date]), Specialty: str(u.first[C.spec]), Country: str(u.first[C.country]), Reach: str(u.first[C.reach]), Quotes: u.quote,
})), 'quotes');

const gold: GoldItem[] = final.map(u => ({
  id: u.id, split: u.split!, weight: u.weight!, language: u.language, is_english: /^ENGLISH/.test(u.language),
  quote_original: u.quote, human_translation: u.translation, translation_variants: u.translationVariants,
  human_categories: u.categories, human_categories_sorting: u.categories.map(c => cats[c]?.sorting),
  human_categories_names: u.categories.map(c => cats[c]?.name), human_indicators: [...new Set(u.categories.map(c => cats[c]?.indicator))],
  source_rows: u.sourceRows, questions: u.questions as string[], original_order: str(u.first[C.order]),
}));
writeJson(path.join(OUT, 'gold.json'), gold);
writeSheet(path.join(OUT, 'gold.xlsx'), gold.map(g => ({ ...g,
  human_categories: g.human_categories.join(', '), human_categories_sorting: g.human_categories_sorting.join(', '),
  human_categories_names: g.human_categories_names.join(' | '), human_indicators: g.human_indicators.join(' | '),
  source_rows: g.source_rows.join(', '), questions: g.questions.join(', ') })), 'gold');

const count = <T>(arr: T[], f: (x: T) => string | number | (string | number)[]) =>
  arr.reduce((m, x) => { for (const k of ([] as (string | number)[]).concat(f(x))) m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);
const perCatSplit = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, count(final.filter(u => has(u, i + 1)), u => u.split!)]));
const manifest = {
  built: new Date().toISOString(), seed: SEED, target_size: TARGET, lang_floor: LANG_MIN, category_floor: CAT_MIN,
  source: { file: path.basename(a.source), sha256: crypto.createHash('sha256').update(fs.readFileSync(a.source)).digest('hex'), sheet: a.sheet,
    rows: rows.length, unique_quotes: units.length,
    population_labels_per_quote: count(units, u => u.categories.length),
    population_with_human_translation: units.filter(u => u.translation).length },
  method: "Unit = unique quote (respondent id + normalised text); gold = set of human categories from its repeated rows. Allocate per collector language proportionally with a floor of min(n, lang_floor). Top up any category present in fewer than category_floor quotes. Greedy dev/test split by each quote's rarest category. weight = language population / language sample count (post-stratification by language; the category top-up makes it approximate).",
  sample_size: final.length, split: count(final, u => u.split!), category_topups: topped,
  sample_labels_per_quote: count(final, u => u.categories.length),
  with_human_translation: final.filter(u => u.translation).length,
  translation_split: count(final.filter(u => u.translation), u => u.split!),
  per_language: Object.fromEntries(Object.entries(langCount).sort((x, y) => y[1] - x[1])),
  per_category_split: perCatSplit,
};
writeJson(path.join(OUT, 'manifest.json'), manifest);
const { per_category_split, method, ...short } = manifest;
console.log(JSON.stringify(short, null, 1));
const thin = Object.entries(perCatSplit).filter(([, o]) => (o.dev || 0) < 3 || (o.test || 0) < 3).map(([k, o]) => `${k}: dev ${o.dev || 0} / test ${o.test || 0}`);
console.log('categories with fewer than 3 quotes in dev or test:', thin.length ? thin : 'none');
