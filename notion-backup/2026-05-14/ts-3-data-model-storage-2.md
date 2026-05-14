<!-- url: https://www.notion.so/35b010d46a708101b005d2d3e7005fef -->
<!-- id: 35b010d4-6a70-8101-b005-d2d3e7005fef -->
<!-- title: 🗄️ TS-3 — Data Model & Storage -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-3](https://www.notion.so/35b010d46a7081d9b307fd6a27a4deb8). All v0.1 schemas hold unchanged unless flagged “enum widened” below.
---
## 1. On-disk layout under `.claude/coherence/` (v0.2 view)
```javascript
.claude/coherence/
  version.json                   # schema_version: 2 + prior_versions
  drift-buffer.json              # source enum widened
  cost-ledger.json               # stage enum widened
  host-capabilities.json         # 3 new optional fields
  graduation.json                # new (DD-074)
  proposal-cache.json            # new (DD-088)
  signal-cache.json              # new (DD-089)
  state-snapshot.json            # new (DD-070, DD-084)
  scan-cache/
    state.json                   # new (DD-066, OQ-v2-30)
  proposals/
    skills/<id>/manifest.json
    skills/<id>/<artifact>.md
    agents/<id>/manifest.json
    agents/<id>/<artifact>.md
    commands/<id>/manifest.json
    commands/<id>/<artifact>.md
    annotations/<id>/manifest.json
    annotations/<id>/<artifact>.diff
  prompts/v2/manifest.json       # plugin-shipped, ships under plugin tree
```
`coherence/ignore` default template gains `proposals/` and `proposal-cache.json` so users do not accidentally commit local proposals (DD-072).
## 2. Schema changes to v0.1 files
<table header-row="true">
<tr>
<td>File</td>
<td>Change</td>
<td>DD</td>
</tr>
<tr>
<td>`version.json`</td>
<td>`schema_version: 1 → 2`; append previous version into `prior_versions[]`.</td>
<td>DD-080</td>
</tr>
<tr>
<td>`drift-buffer.json`</td>
<td>`BufferEntry.source` enum widened with `'trickle_deep_scan' \| 'annotate' \| 'author'`. Other fields unchanged.</td>
<td>DD-066, DD-080</td>
</tr>
<tr>
<td>`cost-ledger.json`</td>
<td>`CostEntry.stage` enum widened with `'author' \| 'annotate'`; `CostEntry.prompt_version` widened to `{ stage1?, stage2?, author?, annotate?: string }`.</td>
<td>DD-091, DD-080</td>
</tr>
<tr>
<td>`host-capabilities.json`</td>
<td>Three new optional fields: `url_scheme_handler: 'osc8' \| 'osc52' \| 'plain'`, `statusline_install_path: string`, `subagent_invocation_id_emitted: boolean` (defaults to `subagent_attribution` value when absent for back-compat). `additionalProperties: false` preserved.</td>
<td>DD-090, NFR-COMPAT-N2</td>
</tr>
</table>
Enum widenings are **additive only**; v0.1 readers tolerate them through the standard schema-versioned read path (NFR-MAINT-2 inherited).
## 3. New state files
### 3.1 `graduation.json` (DD-074)
```json
{
  "schema_version": 2,
  "global_mode": "observe",                  // 'observe' | 'annotate' | 'author'
  "scopes": [
    { "path": "docs/", "mode": "annotate" },  // path-prefix scope
    { "path": "docs/api.md", "mode": "author" } // exact-path scope
  ]
}
```
Resolution: most-specific scope wins (per-doc → per-dir → global). Lookup is O(log n) via path-prefix match, cached per session in `mode-resolver`. (FR-MODES-2..3)
### 3.2 `proposal-cache.json` (DD-088)
```json
{
  "schema_version": 2,
  "entries": [
    {
      "proposal_id": "<uuid-v4>",
      "kind": "slash_command",            // 'skill' | 'agent' | 'slash_command' | 'annotate'
      "state": "surfaced",                  // FSM state, see §3.2.1
      "state_history": [                    // append-only
        { "to": "queued", "at": "2026-05-10T08:00:00Z" },
        { "to": "surfaced", "at": "2026-05-10T09:12:33Z", "reason": "propose-list" }
      ],
      "surfaced_count": 1,
      "consecutive_ignored": 0,
      "last_signal_at": "2026-05-10T07:55:21Z",
      "expires_at": "2026-05-24T08:00:00Z"
    }
  ]
}
```
#### 3.2.1 Lifecycle FSM
```javascript
queued ── propose-list/show ──▶ surfaced ── propose-accept    ──▶ accepted*
                                 │
                                 ├─ propose-reject ─────────▶ rejected*
                                 ├─ expiry (DD-075 fences)  ─▶ expired*
                                 └─ (any) ─illegal─▶ ProposalStateError + quarantine

accepted ── propose-revert-acceptance ──▶ reverted*    (* = terminal)
```
Illegal transitions raise `ProposalStateError` and quarantine the cache file (FR-FAILURE-N3). `state_history` is append-only (NFR-RELIABILITY-N2, NFR-OBS-N2).
### 3.3 `signal-cache.json` (DD-089)
Discriminated union under top-level `entries`:
```json
{
  "schema_version": 2,
  "bash_repetition": {
    "entries": [ { "signature_hash": "a1b2c3d4e5f6", "count": 3, "first_seen": "...", "last_seen": "..." } ],
    "maxItems": 500
  },
  "file_creation": {
    "entries": [ { "skeleton_hash": "...", "locality_root": "src/x/", "count": 3, "first_seen": "...", "last_seen": "..." } ],
    "maxItems": 500
  },
  "agent_correction": {
    "entries": [ { "agent_name": "writing-plans", "corrections": [ { "invocation_id": "...", "line_ratio": 0.42, "at": "..." } ], "first_seen": "...", "last_seen": "..." } ],
    "maxItems": 200
  }
}
```
Circuit-breaker caps (`maxItems`) are bounds, not tuning knobs (FR-AUTHOR-13). SessionEnd prune drops entries with `last_seen < now − 7d`; emits `signal_cache_pruned { kind, removed }` (FR-AUTHOR-14).
### 3.4 `scan-cache/state.json` (DD-066, OQ-v2-30)
Trickle operational state. The `scan-cache/` directory was reserved by v0.1 init (with a `.gitkeep` placeholder for v0.2 trickle-scan); v0.2 places a single `state.json` inside it. The originally-proposed flat-file shape is superseded.
```json
{
  "schema_version": 2,
  "last_pass_at": "2026-05-10T09:14:00Z",
  "entries_this_session": 7,
  "per_session_cap": 20,
  "idle_threshold_ms": 30000
}
```
### 3.5 `state-snapshot.json` (DD-070, DD-084)
Small (≈ 200 B), debounced output consumed by `bin/coherence-statusline.*`. The exact field set below is **TS-introduced** (BRD-4 §1 / DD-070 / DD-084 fix only the size bound and writer policy):
```json
{
  "schema_version": 2,
  "mode": "author",
  "drift_count": 4,
  "proposal_count": 2,
  "last_flush_at": "2026-05-10T09:14:33Z"
}
```
Debounce policy (FR-STATUSLINE-7): hooks set in-process dirty bit (no FS I/O on PostToolUse); flush when (a) dirty AND ≥ 5 s since last flush AND `lockManager` acquires `state-snapshot` non-blocking; forced flush at Stop / SubagentStop / SessionEnd. Worst-case staleness: 5 s. (NFR-PERF-N4)
**First-snapshot bootstrap.** SessionStart MUST write an initial `state-snapshot.json` (post-migration, post-mode-resolve) so that `bin/coherence-statusline.*` invocations on a cold session never read a missing file. The bootstrap write reuses the same atomic-write / lock path as the debounced flush and is exempt from the 5 s debounce floor.
### 3.6 `proposal.schema.json` (DD-087)
Closed schema (`additionalProperties: false`). Required fields:
```json
{
  "proposal_id": "<uuid-v4>",
  "kind": "slash_command",                     // 'skill' | 'agent' | 'slash_command' | 'annotate'
  "created_at": "<iso-8601>",
  "signal_refs": [ "<signal-cache entry ref>" ],
  "proposed_path": ".claude/commands/cohere-deploy.md",
  "body": "...artifact contents...",
  "prompt_version": { "author": "v2.0" },
  "cost_usd": 0.012,
  "validation": {
    "name_collision": false,
    "hallucination_grep_passed": true
  }
}
```
Validated at the cache writer **and** on `/coherence:propose-show` read; on failure the proposal is dropped and `proposal_validation_failed { reason }` is logged (FR-PROPOSE-13).
### 3.7 Per-proposal directory (DD-072)
`.claude/coherence/proposals/<kind>/<id>/`:
- `manifest.json` — the envelope conforming to `proposal.schema.json`.
- `<artifact>.md` (or `.diff` for `annotate` kind) — the candidate body referenced by `manifest.body` (or held inline; layout TBD per implementation PR).
- `<id>` is a deterministic content-derived UUID v4 (FR-PROPOSE-1).
## 4. Prompt manifest
`prompts/v2/manifest.json` (plugin-shipped, DD-091):
```json
{
  "stage1_version": "v1.0",
  "stage2_version": "v1.0",
  "author_version": "v2.0",
  "annotate_version": "v2.0"
}
```
`prompts/v1/` ships unchanged side-by-side (NFR-MAINT-N2).
## 5. Schema registration
`SCHEMA_NAMES` and `FILE_TO_SCHEMA` (in `src/state/`) MUST list:
- `graduation`, `proposal-cache`, `signal-cache`, `scan-cache/state`, `state-snapshot` (the five new files).
- All five participate in v0.1 atomic-write, lock-manager, and quarantine-on-corruption semantics. (NFR-RELIABILITY-N1)
Lock policy (NFR-RELIABILITY-N3):
- `signal-cache` lock guards `signal-cache.json` (per-kind contention is negligible at the rates DD-076/077/078 specify).
- `state-snapshot` lock guards `state-snapshot.json`.
- All other v0.2 files reuse v0.1 per-file lock conventions.
## 6. Storage budgets
- DD-068 telemetry events combined: ≤ ≈13 MB additional disk under v0.1's 90-day rolling retention (FR-OBS-N1e, NFR-PRIVACY-N4).
- `proposal-cache.json` size bounded by per-session proposal cap (≤ 3) and per-proposal expiry (14 d / 7 d / N-ignored fences).
- `signal-cache.json` size bounded by `maxItems` 500 / 500 / 200 + 7-day prune.
## 7. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>FRs</td>
<td>NFRs</td>
<td>DDs</td>
</tr>
<tr>
<td>§1 Layout</td>
<td>FR-PROPOSE-1, FR-PERMISSION-N4</td>
<td>NFR-PRIVACY-N2</td>
<td>DD-072, DD-073</td>
</tr>
<tr>
<td>§2 v0.1 schema deltas</td>
<td>FR-COST-N1, FR-TRICKLE-1, FR-STATUSLINE-8</td>
<td>NFR-COMPAT-N1..N2</td>
<td>DD-066, DD-080, DD-090, DD-091</td>
</tr>
<tr>
<td>§3 New state files</td>
<td>FR-MODES-3, FR-PROPOSE-2..3, FR-AUTHOR-13..14, FR-TRICKLE-2, FR-STATUSLINE-7, FR-PROPOSE-13</td>
<td>NFR-RELIABILITY-N1..N3, NFR-PERF-N4</td>
<td>DD-074, DD-088, DD-089, DD-066, DD-070, DD-084, DD-087</td>
</tr>
<tr>
<td>§4 Prompt manifest</td>
<td>FR-COST-N5</td>
<td>NFR-MAINT-N2</td>
<td>DD-091</td>
</tr>
<tr>
<td>§5 Registration / locks</td>
<td>—</td>
<td>NFR-RELIABILITY-N1..N3</td>
<td>DD-080, DD-084, DD-089</td>
</tr>
<tr>
<td>§6 Storage budgets</td>
<td>FR-OBS-N1e, FR-PROPOSE-9..12, FR-AUTHOR-13..14</td>
<td>NFR-PRIVACY-N4</td>
<td>DD-068, DD-075, DD-089</td>
</tr>
</table>
