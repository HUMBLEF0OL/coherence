# v0.2-alpha telemetry observation window plan (M8)

## Acceptance criterion to close the window

Whichever fires first:
- ≥ 50 opted-in sessions across the matrix; OR
- 30 days from `v0.2-alpha` tag (no later than 2026-06-09 if cut on 2026-05-10).

## Metrics computed at close

1. **Per-detector precision** (`would_have_fired` vs `actually_accepted`).
2. **Per-detector recall proxy** — counts of `proposal_signal_observed` events
   that were not followed by `proposal_proposed` within the same session.
3. **Signal-kind co-occurrence matrix** — input to the DD-067 planner-branch
   decision: ≥ 25% of accept/reject actions span ≥ 2 distinct signal kinds
   within a 30-min window?
4. **Per-session cost share distribution** — Author 60% / Annotate 30% /
   Trickle 10% partition (DD-085).
5. **Statusline tier distribution** (osc8 / osc52 / plain / claude_url).

## Close-out script

`scripts/alpha-telemetry-close.mjs` aggregates `metrics.jsonl` rolled-up
summaries into `release-artifacts/v0.2-alpha-telemetry-<ts>.json`.

## Privacy posture

Every aggregation is **post-hash**: only DD-068 `signature_hash` digests are
considered, never raw command/path/prompt content. The `share-metrics
--anonymized` writer (FG-16) is the canonical anonymisation surface.
