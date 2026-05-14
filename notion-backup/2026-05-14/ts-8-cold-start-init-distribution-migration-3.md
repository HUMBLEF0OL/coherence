<!-- url: https://www.notion.so/35b010d46a70819081b5e19278b4bcd2 -->
<!-- id: 35b010d4-6a70-8190-81b5-e19278b4bcd2 -->
<!-- title: TS-8 — Cold-Start, Init, Distribution & Migration -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 8.1 Install Flow
1. User runs `claude plugin install coherence`.
2. Plugin manifest registers hook handlers, slash commands, and declares `min_claude_code_version` (NFR-COMPAT-3).
3. **Host-capability probe** (`/coherence:doctor`) runs once at install (FR-INSTALL-3, FR-INSTALL-6):
	- `subagent_attribution`: `line-level` \| `file-level-fallback` \| `absent`.
	- `frontmatter_preserves_unknown_keys`: boolean.
	- Hook event shapes per host version.
	- `token_count_in_posttooluse`: boolean (drives FR-MIDSESSION-1c fallback).
4. Probe results cached in `.claude/coherence/host-capabilities.json` (TS-3 §3.5). Subsequent sessions read the cache.
5. `version.json` written with plugin version, schema versions, prompt versions (FR-INSTALL-4).
6. **Default mode is Observe** (FR-PERMISSION-1). No `.claude/coherence/` mutations beyond the directory and the default state files (FR-INSTALL-2).
v0.1 has no marketplace packaging — direct install only (BRD-5 §5.3, deferred to v0.3).
## 8.2 First-Session Bootstrap (Phase 0 from [🚀 5. Cold-Start & Init Flow](https://www.notion.so/49c010d46a7082a0aa1a01f8b72e465d))
On first SessionStart in a project:
1. Create `.claude/coherence/` with default state files if missing (FR-INSTALL-2).
2. Run **bounded discovery**:
	- Top-level directory listing (depth 1).
	- All `.claude/` content under canonical paths (FR-DETECT-13, DD-040).
	- All `*.md` at root and one level deep.
	- `package.json` / `pyproject.toml` at root.
3. Write `discovery.md` (read-only report). Inventory + literal string contradictions + token-budget exceeders + significant code dirs without doc references.
4. Mode stays Observe; no writes to user docs.
## 8.3 v0.1 Operating Mode
v0.1 ships **Observe + Graduated** only. All `/coherence:graduate` does is flip `mode: observe` ↔ `mode: graduated` in config; it enables / disables the Stop LLM patch pipeline writes for the additive change-class auto-apply path (FR-COMMANDS-6, FR-PERMISSION-2). Annotate → Author transitions are deferred to v0.2.
## 8.4 `/coherence:doctor` Probe Detail
Run at install and on demand (FR-COMMANDS-5, FR-INSTALL-3, FR-INSTALL-6).
<table header-row="true">
<tr>
<td>Probe</td>
<td>Method</td>
<td>Cached field</td>
</tr>
<tr>
<td>Subagent attribution</td>
<td>Test SubagentStop event shape from a synthetic invocation</td>
<td>`subagent_attribution`</td>
</tr>
<tr>
<td>Frontmatter unknown-key preservation</td>
<td>Round-trip a YAML with a custom key through host's frontmatter normalisation</td>
<td>`frontmatter_preserves_unknown_keys`</td>
</tr>
<tr>
<td>Hook event shape compatibility</td>
<td>Verify expected fields present on each registered hook</td>
<td>`hook_event_shapes.<hook>`</td>
</tr>
<tr>
<td>Token count surfacing on PostToolUse</td>
<td>Inspect a tool event; record presence</td>
<td>`token_count_in_posttooluse`</td>
</tr>
</table>
Results written atomically; older copy archived per quarantine policy on schema mismatch.
## 8.5 Schema Migration Chain (NFR-MAINT-2, NFR-COMPAT-4)
On every SessionStart:
1. Read `version.json`.
2. If `buffer_schema_version`, `plan_schema_version`, `velocity_schema_version`, `section_index_schema_version`, or `prompt_versions.*` differ from the running plugin's expectation → run `migrate_v{n}_to_v{n+1}` chain in order, atomically per file.
3. If any migration step fails → quarantine affected file, log, continue with fresh defaults (NFR-RELIABILITY-7, FR-FAILURE-2).
4. **Older plugin reads newer state** → read-only mode + upgrade prompt; plugin loads but refuses writes (FR-INSTALL-5, RB-4).
5. **Newer plugin reads older state** → forward migration; backup of pre-migration file in `quarantine/`; on success the prior plugin version is appended to `version.json#prior_versions` (DD-064).
E2E-8 covers the full v0.0.x → v0.1 path (BRD-4 §4.2).
## 8.6 Rollback (DD-064)
<table header-row="true">
<tr>
<td>Mechanism</td>
<td>When to use</td>
<td>Source</td>
</tr>
<tr>
<td>`claude plugin install coherence@<old>`</td>
<td>Documented downgrade path</td>
<td>RB-5</td>
</tr>
<tr>
<td>`.claude/coherence/DISABLED` sentinel</td>
<td>Manual instant kill-switch</td>
<td>RB-2, FR-INSTALL-7</td>
</tr>
<tr>
<td>`.claude/coherence/disabled` (auto)</td>
<td>Plugin self-disabled after 3 exceptions</td>
<td>RB-3, FR-FAILURE-6</td>
</tr>
<tr>
<td>Read-only mode</td>
<td>Schema mismatch; older plugin</td>
<td>RB-4</td>
</tr>
<tr>
<td>`/coherence:recover`</td>
<td>Clear quarantine, reset locks, drop progress, remove `disabled`</td>
<td>FR-FAILURE-7</td>
</tr>
<tr>
<td>`git revert <coherence-commit>`</td>
<td>Per-patch reversal; feeds velocity counter</td>
<td>DD-035, FR-DETECT-14</td>
</tr>
</table>
Every applied patch is a single commit, so rollback granularity is per-patch by definition.
## 8.7 Documentation Deliverables (DG-1..DG-6)
Must ship with v0.1 (BRD-4 §4.7):
<table header-row="true">
<tr>
<td>ID</td>
<td>Doc</td>
<td>Owner</td>
</tr>
<tr>
<td>DG-1</td>
<td>README with install + Observe-mode walkthrough</td>
<td>Engineering</td>
</tr>
<tr>
<td>DG-2</td>
<td>Slash-command reference (`/status`, `/review`, `/repair`, `/recover`, `/doctor`, `/graduate`, `/enable-sidecars`, `/share-metrics`)</td>
<td>Engineering</td>
</tr>
<tr>
<td>DG-3</td>
<td>State-file schema reference (buffer, pending, host-capabilities, version, progress, etc.)</td>
<td>Engineering</td>
</tr>
<tr>
<td>DG-4</td>
<td>Rollback procedure documented + tested</td>
<td>Engineering + QA</td>
</tr>
<tr>
<td>DG-5</td>
<td>CHANGELOG with all DDs landed</td>
<td>Engineering</td>
</tr>
<tr>
<td>DG-6</td>
<td>Privacy & data-handling document (what is sent to Anthropic API for Stage 1 / Stage 2; what is stored locally; how `.gitignore` and `coherence/ignore` are honoured; how `/coherence:share-metrics --anonymized` works)</td>
<td>Engineering + Legal review</td>
</tr>
</table>
## 8.8 Distribution Constraints
- Single-package npm-style install via the host's plugin mechanism. No native binaries.
- Install size cap \< 10 MB on disk (NFR-PERF-8) — prompts and fixtures count toward this.
- LTS Node only (20.x / 22.x).
- No `postinstall` scripts that touch outside the plugin directory; install is pure-extract.
## 8.9 Upgrade Story
<table header-row="true">
<tr>
<td>Trigger</td>
<td>Behaviour</td>
</tr>
<tr>
<td>User runs `claude plugin update coherence`</td>
<td>New plugin version installed; first SessionStart runs migration chain; `version.json#prior_versions` appended (DD-064)</td>
</tr>
<tr>
<td>Plugin schema is newer than running host</td>
<td>Read-only mode + upgrade prompt (FR-INSTALL-5)</td>
</tr>
<tr>
<td>Prompt version bump</td>
<td>Stage 1 / Stage 2 cassette tests must pass green; QG-1/2/3 enforced</td>
</tr>
<tr>
<td>State-file format change</td>
<td>Backed by `migrate_v{n}_to_v{n+1}`; old file copied to `quarantine/`</td>
</tr>
</table>
## 8.10 Cross-References
- Sentinel semantics: TS-6 §6.5.
- State files inventory: TS-3 §3.1.
- Test gates verifying install / migration / rollback: TS-9 §9.4 (E2E-1, E2E-8, E2E-9), §9.8 (RB-1..RB-5).
