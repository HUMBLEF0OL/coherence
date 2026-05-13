# State files reference

Coherence is a file-only plugin (DD-117 — no backend, ever). All state
lives on disk: per-project state under `.claude/coherence/`, committed
team state under `coherence/`. This page describes every file, schema,
and ownership pattern.

## Layout

```
<project-root>/
├── .claude/coherence/        per-developer state (gitignored)
│   ├── version.json
│   ├── config.json
│   ├── drift-buffer.json
│   ├── section-index.json
│   ├── section-symbol-index.json
│   ├── host-capabilities.json
│   ├── cost-ledger.json
│   ├── coherence-log.md
│   ├── metrics.jsonl
│   ├── metrics-summary.json
│   ├── stop-progress.json
│   ├── velocity.json
│   ├── observations.md
│   ├── trust-ledger.json
│   ├── graduation.json
│   ├── proposal-cache.json
│   ├── signal-cache.json
│   ├── state-snapshot.json
│   ├── scope-cache.json
│   ├── scan-cache/state.json
│   ├── proposals/<kind>/<id>/
│   └── quarantine/
└── coherence/                committed team state
    ├── ignore                 (DD-096 committed; teammate-shared)
    ├── ignore.local           (gitignored; personal)
    ├── plans/<branch-sha-12>/<plan-id>.json
    └── trust/<author-hash>.json
```

All JSON files are AJV-validated against schemas under
`src/state/schemas/`. Atomic writes use a temp-file + rename pattern
keyed by `process.pid` and timestamp. Files that fail schema validation
are moved to `.claude/coherence/quarantine/` for inspection.

## Per-developer state (gitignored)

### `version.json` (`version.schema.json`)

Plugin version and schema migration history.

```jsonc
{
  "schema_version": 3,
  "plugin_version": "1.0.0",
  "installed_at": "2026-05-13T00:00:00.000Z",
  "prior_versions": []
}
```

Cross-major upgrades are refused on SessionStart (DD-118 — no migrator
chain). Each major version stands alone.

### `config.json` (`config.schema.json`)

Plugin configuration. Calibration knobs from DD-092 are surfaced here
for user override; absent fields fall back to detector defaults.

```jsonc
{
  "mode": "observe",
  "watches": ["docs/**"],
  "ignore": ["*.tmp"],
  "proposal_expiry_days": 14,
  "bash_repetition_count": 3,
  "agent_correction_line_ratio": 0.20
}
```

### `drift-buffer.json` (`drift-buffer.schema.json`)

Pending documentation drift entries. Buffer entries contain only
content hashes — no raw content is persisted (NFR-PRIVACY-4).

### `section-index.json` (`section-index.schema.json`)

Section index mapping `sectionRef`s to file locations + headings +
line ranges + content hashes. Rebuilt on SessionStart and as files
change.

### `section-symbol-index.json` (schema_version: 1)

Lazy-built cache mapping each `sectionRef` to the code-symbol-shaped
tokens that appear in its content. Used by `/coherence:audit --deep`
pair detection. Invalidated when either the upstream
`section-index.json` or `src/validation/registries/*.ts` hashes
change.

### `host-capabilities.json` (`host-capabilities.schema.json`)

Cached host capability probe results from `/coherence:doctor`.
Includes `subagent_attribution`, `frontmatter_preserves_unknown_keys`,
`token_count_in_posttooluse`, `terminal_hyperlink` (`osc8` / `osc52` /
`plain`), and `claude_url_scheme_supported`.

### `cost-ledger.json` (`cost-ledger.schema.json`)

Per-session LLM cost tracking. Each entry carries `stage`
(`stage1` / `stage2` / `author` / `annotate` / `author_planner` /
`audit_deep`), tokens, USD, and the prompt version. DD-085 tri-partition
budget enforcement reads this file on each `flush()`.

### `coherence-log.md`

Append-only audit log of applied patches and repair operations
(DD-052). Newest-first table format: `| timestamp | type | summary |
git-ref |`. Never rotated (NFR-OBS-1). Types include `auto-applied`,
`reviewed`, `finalize`, `quarantine`, `repair`.

### `metrics.jsonl`

Rolling 90-day event log (NFR-OBS-2, DD-060). One JSON record per
line with an `_ts` timestamp. The retention sweep at SessionStart
aggregates events older than 90 days into `metrics-summary.json` and
removes them from the rolling log. Event catalogue (FR-OBS-N4 /
FR-TELEMETRY-1):

- Patch lifecycle: `patch_proposed`, `patch_applied`, `patch_reverted`,
  `patch_deferred`.
- Validation: `hallucination_grep_result`, `degraded_mode_entered`,
  `kill_switch_seen`, `compaction_detected`.
- Subagent: `subagent_classification`.
- Cost: `cost_per_stop`, `cost_ceiling_hit`.
- DD-068 signature events: `tool_invocation_signature`,
  `user_prompt_signature`, `agent_response_id`.
- Proposal FSM: `proposal_proposed`, `proposal_surfaced`,
  `proposal_accepted`, `proposal_rejected`, `proposal_expired`,
  `proposal_reverted`, `proposal_state_transition`,
  `proposal_validation_failed`, `proposal_acceptance_blocked`,
  `proposal_signal_observed`, `proposal_listed`, `proposal_shown`,
  `proposal_skipped_budget`, `proposal_ignored_by_team`.
- Author + annotate: `annotation_proposed`, `annotate_invocation`,
  `annotate_blocked`, `trickle_scan_pass`, `signal_cache_pruned`.
- Statusline: `statusline_install`, `statusline_uninstall`.
- Scope / plans: `scope_cache_miss`, `plan_created`, `plan_accepted`,
  `plan_rejected`, `metrics_export_started`.
- State: `migration_completed`, `state_history_truncated`.
- Trust + audit: `proposal_accept_recorded`,
  `proposal_edit_recorded`, `proposal_revert_recorded`,
  `trust_promoted`, `trust_synced`, `audit_deep_invoked`,
  `audit_deep_estimate_shown`.

### `metrics-summary.json`

Aggregated counts for entries older than 90 days (truncated from
`metrics.jsonl`).

### `stop-progress.json` (`stop-progress.schema.json`)

Checkpoint for the Stop pipeline (resumable across crashes). Cleared
on successful completion. Orphan files (buffer empty but progress
present) are quarantined by `/coherence:repair`.

### `velocity.json` (`velocity.schema.json`)

Revert velocity tracking for auto-ignore heuristics (FR-DETECT-N1).
Sections that exceed the revert threshold within the rolling window
are auto-ignored.

### `observations.md`

Append-only log of low-confidence findings and demoted-canonical
notices (FR-STOP-21).

### `trust-ledger.json` (`trust-ledger.schema.json`, schema_version: 3)

Personal, per-section accept / edit / revert event log. Survives
plugin re-install (DD-118 file-only). LRU-capped at 200 events per
section, sorted ascending by `_ts`. Score formula is the DD-138
weighted accept rate with `ALPHA = 0.977` (30-day half-life):

```
numerator   = Σ ev.weight   × ALPHA^ageDays   (accept=+1, revert=−1, edit=0)
denominator = Σ ev.denWeight × ALPHA^ageDays   (accept=1,  revert=1,  edit=0.5)
score       = numerator / denominator           (0 when |denominator| < 0.001)
```

```jsonc
{
  "schema_version": 3,
  "events": {
    "README.md#install": [
      { "_ts": "2026-05-13T11:22:33.444Z", "weight": 1, "kind": "accept" }
    ]
  },
  "summary": {
    "README.md#install": { "score": 0.92, "as_of": "...", "event_count": 17 }
  },
  "promoted_at": null,
  "promote_hint_emitted_at": null,
  "auto_land_kinds": []
}
```

Concurrent `recordEvent` calls are serialised by an in-process
per-ledger mutex (M-LEDGER-1). Empty-ledger init on first event
(FR-LEDGER-5). Schema-version mismatch quarantines the file
(fail-closed, Edge #12). Future timestamps are clamped to
`ageDays = 0` (Edge #11).

### `graduation.json` (`graduation.schema.json`)

Mode lifecycle per directory scope (DD-074). Resolves to a
`CoherenceMode` (`observe` / `graduated`) for any path via
`src/modes/resolver.ts`.

### `proposal-cache.json` (`proposal-cache.schema.json`)

DD-081 cache of proposal entries keyed by `proposal_id`. Carries
`kind`, `signal_hash`, `state` (`queued` / `surfaced` / `ignored` /
`accepted` / `rejected` / `expired` / `reverted` / `ignored_by_team`),
generation + expiry timestamps, and a 50-cap `state_history` audit
trail.

### `signal-cache.json` (`signal-cache.schema.json`)

DD-068 signal buckets: `bash_repetition` (max 500), `file_creation`
(max 500), `agent_correction` (max 200). Each bucket is LRU-capped.
**Gitignored** (NFR-PRIVACY-N5) — never serialised under the
committed `coherence/` root.

### `state-snapshot.json` (`state-snapshot.schema.json`)

DD-094 bootstrap snapshot consumed by the statusline. Single atomic
read; cancellation-safe.

### `scope-cache.json` (`scope-cache.schema.json`)

DD-097 ancestor walk cache. Cold-start budget ≤ 200 ms p95 on a
100-package monorepo (NFR-PERF-N4); PostToolUse hot-path warming;
1:100 sampled `scope_cache_miss` telemetry.

### `scan-cache/state.json` (`scan-cache-state.schema.json`)

DD-066 trickle-scan per-session counter + idle threshold. Reset on
SessionStart so the per-session cap (default 20) is genuinely
per-session.

### `proposals/<kind>/<id>/`

DD-065 quarantine directory for net-new artifacts. `kind` is one of
`skill` / `agent` / `slash_command` / `annotate`. Each proposal has
its own subdirectory with a manifest + artifact + state-history.
Files in here never reach user-owned paths (`.claude/skills/`, etc.)
without an explicit `/coherence:propose-accept <id>` invocation —
either user-typed or auto-issued by the SessionStart sweep for
promoted developers (FR-TRUST-3).

### `quarantine/`

Files that failed schema validation or had I/O errors. The quarantine
operator preserves the offending bytes for inspection without blocking
the session.

### Sentinel files

| File | Meaning | Cleared by |
| ---- | ------- | ---------- |
| `DISABLED` | Manual kill-switch | Manual removal only |
| `auto-disabled` | Auto crash-disable (FR-FAILURE-6) | `/coherence:recover` |

## Committed team state (under `coherence/`)

Per DD-117 the user-owned `coherence/` root is committed; it's the
substrate for team-distributable surfaces. The `.gitignore` patcher
emits per-developer lines so personal state never escapes here.

### `coherence/ignore` (DD-096 committed)

Newline-delimited path globs (lines starting with `#` are comments).
Teammate-shared; merged additively at scan time. Read on SessionStart
to drive the team-ignore FSM sweep.

### `coherence/ignore.local` (gitignored)

Personal globs that compose with the team file at scan time. Never
committed.

### `coherence/plans/<branch-sha-12>/<plan-id>.json`

Cross-team plan artifacts (DD-099 amended). Plan IDs derive
deterministically from `branch_sha + author_hash + title + created_at`
so parallel branches never collide. Author identity is hashed
(12-hex SHA-256 of `git config user.email`) per DD-107.

### `coherence/trust/<author-hash>.json` (`team-aggregate.schema.json`, schema_version: 3)

Per-developer trust scores aggregated across the team. Created by
`/coherence:trust sync`.

```jsonc
{
  "schema_version": 3,
  "author_hash": "a1b2c3d4e5f6",
  "last_synced_at": "2026-05-13T...",
  "scores": {
    "README.md#install": { "score": 0.92, "as_of": "..." }
  }
}
```

- 180-day staleness filter for active aggregation (FR-LEDGER-3).
- 365-day prune threshold via `/coherence:trust --prune-stale --yes`.
- A section is flagged `contested` when ≥ 2 contributors disagree AND
  `|aggregate_score| < 0.2` (FR-LEDGER-4 pass-3).

## Boundary discipline (SG-3)

Only a fixed allow-list of modules in `src/` writes to the filesystem
outside `.claude/coherence/`. The list is asserted by
`tests/security/v0.2/sg-3-no-out-of-quarantine-write.test.ts`:
`proposeAccept`, `installStatusline`, `uninstallStatusline`, the
state-store + sentinel + lock writers, the v0.3 ignore-split / plan
store / metrics export, the v0.3 de-annotate operator, the v1.0
`/coherence:metrics --out` sandbox writer, the v1.0
`/coherence:trust sync` team-aggregate writer, and the v1.0 audit
symbol-index cache writer. Any other module writing outside
`.claude/coherence/` trips the lint and fails the ship gate.
