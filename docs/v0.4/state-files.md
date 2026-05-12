# Coherence v0.4 — State Files

v0.4 establishes three storage tiers with distinct semantics.

## Tier 1: Per-installation (`${CLAUDE_PLUGIN_DATA}`)

Path: `$CLAUDE_PLUGIN_DATA/` (set by Claude Code) or, on dev checkouts,
`~/.claude/plugins/data/cohrence/`.

Survives plugin updates. In v0.4 the directory is created on fresh install but no files are written
here yet — reserved for v0.4.1+.

## Tier 2: Per-project per-developer (`.claude/coherence/`)

Gitignored. All v0.3 files carry forward; v0.4 adds:

| File | Owner | Description |
|---|---|---|
| `trigger-state.json` | Plugin | One-time hint guard for TC-1 / TC-2 trigger contracts (DD-129). Absent on fresh install. Written atomically when a threshold is first crossed. Never cleared. |

## Tier 3: Per-team (`coherence/`)

Committed to the repository. Unchanged from v0.3: `plans/<branch-sha>/`, `ignore`,
`ignore.local` (gitignored), `scope.json`.

## `trigger-state.json` schema

```json
{
  "tc1_hint_emitted_at": "<ISO8601 or absent>",
  "tc2_hint_emitted_at": "<ISO8601 or absent>"
}
```

- `tc1_hint_emitted_at`: set when the author-planner readiness hint (TC-1) has been emitted. Once set, never cleared.
- `tc2_hint_emitted_at`: set when the calibration re-tune hint (TC-2) has been emitted. Once set, never cleared.
