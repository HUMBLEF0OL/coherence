# DD-092 v0.2.1 Calibration Commitment

**Hard post-GA deliverable.** Tracked by BRD-5 §1 risk register and the
release-note checklist (RG-5). The v0.2 thresholds DD-076/077/078 ship
default-locked; numeric tuning is delegated to this calibration patch.

## Inputs

- `metrics.jsonl` rolled-up summaries (`proposal_signal_observed { kind,
  would_have_fired }`) from the v0.1.1 + v0.2-alpha observation window
  (≥ 50 sessions OR 30 days, whichever first).

## Method

Wilson 95% confidence intervals (resolves Open Question §7 default).

For each detector kind:
1. Count `would_have_fired=true` events.
2. Count subsequent `proposal_accepted` events sharing `signal_hash`.
3. Compute precision = accepted / fired, with Wilson interval.
4. Sweep candidate thresholds; pick the smallest threshold whose
   projected precision interval has lower bound ≥ 0.7.

## Acceptance criteria

- Per-threshold projected precision ≥ 0.7 with confidence interval reported
  in the patch CHANGELOG entry.
- Calibration delta documented per detector (old vs new threshold; sample
  size; observed false-positive rate).
- v0.2.1 patch ships within 30 days of GA.

## Sign-off

- [ ] Tech lead — (signed when v0.2.1 ships)
- [ ] Product owner — (signed when v0.2.1 ships)
