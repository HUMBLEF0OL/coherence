# v1.0 privacy

v1.0 expands the telemetry catalogue with trust + audit events. The privacy
model carries forward from v0.4 (DD-107 author hashing, NFR-PRIVACY-N5
gitignore, NFR-OBS-2 90-day retention).

## What's stored locally (never uploaded without explicit consent)

- `.claude/coherence/trust-ledger.json` — your per-section accept/edit/revert
  history. **Never transmitted, never aggregated remotely.** Survives plugin
  re-install.
- `.claude/coherence/section-symbol-index.json` — audit cache; symbols
  extracted from your own section content.
- `.claude/coherence/metrics.jsonl` — 90-day rolling telemetry log.

## What gets committed (visible to your team)

- `coherence/trust/<author-hash>.json` — your per-section trust scores keyed
  by SHA-256 of your git email (12 hex chars). Your raw email is never
  written to this file. Team aggregate is computed by reading all such files
  in `coherence/trust/`.

The author hash is the same identifier used by v0.3 plans (DD-107).

## v1.0 new telemetry events (FR-TELEMETRY-1)

Added to `metrics.jsonl`:

| Event                              | Payload                                                                                                  | Privacy notes                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `proposal_accept_recorded`         | `sectionRef`, `weight`, `author_hash`                                                                    | sectionRef is `path#anchor`; no diff content.                       |
| `proposal_edit_recorded`           | same shape                                                                                                | same as above.                                                      |
| `proposal_revert_recorded`         | same shape                                                                                                | same as above.                                                      |
| `trust_promoted`                   | `auto_land_kinds`, `author_hash`                                                                          | Hashed identity only.                                               |
| `trust_synced`                     | `section_count`, `author_hash`                                                                            | Count, not content.                                                 |
| `audit_deep_estimate_shown`        | `pair_count`, `signature`                                                                                 | Signature is sha256 prefix; no section content.                     |
| `audit_deep_invoked`               | `pair_count`, `signature`                                                                                 | Same as above.                                                      |

No event leaks raw email, raw file contents, or LLM responses.

## Consent

The v0.4 `/coherence:consent` semantics carry forward without change:
local telemetry default-on; remote upload default-off and gated by
explicit `/coherence:consent --upload on`.

## Path-sandbox carry (NFR-PATH-SANDBOX)

`/coherence:metrics --out <path>` reuses the v0.4 export-metrics sandbox
helper. Paths outside the project root require `--allow-out-of-tree`
(stderr warning logged on bypass).

## Trust-ledger orphan repair (FR-REPAIR-1)

`/coherence:repair --reassociate` and `--expire-orphans` operate purely on
the local ledger. The `coherence-log.md` entry captures the action's intent
(rename or bulk-drop), but the orphan sectionRefs themselves are project
identifiers (the section anchors), not private data.
