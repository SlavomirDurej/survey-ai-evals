// Structural checks that an old labelled sheet uses the current category numbering. Aggregates only.
//   1. --client-list: the client's own numbered category list compared by number with the live set.
//   2. Question structure: in the survey each question asks about one indicator, so a label should sit in its
//      question's indicator. A renumbered taxonomy would break this pattern.
//   3. --run: how often the AI's labels land in the question's indicator, against the human labels.
// Usage: npm run taxonomy-structure -- --source <sheet.xlsx> --categories <categories.json>
//          [--sheet 2024] [--client-list <list.xlsx>] [--run <name> --sample <dir>]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from '../lib/config.ts';
import { readJson, readXlsx, XLSX } from '../lib/io.ts';
import type { Category, GoldItem } from '../lib/types.ts';

const { values: a } = parseArgs({ options: {
  source: { type: 'string' }, categories: { type: 'string' }, sheet: { type: 'string', default: '2024' },
  'client-list': { type: 'string' }, run: { type: 'string' }, sample: { type: 'string' },
} });
if (!a.source || !a.categories) throw new Error('need --source and --categories');
const cats = new Map(readJson<Category[]>(a.categories).map(c => [c.number, c]));
const letter = (n: number) => cats.get(n)?.sorting?.[0];
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

if (a['client-list']) {
  const wb = readXlsx(a['client-list']);
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, blankrows: false }).slice(1).filter(r => r[0] != null);
  const diff = rows.filter(r => norm(cats.get(Number(r[0]))?.name) !== norm(r[1]));
  console.log(`client list: ${rows.length} categories, names identical by number: ${rows.length - diff.length}`);
  for (const r of diff) console.log(`  differs: #${r[0]}`);
}

const raw = XLSX.utils.sheet_to_json<any[]>(readXlsx(a.source).Sheets[a.sheet!], { header: 1, defval: null, blankrows: false });
const H = (raw[1] as unknown[]).map(c => (c == null ? '' : String(c).trim()));
const qi = H.indexOf('QUESTION'), ci = H.indexOf('CATEGORISATION');
const tab: Record<string, Record<string, number>> = {};
for (const r of raw.slice(2)) {
  const q = r[qi], n = r[ci];
  if (!q || n == null) continue;
  const l = letter(Number(n)) ?? '?';
  (tab[q] ||= {})[l] = (tab[q][l] || 0) + 1;
}
let match = 0, total = 0;
const qToLetter: Record<string, string> = {};
console.log('question -> label rows by indicator letter');
for (const q of Object.keys(tab).sort((x, y) => parseInt(x.slice(1)) - parseInt(y.slice(1)))) {
  const e = Object.entries(tab[q]).sort((x, y) => y[1] - x[1]), sum = e.reduce((s, x) => s + x[1], 0);
  qToLetter[q] = e[0][0]; match += e[0][1]; total += sum;
  console.log(`  ${q.padEnd(4)} main ${e[0][0]} ${(100 * e[0][1] / sum).toFixed(1)}% of ${sum}`);
}
console.log(`labels in their question's main indicator: ${match}/${total} = ${(100 * match / total).toFixed(1)}%`);

if (a.run && a.sample) {
  const sampleDir = path.isAbsolute(a.sample) ? a.sample : path.join(dataDir(), a.sample);
  const gold = new Map(readJson<GoldItem[]>(path.join(sampleDir, 'gold.json')).map(g => [g.id, g]));
  const joined = readJson<{ id: number; ai_categories: number[]; human_categories: number[] }[]>(path.join(dataDir(), 'runs', a.run, 'joined.json'));
  // a quote filed under several questions is in-indicator if the label matches ANY of its questions
  const inQ = (id: number, n: number) => gold.get(id)!.questions.some(q => qToLetter[q] === letter(n));
  const share = (k: 'ai_categories' | 'human_categories') => {
    let hit = 0, all = 0;
    for (const j of joined) for (const n of j[k]) { all++; if (inQ(j.id, n)) hit++; }
    return `${hit}/${all} = ${(100 * hit / all).toFixed(1)}%`;
  };
  console.log(`run ${a.run}: labels in one of the quote's question indicators: human ${share('human_categories')}, AI ${share('ai_categories')}`);
}
