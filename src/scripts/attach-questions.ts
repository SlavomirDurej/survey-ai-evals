// Attaches to each sample quote the survey question(s) the respondent actually answered.
//
// Why: in the labelled sheet, the QUESTION column mostly records where the analyst filed the quote (often the
// question matching the category they chose), not where the respondent wrote it. The raw survey export, taken
// before labelling, has the real question. This script matches every sample quote back to that raw export.
//
// Matching, within the same respondent (raw rows can repeat a text under several questions; all are kept):
//   exact       same text after normalising case, spacing and punctuation
//   contained   one text contains the other (the analyst kept an excerpt, or merged answers)
//   similar     best similarity >= --min-sim (text edited between export and labelling): chrF or edit
//               similarity, edit similarity only for short texts, accents ignored; near-ties
//               within 2 points keep every question involved
//   unknown     respondent not in the raw export (e.g. a language it does not cover) or nothing similar enough
//
// Output: <sample>/questions.json (private): per quote id the real question codes, how they were matched, and
// the similarity; plus the question wording from --coding if given.
// Usage: npm run attach-questions -- --sample <dir> --labelled <sheet.xlsx> --raw <raw.xlsx>
//          [--labelled-sheet 2024] [--raw-sheet TOPSHEET] [--coding <xlsx with question coding + categories sheets>]
//          [--min-sim 50] [--run <name>, to also report how the AI labels of a run align with the real question]
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from '../lib/config.ts';
import { readJson, readXlsx, writeJson, XLSX } from '../lib/io.ts';
import type { GoldItem } from '../lib/types.ts';
import { sentenceChrf } from '../metrics/chrf.ts';

const { values: a } = parseArgs({ options: {
  sample: { type: 'string' }, labelled: { type: 'string' }, raw: { type: 'string' }, coding: { type: 'string' },
  'labelled-sheet': { type: 'string', default: '2024' }, 'raw-sheet': { type: 'string', default: 'TOPSHEET' }, 'min-sim': { type: 'string', default: '50' },
  run: { type: 'string' },
} });
if (!a.sample || !a.labelled || !a.raw) throw new Error('need --sample, --labelled, --raw');
const MIN_SIM = Number(a['min-sim']);

// labelled sheet: header on row 2, respondent id in column C (index 2)
const lab = XLSX.utils.sheet_to_json<any[]>(readXlsx(a.labelled).Sheets[a['labelled-sheet']!], { header: 1, defval: null, blankrows: false });
// raw export: header rows 1-3; question code in column B, respondent id in C, quote text in J
const rawRows = XLSX.utils.sheet_to_json<any[]>(readXlsx(a.raw).Sheets[a['raw-sheet']!], { header: 1, defval: null, blankrows: false })
  .slice(3).filter(r => r[9] && r[1]).map(r => ({ q: String(r[1]).trim(), resp: String(r[2]), text: String(r[9]) }));
const byResp = new Map<string, typeof rawRows>();
for (const r of rawRows) (byResp.get(r.resp) ?? byResp.set(r.resp, []).get(r.resp)!).push(r);

// accents are dropped (raw answers are often typed without them, the labelled copy is corrected)
const fold = (t: string) => t.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
const key = (t: string) => fold(t).replace(/[^\p{L}\p{N}]+/gu, '');
const spaced = (t: string) => fold(t).replace(/\s+/g, ' ').trim();
const SHORT = 30; // characters in the key; below this, chrF alone is not trusted

/** 100 * (1 - edit distance / longer length), on code points. Skipped (null) for long texts, where chrF is reliable. */
function editSimilarity(x: string, y: string): number | null {
  const s = Array.from(x), t = Array.from(y);
  if (Math.max(s.length, t.length) > 600) return null;
  if (!s.length || !t.length) return s.length === t.length ? 100 : 0;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 100 * (1 - prev[t.length] / Math.max(s.length, t.length));
}

type Match = { id: number; split: string; language: string; real_questions: string[]; match: 'exact' | 'contained' | 'similar' | 'unknown'; similarity: number | null; labelled_questions: string[] };
const gold = readJson<GoldItem[]>(path.join(a.sample, 'gold.json'));
const out: Match[] = gold.map(g => {
  const resp = String(lab[g.source_rows[0] - 1][2]);
  const base = { id: g.id, split: g.split, language: g.language, labelled_questions: g.questions };
  const cands = byResp.get(resp) ?? [];
  const k = key(g.quote_original);
  const qs = (rs: typeof rawRows) => [...new Set(rs.map(r => r.q))].sort((x, y) => parseInt(x.slice(1)) - parseInt(y.slice(1)));
  const exact = cands.filter(r => key(r.text) === k);
  if (exact.length) return { ...base, real_questions: qs(exact), match: 'exact', similarity: 100 };
  const contained = k.length >= 15 ? cands.filter(r => { const rk = key(r.text); return rk.length >= 15 && (rk.includes(k) || k.includes(rk)); }) : [];
  if (contained.length) return { ...base, real_questions: qs(contained), match: 'contained', similarity: null };
  // similarity: edit similarity for short texts (chrF is unstable there), otherwise the better of chrF and edit similarity
  const short = k.length < SHORT;
  const scored = cands.map(r => {
    const ed = editSimilarity(key(g.quote_original), key(r.text)) ?? 0;
    const chrf = Math.max(sentenceChrf(spaced(g.quote_original), spaced(r.text)), sentenceChrf(spaced(r.text), spaced(g.quote_original)));
    return { r, s: short ? ed : Math.max(chrf, ed) };
  });
  const best = Math.max(-1, ...scored.map(x => x.s));
  if (best >= MIN_SIM) return { ...base, real_questions: qs(scored.filter(x => x.s >= best - 2).map(x => x.r)), match: 'similar', similarity: Number(best.toFixed(1)) };
  return { ...base, real_questions: [], match: 'unknown', similarity: best >= 0 ? Number(best.toFixed(1)) : null };
});

let coding: Record<string, string> | undefined;
if (a.coding) {
  const wb = readXlsx(a.coding);
  const sheet = wb.SheetNames.find(n => /question coding/i.test(n));
  if (!sheet) throw new Error('no "question coding" sheet in --coding file');
  coding = Object.fromEntries(XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false })
    .slice(1).filter(r => r[0] != null).map(r => [`Q${r[0]}`, String(r[1]).trim()]));
}
writeJson(path.join(a.sample, 'questions.json'), { built: new Date().toISOString(), min_similarity: MIN_SIM, question_text: coding ?? null, quotes: out });

const tally = (f: (m: Match) => string) => out.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {} as Record<string, number>);
console.log('match type by split:', JSON.stringify(tally(m => `${m.split} ${m.match}`)));
console.log('english quotes known:', out.filter(m => /^ENGLISH/.test(m.language) && m.match !== 'unknown').length, '/', out.filter(m => /^ENGLISH/.test(m.language)).length);
const known = out.filter(m => m.match !== 'unknown');
const moved = known.filter(m => !m.real_questions.some(q => m.labelled_questions.includes(q))).length;
console.log(`known: ${known.length}; real question not among the labelled sheet's questions (moved): ${moved} (${(100 * moved / known.length).toFixed(1)}%)`);
console.log('real question counts:', JSON.stringify(tally(m => m.real_questions.length ? m.real_questions.join('/') : 'none')));
console.log('-> ' + path.join(a.sample, 'questions.json'));

// Alignment: how often do labels fall under the question the respondent actually answered?
// Needs the category -> question mapping from the --coding file's "categories" sheet (category #, name, indicator, Q).
if (a.coding) {
  const wb = readXlsx(a.coding);
  const sheet = wb.SheetNames.find(n => /^categories/i.test(n.trim()));
  if (sheet) {
    const catQ = new Map(XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheet], { header: 1, defval: null, blankrows: false })
      .slice(1).filter(r => r[0] != null && r[3] != null).map(r => [Number(r[0]), `Q${r[3]}`]));
    const align = (labelsOf: (id: number) => number[] | undefined, label: string) => {
      let inQ = 0, all = 0, quotesAny = 0, quotes = 0;
      for (const m of out) {
        const ls = labelsOf(m.id);
        if (!ls || !m.real_questions.some(q => [...catQ.values()].includes(q))) continue; // only Q3-Q12 style questions
        quotes++;
        const hit = ls.filter(c => m.real_questions.includes(catQ.get(c)!)).length;
        inQ += hit; all += ls.length; if (hit) quotesAny++;
      }
      console.log(`${label}: ${inQ}/${all} labels (${(100 * inQ / all).toFixed(1)}%) under the real question; quotes with at least one: ${quotesAny}/${quotes} (${(100 * quotesAny / quotes).toFixed(1)}%)`);
    };
    const goldById = new Map(gold.map(g => [g.id, g.human_categories]));
    align(id => goldById.get(id), 'human labels, all known quotes');
    align(id => (goldById.get(id) && out.find(m => m.id === id)!.split === 'dev' ? goldById.get(id) : undefined), 'human labels, dev only');
    if (a.run) {
      const joined = new Map(readJson<{ id: number; ai_categories: number[] }[]>(path.join(dataDir(), 'runs', a.run, 'joined.json')).map(j => [j.id, j.ai_categories]));
      align(id => joined.get(id), `AI labels, run ${a.run}`);
    }
  }
}
