# Rule sweep on run 2026-11-19-dev-staging

Same model outputs, different post-processing rules. No model calls. 230 quotes, dev split.
Human labels per quote: 1.68. Category-level metrics unless the column says otherwise.
The interval is a paired bootstrap (2,000 resamples of quotes) on the micro F1 difference against the baseline.
Rows marked * use the number of human labels, so they are diagnostics, not usable rules.

| Rule | Labels/quote | Micro P | Micro R | Micro F1 | Macro F1 | Exact | Indicator F1 | F1 vs baseline [95% CI] |
|---|---|---|---|---|---|---|---|---|
| baseline: union over segments | 2.07 | 0.366 | 0.451 | 0.404 | 0.390 | 0.183 | 0.628 |  |
| confidence >= 0.8 | 1.75 | 0.393 | 0.409 | 0.401 | 0.373 | 0.183 | 0.602 | -0.003 [-0.021, +0.013] |
| confidence >= 0.9 | 0.80 | 0.451 | 0.215 | 0.291 | 0.226 | 0.148 | 0.438 | -0.113 [-0.158, -0.066] |
| top 1 by confidence | 0.93 | 0.447 | 0.249 | 0.319 | 0.268 | 0.196 | 0.548 | -0.085 [-0.130, -0.043] |
| top 2 by confidence | 1.48 | 0.413 | 0.365 | 0.388 | 0.351 | 0.200 | 0.612 | -0.016 [-0.050, +0.014] |
| top 3 by confidence | 1.76 | 0.390 | 0.409 | 0.399 | 0.375 | 0.183 | 0.623 | -0.005 [-0.028, +0.015] |
| first segment only | 1.29 | 0.394 | 0.303 | 0.343 | 0.284 | 0.183 | 0.576 | -0.062 [-0.100, -0.024] |
| oracle: top k, k = number of human labels * | 1.46 | 0.442 | 0.383 | 0.411 | 0.379 | 0.252 | 0.630 | +0.006 [-0.020, +0.031] |

## Calibration

If the model's confidence meant something, labels with higher stated confidence would be right more often.

| Stated confidence | AI labels | Share in human set |
|---|---|---|
| below 0.80 | 73 | 0.219 |
| 0.80 to 0.89 | 218 | 0.344 |
| 0.90 to 0.94 | 91 | 0.341 |
| 0.95 and above | 93 | 0.559 |
