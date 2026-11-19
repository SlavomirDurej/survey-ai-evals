// Picks quotes for a manual check that old category numbers still mean the current category names.
// Single-label quotes only (unambiguous), N per indicator, distinct categories, seeded. Dev split only,
// so the test split is never looked at. Output is private (it contains quote text).
// Usage: npm run taxonomy-pick -- --sample <dir> --out <file.json> [--per-indicator 2] [--seed 7]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJson, writeJson } from '../lib/io.ts';
import { makeRng } from '../lib/rng.ts';
import type { Category, GoldItem } from '../lib/types.ts';

const { values: a } = parseArgs({ options: {
  sample: { type: 'string' }, out: { type: 'string' }, 'per-indicator': { type: 'string', default: '2' }, seed: { type: 'string', default: '7' },
} });
if (!a.sample || !a.out) throw new Error('need --sample <dir> --out <file.json>');
const per = Number(a['per-indicator']);
const { shuffle } = makeRng(Number(a.seed));
const gold = readJson<GoldItem[]>(path.join(a.sample, 'gold.json'));
const cats = new Map(readJson<Category[]>(path.join(a.sample, 'categories.json')).map(c => [c.number, c]));
const english = (g: GoldItem) => (g.is_english ? g.quote_original : g.human_translation);

const pool = shuffle(gold.filter(g => g.split === 'dev' && g.human_categories.length === 1 && (english(g)?.length ?? 0) >= 40));
const byIndicator: Record<string, object[]> = {}, used = new Set<number>();
for (const g of pool) {
  const c = cats.get(g.human_categories[0])!, list = (byIndicator[c.indicator] ||= []);
  if (list.length >= per || used.has(c.number)) continue;
  used.add(c.number);
  list.push({ id: g.id, category: c.number, sorting: c.sorting, name: c.name, indicator: c.indicator, text: english(g),
    text_source: g.is_english ? 'original' : 'human translation', question: g.questions.join(', '), verdict: null });
}
const picked = Object.values(byIndicator).flat().sort((x: any, y: any) => x.category - y.category);
writeJson(a.out, picked);
console.log(`picked ${picked.length} quotes across ${Object.keys(byIndicator).length} indicators -> ${a.out}`);
