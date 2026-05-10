# v0.2 privacy posture (DG-6)

## Privacy-safe-by-construction (FR-OBS-N5)

Every v0.2 telemetry event records **only hashed signatures** (12-hex
truncated sha256 per DD-068, SG-1) and bucketed metadata (length buckets,
language buckets). No raw command text, no raw file paths, no raw user
prompts, no raw agent output is persisted in `metrics.jsonl` or written to
`drift-buffer.json`.

## Event redaction matrix

| Event | Raw fields persisted | Hashed fields |
|-------|----------------------|----------------|
| `tool_invocation_signature` | none | `signature_hash` (DD-068, 12-hex) |
| `user_prompt_signature` | none | `signature_hash`, `length_bucket`, `refers_to_prior` (boolean) |
| `agent_response_id` | none | `agent_id` (12-hex), `length_bucket` |
| `proposal_signal_observed` | none | `signal_kind`, `signal_hash` (12-hex), `would_have_fired` |
| `proposal_proposed` / `proposal_accepted` / `proposal_rejected` | `kind` (enum) | `proposal_id` (32-hex) |
| `annotation_proposed` / `annotate_blocked` | none | `doc_path_hash` (12-hex) |
| `proposal_acceptance_blocked` | `reason` (enum) | `existing_path_hash` |
| `migration_completed` | `from`, `to`, `duration_ms` | none |
| `cost_ceiling_hit` | `stage`, `cost_usd` | none |

## DD-065 quarantine

Author and Annotate proposers **never** write outside
`.claude/coherence/proposals/<kind>/<id>/`. The two cross-the-boundary
operators (`propose-accept`, `install-statusline`) are explicitly gated by
typed slash commands and confirmation prompts.

## Egress posture

`share-metrics --anonymized` writes a redacted JSONL file to a user-chosen
path. v0.2 ships **no HTTPS upload** (DD-086 — egress deferred to v0.3).
