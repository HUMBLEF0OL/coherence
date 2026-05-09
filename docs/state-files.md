# Coherence State Files Reference (DG-3)

All state files live in `.claude/coherence/` within your project root.

---

## `config.json`

Plugin configuration. Schema: `config.schema.json`.

```json
{
  "mode": "observe",      // "observe" | "graduated"
  "watches": ["docs/**"], // optional glob patterns to watch
  "ignore": ["*.tmp"]     // optional glob patterns to ignore
}
```

---

## `version.json`

Plugin version and schema migration history. Schema: `version.schema.json`.

```json
{
  "schema_version": 1,
  "plugin_version": "0.1.0",
  "installed_at": "2026-05-09T00:00:00Z",
  "prior_versions": []
}
```

---

## `drift-buffer.json`

Pending documentation drift entries. Schema: `drift-buffer.schema.json`.

```json
{
  "state": "pending",
  "entries": [
    {
      "path": "docs/api.md",
      "sectionRef": "docs/api.md#intro",
      "contentHash": "<sha256-hex>",
      "triggeredAt": "2026-05-09T00:00:00Z",
      "source": "posttooluse"
    }
  ],
  "last_changed_at": "2026-05-09T00:00:00Z"
}
```

Buffer entries contain only hashes — no raw content (NFR-PRIVACY-4).

---

## `section-index.json`

Section index mapping sectionRefs to file locations. Schema: `section-index.schema.json`.

```json
[
  {
    "path": "docs/api.md",
    "sectionRef": "docs/api.md#intro",
    "heading": "Introduction",
    "line_start": 1,
    "line_end": 42,
    "contentHash": "<sha256-hex>"
  }
]
```

---

## `host-capabilities.json`

Cached host capability probe results. Schema: `host-capabilities.schema.json`.

```json
{
  "subagent_attribution": false,
  "frontmatter_preserves_unknown_keys": true,
  "hook_event_shapes": {},
  "token_count_in_posttooluse": false,
  "host_version": "stub-v2.0"
}
```

---

## `cost-ledger.json`

Per-session LLM cost tracking. Schema: `cost-ledger.schema.json`.

```json
{
  "entries": [
    {
      "session_id": "...",
      "timestamp": "2026-05-09T00:00:00Z",
      "stage": "stage1",
      "input_tokens": 1000,
      "output_tokens": 200,
      "cost_usd": 0.0012,
      "prompt_version": { "stage1": "v1.0" }
    }
  ]
}
```

---

## `coherence-log.md`

Append-only audit log of applied patches (DD-052). Never rotated in v0.1 (NFR-OBS-1).

Each entry is a Markdown block with timestamp, type, summary, git ref, and section list.

---

## `metrics.jsonl`

Rolling 90-day event log (NFR-OBS-2). One JSON record per line with `_ts` timestamp.

Event types: `patch_proposed`, `patch_applied`, `patch_reverted`, `patch_deferred`, `hallucination_grep_result`, `cost_per_stop`, `compaction_detected`, `degraded_mode_entered`, `kill_switch_seen`, `subagent_classification`.

---

## `metrics-summary.json`

Aggregated counts for entries older than 90 days (truncated from `metrics.jsonl`).

---

## `stop-progress.json`

Checkpoint for the Stop pipeline (resumable across crashes). Cleared on successful completion.

---

## `velocity.json`

Revert velocity tracking for auto-ignore heuristics. Schema: `velocity.schema.json`.

---

## `observations.md`

Append-only log of low-confidence findings and demoted-canonical notices (FR-STOP-21).

---

## Sentinel Files

| File | Meaning | Cleared by |
|---|---|---|
| `DISABLED` | Manual kill-switch | Manual removal only |
| `auto-disabled` | Auto crash-disable | `/coherence:recover` |

---

## `quarantine/`

Files that failed schema validation or had I/O errors are moved here for inspection.
