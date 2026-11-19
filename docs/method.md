# Method

## System under test

A pipeline that processes survey quotes in three LLM steps, run per batch by n8n workflows:

| Step | Model (via OpenRouter) | Input | Output |
|---|---|---|---|
| Clean | Gemini 2.5 Flash | original quote, collector language | cleaned quote |
| Translate | Claude Sonnet 4.6 | cleaned quotes, 3 per call | English translation |
| Categorise | Claude Haiku 4.5 | translation, taxonomy | segments of the quote, each with 1 to 3 categories and a confidence |

Each step has a fallback model. The taxonomy is 50 categories under 10 indicators. The model does not see the
survey question the quote answers.

Experiments run on a staging copy of the whole system. Before the first run, every active workflow on staging
was synced from production and checked node for node, and the reference tables (taxonomy, specialities) were
made identical.

## Gold

The previous year's analyst sheet: about 7,100 rows. Each row is a quote with one category number, a question
and, for non-English quotes, a human translation. A quote with several categories appears once per category, so
the unit is a unique quote (respondent id plus normalised text) and its label is the set of categories from its
rows. That gives 4,523 unique quotes:

| Categories per quote | 1 | 2 | 3 | 4+ |
|---|---|---|---|---|
| Share of quotes | 60% | 28% | 10% | 2% |

There is no human "cleaned" text, so the clean step has no gold. The taxonomy check is in
[Note 1](notes/01-taxonomy-check.md).

## Sample

Built by `src/scripts/build-sample.ts`, deterministic from a seed:

1. Allocate by collector language in proportion to its size, with a floor of 8 quotes (or all, if fewer).
2. Top up any category that appears in fewer than 6 sampled quotes.
3. Never sample the same text twice (identical answers from different respondents exist).
4. Split into dev and test greedily by each quote's rarest category, so every category has at least 3 quotes
   in each half.
5. Record a post-stratification weight per quote (language population over language sample count).

Result: 476 quotes in 24 language groups, dev 230 and test 246, 312 with a human translation.

The upload file carries only what the app takes from a client file, with the sample id in the Order column.
The app stores Order as the row order, which is the join key back to gold after the run.

## Scoring categories

For each quote: AI labels = the union of categories over all its segments (plus any row-level ones);
human labels = the gold set. Then standard multi-label metrics, implemented in `src/metrics/multilabel.ts`:

| Metric | Meaning |
|---|---|
| Micro precision, recall, F1 | pool matches, extras and misses over all quotes; frequent categories dominate |
| Macro F1 | F1 per category, then the plain mean; rare categories count as much as common ones |
| Exact match | share of quotes where the AI set equals the human set |
| Jaccard | mean over quotes of overlap divided by union |
| Indicator level | the same metrics after mapping each category to its indicator |

A ratio with a zero denominator counts as 0, as in scikit-learn with `zero_division=0`.
`tools/crosscheck_sklearn.py` recomputes the metrics with scikit-learn on a real run and fails on any difference.

Rules that are choices, not facts, and are switchable in `score-run`: the union over segments, keeping every
suggestion regardless of confidence, and weighting (off by default).

## Cost

Measured, not estimated: the workers save successful executions, and `run-cost` sums the token counts each
model node reports and prices them at OpenRouter list prices (`config/openrouter-prices.json`, with the date
they were fetched).

## Limitations

- The gold is one team's labels, not adjudicated, with no agreement measure. The ceiling for any model is
  unknown, so scores are for comparing versions, not for an absolute verdict.
- The labelled sheet files some quotes under several questions, partly as a side effect of labelling, so its
  question column must not be used as model input (Note 1).
- The union over segments rewards a model for splitting quotes finely. Segment-aware scoring is open.
- 230 quotes give wide error bars on per-category numbers. Treat category-level results as leads, not findings.
