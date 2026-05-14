<!-- url: https://www.notion.so/35b010d46a7081d9b307fd6a27a4deb8 -->
<!-- id: 35b010d4-6a70-81d9-b307-fd6a27a4deb8 -->
<!-- title: TS-3 — Data Model & Storage -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 3.1 On-Disk Layout
Everything lives under `.claude/coherence/` in the project root. Created on first SessionStart per FR-INSTALL-2.
```javascript
.claude/coherence/
  config.json                  # mode (observe / graduated), tunables
  version.json                 # plugin version, schema versions, prompt versions
  host-capabilities.json       # /coherence:doctor cache
  drift-buffer.json            # in-session buffer
  pending.md                   # cross-session deferred entries
  stop-progress.json           # crash-resume checkpoint (Stop only)
  velocity.json                # per-section revert counts + windows
  ignore                       # gitignore-style skip patterns
  observations.md              # low-confidence findings + rejected canonical demotions
  coherence-log.md             # newest-first applied/auto-applied/finalize history
  metrics.jsonl                # event telemetry
  metrics-summary.json         # >90-day rollup (counts only)
  revalidation-log.md          # SessionStart drops + Stage 2 validation failures
  subagent-history.jsonl       # per-file line provenance
  subagent-stats.json          # rolling-window aggregates
  subagent-trace.json          # active-window subagent invocation trace (per session)
  section-index.json           # cached section-ref normal forms (R-17 mitigation)
  cost-ledger.json             # session-scoped cumulative spend
  DISABLED                     # manual kill-switch sentinel (presence-only)
  disabled                     # crash self-disable sentinel (with diagnostic)
  quarantine/                  # quarantined corrupt state files (.bak)
  sidecars/                    # opt-in skill/agent metadata fallback
```
Sentinel filenames `DISABLED` (manual, FR-INSTALL-7) and `disabled` (auto, FR-FAILURE-6) are intentionally distinct on case-sensitive filesystems; on case-insensitive filesystems either acts as a kill-switch. DD-064 specifies a single lowercase `disabled` for both paths; v0.1 splits them so that the manual sentinel survives a `/coherence:recover` (which only removes the lowercase auto-disable). This split is documented in CHANGELOG (DG-5).
`scan-cache.json` (DD-036) is **not** present in v0.1 — the trickle scanner is deferred to v0.2 (BRD-5 §5.3). DD-041's lock list reserves the filename for that future use.
## 3.2 Schema Conventions
- All JSON files start with `{ "schema_version": <int>, ... }`.
- All schemas are validated with `ajv` draft-07 (D-6) on every read.
- Failed validation → quarantine to `.claude/coherence/quarantine/<filename>.<unix-ts>.bak` (last 10 retained per file, NFR-RELIABILITY-7), proceed with fresh defaults, log to `coherence-log.md`.
- Forward-compat: older plugin reads newer state → read-only mode (NFR-COMPAT-4).
- Backward-compat: newer plugin reads older state → `migrate_v{n}_to_v{n+1}` chain run at SessionStart (NFR-MAINT-2).
## 3.3 Buffer Entry Schema (`drift-buffer.json`, `pending.md`)
DD-026 schema (v0.1 extends DD-026's `source` enum with `assertion` and `subagent` to cover synthetic-trigger and subagent-attributed entries). Each entry has:
<table header-row="true">
<tr>
<td>Field</td>
<td>Type</td>
<td>Notes</td>
</tr>
<tr>
<td>`entry_id`</td>
<td>string (uuid)</td>
<td>Stable across re-validation</td>
</tr>
<tr>
<td>`section_ref`</td>
<td>string</td>
<td>Normalised per DD-027: `<workspace-relative-path>#<id-or-heading-anchor>`</td>
</tr>
<tr>
<td>`triggering_files`</td>
<td>string\[\]</td>
<td>OS canonical realpaths, forward-slash separators</td>
</tr>
<tr>
<td>`tool`</td>
<td>enum</td>
<td>`Edit` / `Write` / `Bash` (DD-026; assertion- and subagent-sourced entries are identified via `source`, not `tool`)</td>
</tr>
<tr>
<td>`timestamp`</td>
<td>ISO-8601 UTC</td>
<td>NFR-OBS-5</td>
</tr>
<tr>
<td>`change_class_hint`</td>
<td>enum</td>
<td>`additive` / `modifying` / `destructive` / `frontmatter` (deterministic recount at Stop wins, FR-STOP-6b)</td>
</tr>
<tr>
<td>`confidence`</td>
<td>enum</td>
<td>`high` / `low` (FR-STOP-21)</td>
</tr>
<tr>
<td>`state`</td>
<td>enum</td>
<td>`pending` / `deferred` (DD-026; cleared entries are removed from the buffer rather than relabelled, DD-010)</td>
</tr>
<tr>
<td>`matched_watch_glob`</td>
<td>string</td>
<td>The exact glob that matched</td>
</tr>
<tr>
<td>`source`</td>
<td>enum</td>
<td>`post_tool_use` / `session_start_revalidation` (DD-026) plus v0.1 extensions `assertion` (FR-STOP-19) and `subagent` (FR-DETECT-17)</td>
</tr>
<tr>
<td>`subagent_invocation_id`</td>
<td>string \\</td>
<td>null</td>
</tr>
<tr>
<td>`content_hash`</td>
<td>string</td>
<td>sha256 of the section content at entry creation. Used by DD-051 consecutive-defer reset: when the section's current hash differs from the entry's stored hash, `consecutive_defer_sessions` resets to 0.</td>
</tr>
</table>
No `trigger_id` field — grouping is materialised at Stop by union-find on `triggering_files` overlap (FR-DETECT-3, DD-025).
`pending.md` is a Markdown file with one fenced JSON block per entry plus a human-readable summary line, hard-capped at 200 entries (oldest pruned by timestamp before re-validation), 14-day staleness fence (FR-BUFFER-7).
## 3.4 Section Anchor & Frontmatter Format
### Prose docs (referring docs)
HTML comment + YAML frontmatter, paired open/close with stable `id`:
```javascript
<!-- coherence:section id=middleware-rate-limit
watches:
  - src/middleware/rate-limit/**
asserts:
  - import_exists: "from 'express'"
role: canonical          # optional; honored absolutely by Stage 1 (DD-015 rule 2)
coherence-key: <opaque>  # preserved verbatim across patches (FR-LAYERS-2)
last-verified: 2026-04-01
-->
... section content ...
<!-- /coherence:section -->
```
- Stack-based scanner detects orphan opens, missing closes, duplicate `id=` per file (FR-DETECT-12). Any error makes the file **fatal-for-file** until `/coherence:repair` resolves it.
- Scanner skips fenced code blocks (` ` ` and `\~\~\~\`) to avoid false positives on intentional examples (R-18).
- IDs restricted to `[a-z0-9_-]+` (FR-DETECT-15).
- Heading-fallback: GitHub-compatible slug; `-1` / `-2` disambiguation in document order; emits one warning per file per session.
### Skills (`.claude/skills/*/SKILL.md`) and Subagents (`.claude/agents/*.md`)
YAML frontmatter only — **no HTML coherence comments** in body (DD-050, NFR-SECURITY-7). The `coherence:` block is a top-level key in the file's existing YAML frontmatter:
```yaml
---
name: my-skill
description: ...
coherence:
  id: my-skill-skill
  watches:
    - src/my-skill/**
  role: consumer
  coherence-key: <opaque>
---
```
When `/coherence:doctor` reports `frontmatter_preserves_unknown_keys: false`, users opt into `.claude/coherence/sidecars/<name>.yaml` with the same shape (FR-COMMANDS-7).
### Discovery scope
Skill discovery restricted to `.claude/skills/*/SKILL.md`; agent discovery restricted to `.claude/agents/*.md`. Files outside these paths are silently ignored (FR-DETECT-13, DD-040).
## 3.5 `host-capabilities.json` (DD-043, DD-062)
```json
{
  "schema_version": 1,
  "probed_at": "2026-05-09T07:00:00Z",
  "plugin_version": "0.1.0",
  "host_version": "2.1.x",
  "subagent_attribution": "line-level",
  "frontmatter_preserves_unknown_keys": true,
  "hook_event_shapes": { "PostToolUse": "v1", "SubagentStop": "v1" },
  "token_count_in_posttooluse": true
}
```
Written at install via `/coherence:doctor`; re-read at every SessionStart; only refreshed by manual `/coherence:doctor` re-run (FR-INSTALL-6).
## 3.6 `version.json` (DD-064)
```json
{
  "plugin_version": "0.1.0",
  "buffer_schema_version": 1,
  "plan_schema_version": 1,
  "velocity_schema_version": 1,
  "section_index_schema_version": 1,
  "prompt_versions": { "stage1": 1, "stage2": 1 },
  "installed_at": "2026-05-09T07:00:00Z",
  "prior_versions": []
}
```
`prior_versions` (DD-064) records every plugin version that has previously written to this directory; appended on each successful migration. Replaces the original `upgraded_from` single-value field.
## 3.7 `velocity.json` (DD-011, DD-051)
```json
{
  "schema_version": 1,
  "sections": {
    "<section_ref>": {
      "revert_window_start": "2026-04-15T...",
      "revert_count": 1,
      "revert_timestamps": ["2026-04-15T...", "..."],
      "consecutive_defer_sessions": 0,
      "last_defer_session_id": "session-abc",
      "auto_ignored": false
    }
  }
}
```
2 reverts within 30 days → `auto_ignored = true` and a one-line user notice (FR-BUFFER-5). Surfaces in `/coherence:status` velocity block (FR-OBS-7). `revert_timestamps` retains the precise timestamps used to slide the 30-day window. `last_defer_session_id` plus the buffer-entry `content_hash` (TS-3 §3.3) implement the DD-051 reset-on-content-change rule for `consecutive_defer_sessions`.
## 3.8 `stop-progress.json` (FR-STOP-12, NFR-RELIABILITY-2)
```json
{
  "schema_version": 1,
  "started_at": "...",
  "groups": [
    { "group_id": "...", "plan": {...}, "plan_validated": true,
      "stage2": { "<section_ref>": { "status": "done|pending|failed", "diff": "..." } } }
  ]
}
```
Atomically rewritten between every Stage 2 call. On crash, resume reads it and skips entries with `status: done`.
## 3.9 `cost-ledger.json` (FR-OBS-6, DD-046)
Session-scoped, reset at SessionEnd:
```json
{
  "session_id": "...",
  "stage1_calls": 2,
  "stage2_calls": 7,
  "input_tokens": 11823,
  "output_tokens": 1421,
  "estimated_usd": 0.062,
  "review_invocations": 1,
  "prompt_versions": { "stage1": 1, "stage2": 1 }
}
```
`prompt_versions` (DD-057) records the prompt-version pair active when the ledger row was created so that cost telemetry can be partitioned by prompt revision.
## 3.10 `metrics.jsonl` (FR-OBS-2, DD-060, NFR-OBS-2)
Append-only; one event per line; 90-day rolling retention with summarisation to `metrics-summary.json`. Event types in v0.1:
- `patch_proposed`, `patch_applied`, `patch_reverted`, `patch_deferred`
- `hallucination_grep_result` (per tier)
- `cost_per_stop`
- `compaction_detected`
- `degraded_mode_entered`
- `kill_switch_seen` (manual or auto)
- `subagent_classification` (per invocation)
Each event carries `{ ts, schema_version, type, payload }`. Events sourced from an LLM call (`patch_proposed`, `patch_applied`, `cost_per_stop`, `hallucination_grep_result`) additionally carry `prompt_version: { stage1: <int>, stage2: <int> }` so telemetry can be partitioned by prompt revision (DD-057). No raw code content; section refs and IDs only (NFR-PRIVACY-4).
## 3.11 `coherence-log.md` (FR-OBS-1, DD-052)
Newest-first; one entry per applied or auto-applied patch, finalize commit, or quarantine event. References `git refs` only — **no inline diffs** (NFR-OBS-1: not auto-rotated; bounded by patch count).
```markdown
## 2026-05-09T08:14:33Z  apply  abc1234
sections:
  - CLAUDE.md#middleware-rate-limit
class: additive  bundle: g-001
```
## 3.12 `subagent-history.jsonl` & `subagent-stats.json`
Line-level provenance per file modified by a subagent (FR-DETECT-17). Both files share the 90-day retention policy.
```javascript
{"ts":"...","subagent_id":"...","file":"src/x.ts",
  "lines_added":[[10,12],[40,42]],"lines_removed":[],
  "net_delta":6,"classified":"pending"}
```
Text-only subagents get a single zero-delta entry. Reverts within 7 days reclassify matching entries to `rejected` (FR-DETECT-17).
## 3.13 `ignore` (NFR-PRIVACY-5)
Gitignore-style; lines beginning `#` are comments. Always honoured before any read or path-filter match. Plugin always implicitly ignores `.env`, `.envrc`, `.git/`, and the user's `.gitignore`.
## 3.14 Public TypeScript Types (NFR-MAINT-3)
Exported from a single barrel module and stable across MINOR versions:
- `BufferEntry`
- `CoherencePlan` (Stage 1 output schema)
- `Patch` (Stage 2 output: diff, NO_PATCH_NEEDED, ESCALATE, PLAN_DISAGREES variants)
- `HostCapabilities`
- `ChangeClass` enum
- `SectionRef` branded string
## 3.15 Persistence Invariants
- All JSON writes are temp+rename in the same directory (NFR-RELIABILITY-1).
- `pending.md`, `coherence-log.md`, `metrics.jsonl`, `subagent-history.jsonl` are append-only mutated via temp+rename of full file.
- Section refs everywhere are normalised per DD-027 / FR-DETECT-15 — the section index caches the normal form once per session in `section-index.json` (R-17 mitigation).
- Line endings preserved per file convention (NFR-COMPAT-5).
