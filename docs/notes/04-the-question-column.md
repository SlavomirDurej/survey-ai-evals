# Note 4: The question column was mostly the analyst's filing, and a correction to Note 1

The next experiment gives the categoriser the survey question each quote answers. In this survey, ten of the
questions each ask about one indicator, so the question should be a strong hint. Before running it I needed the
real question for every sample quote, and getting it overturned a number I had published.

## Where the real question lives

The labelled sheet has a QUESTION column, but Note 1 already showed it is partly a product of labelling. The raw
survey export, made before anyone labelled anything, has the question each respondent actually answered. It
covers the non-English answers only (it was the file sent to translators), so English quotes have no raw source.

Matching every sample quote back to the raw export, within the same respondent:

| Match | Quotes | How |
|---|---|---|
| Exact | 202 | same text after normalising case, spacing, punctuation |
| Contained | 13 | one text contains the other (the analyst kept an excerpt) |
| Similar | 96 | text edited between export and labelling; chrF or edit similarity, accents ignored |
| Unknown | 165 | 164 English quotes (no raw source) and 1 very short answer with no safe match |

The similar matches were checked by reading the weakest ones. They are the same answers with typos fixed, accents
added or wording tidied. Very short texts are matched by edit distance only, because chrF is unstable on a few
characters; one two-word answer was left unknown rather than guessed.

## What it showed

**41% of the matched quotes sit under a different question in the labelled sheet than the one the respondent
answered.** The analysts did not only copy quotes to extra questions (Note 1); they moved them, mostly to the
question that matches the category they chose. So in the labelled sheet, the question mostly records where the
analyst filed the quote.

## The correction

Note 1 said the humans "clearly used" the question: 99.5% of their labels in the dev sample sat in the indicator
of one of the quote's questions. Those were the labelled sheet's questions, which largely follow the labels, so
the number was mostly circular. Against the real question:

| | Labels in the real question's indicator | Quotes with at least one such label |
|---|---|---|
| Analysts (290 quotes with a known Q3 to Q12 question) | 48.5% | 62.4% |
| Pipeline, baseline run (142 dev quotes) | 35.6% | 47.9% |

The analysts follow the question about half the time, because respondents often answer one question with points
that belong to another indicator. The pipeline follows it less, which is expected since it never sees it.

What survives from Note 1: the taxonomy check still holds (it rests mainly on the client's numbered category list
being identical to the live one), and the advice never to use the labelled sheet's question as model input is now
stronger.

## What it means for the experiment

The question is a moderate signal, not the decisive one I expected. A realistic hope is to close part of the
13-point gap without making the model force every label into the question's indicator, which would hurt the
quotes where the analysts looked past the question. The experiment runs on the 142 dev quotes with a known real
question, so English is not covered.

## Lessons

- A derived column can look like an input. Check where each column came from before treating it as one.
- Re-derive a published claim when new data touches it, and correct it in the open.
- For short strings, character n-gram metrics are noisy. Edit distance is the better tool there.
