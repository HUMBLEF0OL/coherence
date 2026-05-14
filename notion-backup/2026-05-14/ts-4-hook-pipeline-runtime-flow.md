<!-- url: https://www.notion.so/35b010d46a7081fdad11c61f762961af -->
<!-- id: 35b010d4-6a70-81fd-ad11-c61f762961af -->
<!-- title: TS-4 — Hook Pipeline & Runtime Flow -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 4.1 Hook Inventory
<table header-row="true">
<tr>
<td>Hook</td>
<td>Latency budget (p95)</td>
<td>LLM cost</td>
<td>Owner module</td>
</tr>
<tr>
<td>`SessionStart`</td>
<td>\< 2 s medium / \< 4 s monorepo (NFR-PERF-3)</td>
<td>0</td>
<td>`detection`, `stateStore`</td>
</tr>
<tr>
<td>`PostToolUse`</td>
<td>\< 50 ms (NFR-PERF-1)</td>
<td>\~50 tok per refresh (cap 1/buffer change)</td>
<td>`detection`, `bufferLifecycle`</td>
</tr>
<tr>
<td>`UserPromptSubmit`</td>
<td>\< 100 ms (NFR-PERF-6)</td>
<td>0</td>
<td>`detection`</td>
</tr>
<tr>
<td>`SubagentStop`</td>
<td>\< 100 ms</td>
<td>0</td>
<td>`subagentTracker`</td>
</tr>
<tr>
<td>`Stop`</td>
<td>\< 10 s typical / \< 25 s ceiling (NFR-PERF-4..5)</td>
<td>\$0.07 p50 / \$0.15 p95 (NFR-COST-1..2)</td>
<td>`stopPipeline`</td>
</tr>
<tr>
<td>`SessionEnd`</td>
<td>\< 100 ms</td>
<td>0</td>
<td>`bufferLifecycle`, `subagentTracker`</td>
</tr>
<tr>
<td>`PreCompact` (when present)</td>
<td>\< 100 ms</td>
<td>0</td>
<td>`detection`</td>
</tr>
</table>
**Universal first step in every hook:** check for `.claude/coherence/DISABLED` and `.claude/coherence/disabled`; if present, return success with no I/O, no LLM, no `additionalContext` (FR-INSTALL-7, FR-FAILURE-8). Surface once per session in `/coherence:status`.
## 4.2 SessionStart Sequence
Deterministic; no LLM. Sequencing per DD-053:
1. **Kill-switch check.** Exit early if disabled.
2. **Migration.** If `version.json` schema differs, run `migrate_v{n}_to_v{n+1}` chain (NFR-MAINT-2). On failure, enter read-only mode + upgrade prompt (FR-INSTALL-5).
3. **Anchor integrity sweep.** Scan indexed docs (per `coherence/ignore` and discovery scope). Files with errors marked **fatal-for-file** until repaired (FR-DETECT-12).
4. **`<!-- coherence-pending -->`**** finalize sweep.** Markers ≥7 days old finalize via `[coherence] finalize` commit, log to `coherence-log.md` (FR-DETECT-11).
5. **`pending.md`**** re-validation.** For each entry: re-resolve path & anchor; drop if condition no longer holds (FR-DETECT-6, FR-BUFFER-7). Reasons logged to `revalidation-log.md` (NFR-OBS-3).
6. **Assertion evaluation.** Evaluate `import_exists` predicates (TS-5 §5.7) against indexed code. Failures appended to a synthetic trigger group (FR-STOP-19, DD-054).
7. **Revert detection scan.** Scan `[coherence]` commits since previous SessionStart for ≥80% line removals; feed velocity counter (FR-DETECT-14, DD-035).
8. **`additionalContext`**** injection.** Inject high-confidence drift summary if any (DD-012 Mechanism 1 startup variant).
9. **Reset compaction caches.** Clear `last_refreshed_section_set` (FR-MIDSESSION-1b, FR-DETECT-10).
Anchor-collision detection (FR-DETECT-5) is part of step 3.
## 4.3 PostToolUse Sequence
Fires on Write / Edit / Bash. Hot path — must hold p95 \< 50 ms.
1. Kill-switch check.
2. Honour `coherence/ignore` and `.gitignore` early.
3. **Path filter.** Pure-JS glob match against indexed `watches:`. No LLM, no FS reads beyond cached doc-section index. (FR-DETECT-1, NFR-COST-3 row 1)
4. On match → acquire buffer lock (≤5 s exponential backoff, FR-FAILURE-3b) → append entry per DD-026 schema → release.
5. **Compaction detection.** Compare host-reported token count delta to previous (FR-MIDSESSION-1c). On detection: clear cached section-set, append `compaction_detected` to `metrics.jsonl`, append note to `coherence-log.md`.
6. **Silent context refresh.** If buffer non-empty AND section-set hash changed (or unflagged subagent transitioned to flagged) → return `additionalContext` with brief stale-section list (\~50 tokens, FR-MIDSESSION-1, FR-MIDSESSION-1b).
When the host does not surface token counts, fall back to a 10-minute idle heuristic for compaction; record degraded mode in `host-capabilities.json` (FR-MIDSESSION-1c).
## 4.4 UserPromptSubmit Sequence
1. Kill-switch check.
2. Detect long-agent-turn boundary: ≥60 s OR 5+ tool calls OR 5+ min user silence (FR-MIDSESSION-2).
3. Evaluate FR-MIDSESSION-3 conditions (3+ trigger groups, 15+ min since last Stop/review, post-long-turn).
4. If all true → inject `additionalContext` instructing Claude it MAY mention drift conversationally and suggest `/coherence:review` (DD-012 Mechanism 2). Claude decides if and how.
Never blocks the user prompt path (FR-MIDSESSION-4).
## 4.5 SubagentStop Sequence
1. Kill-switch check.
2. Capture provenance per FR-DETECT-17:
	- **Line-level** when host exposes `subagent_invocation_id` + line ranges.
	- **File-level fallback** otherwise (`min(5 min, same agent turn)`, FR-DETECT-8).
3. Append per-file entry (`classified: pending`) to `subagent-history.jsonl`; update `subagent-stats.json`.
4. Open the **2-message keyword classifier window** (FR-DETECT-16). Final state computed at SessionEnd.
5. If thresholds (FR-LAYERS-4) imply newly-flagged subagent, mark for next PostToolUse refresh inclusion (FR-MIDSESSION-1b).
## 4.6 Stop Sequence
The orchestrator described in TS-2 §2.5. Non-pipeline aspects only listed here:
- **Empty buffer → no-op** (FR-BUFFER-1, NFR-COST-3 row 1).
- **Single-section group → skip Stage 1** (FR-STOP-2: planner only invoked when a group contains ≥2 sections).
- **Cap defer notice** is user-visible (FR-STOP-11).
- **Review UX** template (FR-PERMISSION-\*):
```javascript
📄 coherence: 3 changes detected this session

[auto-applied]
  • CLAUDE.md#middleware — added new rate-limit middleware pattern

[needs review]
  • ARCHITECTURE.md#layers — modified (show diff)
  • skills/api-patterns — frontmatter description update (show diff)

[Accept all remaining] [Review each] [Skip]
```
Plan-derived bundles render as one row that expands to per-section diffs (FR-STOP-9). Assertion-failure entries render in a separate "Assertion failures" section with a 3-action UX and `last-verified` age (FR-PERMISSION-8, FR-PERMISSION-10).
- **Approve → commit → buffer clear** (FR-BUFFER-2, FR-PERMISSION-4).
- **Skip → buffer entries marked deferred** (FR-BUFFER-3); consecutive-defer counter increments (FR-BUFFER-6, DD-051).
- **Auto-applied additive patches** carry `<!-- coherence-pending: YYYY-MM-DD -->` for 7 days (DD-038, FR-DETECT-11) and finalize at next SessionStart.
## 4.7 SessionEnd Sequence
1. Kill-switch check.
2. Persist deferred buffer entries to `pending.md` atomically (FR-BUFFER-4).
3. Compute final subagent classifications across the session window (FR-DETECT-16) and update `subagent-stats.json`.
4. Reset session-scoped state: `cost-ledger.json` cleared.
5. Truncate `drift-buffer.json` to empty.
## 4.8 PreCompact (when host exposes it)
Clear cached `last_refreshed_section_set` and `last_refreshed_flagged_agents` so the first non-empty buffer after compaction re-injects context (FR-DETECT-10, DD-039). Two distinct fallbacks cover the case where `PreCompact` is unavailable and may both fire in the same session:
- **DD-039 wall-time fallback (30 min).** When the plugin has not seen a `PreCompact` event but the host session has been alive ≥30 minutes since the last compaction-cache reset, the cache is reset proactively as a defence against silent compactions.
- **FR-MIDSESSION-1c idle/token-delta fallback (10 min).** Surfaced from `PostToolUse` (TS-4 §4.3 step 5) when host-reported token counts are unavailable: a 10-minute idle gap on the user side triggers a compaction-detection event with `mode: time-fallback`.
Both paths emit a `compaction_detected` event in `metrics.jsonl` with `mode: time-fallback` (NFR-COST-3) and degrade gracefully when the host eventually starts surfacing `PreCompact`.
## 4.9 Buffer Lifecycle State Machine (DD-010)
```javascript
[empty]
  | PostToolUse match
  v
[pending] ——— Stop accept ———> [cleared] ——> erased
  | Stop skip
  v
[deferred]
  | next PostToolUse same session  → stays deferred (new entries append separately)
  | SessionEnd  → persisted to pending.md
  v
[persisted]
  | next SessionStart re-validation
  v
  drop (condition no longer holds)
  OR
  re-promoted to [pending] for next Stop
```
## 4.10 Mid-Session Mechanisms Summary (DD-012)
<table header-row="true">
<tr>
<td>Mechanism</td>
<td>Trigger</td>
<td>Vehicle</td>
<td>Cost</td>
</tr>
<tr>
<td>1. Silent context refresh</td>
<td>Buffer non-empty + section-set hash changed</td>
<td>`additionalContext` from PostToolUse</td>
<td>\~50 tokens / refresh</td>
</tr>
<tr>
<td>2. Conversational mention</td>
<td>3+ groups, 15+ min, post-long-turn</td>
<td>`additionalContext` from UserPromptSubmit; Claude-mediated</td>
<td>0 host-side; Claude may add a sentence</td>
</tr>
<tr>
<td>3. `/coherence:review`</td>
<td>User-initiated slash command</td>
<td>Stage 1 + Stage 2 against current buffer mid-session</td>
<td>Same as Stop, costed in `cost-ledger.json`</td>
</tr>
</table>
None of these block the agent's hot path (FR-MIDSESSION-4).
## 4.11 Canonical Selection Algorithm (FR-STOP-14)
Used by Stage 1 input prep AND by velocity defer prioritisation. Steps:
1. Compute deepest common ancestor `D` of `triggering_files` across the group.
2. **FILTER** candidate sections whose containing file is at-or-above `D` (DD-028).
3. **NEAREST-WINS** by directory distance to `D` (DD-018).
4. **DEPTH-SCORE tiebreak** per DD-016 deterministic formula (pre-computed before planner sees input).
5. Lexicographic path order final tiebreak.
Demoted user-declared canonicals are reported via FR-STOP-20 + FR-PERMISSION-9.
## 4.12 Sequencing Invariants
- **Patch source-of-truth:** Stage 2 reads section content fresh from disk at patch-generation time (FR-STOP-15). No PostToolUse snapshot is ever passed into a Stage 2 prompt.
- **No cross-group merge:** competing patches on the same section from independent groups stay separate; file-merge rejects overlap with one consolidated review note (FR-STOP-18).
- **Stage 1 honours declared canonicals absolutely** (DD-015 rule 2); else Stage 1 may demote and report (FR-STOP-20).
