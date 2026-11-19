// Writes an upload file containing only one split (dev or test) of a sample. Order stays = gold id.
// Usage: npm run split-upload -- --sample <dir> --split dev [--upload upload.xlsx]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readJson, readXlsx, writeSheet, XLSX } from '../lib/io.ts';
import type { GoldItem } from '../lib/types.ts';

const { values: a } = parseArgs({ options: { sample: { type: 'string' }, split: { type: 'string' }, upload: { type: 'string', default: 'upload.xlsx' } } });
if (!a.sample || (a.split !== 'dev' && a.split !== 'test')) throw new Error('need --sample <dir> --split dev|test');
const ids = new Set(readJson<GoldItem[]>(path.join(a.sample, 'gold.json')).filter(g => g.split === a.split).map(g => g.id));
const wb = readXlsx(path.join(a.sample, a.upload!));
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null })
  .filter(r => ids.has(Number(r.Order)));
const file = path.join(a.sample, a.upload!.replace(/\.xlsx$/, `-${a.split}.xlsx`));
writeSheet(file, rows, 'quotes');
console.log(`${file}: ${rows.length} rows (gold ${a.split}: ${ids.size})`);
