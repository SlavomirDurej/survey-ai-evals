# Note 3: Scoring translations, where the metric was the easy part

About 2,800 of last year's quotes have a human translation. That gives a reference to score the pipeline's
translations against. The metric took an hour; the references took most of the work.

## The metric: chrF

chrF compares character n-grams (1 to 6 characters) between the model's translation and the reference, and
reports an F-score that weights recall twice as much as precision. I chose it over BLEU because it gives partial
credit for word forms ("prices" against "pricing"), works the same for any target language, and large studies of MT metrics recommend it over BLEU when a
neural metric is not an option. It runs locally and costs nothing.

The implementation (`src/metrics/chrf.ts`) is tested against sacrebleu, the reference implementation, and
matches it to 9 decimal places at sentence and corpus level. Corpus chrF pools the n-gram counts over all quotes
before computing one score; it is not the mean of per-quote scores.

## What the references needed

Reading the lowest-scoring quotes before trusting the number found three problems, none of them the model's:

1. **Excerpt references.** For a few long quotes, the analysts translated a different excerpt for each category
   row. Those references cover only part of the quote. They are rare (27 quotes in the full sheet, 2 in the dev
   split) and are left out.
2. **Editorial notes.** About a fifth of all human translations carry notes such as "[on safety]" or
   "[on access]". They name the question's topic, which is not in the quote, so the model rightly leaves them
   out and loses points for it. They are removed from the references (25 in the dev split). The notes also name
   the indicator, so the human translation partly encodes the label: it must never be used as model input in a
   categorisation experiment.
3. **Paraphrase.** What remains at the bottom are very short answers where the model and the analyst chose
   different but reasonable words, of the kind "more dialogue" against "better communication" (an invented
   example; the real pairs stay private). chrF cannot see that they mean much the same.

## Result

154 dev quotes ([full table](../../results/2026-11-19-dev-staging-translation.md)):

| | chrF |
|---|---|
| Pipeline translation | **58.6** (95% interval 55.6 to 61.3) |
| Same, against references with the notes left in | 57.5 |
| Floor: the untranslated original scored the same way | 23.3 |

By collector language it ranges from about 45 (Simplified Chinese, 6 quotes) to about 69 (Portuguese, 5 quotes).
The model's translations are about 18% longer than the human ones (median); one visible habit is adding
glosses, such as expanding "R&D".

## Lessons

- Read the worst items before trusting an aggregate. Here they were mostly reference problems.
- Clean references with a documented, narrow rule, and report the score both ways so the effect is visible.
- chrF is good for catching regressions between pipeline versions. It is not a quality grade: a correct
  translation that words things differently scores low.
- Meaning needs a different tool. Next step for translation: an LLM judge (or COMET) on the low-scoring tail,
  asking whether the meaning matches, so the cheap metric decides where the expensive one looks.
