# Evaluating an LLM survey pipeline against a year of human labels

A healthcare insights client runs a yearly survey of patient groups: about 7,000 free-text quotes in 20+
languages. Analysts used to clean, translate and categorise every quote by hand, into 50 categories grouped
under 10 indicators. I built the production pipeline that now does this with LLMs (n8n workflows calling
models through OpenRouter, Postgres, a Next.js review app).

This repo is the evaluation work: does the pipeline agree with what the analysts did, where does it fail, and
which changes make it better? It is also how I am learning evals properly, so the notes explain the reasoning
as well as the numbers.

## Status

| Step | What | State |
|---|---|---|
| 1 | A staging copy of the pipeline at parity with production, so experiments never touch the live system | done |
| 2 | A seeded, stratified sample of the previous year's human work, run through the real pipeline | done, dev split |
| 3 | A harness to score runs and compare prompt or model changes | in progress |

## First result (baseline, dev split, 230 quotes)

| Level | Micro P | Micro R | Micro F1 | Macro F1 | Exact set match |
|---|---|---|---|---|---|
| Category (50) | 0.366 | 0.451 | 0.404 | 0.390 | 0.183 |
| Indicator (10) | 0.596 | 0.663 | 0.628 | 0.605 | 0.374 |

Cost of the run, measured from token counts: $2.54 for 230 quotes. Full breakdown in
[results/2026-11-19-dev-staging.md](results/2026-11-19-dev-staging.md).

How to read it: the model gives more labels than the analysts did (2.07 against 1.68 per quote) and gets the
right indicator far more often than the exact category. These are baseline numbers, before any change.

## What I learned so far

- [Note 1: Is the old gold still valid for today's taxonomy?](docs/notes/01-taxonomy-check.md)
  Three cheap checks before scoring anything, and a column that turned out to be partly a copy of the label.

## Method in short

- **Gold:** the previous year's analyst sheet. It is in export shape (one row per quote per category), so the
  label is a set of categories per quote: 60% of quotes have one, 40% have two or more.
- **Sample:** 476 unique quotes, stratified by language with floors per language and per category, split
  into dev (230) and test (246). Prompts are tuned on dev only; test is scored rarely.
- **Run:** the sample goes through the real app and pipeline on staging, exactly like a client upload.
- **Score:** standard multi-label metrics (micro and macro precision, recall, F1, exact match, Jaccard).
  The implementation is unit-tested and cross-checked against scikit-learn on real runs.

Details and limitations: [docs/method.md](docs/method.md).

## Layout

```
src/metrics/multilabel.ts     metric definitions + tests
src/scripts/build-sample.ts   seeded stratified sample, dev/test split, gold file
src/scripts/export-run.ts     pull a run's outputs from the app database
src/scripts/score-run.ts      join to gold, score, write private detail + public summary
src/scripts/run-cost.ts       measured cost from saved n8n executions
src/scripts/taxonomy-*.ts     checks that the old labels still fit today's taxonomy
tools/crosscheck_sklearn.py   recompute the metrics with scikit-learn
results/                      aggregate results per run (public)
docs/                         method and learning notes
```

## Running it

Needs Node 22+. Copy `.env.example` to `.env` and fill in the n8n instance, worker workflow IDs and database
access. Private data lives under `DATA_DIR` (default `data/private/`, gitignored).

```
npm install
npm test
npm run build-sample -- --source <sheet.xlsx> --categories <categories.json> --out <DATA_DIR>/sample-v1
npm run split-upload -- --sample <DATA_DIR>/sample-v1 --split dev
# upload the file through the app and process it, then:
npm run export-run -- --survey <survey uuid> --run <run name>
npm run run-cost -- --since <run start, ISO> --out <DATA_DIR>/runs/<run name>/cost.json
npm run score-run -- --run <run name> --sample sample-v1 --split dev --cost cost.json --public results/<run name>.md
```

## Data and privacy

No client data is in this repo: no quotes, translations, per-quote labels, client name, hostnames or keys.
Results are published as aggregates only, with categories by code.

## Next

- Component-level experiments with promptfoo: call the categorise prompt directly against gold, so prompt
  ideas cost cents and minutes, then confirm winners end to end.
- First experiment: show the categoriser the survey question the quote answers (taken from the raw input,
  not the labelled sheet, see Note 1).
- Score translations against the human ones (chrF, then an LLM judge).
- Sweep a confidence threshold and segment handling, since the model over-labels.
