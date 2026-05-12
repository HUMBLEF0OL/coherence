# Coherence v0.4 — Slash Commands

See `docs/v0.3/commands.md` for the v0.3 command surface (carries forward unchanged).

## /coherence:consent

View or update telemetry consent without needing a TTY (DD-127, FR-CONSENT-1).

Usage: `/coherence:consent [--local on|off] [--upload on|off] [--reset]`

- No flags: print current consent state.
- `--local on|off`: enable/disable local hashed event collection (default: on).
- `--upload on|off`: enable/disable the copy-paste curl hint in `/coherence:export-metrics` (default: off).
- `--reset`: delete the `config.json#telemetry` key entirely, restoring silent defaults.

## /coherence:audit

Bundling-only audit report (DD-125, FR-AUDIT-1). Runs four existing commands in sequence and renders
a single Markdown report. Deep audit ships in v1.0.

Output sections: `## Doctor`, `## Scope Debug`, `## Status`, `## Metrics Export`

Each section wraps its command's output; failures are captured as `[error: ...]` rather than aborting
the report.

## /coherence:export-metrics — sandbox hardening (DD-128)

`--out` path containment now applies to every invocation, not just when the parent directory does
not yet exist. Paths outside `projectRoot` are refused unless `--allow-out-of-tree` is also passed
(which emits a stderr warning).
