# Translation scores, run 2026-11-19-dev-staging

AI translations against the human translations, scored with chrF (character n-grams 1 to 6, beta 2, as sacrebleu's
defaults; the implementation is tested against sacrebleu). Aggregates only.

- Quotes scored: 154 of 156 in the dev split that have a human translation.
  Left out: 2 whose reference is a per-category excerpt, 0 with no AI translation.
- References: editorial notes such as "[on safety]" removed from 25 of them (they name the question's
  topic and are not part of the translation). Against the raw references the score would be 57.5.
- **Corpus chrF: 58.6** (95% bootstrap interval 55.6 to 61.3).
- Floor, the untranslated original scored the same way: 23.3.
- Sentence chrF quartiles: 46.7 / 55.2 / 65.6. Median length of AI translation over human: 1.18.

| Collector language | Quotes | chrF | Floor |
|---|---|---|---|
| SPANISH MAIN | 23 | 55.6 | 26.0 |
| FRENCH | 17 | 53.9 | 31.4 |
| SPANISH LATAM | 16 | 61.8 | 32.2 |
| PORTUGUESE (BRAZIL) | 16 | 65.8 | 29.4 |
| GERMAN | 11 | 64.1 | 24.5 |
| ITALIAN | 8 | 62.5 | 33.9 |
| CHINESE SIMPL | 6 | 45.1 | 0.0 |
| FINNISH | 6 | 50.0 | 16.2 |
| KOREAN | 6 | 52.5 | 0.5 |
| PORTUGUESE MAIN | 5 | 69.2 | 19.6 |
| GREEK | 5 | 66.1 | 13.4 |
| 10 smaller groups (under 5 quotes each) | 35 | | |

chrF measures surface overlap with one human reference. A correct translation that words things differently scores
lower, so these numbers rank versions of the pipeline against each other; they are not a quality grade.
