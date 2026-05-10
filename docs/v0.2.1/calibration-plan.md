# Corpus calibration plan (originally v0.2.1; folded into v0.3 ship-time)

> ⚠️ **SUPERSEDED BY v0.3** (2026-05-10)
> 
> The corpus-calibration framework described here shipped with v0.3 directly.
> The acceptance gate (M-CALIB-1: per-detector Wilson 95% lower bound ≥ 0.7,
> recall ≥ 0.6) is now wired into `scripts/release-ga.mjs` preflight, and the
> v0.3 corpus (72 fixtures across bash/correction/file_creation) cleared the
> floor on first run. See [docs/v0.3/CHANGELOG.md § M7](../v0.3/CHANGELOG.md)
> for the calibration table.
> 
> This document is preserved for historical context only. Field calibration
> remains v0.4+ work.

> **2026-05-10 reframing:** Per Notion DD-118 (no legacy support) + the
> "no audience yet" reality, v0.2.1 is no longer cut as a separate
> release. The corpus-calibration framework described here ships with
> v0.3 directly; "Pass M-CALIB-1" is now part of v0.3 ship-time
> acceptance (BRD-4). The technical content of this doc is unchanged.

**Status:** scaffold landed 2026-05-10. Gate currently FAILS at corpus
size 13; path forward = corpus expansion before v0.3 GA.

## Why corpus calibration

DD-092 (v0.2 ratified) committed v0.2.1 to re-tune DD-076/077/078
threshold defaults against real-user telemetry from a v0.2-alpha rolling
30-day window. Real-user telemetry requires the alpha distribution to
run for ≥30 days × ≥50 sessions before `scripts/alpha-telemetry-close.mjs`
will accept the data — multi-month minimum.

DD-092 amendment 2026-05-10 (= v0.3 DD-116) changed the calibration
substrate for v0.2.1: ship corpus-calibrated thresholds, not
field-calibrated. Field calibration becomes v0.4 work once real data
accrues. Corpus calibration is the **substrate floor** — it ensures
detectors are not broken — and it unblocks v0.3 BRD/Tech Spec authoring
which would otherwise carry "(subject to v0.2.1 amendment)" annotations
on every detector-adjacent section.

## How the calibrator works

`scripts/corpus-calibrate.mjs` (run via `npm run calibrate`):

1. Walks `tests/fixtures/signal-corpora/{bash,correction,file_creation}/{positive,negative,boundary,adversarial}/*.json`.
2. For each detector, runs the supplied samples against a small threshold
   sweep grid:
   - `bash_repetition`: count ∈ {2, 3, 4, 5} × windowMinutes ∈ {15, 30, 45, 60} = 16 configs.
   - `agent_correction`: occurrenceCount ∈ {2, 3, 4} × lineRatio ∈ {0.15, 0.2, 0.25, 0.3} × windowMinutes ∈ {3, 5, 7, 10} = 48 configs.
   - `file_creation`: count ∈ {2, 3, 4} × jaccard ∈ {0.7, 0.75, 0.8, 0.85} = 12 configs.
3. For each (detector, config), computes confusion matrix (TP/FP/TN/FN),
   precision = TP/(TP+FP), recall = TP/(TP+FN), and Wilson 95% CI on
   precision.
4. Picks the config that maximises `precision_wilson_lower` while keeping
   `recall ≥ 0.6`.
5. Writes `release-artifacts/v0.2.1-corpus-calibration-<ts>.json`.

## Acceptance gate

Per DD-116 (v0.3 ratified):

- per-detector `precision_wilson_lower ≥ 0.7`
- per-detector `recall ≥ 0.6`

If any non-skipped detector fails, the calibrator exits 1.

## Current state (2026-05-10)

Corpus: 13 cases (7 bash, 6 correction, 0 file_creation).

```
bash_repetition  : FAIL  precision_lower=0.510, recall=1.000  recommended={count:3, windowMinutes:30}
agent_correction : FAIL  precision_lower=0.342, recall=1.000  recommended={occurrenceCount:2, lineRatio:0.2, windowMinutes:3}
file_creation    : SKIP  (no fixtures yet)
```

Recall is perfect at the recommended configs — every positive fixture
fires. The gate fails on precision because Wilson 95% lower bound on
N=4 negatives is statistically wide (≈ 0.51 at 4/4 success). N must grow
substantially before the lower bound clears 0.7.

## Path to a passing gate

Per detector, the corpus needs ≥ ~30 cases with a mix of positive,
negative, boundary, and adversarial. Rough plan:

### bash_repetition (currently 7 → target 30)

Need ~23 more. Add variety along these axes:

- **Positive:** repeated test runners (jest, pytest, cargo test), repeated
  git commands (`git status`, `git log`), repeated build commands (`make`,
  `npm run build`), 4-occurrence and 5-occurrence cases, cross-shell
  variants (cmd, powershell, bash on Windows path separators).
- **Negative:** distinct commands, identical commands but only twice,
  repeats spread beyond the window (45 min apart, 60 min apart).
- **Boundary:** third invocation at exactly the window edge (29:59,
  30:00, 30:01), repeats with normaliser-eligible variations
  (whitespace, quoting).
- **Adversarial:** commands with embedded timestamps, log paths, or PIDs
  (the normaliser must collapse them); commands that differ in argument
  order; piped chains where only one stage repeats.

### agent_correction (currently 6 → target 30)

Need ~24 more. Axes:

- **Positive:** burst of 3 within 5 min with ratio above floor; burst of
  4-5 within 5 min; cross-day bursts (different agents) where one agent
  bursts.
- **Negative:** single correction; corrections spread over 7 days but no
  burst; ratio below floor across all samples.
- **Boundary:** ratio at exactly 0.20; burst at 4:59; 3 corrections but
  only 2 within burst window.
- **Adversarial:** other-agent samples bleeding into target agent
  computation; large lines_changed but very large total_lines (low ratio);
  same agent_id appearing twice with the same timestamp.

### file_creation (currently 0 → target 30)

Need 30. Each fixture is a sequence of file writes:

- **Positive:** 3 files in same dir, structurally similar (Jaccard ≥
  0.8 on first-5-line tokens); 3 files in same dir, share import set;
  3 markdown skill files in same dir, share heading hierarchy.
- **Negative:** 3 files in different dirs (locality miss); 3 files in
  same dir, structurally distinct (Jaccard < 0.5); only 2 files in same
  dir.
- **Boundary:** Jaccard at exactly 0.80 on structural tokens;
  exactly 3 files; mixed-language same-dir creates.
- **Adversarial:** 3 files in same dir but each is mostly comments;
  large files where only the first 5 lines are shared; intentionally
  similar but in `node_modules/` or other ignored paths.

A practical first iteration: spend a focused half-day generating the
target 30 cases per detector. This single iteration probably converges
the gate.

## Field calibration (v0.4)

Once `v0.2-alpha` is distributed and `scripts/alpha-telemetry-close.mjs`
gates clear (≥50 sessions × ≥30 days), real-field calibration can
amend v0.4 thresholds. The same `corpus-calibrate.mjs` framework
extends to it: read events from `metrics.jsonl` instead of fixtures,
compute the same Wilson statistic. The calibrator will accept a
`--source` flag in v0.4 to switch between corpus and metrics inputs.

## Next steps

1. Expand corpus to ~30 cases per detector (per the axes above).
2. Re-run `npm run calibrate`. Iterate threshold sweep grid if needed.
3. Apply recommended thresholds to `DEFAULT_BASH_REPETITION_*`,
   `DEFAULT_FILE_CREATION_*`, `DEFAULT_AGENT_CORRECTION_*`.
4. Update `docs/v0.2/CHANGELOG.md` v0.2.1 section with corpus-calibration
   results.
5. Bump `package.json#version`: `0.2.0-alpha.1` → `0.2.1-alpha.1` (or
   `0.2.1` for GA).
6. Cascade dev → staging → master, tag, push.
