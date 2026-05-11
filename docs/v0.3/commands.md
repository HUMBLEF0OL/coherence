# v0.3 slash command reference

> All v0.1 + v0.2 commands continue to work; this page documents only the
> v0.3 additions. For the complete catalogue see [plugin.json](../../plugin.json).

## `/coherence:scope-debug <path>`

Read-only. Walks ancestor `CLAUDE.md` and `coherence/scope.json` files (depth
cap 8) for the supplied file or directory and prints:

- the ancestor chain, deepest-first
- per-key provenance (which file supplied which value)
- resolved effective scope
- cache hit/miss + age

Implementation: [src/commands/scopeDebug.ts](../../src/commands/scopeDebug.ts).

Telemetry: emits `scope_cache_miss` sampled 1:100 (deterministic
per-process counter; resets at SessionStart).

## `/coherence:ignore-split`

Idempotent. Sets up the two-file additive ignore model (DD-096):

- creates an empty `coherence/ignore` (committed) if missing
- creates an empty `coherence/ignore.local` (personal) if missing
- appends `coherence/ignore.local` to `.gitignore` under a
  `# cohrence — personal ignore` header if missing

Implementation: [src/commands/ignoreSplit.ts](../../src/commands/ignoreSplit.ts).

## `/coherence:export-metrics [--out <path>] [--since <ISO>] [--anonymized]`

Writes a redacted JSONL export of `metrics.jsonl`. Per DD-117, v0.3 never
initiates a network request — the command only writes a file. A copy-paste
`curl` line is printed iff `config.json#telemetry.upload_consent === true`.

Options:

- `--out <path>` — output file (default: `metrics-export-<ts>.jsonl` in cwd)
- `--since <ISO>` — filter to events with `_ts >= since`
- `--anonymized` — additionally hash `proposal_id`, `signal_hash`, and
  `session_id` to 12-hex SHA-256

Implementation: [src/commands/exportMetrics.ts](../../src/commands/exportMetrics.ts).
Audit trail: appended to `.claude/coherence/coherence-log/exports.jsonl`.

## `/coherence:de-annotate <target> [--scope per-doc|per-directory|global] [--keep-as-user-anchor]`

Strip an auto-annotation, or graduate it to a user-owned anchor. Default
scope: `per-doc`. Default action: `strip`. Pass `--keep-as-user-anchor` to
flip `auto-annotated: true` → `false` instead of removing the block.

The scope decision persists in `graduation.json#de_annotate` so future
scans honour it. Most-specific-wins resolution: per-doc > per-directory >
global (DD-074 mental model).

A user-edit hint is emitted when the target file is large and recently
modified, suggesting `--keep-as-user-anchor` so in-progress edits survive.

Implementation: [src/commands/deAnnotate.ts](../../src/commands/deAnnotate.ts).

## `/coherence:plan-create <kind> <title> [--body <markdown>]`

Audit-3 B3. Writes a cross-team plan file at
`coherence/plans/<branch-sha>/<plan-id>.json`. `kind` is one of `proposal`,
`decision`, `directive`, `alignment`, `ad_hoc`. The plan id is a
deterministic 32-hex SHA-256 of `branch_sha + author_hash + title +
created_at`. Emits `plan_created`.

Implementation: [src/commands/planCreate.ts](../../src/commands/planCreate.ts).

## `/coherence:plan-accept <branch-sha> <plan-id>`

Audit-3 B3. Loads the plan under `withCacheLock('team-plan-store')`,
appends an `audit_log` entry, persists, and emits `plan_accepted` with the
hashed actor and `duration_minutes` since creation.

Surfaces friendly errors when the plan file is missing
(`PlanNotFoundError`) or malformed JSON (`MalformedPlanError`).

Implementation: [src/commands/planAccept.ts](../../src/commands/planAccept.ts).

## `/coherence:plan-reject <branch-sha> <plan-id> <reason>`

Audit-3 B3. `reason` is one of `stale`, `superseded`, `rejected_explicit`.
Emits `plan_rejected` with the reason in the payload.

Implementation: [src/commands/planReject.ts](../../src/commands/planReject.ts).

## `/coherence:recover [--target <tag>]`

Audit-3 B5. Without args runs the within-major recover flow (clears
auto-disabled sentinel, resets locks, drops stop-progress, clears
quarantine). With `--target <tag>` (or a bare positional `v0.X.Y`),
refuses when the target's major.minor differs from the running plugin's;
otherwise proceeds. See [rollback.md](rollback.md) for the major-version
matrix.

Implementation: [src/commands/recover.ts](../../src/commands/recover.ts).

## v0.3 doctor amendment

`/coherence:doctor` now flags any cross-team plan older than 7 days
(`STALE_PLAN_THRESHOLD_DAYS`). The threshold is exported from
[src/commands/doctor.ts](../../src/commands/doctor.ts) for tests.

## v0.3 status amendment

`/coherence:status` now surfaces a telemetry line:

```
Telemetry: local=on, upload=off (defaults; will re-prompt next interactive session)
```

The `defaults` suffix appears when consent was taken from the non-interactive
fallback. The next interactive SessionStart re-prompts.
