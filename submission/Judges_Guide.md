# WasteRecast / methodology and demonstration guide

## The problem

Material categories hide acceptance differences. Two listings may both say
“plastic” while differing in polymer, moisture, contamination, grade or usable
cost. Semantic similarity alone cannot establish whether a buyer can use a stream.

## A clear explanation for the judges

“We retrieve possible counterparts by meaning, then check whether their stated
requirements actually align. Our distinctive step is to ask what supported change
could make a partial match worth investigating. We preserve the failed condition,
show the evidence and require a trial, retest and written acceptance. Economics
are calculated separately from referenced costs and usable yield.”

This is the proposed distinction of the combined workflow. We do not claim to
have invented embeddings, reciprocal rank fusion or industrial symbiosis, or to
be the only exchange using AI.

## Implemented pipeline

| Stage | Actual implementation | Boundary |
|---|---|---|
| Capture | Gemini extracts optional documents/descriptions into a reviewed typed passport | No document authentication or certified laboratory evidence |
| Retrieve | Active opposite-side Firestore listings, country/domestic restrictions, initial pool up to 200 | No exhaustive global inventory |
| Search | Alias/IDF overlap, actual 768-dimensional Gemini vectors with cosine similarity, curated process edges | No proof of technical acceptance |
| Fuse | Sum of `1 / (60 + rank)` across available retrieval lists | No calibrated fit probability |
| Check | Reviewed facts, compatible unit conversion, contradiction checks; pass/fail/unknown | No compliance approval |
| Explain | Gemini describes alignment, gaps and questions; fixed checks retain authority | No override of failed or unknown conditions |
| Investigate | Small sourced operation set; fewest operations or least fully quoted comparable cost | No guaranteed output or global financial optimum |
| Calculate | `(purchase + transport + processing + testing) / (input tonnes × usable yield / 100)` | No invented prices, FX conversion or unmeasured yield |
| Follow through | Human sample/retest/acceptance, private self-reported outcome references | No independently verified traction |

Public vector generation requires App Check and a verified account. The private
endpoint reserves a durable Firestore budget of 240 texts per account per rolling
24 hours. A session cache reduces repeated vector calls. The signed-out demo shows
the labelled alias/process fallback. Service failure never becomes a fabricated
AI response.

## Reproduce the acceptance example

1. Open https://wasterecast.web.app/#exchange.
2. Click “Try a clearly labelled matching scenario.” The counterparts are in-memory examples, never real businesses.
3. Inspect the passport. The seller states PP and 2% moisture. References explicitly identify illustrative test input.
4. Click the Gemini assessment control above the results. It makes a real request. Wording and scores can vary.
5. The PP buyer's 0.5% moisture limit fails against 2%. A drying investigation remains conditional on trial, retest and acceptance.
6. The PP compounder's required melt flow of 12–20 g/10min stays unknown without seller evidence.
7. Select “All scores and blocked listings.” The PET-only buyer is blocked by polymer identity.
8. Calculate landed cost on the first card with the illustrative values below. Reference each cost and explicitly label the yield assumption.

| Input | Illustrative value |
|---|---:|
| Input tonnes | 5 |
| Usable yield | 90% assumption, not a trial result |
| Currency | EUR |
| Total purchase | 1000 |
| Total transport | 100 |
| Total processing | 200 |
| Total testing | 50 |
| Buyer budget / usable tonne | 280 |

Expected: 1350 / 4.5 = **300 EUR per usable tonne**, exceeding the entered budget
by **20 EUR per usable tonne**. This tests arithmetic, not a real commercial offer.

## Verification and next milestone

The application revision passed 57 automated tests. All 24 authored acceptance
cases passed their expected labels. Separate service checks tested actual
embeddings, access controls, Firestore publication/persistence and private review
isolation. Three requests on one moisture scenario kept the conditional decision
while scores varied. Two authored 31-record retrieval fixtures placed their
relevant item first. None of these observations establish real-market accuracy
or production-scale capacity.

The next validation is an independently reviewed materials dataset and a
consenting buyer/seller pilot with real sample results, quotes, time to qualified
enquiry and verified recovered mass. No completed transaction or measured
environmental improvement is claimed today.
