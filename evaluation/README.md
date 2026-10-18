# Matching evaluation evidence

`matching-evaluation.json` records real Gemini calls made on 18 October 2026:
three repeated semantic assessments of one authored moisture scenario, and real
768-dimensional embedding retrieval on two authored 31-candidate fixtures.

The proposed ground truth is authored and awaits independent materials-expert
review. These are software/model smoke tests, not measured real-market accuracy,
certification, traction or proof of perfect matching. Scores varied between
runs; deterministic acceptance checks preserve the required failures.

Run `node scripts/evaluate_matching.mjs` for the current deterministic cases,
or add `--live` to make new actual Gemini calls using the private local key.
Never publish `.env`, credentials or uploaded user evidence in this directory.
