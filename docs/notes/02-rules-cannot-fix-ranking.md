# Note 2: Can a simple rule fix over-labelling?

The baseline run gives more categories per quote than the analysts did (2.07 against 1.68), with precision 0.37
and recall 0.45. The tempting fix is a rule on the model's output: keep only confident labels, or only the top
two. It costs nothing to test, because the outputs already exist: re-score the same run under each rule.

## What I tried

Seven rules on the same 230 dev quotes, no model calls
([full table](../../results/2026-11-19-dev-staging-rule-sweep.md)):

| Rule | Labels per quote | Micro F1 | Difference from baseline [95% interval] |
|---|---|---|---|
| Baseline: every label from every segment | 2.07 | 0.404 | |
| Confidence 0.8 or higher | 1.75 | 0.401 | -0.003 [-0.021, +0.013] |
| Top 3 by confidence | 1.76 | 0.399 | -0.005 [-0.028, +0.015] |
| Top 2 by confidence | 1.48 | 0.388 | -0.016 [-0.050, +0.014] |
| First segment only | 1.29 | 0.343 | -0.062 [-0.100, -0.024] |
| Top 1 by confidence | 0.93 | 0.319 | -0.085 [-0.130, -0.043] |
| Oracle: top k, where k is the number of human labels | 1.46 | 0.411 | +0.006 [-0.020, +0.031] |

No rule helps. Every cut trades recall for precision roughly one for one.

## The oracle row is the useful one

The oracle cheats: it knows how many labels the analysts gave each quote and keeps that many of the model's
highest-ranked labels. It cannot be deployed, but it answers a diagnostic question. If the model's problem were
only "too many labels", the oracle would score well above baseline. It does not (+0.006, inside the noise).
So the model is not over-labelling a good ranking; its ranking itself puts the wrong categories near the top.

## The model's confidence is weak evidence

| Stated confidence | Labels | Share the analysts also chose |
|---|---|---|
| below 0.80 | 73 | 22% |
| 0.80 to 0.89 | 218 | 34% |
| 0.90 to 0.94 | 91 | 34% |
| 0.95 and above | 93 | 56% |

Higher stated confidence does mean somewhat better odds, but "0.95" is right about half the time, and 85% of
labels sit in a narrow 0.80 to 0.95 band where confidence says almost nothing. Self-reported confidence from an
LLM is a ranking hint at best, not a probability.

## Lessons

- Before tuning thresholds, run an oracle. It tells you whether selection or ranking is the problem.
- With 230 quotes, F1 differences of a couple of points are noise. A paired bootstrap (resample quotes, score
  both rules on the same resample) shows that cheaply; here only the clearly bad rules are distinguishable.
- Rules picked on dev are tuned to dev. None was picked here, but a winning rule would still need the test split.
- The fix has to change what the model sees or how it decides, not what happens after. The first candidate is
  giving it the survey question (Note 1).
