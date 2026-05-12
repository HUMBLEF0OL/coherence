# Coherence v0.4 — Privacy

See `docs/v0.3/privacy.md` for the v0.3 baseline.

## v0.4 additions

No new telemetry events are introduced in v0.4. The trigger-contract evaluation
(`evaluateTriggerContracts`) reads `metrics.jsonl` locally and writes only to `trigger-state.json` —
no events are emitted for threshold crossing itself. The one-time hint is printed to stdout only.

`/coherence:consent` writes to `config.json#telemetry` only. No new event is emitted on consent
change.

`/coherence:export-metrics` continues to honour the v0.3 DD-068 redaction matrix; v0.4 adds an
always-on `--out` path sandbox so a malformed path can no longer escape `projectRoot` without an
explicit `--allow-out-of-tree`.
