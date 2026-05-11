# v0.3 state files

> v0.3 introduces three new state surfaces. The v0.1 + v0.2 state files
> (`version.json`, `proposal-cache.json`, `signal-cache.json`,
> `state-snapshot.json`, `graduation.json`, `metrics.jsonl`, etc.) continue
> unchanged; see [docs/v0.2/state-files.md](../v0.2/state-files.md) for
> their definitions.

## Two-tier `schema_version` convention (round-2 C4)

v0.3 distinguishes two levels of `schema_version`:

- The **install sentinel** at `.claude/coherence/version.json#schema_version`
  carries the major-version key. v0.3 sets this to `3`. SessionStart's
  `refuseLegacy()` rejects any pre-v3 sentinel and refuses to migrate
  (NFR-COMPAT-N4, DD-118).
- Per-file `schema_version` integers on individual state files evolve
  independently. v0.2 files retain `schema_version: 2` (their on-disk shape
  hasn't changed); v0.3-introduced files use `schema_version: 1` (user-owned)
  or `schema_version: 3` (plugin-managed sentinel).

## Plugin-managed (under `.claude/coherence/`)

### `scope-cache.json` (M1; DD-106)

Stores the resolved ancestor chain and effective scope for files whose
context has been computed. Schema:
[scope-cache.schema.json](../../src/state/schemas/scope-cache.schema.json).

```jsonc
{
  "schema_version": 3,
  "generated_at": "2026-05-10T...Z",
  "entries": {
    "<absolute file path>": {
      "file": "<absolute file path>",
      "ancestor_chain": [
        { "file": "<scope file path>", "mtimeMs": 12345 }
      ],
      "extends_resolved": { "schema_version": 1, "mode": "annotate" },
      "written_at": "2026-05-10T...Z"
    }
  }
}
```

Eviction: any ancestor `mtimeMs` divergence invalidates the entry on next
consultation. The cache is plugin-managed and re-derivable, so
`.gitignore`d.

### `coherence-log/exports.jsonl` (M4)

One-line-per-export audit trail for `/coherence:export-metrics`. Each line:

```json
{"kind":"metrics_export","out":"<absolute path>","count_bucket":"1-9","since":null,"anonymized":false,"at":"2026-05-10T..."}
```

### `scan-cache/tombstones.json` (M5; DD-103, FR-TOMBSTONE-1)

Per-file scan tombstones with mtime + content hashes. Path-keyed (normalised)
dictionary; LRU at 5,000 entries. Composes with the v0.2 P7 doc-content memo:
tombstone consultation runs BEFORE doc read; memo consultation runs INSIDE
the detector. Eviction: any forward jump in the on-disk `mtime` invalidates
the entry on next consultation; optional `expires_at` ages out long-idle
entries.

The on-disk file lives in a separate path from the trickle scanner's session
state (`scan-cache/state.json`) and has its own dedicated schema:
[scan-cache-tombstones.schema.json](../../src/state/schemas/scan-cache-tombstones.schema.json).
The earlier plan draft proposed augmenting `scan-cache-state.schema.json`
in-place; the final implementation persists tombstones to a sibling file so
the two lifecycles (per-session ephemera vs. cross-session memo) evolve
independently. The writer is `src/scanner/scanCacheTombstone.ts`; the trickle
scanner consults it via `src/hooks/postToolUse.ts`.

```jsonc
{
  "entries": {
    "<normalised file path>": {
      "path_hash":    "<12-hex>",
      "content_hash": "<12-hex>",
      "git_mtime":    "2026-05-10T...Z",
      "inserted_at":  "2026-05-10T...Z",
      "expires_at":   "2026-05-17T...Z"  // optional
    }
  }
}
```

## User-owned (under `coherence/`, committed)

### `coherence/ignore` + `coherence/ignore.local` (M2; DD-096)

Two-file additive ignore. Both files are simple line-per-pattern
gitignore-style globs. The reader merges them additively; committed-wins on
conflict. The `.local` variant is gitignored.

### `coherence/scope.json` and `CLAUDE.md` (M1; DD-097, DD-098, DD-105)

Per-package scope hints. `coherence/scope.json` is the machine-readable
sidecar; `CLAUDE.md` is the human-facing rules file. The walker treats both
as ancestors but only parses JSON for resolved keys (M1 sidecar-only).

Schema for the JSON sidecar:
[scope-config.schema.json](../../src/state/schemas/scope-config.schema.json).

```jsonc
{
  "schema_version": 1,
  "scope_id": "auth-service",
  "extends": "shared-rules",
  "ignore": ["*.snap", "fixtures/**"],
  "mode": "annotate"
}
```

Resolution: most-specific-wins by default; `extends:` opt-in for shallow
merge. `ignore[]` arrays merge additively across ancestors per the DD-105
narrative.

### `coherence/plans/<branch-sha>/<plan-id>.json` (M3; DD-099 amended, DD-107, DD-108)

Cross-team plan files. `branch_sha` is `git rev-parse --short=12 HEAD` at
creation time; `plan_id` is a deterministic 32-hex SHA-256 of
`branch_sha + author_hash + title + created_at`. Author identity is hashed
(12-hex SHA-256 of `git config user.email`). Plain names appear in interactive
CLI output only; never persisted.

Schema: [team-plan.schema.json](../../src/state/schemas/team-plan.schema.json).

```jsonc
{
  "schema_version": 1,
  "plan_id": "<32-hex>",
  "branch_sha": "<12-hex>",
  "kind": "proposal",
  "title": "Adopt JWT auth",
  "body": "...",
  "created_at": "2026-05-10T...Z",
  "author_hash": "<12-hex>",
  "audit_log": [
    { "actor_hash": "<12-hex>", "action": "created", "at": "..." }
  ]
}
```

Concurrent writers are serialised by `withCacheLock(filePath, 'team-plan-store', ...)`
([src/state/locks.ts](../../src/state/locks.ts)) — DD-100.

## Telemetry consent (M4; DD-115)

Persisted as `config.json#telemetry`:

```jsonc
{
  "telemetry": {
    "local_collection": true,
    "upload_consent": false,
    "recorded_at": "2026-05-10T...Z",
    "plugin_version": "0.3.0",
    "non_interactive_default": false
  }
}
```

Re-prompt trigger: `recorded_at` absent. Non-interactive shells set
`non_interactive_default: true` and use the defaults; the next interactive
session re-prompts.
