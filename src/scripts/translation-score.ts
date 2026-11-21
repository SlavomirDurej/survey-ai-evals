// Scores a run's translations against the human translations with chrF (character n-gram F-score, as sacrebleu).
//
// Which quotes count: those in the chosen split with exactly one human translation text. In the source sheet a
// few long quotes carry a different excerpt translation per category row; those references cover only part of
// the quote, so they are left out instead of guessed at.
//
// For scale it also reports a floor: chrF of the untranslated original against the human translation, i.e. what
// "doing nothing" scores. Shared names, numbers and cognates give that floor a non-zero value.
//
// Writes <DATA_DIR>/runs/<run>/translation-scores.json (private, per quote) and, with --public, an aggregate summary.
// Usage: npm run translation-score -- --run <name> --sample <dir> [--split dev] [--public results/<file>.md]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dataDir } from '../lib/config.ts';
import { readJson, writeJson } from '../lib/io.ts';
import type { GoldItem, OutputRow } from '../lib/types.ts';
import { bootstrapCI } from '../metrics/bootstrap.ts';
import { corpusChrf, sentenceChrf } from '../metrics/chrf.ts';

const { values: a } = parseArgs({ options: { run: { type: 'string' }, sample: { type: 'string' }, split: { type: 'string' }, public: { type: 'string' } } });
if (!a.run || !a.sample) throw new Error('need --run <name> --sample <dir>');
const runDir = path.join(dataDir(), 'runs', a.run);
const sampleDir = path.isAbsolute(a.sample) ? a.sample : path.join(dataDir(), a.sample);
const { rows } = readJson<{ rows: OutputRow[] }>(path.join(runDir, 'outputs.json'));
const gold = new Map(readJson<GoldItem[]>(path.join(sampleDir, 'gold.json')).map(g => [g.id, g]));

const inSplit = rows.map(r => ({ r, g: gold.get(r.row_order) })).filter(x => x.g && (!a.split || x.g.split === a.split));
const withRef = inSplit.filter(x => x.g!.human_translation);
const excluded = { excerpt_references: withRef.filter(x => x.g!.translation_variants > 1).length, no_ai_translation: withRef.filter(x => !x.r.translation).length };
// The analysts added editorial notes naming the question's topic, e.g. "[on safety]", to about a fifth of their
// translations. They are not part of the translation (and they name the indicator, i.e. part of the label), so they
// are removed from the reference. Glosses like "AIFA [Italian Medicines Agency]" are real translation and stay.
const EDITORIAL = /\s*\[on [^\]]*\]/gi;
const cleanRef = (t: string) => t.replace(EDITORIAL, '').replace(/\s+([.,;:!?])/g, '$1').trim();
const items = withRef.filter(x => x.g!.translation_variants === 1 && x.r.translation).map(({ r, g }) => ({
  id: g!.id, language: g!.language, hyp: r.translation!.trim(), ref: cleanRef(g!.human_translation!), refRaw: g!.human_translation!.trim(),
  orig: g!.quote_original.trim(), hadNote: EDITORIAL.test(g!.human_translation!) && !(EDITORIAL.lastIndex = 0),
}));
if (!items.length) throw new Error('no quotes with both a human and an AI translation');
const rawRefScore = corpusChrf(items.map(it => ({ hyp: it.hyp, ref: it.refRaw })));
const withNotes = items.filter(it => it.ref !== it.refRaw).length;

const corpus = (idx: number[], field: 'hyp' | 'orig') => corpusChrf(idx.map(i => ({ hyp: items[i][field], ref: items[i].ref })));
const all = items.map((_, i) => i);
const ci = bootstrapCI(items.length, idx => corpus(idx, 'hyp'), 2000, 1);
const floor = corpus(all, 'orig');
const per = items.map(it => ({ ...it, chrf: sentenceChrf(it.hyp, it.ref), floor: sentenceChrf(it.orig, it.ref), len_ratio: it.hyp.length / it.ref.length }));
const q = (xs: number[], p: number) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

const byLang = new Map<string, number[]>();
items.forEach((it, i) => byLang.set(it.language, [...(byLang.get(it.language) ?? []), i]));
const langRows = [...byLang].filter(([, idx]) => idx.length >= 5).sort((x, y) => y[1].length - x[1].length)
  .map(([lang, idx]) => ({ lang, n: idx.length, chrf: corpus(idx, 'hyp'), floor: corpus(idx, 'orig') }));
const small = [...byLang].filter(([, idx]) => idx.length < 5);

const summary = {
  run: a.run, split: a.split ?? 'all', scored: items.length, in_split_with_human_translation: withRef.length, excluded,
  corpus_chrf: ci.value, ci95: [ci.lo, ci.hi], floor_untranslated: floor,
  references_with_editorial_notes: withNotes, corpus_chrf_against_raw_references: rawRefScore,
  sentence_chrf_quartiles: [0.25, 0.5, 0.75].map(p => q(per.map(x => x.chrf), p)),
  length_ratio_ai_over_human_median: q(per.map(x => x.len_ratio), 0.5),
  per_language: langRows, small_languages: small.map(([l, idx]) => ({ lang: l, n: idx.length })),
};
writeJson(path.join(runDir, 'translation-scores.json'), { summary, per_quote: per.sort((x, y) => x.chrf - y.chrf) });

const f = (x: number) => x.toFixed(1);
console.log(`scored ${items.length} (excluded ${JSON.stringify(excluded)})`);
console.log(`corpus chrF ${f(ci.value)} [95% CI ${f(ci.lo)}, ${f(ci.hi)}]   floor (untranslated original) ${f(floor)}`);
console.log(`references with editorial notes removed: ${withNotes}; chrF against the raw references would be ${f(rawRefScore)}`);
console.log(`sentence chrF quartiles ${summary.sentence_chrf_quartiles.map(f).join(' / ')}   median length AI/human ${summary.length_ratio_ai_over_human_median.toFixed(2)}`);
for (const l of langRows) console.log(`  ${l.lang.padEnd(24)} n=${String(l.n).padStart(3)}  chrF ${f(l.chrf)}  floor ${f(l.floor)}`);

if (a.public) {
  fs.mkdirSync(path.dirname(a.public), { recursive: true });
  fs.writeFileSync(a.public, `# Translation scores, run ${a.run}

AI translations against the human translations, scored with chrF (character n-grams 1 to 6, beta 2, as sacrebleu's
defaults; the implementation is tested against sacrebleu). Aggregates only.

- Quotes scored: ${items.length} of ${withRef.length} in the ${summary.split} split that have a human translation.
  Left out: ${excluded.excerpt_references} whose reference is a per-category excerpt, ${excluded.no_ai_translation} with no AI translation.
- References: editorial notes such as "[on safety]" removed from ${withNotes} of them (they name the question's
  topic and are not part of the translation). Against the raw references the score would be ${f(rawRefScore)}.
- **Corpus chrF: ${f(ci.value)}** (95% bootstrap interval ${f(ci.lo)} to ${f(ci.hi)}).
- Floor, the untranslated original scored the same way: ${f(floor)}.
- Sentence chrF quartiles: ${summary.sentence_chrf_quartiles.map(f).join(' / ')}. Median length of AI translation over human: ${summary.length_ratio_ai_over_human_median.toFixed(2)}.

| Collector language | Quotes | chrF | Floor |
|---|---|---|---|
${langRows.map(l => `| ${l.lang} | ${l.n} | ${f(l.chrf)} | ${f(l.floor)} |`).join('\n')}
| ${small.length} smaller groups (under 5 quotes each) | ${small.reduce((s, [, idx]) => s + idx.length, 0)} | | |

chrF measures surface overlap with one human reference. A correct translation that words things differently scores
lower, so these numbers rank versions of the pipeline against each other; they are not a quality grade.
`);
  console.log('public ->', a.public);
}
