# v1.0 state files

v1.0 introduces three new state files. All files inherit DD-117 / DD-118
constraints: file-only, no backend; cross-major migration retired.

| File                                                         | Type        | Owner       | Schema |
| ------------------------------------------------------------ | ----------- | ----------- | ------ |
| `.claude/coherence/trust-ledger.json`                        | gitignored  | per-dev     | v3 (trust-ledger.schema.json) |
| `.claude/coherence/section-symbol-index.json`                | gitignored  | per-dev     | v1     (audit cache; lazy-built) |
| `coherence/trust/<author-hash>.json`                         | **committed** | per-dev   | v3 (team-aggregate.schema.json) |

## `trust-ledger.json` (FR-LEDGER-1..5, DD-138)

Personal-only, never leaves the developer's machine. Survives plugin
re-install because `.claude/coherence/` is preserved across installs.

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

- LRU cap: 200 events per section, sorted ascending by `_ts`.
- Summary is recomputed lazily when the newest event's `_ts` is after `summary.<ref>.as_of`.
- Empty-ledger initialisation when file is absent (FR-LEDGER-5).
- Schema-version mismatch is fail-closed (Edge #12): StateStore quarantines the file rather than zeroing it out.

## `section-symbol-index.json` (TS-6, M3)

Lazy-built cache mapping each `sectionRef` to the registry symbols mentioned
in its content. Invalidated when either `section-index.json` or
`src/validation/registries/*.ts` hash changes.

```jsonc
{
  "schema_version": 1,
  "source_index_hash": "...",
  "registry_hash": "...",
  "built_at": "2026-05-13T...",
  "symbols": {
    "README.md#install": ["existsSync", "readFileSync", ...]
  }
}
```

## `coherence/trust/<author-hash>.json` (FR-LEDGER-2..4)

**Committed**, per-developer (one per active contributor). Created by
`/coherence:trust sync`. `<author-hash>` is the 12-char sha256 of
lowercased `git config user.email` (DD-107 reused).

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
- Contested flag: ≥ 2 contributors AND `|aggregate| < 0.2` (FR-LEDGER-4 pass-3).

## `cost-ledger.json` (schema extension)

`stage.enum` extended with `audit_deep` for `--deep` LLM calls.
