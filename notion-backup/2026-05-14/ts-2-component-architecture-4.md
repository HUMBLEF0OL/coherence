<!-- url: https://www.notion.so/35b010d46a708134843dc4fed567f896 -->
<!-- id: 35b010d4-6a70-8134-843d-c4fed567f896 -->
<!-- title: TS-2 — Component Architecture -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 2.1 Module Map
Nine top-level modules. Each owns a clearly bounded responsibility; none owns more than one external surface.
<table header-row="true">
<tr>
<td>Module</td>
<td>Responsibility</td>
<td>Key BRD references</td>
</tr>
<tr>
<td>`hookAdapters`</td>
<td>Map host hook events to internal pipelines; enforce kill-switch first</td>
<td>FR-INSTALL-7, DD-019</td>
</tr>
<tr>
<td>`stateStore`</td>
<td>Atomic read/write of all `.claude/coherence/*` files with schema validation, locking, quarantine</td>
<td>NFR-RELIABILITY-1..3, DD-026, DD-061</td>
</tr>
<tr>
<td>`detection`</td>
<td>Path filter, anchor scanner, assertion evaluator, compaction detection</td>
<td>FR-DETECT-\*, DD-007, DD-039</td>
</tr>
<tr>
<td>`subagentTracker`</td>
<td>Line-level / file-level provenance, state-machine classification, rolling-window stats</td>
<td>FR-DETECT-7..8, FR-LAYERS-3..4, DD-013, DD-022, DD-062</td>
</tr>
<tr>
<td>`bufferLifecycle`</td>
<td>Buffer mutation, deferral, persistence to `pending.md`, velocity counter</td>
<td>FR-BUFFER-\*, FR-DETECT-14, DD-010, DD-011</td>
</tr>
<tr>
<td>`stopPipeline`</td>
<td>Trigger-source grouping, cap enforcement, planner orchestration, patch parallelism, merge, commit</td>
<td>FR-STOP-\*, DD-008, DD-049, DD-056, DD-061</td>
</tr>
<tr>
<td>`llmClient`</td>
<td>Stage 1 / Stage 2 calls, prompt caching, cost ledger, cassette replay</td>
<td>FR-STOP-13, NFR-COST-\*, DD-057</td>
</tr>
<tr>
<td>`validation`</td>
<td>Format / apply / sanity / line-count / hallucination grep; change-class reclassification</td>
<td>FR-STOP-6..7, DD-017, DD-032, DD-047, DD-058</td>
</tr>
<tr>
<td>`slashCommands`</td>
<td>Implementation of `/coherence:*` commands; canonical status output</td>
<td>FR-COMMANDS-\*, DD-055</td>
</tr>
</table>
Support surfaces (not separate modules): `gitAdapter`, `pathNormaliser`, `logger`, `metricsRecorder`, `prompts/`.
## 2.2 Three-Layer Healing Adapter
Each layer differs only in **detection signal source** and **permission gating overlay**, not in the patch pipeline itself. The pipeline is layer-agnostic; layer-specific behaviour is contributed via small policy objects.
<table header-row="true">
<tr>
<td>Layer</td>
<td>Detection signals</td>
<td>Storage of metadata</td>
<td>Permission overlay</td>
</tr>
<tr>
<td>Referring docs (`CLAUDE.md`, etc.)</td>
<td>Path watches in HTML+YAML anchors; `asserts: import_exists` (DD-007, DD-054)</td>
<td>YAML frontmatter inside `<!-- coherence:section ... -->` (DD-050)</td>
<td>Standard change-class gating (DD-002)</td>
</tr>
<tr>
<td>Skills (`.claude/skills/*/SKILL.md`)</td>
<td>Path watches in skill YAML frontmatter; canonical-path discovery only (DD-040)</td>
<td>YAML frontmatter only — no HTML comments in body (DD-050)</td>
<td>Frontmatter changes always confirm (FR-PERMISSION-3)</td>
</tr>
<tr>
<td>Subagents (`.claude/agents/*.md`)</td>
<td>Path watches; SubagentStop output-use signal; rolling-window stats (DD-013, DD-022)</td>
<td>YAML frontmatter only; sidecar fallback when host strips unknown keys (FR-COMMANDS-7)</td>
<td>Frontmatter always confirm; allowed-tools changes always confirm</td>
</tr>
</table>
**Coherence Pass** — when a single-layer patch is approved, the planner has already resolved cross-layer impact (Stage 1 sees all sections in a trigger group regardless of layer). The post-approval cross-layer scan in Architecture is **subsumed by Stage 1** in v0.1; no separate pass module is built (DD-008, FR-LAYERS-5).
## 2.3 Module Dependency Graph (acyclic)
```javascript
hookAdapters → stateStore
            → detection → stateStore
            → subagentTracker → stateStore
            → bufferLifecycle → stateStore
            → stopPipeline → detection
                          → bufferLifecycle
                          → llmClient
                          → validation
                          → gitAdapter → stateStore
slashCommands → stateStore, detection, stopPipeline (review), bufferLifecycle
llmClient   → prompts/, cost ledger (in stateStore)
validation  → pathNormaliser, prompts metadata only
```
No module imports `hookAdapters` or `slashCommands`. Cycles are forbidden by lint rule.
## 2.4 Subagent Tracker (special case)
Own module because it carries its own state machine and rolling-window aggregation, and it is the only place where host-capability degrades (line-level → file-level fallback).
- **Provenance:** when host exposes `subagent_invocation_id` + line ranges, recorded at SubagentStop in `.claude/coherence/subagent-history.jsonl` (FR-DETECT-17).
- **Fallback:** when absent, attribute file changes within `min(5 minutes, same agent turn)`; surface mode in `/coherence:status` as `provenance: file-level fallback` (FR-DETECT-8, DD-062).
- **Classification:** windowed user-message keyword classifier (first two messages after SubagentStop, FR-DETECT-16) + file-modification signal at SessionEnd → final state Accepted / Edited / Discarded.
- **Rolling-window:** last 50 invocations; thresholds discard \>25%, edit \>50%, sudden shift \>20pp on last 5 vs prior 10 (FR-LAYERS-3..4).
- **Retroactive reclassification:** revert detected within 7 days flips matching history entries to `rejected` (FR-DETECT-17).
- **Retention:** 90-day rolling window (NFR-OBS-2) shared with `metrics.jsonl`.
## 2.5 Stop Pipeline (orchestrator)
State machine, not a script. Steps and their contracts:
<table header-row="true">
<tr>
<td>Step</td>
<td>Input</td>
<td>Output</td>
<td>DD / FR</td>
</tr>
<tr>
<td>1. Read & validate buffer</td>
<td>`drift-buffer.json`  • schema</td>
<td>List of valid entries; corrupt entries quarantined</td>
<td>DD-026, FR-FAILURE-2</td>
</tr>
<tr>
<td>2. Trigger-source grouping</td>
<td>Entries</td>
<td>Groups via union-find on `triggering_files` overlap</td>
<td>DD-009, DD-025, FR-STOP-1</td>
</tr>
<tr>
<td>3. Cap enforcement</td>
<td>Groups</td>
<td>≤3 groups, ≤12 sections/group, canonical-first defer overflow</td>
<td>DD-056, FR-STOP-10..11</td>
</tr>
<tr>
<td>4. Stage 1 planner (if ≥2 sections in group)</td>
<td>Group + section content (read fresh from disk)</td>
<td>Plan JSON</td>
<td>FR-STOP-2..3, FR-STOP-15</td>
</tr>
<tr>
<td>5. Plan validation</td>
<td>Plan JSON</td>
<td>Plan or fallback-to-independent</td>
<td>FR-STOP-3, FR-STOP-16</td>
</tr>
<tr>
<td>6. Stage 2 patch writers</td>
<td>(section, plan, change-class hint)</td>
<td>Diff or NO_PATCH_NEEDED / ESCALATE / PLAN_DISAGREES</td>
<td>FR-STOP-4..5, FR-STOP-17</td>
</tr>
<tr>
<td>7. Patch validation</td>
<td>Each Stage 2 output</td>
<td>Pass / fail with reason → `revalidation-log.md`</td>
<td>FR-STOP-6..7, NFR-OBS-3</td>
</tr>
<tr>
<td>8. Change-class reclassification</td>
<td>Patch</td>
<td>Deterministic class wins over LLM-claimed</td>
<td>FR-STOP-6b, DD-017</td>
</tr>
<tr>
<td>9. File-level merge</td>
<td>Per-file patches</td>
<td>Merged diffs; overlap rejects all of file</td>
<td>FR-STOP-8, DD-008</td>
</tr>
<tr>
<td>10. Bundle assembly</td>
<td>Per-group patches</td>
<td>Atomic bundle (plan-derived) or individual</td>
<td>FR-STOP-9, FR-STOP-18</td>
</tr>
<tr>
<td>11. Consolidated review</td>
<td>Bundles + standalones</td>
<td>User decision</td>
<td>DD-002, FR-PERMISSION-\*</td>
</tr>
<tr>
<td>12. Commit</td>
<td>Approved patches</td>
<td>One `[coherence]` commit per bundle/patch</td>
<td>FR-PERMISSION-4, FR-FAILURE-5, DD-005</td>
</tr>
<tr>
<td>13. Buffer mutation</td>
<td>Approve/skip outcomes</td>
<td>Cleared or deferred entries</td>
<td>FR-BUFFER-2..3</td>
</tr>
<tr>
<td>14. Telemetry</td>
<td>All steps</td>
<td>`metrics.jsonl`, `coherence-log.md`, cost ledger</td>
<td>FR-OBS-*, NFR-OBS-*</td>
</tr>
<tr>
<td>15. Checkpoint</td>
<td>After each Stage 2 call</td>
<td>`stop-progress.json`</td>
<td>FR-STOP-12, NFR-RELIABILITY-2</td>
</tr>
</table>
Resume from crash uses step 15's checkpoint to skip already-completed Stage 2 calls.
## 2.6 LLM Client
Thin wrapper around Anthropic SDK with three responsibilities:
- Load versioned prompts from `prompts/v{n}/` and stamp Stage 1 / Stage 2 cache prefix (FR-STOP-13, NFR-MAINT-1).
- Track per-call cost and append to the in-session cost ledger (`coherence_session_cost`, FR-OBS-6).
- **Cassette mode:** in test runs, deterministic replay of recorded API responses (BRD-4 §4.2: "cassette refresh requires explicit CI flag, no silent re-recording").
The client never sees state files — it consumes pre-built prompts and returns raw model output. Validation is in `validation`, not `llmClient`.
## 2.7 Validation Module
Five deterministic checks executed in order; first failure short-circuits and logs (FR-STOP-6, NFR-OBS-3):
1. **Format:** unified diff parses, or output is exactly `NO_PATCH_NEEDED` / `ESCALATE` / `PLAN_DISAGREES` (with reason for the latter).
2. **Apply:** `git apply --check` succeeds against current section content (read fresh per FR-STOP-15).
3. **Sanity (change-class):** deterministic recount per DD-017 (whitespace-only `-` lines ignored). Class wins over LLM-claimed (FR-STOP-6b).
4. **Line-count ratio:** `(added + removed) / original_lines > 0.40` → auto-converts to `ESCALATE`.
5. **Hallucination grep:** two-tier per DD-032/DD-047. Strict tier rejects; loose tier with ≥3 unknown tokens demotes change-class one tier (FR-STOP-7).
Language detection by file extension; v0.1 registry covers TypeScript/JavaScript, Python, Go, Rust, Java, C#, Ruby, PHP. Files of unregistered languages still get rules 1, 2, 4, 5 — only the import-line rule degrades (FR-STOP-6c).
## 2.8 Slash Commands
Each command is a thin function over the same core modules:
<table header-row="true">
<tr>
<td>Command</td>
<td>Backed by</td>
<td>Output contract</td>
</tr>
<tr>
<td>`/coherence:status`</td>
<td>`stateStore`  • `subagentTracker`  • cost ledger</td>
<td>Canonical fixed-order text (DD-055, FR-PERMISSION-5, NFR-OBS-4)</td>
</tr>
<tr>
<td>`/coherence:review` (`--estimate`)</td>
<td>`stopPipeline` mid-session</td>
<td>Same review UX as Stop; estimate mode skips Stage 2 (FR-MIDSESSION-5..6)</td>
</tr>
<tr>
<td>`/coherence:repair`</td>
<td>`stateStore` quarantine + anchor scan</td>
<td>Recovery actions per FR-PERMISSION-6</td>
</tr>
<tr>
<td>`/coherence:recover`</td>
<td>`stateStore`  • lock manager</td>
<td>Reset locks, drop progress, re-enable from `disabled` (FR-FAILURE-7)</td>
</tr>
<tr>
<td>`/coherence:doctor`</td>
<td>Capability probes</td>
<td>Writes `host-capabilities.json` (FR-INSTALL-3, FR-INSTALL-6)</td>
</tr>
<tr>
<td>`/coherence:graduate` (`--revert`)</td>
<td>Config flag in `version.json` / config</td>
<td>Toggles `mode: observe` ↔ `mode: graduated` (FR-COMMANDS-6)</td>
</tr>
<tr>
<td>`/coherence:enable-sidecars`</td>
<td>Config flag</td>
<td>Switches skill/agent metadata to sidecar fallback (FR-COMMANDS-7)</td>
</tr>
<tr>
<td>`/coherence:share-metrics --anonymized`</td>
<td>`metricsRecorder` redactor</td>
<td>Opt-in, one-shot anonymised export (DD-060, DG-6); no FR mapping — privacy surface only</td>
</tr>
</table>
Per-command design detail:
- /coherence:review — reads hook state, runs drift detector on all tracked docs, writes a drift-report block into current conversation context; read-only, no file writes.
- /coherence:repair — runs review, then offers targeted patch candidates for each drift finding; in Observe mode writes only to current conversation (no file writes); in Graduated mode applies additive patches automatically.
- /coherence:recover — full re-sync from canonical source; creates snapshot before patching; used when repair cannot resolve divergence.
- /coherence:graduate — opts the session into Graduated mode, enabling auto-apply of additive-class patches; persists mode flag in hook config.
- /coherence:enable-sidecars — provisions sidecar .coherence/ tracking files for newly onboarded docs; idempotent; no destructive writes.
## 2.9 Concurrency Model
- **Single-threaded JS event loop per Node process.**
- **Per-file advisory locks** (`<file>.lock`) for cross-session safety on shared state files (FR-FAILURE-3, FR-FAILURE-3b).
- **Bounded LLM concurrency:** Stage 2 ≤8 parallel calls (NFR-PERF-10).
- **No worker threads** in v0.1; all CPU-bound work (parsing, grep, diff apply) is sub-millisecond per call and stays in the main loop.
- Hooks are **best-effort idempotent**: any hook can be retried without side effects beyond what step 15's checkpoint allows.
## 2.10 Error Handling Strategy
<table header-row="true">
<tr>
<td>Class</td>
<td>Policy</td>
</tr>
<tr>
<td>Schema validation failure on read</td>
<td>Quarantine file, proceed with fresh state, log (FR-FAILURE-2)</td>
</tr>
<tr>
<td>Lock acquisition timeout</td>
<td>Backoff per FR-FAILURE-3b; after 3 consecutive timeouts → degraded mode (FR-FAILURE-4)</td>
</tr>
<tr>
<td>Hook handler exception</td>
<td>Caught, logged; 3rd in a session triggers crash self-disable (FR-FAILURE-6)</td>
</tr>
<tr>
<td>Git pre-flight failure</td>
<td>Skip and defer; never partial commit (FR-FAILURE-5)</td>
</tr>
<tr>
<td>LLM API failure</td>
<td>Whole Stop run defers buffer to `pending.md`; user notice (R-15)</td>
</tr>
<tr>
<td>Patch validation failure</td>
<td>Silent log to `revalidation-log.md`; never surfaced to user (FR-OBS-4)</td>
</tr>
</table>
## 2.11 Open Engineering Choices (TS-only, not BRD)
<table header-row="true">
<tr>
<td>Choice</td>
<td>Direction</td>
<td>Resolved by</td>
</tr>
<tr>
<td>ESM vs CJS</td>
<td>ESM (Node 20+)</td>
<td>Implementation PR for hookAdapters</td>
</tr>
<tr>
<td>Schema validator</td>
<td>`ajv` draft-07 (D-6)</td>
<td>TS-3 §3.2</td>
</tr>
<tr>
<td>Diff library</td>
<td>`parse-diff`  • `apply-diff` or jsdiff</td>
<td>TS-5 §5.5</td>
</tr>
<tr>
<td>YAML parser</td>
<td>`js-yaml`</td>
<td>TS-3 §3.4</td>
</tr>
<tr>
<td>Git interface</td>
<td>Shell out to `git` CLI for portability over `nodegit`/`isomorphic-git`</td>
<td>TS-6 §6.4</td>
</tr>
</table>
