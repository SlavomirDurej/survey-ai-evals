# Run 2026-11-19-dev-staging

Aggregate results only. Quote text, translations and per-quote labels stay private.

- Quotes scored: 230 (dev split), processing status: {"completed":230}
- Scoring rules: one unit per quote, AI labels = union over segments, min confidence 0, unweighted
- Labels per quote, mean: human 1.68, AI 2.07; quotes with no AI label: 6.5%
- Measured cost: $2.54 (clean $0.07, translate $1.22, categorise $1.26), from saved execution token counts at list prices

## Category sets

| Level | Micro P | Micro R | Micro F1 | Macro F1 | Exact match | Jaccard |
|---|---|---|---|---|---|---|
| Category (50) | 0.366 | 0.451 | 0.404 | 0.390 | 0.183 | 0.331 |
| Indicator (10) | 0.596 | 0.663 | 0.628 | 0.605 | 0.374 | 0.560 |

## Per indicator

| Indicator | Human labels | AI labels | P | R | F1 |
|---|---|---|---|---|---|
| A Patient centricity | 23 | 38 | 0.395 | 0.652 | 0.492 |
| B Patient information | 39 | 47 | 0.660 | 0.795 | 0.721 |
| C Patient safety | 22 | 19 | 0.526 | 0.455 | 0.488 |
| D Products of benefit to patients | 30 | 27 | 0.778 | 0.700 | 0.737 |
| E Transparency | 36 | 34 | 0.735 | 0.694 | 0.714 |
| F Integrity | 24 | 27 | 0.407 | 0.458 | 0.431 |
| G Patient-group relations | 55 | 82 | 0.561 | 0.836 | 0.672 |
| H Providing service beyond the pill | 25 | 21 | 0.524 | 0.440 | 0.478 |
| I Engaging patients in R&D | 39 | 41 | 0.659 | 0.692 | 0.675 |
| J Access to medicines | 39 | 33 | 0.697 | 0.590 | 0.639 |

## Weakest categories (support of 3 or more)

| Category | Human labels | AI labels | F1 |
|---|---|---|---|
| C.2 | 5 | 2 | 0.000 |
| C.5 | 6 | 2 | 0.000 |
| D.4 | 3 | 1 | 0.000 |
| H.1 | 3 | 14 | 0.000 |
| H.3 | 5 | 2 | 0.000 |
| I.6 | 5 | 5 | 0.000 |
| J.3 | 3 | 1 | 0.000 |
| A.1 | 3 | 13 | 0.125 |
