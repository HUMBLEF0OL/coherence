<!-- url: https://www.notion.so/35b010d46a7081d98a3ad878e7e6e904 -->
<!-- id: 35b010d4-6a70-81d9-8a3a-d878e7e6e904 -->
<!-- title: TS-7 — Performance, Cost & Observability -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 7.1 Latency Budgets
All p95 unless noted. Measured by `tests/perf/` harness across small / medium / large / monorepo reference codebases. CI fails any merge with \> 30% regression (PG-\* gates).
<table header-row="true">
<tr>
<td>Hook / surface</td>
<td>Budget</td>
<td>Source</td>
</tr>
<tr>
<td>PostToolUse</td>
<td>\< 50 ms typical</td>
<td>NFR-PERF-1, PG-1</td>
</tr>
<tr>
<td>PostToolUse worst case</td>
<td>Single-hook lock-wait ≤5 s; degraded mode after 3 consecutive timeouts</td>
<td>NFR-PERF-2</td>
</tr>
<tr>
<td>SessionStart</td>
<td>\< 2 s medium / \< 4 s monorepo</td>
<td>NFR-PERF-3, PG-2</td>
</tr>
<tr>
<td>Stop typical (≤12 sections)</td>
<td>\< 10 s</td>
<td>NFR-PERF-4, PG-3</td>
</tr>
<tr>
<td>Stop ceiling (36 sections, 8 concurrent Stage 2)</td>
<td>\< 25 s</td>
<td>NFR-PERF-5, PG-4</td>
</tr>
<tr>
<td>UserPromptSubmit / SubagentStop / SessionEnd / PreCompact</td>
<td>\< 100 ms</td>
<td>NFR-PERF-6</td>
</tr>
<tr>
<td>`/coherence:status`</td>
<td>\< 250 ms</td>
<td>NFR-PERF-7</td>
</tr>
<tr>
<td>Resident memory</td>
<td>\< 50 MB p95 / \< 80 MB p99</td>
<td>NFR-PERF-9</td>
</tr>
<tr>
<td>Install size</td>
<td>\< 10 MB</td>
<td>NFR-PERF-8</td>
</tr>
<tr>
<td>Stage 2 max concurrency</td>
<td>≤8</td>
<td>NFR-PERF-10</td>
</tr>
</table>
Cap enforcement (TS-5 §5.6) is the primary mechanism for holding Stop within budget. Defer overflow to `pending.md` rather than blow caps.
## 7.2 Cost Budgets
<table header-row="true">
<tr>
<td>Scenario</td>
<td>Target</td>
<td>Source</td>
</tr>
<tr>
<td>Per-Stop session p50</td>
<td>≤ \$0.07</td>
<td>NFR-COST-1</td>
</tr>
<tr>
<td>Per-Stop session p95</td>
<td>≤ \$0.15</td>
<td>NFR-COST-2</td>
</tr>
<tr>
<td>PostToolUse silent context refresh</td>
<td>\~50 tokens / refresh; **capped at 1 per buffer change**</td>
<td>NFR-COST-3</td>
</tr>
<tr>
<td>Mid-session `/coherence:review`</td>
<td>Costed and surfaced before run via `--estimate`</td>
<td>NFR-COST-4</td>
</tr>
<tr>
<td>Cost telemetry</td>
<td>Recorded in `metrics.jsonl` per Stop</td>
<td>NFR-COST-5</td>
</tr>
<tr>
<td>Prompt-cache assumption</td>
<td>\~70% input-token savings on cache hits within 5-min window</td>
<td>NFR-COST-6, DD-057</td>
</tr>
</table>
Cost budget enforcement points:
- Hard caps in TS-5 §5.6 (FR-STOP-10).
- `cost-ledger.json` aggregates session spend across `/coherence:review` invocations and the next Stop (FR-OBS-6).
- `metrics.jsonl` records per-Stop cost event (NFR-COST-5).
## 7.3 Observability Surfaces
<table header-row="true">
<tr>
<td>Surface</td>
<td>Format</td>
<td>Owner</td>
<td>Source</td>
</tr>
<tr>
<td>`coherence-log.md`</td>
<td>Newest-first Markdown, references git refs only, no inline diffs</td>
<td>`stateStore`</td>
<td>FR-OBS-1, DD-052, NFR-OBS-1</td>
</tr>
<tr>
<td>`metrics.jsonl`</td>
<td>Append-only JSONL, 90-day rolling, summarised to `metrics-summary.json`</td>
<td>`metricsRecorder`</td>
<td>FR-OBS-2, DD-060, NFR-OBS-2</td>
</tr>
<tr>
<td>`revalidation-log.md`</td>
<td>(a) DD-029 SessionStart entry-drop reasons (b) Stage 2 validation failures with check identifier + payload</td>
<td>`stateStore`  • `validation`</td>
<td>FR-OBS-4, NFR-OBS-3</td>
</tr>
<tr>
<td>`subagent-history.jsonl`</td>
<td>One JSON line per file modified by subagent</td>
<td>`subagentTracker`</td>
<td>FR-DETECT-17</td>
</tr>
<tr>
<td>`subagent-stats.json`</td>
<td>Rolling window aggregates</td>
<td>`subagentTracker`</td>
<td>FR-OBS-5, FR-LAYERS-3..4</td>
</tr>
<tr>
<td>`cost-ledger.json`</td>
<td>Session-scoped cumulative spend</td>
<td>`llmClient`  • Stop</td>
<td>FR-OBS-6</td>
</tr>
<tr>
<td>`observations.md`</td>
<td>Low-confidence findings + canonical demotions</td>
<td>`stopPipeline`</td>
<td>FR-PERMISSION-9, FR-STOP-21</td>
</tr>
<tr>
<td>Statusline badge</td>
<td>`[🧭 N]` non-empty buffer; `[🧭 ⚠]` degraded; hidden empty</td>
<td>`slashCommands` (status producer)</td>
<td>FR-PERMISSION-7</td>
</tr>
</table>
All timestamps are ISO-8601 UTC (NFR-OBS-5).
## 7.4 `/coherence:status` Canonical Output (DD-055, FR-PERMISSION-5, NFR-OBS-4)
Fixed-order, diff-stable text. Conditional sections appear only when relevant.
```javascript
coherence v0.1.0   mode: observe   schema: 1
host-capabilities: line-level
[KILL] Plugin disabled via kill-switch sentinel        # if DISABLED present
[CRASH] Plugin auto-disabled (3 hook exceptions); see disabled file

buffer:
  pending: 4    deferred: 1
recent activity (last 5):
  - 2026-05-09T08:14Z apply CLAUDE.md#middleware-rate-limit (additive)
  - ...
subagent stats (last 50 invocations / per agent):
  test-author    accepted=42 edited=6 discarded=2  trend: stable
  refactor-bot   accepted=18 edited=5 discarded=27 trend: shift -22pp ⚠
  doc-writer     trend: insufficient_data

velocity:
  ARCHITECTURE.md#layers  reverts=1/2  consec_defer=0
  CLAUDE.md#middleware    consec_defer=2/3

coherence_session_cost:
  stage1_calls=2 stage2_calls=7 in=11823 out=1421 USD~$0.062
  reviews=1
```
Canonical fixed-order: header → capabilities → sentinels → buffer → recent activity → subagent stats → velocity → cost. Conditional rows omitted when empty. The sidecar fallback state is conveyed via `host-capabilities: line-level [sidecars]` only when `/coherence:enable-sidecars` is active; otherwise the capabilities row carries no sidecar token.
## 7.5 Telemetry Event Catalogue
Events emitted to `metrics.jsonl` (FR-OBS-2):
<table header-row="true">
<tr>
<td>Event</td>
<td>Payload (key fields)</td>
<td>Notes</td>
</tr>
<tr>
<td>`patch_proposed`</td>
<td>section_ref, change_class, group_id, prompt_version</td>
<td>one per Stage 2 success; `prompt_version` per DD-057</td>
</tr>
<tr>
<td>`patch_applied`</td>
<td>section_ref, commit_sha, change_class, prompt_version</td>
<td>one per commit</td>
</tr>
<tr>
<td>`patch_reverted`</td>
<td>section_ref, original_commit_sha, revert_commit_sha</td>
<td>from FR-DETECT-14</td>
</tr>
<tr>
<td>`patch_deferred`</td>
<td>section_ref, reason</td>
<td>reason = skipped / cap / lock / api</td>
</tr>
<tr>
<td>`hallucination_grep_result`</td>
<td>tier, decision (accept / reject / demote), prompt_version</td>
<td>per validation step 5</td>
</tr>
<tr>
<td>`cost_per_stop`</td>
<td>stage1_calls, stage2_calls, in_tokens, out_tokens, usd, prompt_version</td>
<td>per Stop</td>
</tr>
<tr>
<td>`compaction_detected`</td>
<td>mode (token-delta / time-fallback)</td>
<td>per FR-MIDSESSION-1c / DD-039</td>
</tr>
<tr>
<td>`degraded_mode_entered`</td>
<td>reason (lock_timeouts / api / disk)</td>
<td>per session, at most once</td>
</tr>
<tr>
<td>`kill_switch_seen`</td>
<td>kind (manual / auto), at_session_start?</td>
<td>per session</td>
</tr>
<tr>
<td>`subagent_classification`</td>
<td>subagent_id, final_state, file_count</td>
<td>per SubagentStop after window closes</td>
</tr>
</table>
Events sourced from an LLM call carry `prompt_version: { stage1: <int>, stage2: <int> }` per DD-057. No raw code content; section refs and IDs only (NFR-PRIVACY-4).
## 7.6 Sharing Telemetry (Opt-In)
`/coherence:share-metrics --anonymized` (documented in DG-6; backed by DD-060; not enumerated in BRD-2 FR-COMMANDS — privacy surface only):
- Drops project-identifying paths; replaces section refs with anonymous IDs.
- One-shot, per-invocation; never background.
- User confirms before any network egress.
- v0.1 ships the command and the redaction routine; the receiving endpoint is out of v0.1 scope (could be a local file write or an opt-in HTTPS POST documented in DG-6).
## 7.7 Performance Harness Design (DD-059)
- `tests/perf/` directory with four reference codebases: `small`, `medium`, `large`, `monorepo`.
- Each fixture seeds a representative `.claude/coherence/` state and runs each hook in isolation against synthetic events.
- Harness records p50/p95/p99 latencies and resident memory; CI compares against the previous green run baseline; failure if any p95 regresses \> 30% on any cell.
- Stop ceiling test forces 36 sections across 3 trigger groups with 8 concurrent Stage 2 calls (cassette mode) to validate NFR-PERF-5.
## 7.8 Maintainability (NFR-MAINT)
<table header-row="true">
<tr>
<td>Concern</td>
<td>Rule</td>
</tr>
<tr>
<td>Prompts</td>
<td>Versioned `prompts/v{n}/`; bumping n requires QG-1/2/3 green (NFR-MAINT-1)</td>
</tr>
<tr>
<td>State-file schemas</td>
<td>`migrate_v{n}_to_v{n+1}` chain at SessionStart on version mismatch (NFR-MAINT-2)</td>
</tr>
<tr>
<td>Public types</td>
<td>`BufferEntry`, `CoherencePlan`, `Patch`, `HostCapabilities`, `ChangeClass`, `SectionRef` exported and stable across MINOR (NFR-MAINT-3)</td>
</tr>
<tr>
<td>Coverage</td>
<td>≥80% non-LLM modules; LLM-call sites covered by fixture replay (NFR-MAINT-4)</td>
</tr>
</table>
## 7.9 Internationalization
- v0.1 UI strings English-only (NFR-I18N-1).
- All file content handled as UTF-8 throughout; non-ASCII safe (NFR-I18N-2).
