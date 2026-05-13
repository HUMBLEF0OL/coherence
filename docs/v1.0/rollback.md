# v1.0 rollback

DD-118 prohibits cross-major migration logic. v1.0 follows the same model
as v0.4: re-install preserves `.claude/coherence/`; a fresh install initialises
state lazily.

## Going from v0.4 → v1.0

- No migration step required. v1.0 lays down `trust-ledger.json` lazily
  (first `recordEvent` call). Existing `.claude/coherence/` state survives.
- `cost-ledger.json` schema gains `audit_deep` in the `stage` enum —
  backwards-compatible (no v0.4 entry uses it).
- `coherence/trust/` directory is created by the first `/coherence:trust sync`
  invocation. Pre-existing repos without this directory pose no issue.

## Going from v1.0 → v0.4 (downgrade)

Not supported by design. If you must downgrade:

1. Stop using `/coherence:trust`, `/coherence:metrics`, and `/coherence:audit --deep`.
2. The v0.4 codebase will simply ignore `trust-ledger.json` and any
   `coherence/trust/*.json` files on disk.
3. `cost-ledger.json` entries with `stage: "audit_deep"` will fail the v0.4
   schema; if present, delete or quarantine the file before downgrading.

## Team aggregate committed-file model

`coherence/trust/<author-hash>.json` files are **committed**. They survive
branch switching, repo re-clone, and v1.0 re-install. If a contributor
leaves the team, their file ages out of active aggregation after 180 days
(FR-LEDGER-3) and becomes prune-eligible after 365 days
(`/coherence:trust --prune-stale --yes`).

## Cosign signing rollback

If a release introduces a regression and you need to ship an emergency
v1.0.x fix:

1. Cut a new tag (e.g. `v1.0.1`).
2. The GitHub Actions workflow signs the new tarball.
3. The previous signed tarball remains attached to its release with its
   sig + pem + sha256 — verifiable indefinitely via Rekor.

There is no "unsign" operation; signatures are append-only history.
