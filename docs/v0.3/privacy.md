# v0.3 privacy posture

> Extends the v0.2 redaction matrix at [docs/v0.2/privacy.md](../v0.2/privacy.md)
> with v0.3-specific events and the new first-run telemetry consent model.
> The DD-068 hashing rules remain in force: 12-hex SHA-256 for paths,
> commands, identifiers; raw content never written.

## Architectural commitment — DD-117

Coherence v0.3 has no backend, ever. There is no project-side server, no
hosted upload service, no TLS-pinned client. Telemetry stays as a local
`metrics.jsonl` append log; export is user-driven via
`/coherence:export-metrics` which writes a redacted JSONL file to a path the
developer chooses. The Anthropic SDK is the only network sink — and only
during LLM calls, never for telemetry.

The architectural invariant is enforced by the **M-ARCH-1** ship-time gate
(`tests/static-analysis/no-network.test.ts`) which scans `src/` for forbidden
network APIs and HTTPS URLs.

## Two-tier consent (DD-115)

- **Local collection** — opt-OUT, default ON. Hashed events written to
  `.claude/coherence/metrics.jsonl` on the developer's machine.
- **Upload** — opt-IN, default OFF. The developer manually invokes
  `/coherence:export-metrics`; v0.3 NEVER initiates a network request.

Persisted to `.claude/coherence/config.json#telemetry`. Non-interactive
shells take defaults and flag `non_interactive_default: true`; the next
interactive SessionStart re-prompts. Re-prompt trigger: `recorded_at` absent.

## v0.3 telemetry events (extension to v0.2 matrix)

| Event | Source | Payload (post-redaction) |
|---|---|---|
| `scope_cache_miss` | M1 scope cache | `{ session_id, ancestor_count }` — sampled 1:100 |
| `proposal_ignored_by_team` | M2 FSM transition | `{ session_id, proposal_id_hash: 32-hex, ignore_path_hash: 12-hex }` |
| `plan_created` | M3 plan store | `{ session_id, plan_id_hash: 32-hex, branch_sha: 12-hex, kind: enum, author_hash: 12-hex }` |
| `plan_accepted` | M3 plan store | as `plan_created` + `actor_hash: 12-hex`, `duration_minutes: number` |
| `plan_rejected` | M3 plan store | as `plan_created` + `reason: stale\|superseded\|rejected_explicit` |
| `metrics_export_started` | M4 export command | `{ session_id, since?: ISO, anonymized: boolean, event_count_bucket: '0'\|'1-9'\|'10-99'\|'100-999'\|'1000+' }` |

All `*_hash` fields are 12-hex SHA-256; `proposal_id_hash` is the existing
32-hex UUID v5 (DD-072) which doubles as its own hash.

## Cross-developer-leak prevention (NFR-PRIVACY-N5)

Per-developer state files MUST stay per-developer:

- `signal-cache.json` and `session-map.json` are written under
  `.claude/coherence/` (gitignored) — never under the committed `coherence/`
  root.
- `firstRun.runFreshInstall()` patches `.gitignore` on first install to add
  both filenames under a `# cohrence — per-developer state (do not commit)`
  header.

Enforcement: **M-PRIVACY-1** ship-time gate
(`tests/static-analysis/no-cross-dev-leak.test.ts`) lints `src/` for any
codepath that writes those filenames under the committed `coherence/`
root, and asserts the `firstRun.ts` patcher emits both lines.

## Identity hashing (DD-107)

Cross-team plans (M3) carry an `author_hash` — 12-hex SHA-256 of
`git config user.email` (lowercased + trimmed). The display name (`git
config user.name`) appears in interactive CLI surfaces only and is NEVER
persisted to plan files. The plan-store schema explicitly forbids any field
named `author`, `email`, `name`, etc.; only `author_hash` is allowed.

## Export redaction (M4)

`/coherence:export-metrics` strips field names that could carry raw content:

```
path, paths, file, files, raw_path, raw_command, raw_response,
message, content, body
```

DD-068 enforces these never appear at write time; the export-time strip is
defence-in-depth in case a future event payload extension regresses.

`--anonymized` additionally hashes `proposal_id`, `signal_hash`, and
`session_id` to 12-hex SHA-256 so a leaked export cannot correlate against
the developer's local cache.
