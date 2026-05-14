<!-- url: https://www.notion.so/35b010d46a7081dbada3f47596216e94 -->
<!-- id: 35b010d4-6a70-81db-ada3-f47596216e94 -->
<!-- title: 🚀 TS-8 — Cold-Start, Init, Distribution & Migration -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-8](https://www.notion.so/35b010d46a70819081b5e19278b4bcd2). v0.1 install flow, `/coherence:doctor`, and host-capability probe are inherited; this slice covers the v0.2 deltas.
---
## 1. Install / upgrade flow
Fresh install on a v0.2 plugin produces `version.json.schema_version: 2` directly. Upgrade-in-place flows from v0.1 → v0.2 trigger the migrator at first SessionStart.
## 2. v1 → v2 migrator (DD-080)
Single coordinated migrator at `src/state/migrate/v1_to_v2.ts`, slotted into the `// Future: if (schemaVersion < 2)` branch of `src/state/migrate/index.ts`. Atomic semantics; quarantine-and-continue on any corrupt input (FR-FAILURE-N1..N2).
### 2.1 Steps
> **Note (TS-introduced ordering).** DD-080 commits to *what* the migrator does atomically; the sub-step ordering below (a..i) is a TS recommendation and MAY be reordered in implementation provided the whole sequence remains atomic and the post-condition (v2 state coherent across all five files) is preserved.
```javascript
1. Acquire a write lock on version.json.
2. Read version.json; verify schema_version == 1 (else no-op).
3. Begin migration:
   a. Bump version.json.schema_version → 2; append { schema_version: 1, migrated_at } to prior_versions[].
   b. Widen drift-buffer.json BufferEntry.source enum (additive; existing entries untouched).
   c. Widen cost-ledger.json CostEntry.stage enum + CostEntry.prompt_version shape (additive).
   d. Create empty graduation.json     { schema_version: 2, global_mode: 'observe', scopes: [] }
   e. Create empty proposal-cache.json { schema_version: 2, entries: [] }
   f. Create empty signal-cache.json   { schema_version: 2, bash_repetition: { entries: [], maxItems: 500 }, file_creation: { entries: [], maxItems: 500 }, agent_correction: { entries: [], maxItems: 200 } }
   g. Create empty scan-cache/state.json { schema_version: 2, last_pass_at: null, entries_this_session: 0, per_session_cap: 20, idle_threshold_ms: 30000 }
   h. Create empty state-snapshot.json { schema_version: 2, mode: 'observe', drift_count: 0, proposal_count: 0, last_flush_at: null }
   i. Extend SCHEMA_NAMES and FILE_TO_SCHEMA in-process for the rest of this run.
4. Emit migration_completed { from: 1, to: 2, duration_ms } (DD-080).
5. Release lock.
```
### 2.2 Failure handling
Reuses v0.1 quarantine policy from `migrate/v0_to_v1.ts`: quarantine corrupt/old file, write fresh default, log, continue (FR-FAILURE-N2). Acceptance gate FG-1 verifies on a synthetic v1 corpus that:
- v2 state is correct.
- Pre-migration files are quarantined.
- `prior_versions` is appended.
- No data loss.
## 3. `/coherence:doctor` extensions
- Reports the effective mode per scope (uses `mode-resolver`).
- Consults `host-capabilities.statusline_install_path` to flag drift between probe result and installed state (FR-STATUSLINE-8).
- Instructs the user about `FORCE_HYPERLINK=1` when `host-capabilities.url_scheme_handler == 'plain'` (FR-STATUSLINE-9).
- Lists supported terminals and the override.
- v0.1 doctor checks all hold unchanged.
## 4. Host-capability probe extensions (DD-090)
Three new optional fields on `host-capabilities.json` (NFR-COMPAT-N1..N2):
<table header-row="true">
<tr>
<td>Field</td>
<td>Type</td>
<td>Probe</td>
<td>Defaults</td>
</tr>
<tr>
<td>`url_scheme_handler`</td>
<td>`'osc8' \| 'osc52' \| 'plain'`</td>
<td>Detect terminal capability via env (TERM, COLORTERM) + handshake; honour `FORCE_HYPERLINK=1`.</td>
<td>`'plain'`</td>
</tr>
<tr>
<td>`statusline_install_path`</td>
<td>`string`</td>
<td>Resolve the user's `~/.claude/settings.json` (or project `settings.json`).</td>
<td>`null`</td>
</tr>
<tr>
<td>`subagent_invocation_id_emitted`</td>
<td>`boolean`</td>
<td>Reflect whether host emits `invocation_id` per subagent invocation (DD-078 dependency).</td>
<td>`subagent_attribution` value when absent (back-compat)</td>
</tr>
</table>
`additionalProperties: false` is preserved — open-typed extension is forbidden.
The pre-existing v0.1 field `frontmatter_preserves_unknown_keys` is **unchanged** and continues to drive the DD-069 sidecar fallback for skill/agent annotation.
## 5. Statusline install / uninstall flow
### 5.1 `/coherence:install-statusline`
```javascript
resolve target = host-capabilities.statusline_install_path (else default ~/.claude/settings.json)
backup target -> <target>.coherence-bak.<iso-ts>.json
explicit user confirmation (slash-command flow)
write statusLine field; preserve all other fields
emit statusline_install { path, backup }
```
### 5.2 `/coherence:uninstall-statusline`
Restores from the most recent `.coherence-bak.*.json` and emits a corresponding metric. Verified by FG-13.
### 5.3 Plugin distribution
- `bin/coherence-statusline.sh`, `bin/coherence-statusline.ps1`, `bin/coherence-subagent-statusline.sh` ship with the plugin.
- The plugin's `bin/` is auto-added to Bash `PATH` per Claude Code docs (FR-STATUSLINE-2).
- `subagentStatusLine` is mandatory plugin-shipped (FR-STATUSLINE-1.b).
## 6. Rollback strategy
- **Down-migration (v2 → v1):** out-of-scope for v0.2; users wanting to roll back uninstall the v0.2 plugin and restore from their VCS / backup. New v0.2-only files are inert under v0.1 (v0.1 ignores unknown filenames; v0.2-widened enums never appear in v1 state because v1 readers never wrote them).
- **Per-proposal rollback:** `/coherence:propose-revert-acceptance <id>` (DD-083, TS-6 §3).
- **Statusline rollback:** `/coherence:uninstall-statusline` restores the backup.
## 7. CI matrix
v0.2 inherits the v0.1 matrix `[ubuntu, macos, windows] × [Node 20.x, 22.x] × [stub-v2.0, stub-v2.1]`. All v0.2 acceptance gates (FG / PG / CG / SG) must be green on every cell (RG-2). The v0.1 gates must remain green (RG-1, no regression).
## 8. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>FRs</td>
<td>NFRs</td>
<td>DDs</td>
<td>Gates</td>
</tr>
<tr>
<td>§2 Migrator</td>
<td>FR-FAILURE-N1..N3, FR-COST-N1, FR-TRICKLE-1, FR-MODES-3</td>
<td>NFR-RELIABILITY-N1</td>
<td>DD-080</td>
<td>FG-1</td>
</tr>
<tr>
<td>§3 Doctor</td>
<td>FR-STATUSLINE-8..9</td>
<td>—</td>
<td>DD-090, DD-071</td>
<td>(covered FG-13..14)</td>
</tr>
<tr>
<td>§4 Host capabilities</td>
<td>FR-STATUSLINE-5, FR-STATUSLINE-8</td>
<td>NFR-COMPAT-N1..N2</td>
<td>DD-069, DD-090, DD-071</td>
<td>FG-14</td>
</tr>
<tr>
<td>§5 Statusline install</td>
<td>FR-STATUSLINE-1..4</td>
<td>NFR-COMPAT-N3</td>
<td>DD-070</td>
<td>FG-13</td>
</tr>
<tr>
<td>§6 Rollback</td>
<td>FR-PROPOSE-8</td>
<td>NFR-OBS-N1</td>
<td>DD-083</td>
<td>FG-10</td>
</tr>
<tr>
<td>§7 Matrix</td>
<td>(all)</td>
<td>NFR-COMPAT (v0.1 inherited)</td>
<td>—</td>
<td>RG-1, RG-2</td>
</tr>
</table>
