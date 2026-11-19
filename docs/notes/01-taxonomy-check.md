# Note 1: Is the old gold still valid for today's taxonomy?

The gold set for this eval is a year of survey quotes that analysts at a healthcare insights client labelled by
hand. Each quote carries one or more category numbers (1 to 50) from a two-level taxonomy: 10 indicators,
50 categories. The labelled sheet stores numbers only, no names. Before scoring a model against it, I had to
check that the numbers still mean the categories the model is asked to choose from today. If the taxonomy had
been renumbered, every score would partly measure the renumbering instead of the model.

## Three cheap checks

| Check | Result |
|---|---|
| The client's own category list, numbered, against the live system's list | 50 of 50 names identical by number |
| Survey structure: each of 10 questions asks about one indicator, so a quote's label should sit in its question's indicator | 98.5% of 7,105 labels do |
| Read 20 quotes (2 per indicator, seeded random pick) next to the current category name | 18 clear fits, 2 plausible, 0 misfits |

Any one check alone is weak. Together they make a renumbering very unlikely.

## What the second check turned up

The labelled sheet files some quotes under several questions, one category per question. The raw input
has far fewer of these (about 5% of quotes against about 29% in a 476-quote sample; the raw file covers mostly
non-English quotes, so this is indicative), so most copies were probably made by the analysts while labelling.
That makes the question column partly a copy of the answer: feeding it to the model in an eval would leak the
label.

The real survey question is still fair input, and the humans clearly used it: 99.5% of their labels in the dev
sample sit in the indicator of one of the quote's questions. The model in production does not see the question,
and only 46% to 63% of its labels land there. The range depends on which of a quote's questions you count, and
some of those questions are analyst copies, so a clean number needs the questions from the raw input. Giving
the model the real question is the first experiment.

## Lessons

- Validate the gold before scoring against it. Old labels can quietly drift from the current task.
- Look for columns that are partly derived from the label. They inflate scores when used as input.
- Structure in the data (here, question to indicator) can check labels at scale, so a manual read can stay small.
