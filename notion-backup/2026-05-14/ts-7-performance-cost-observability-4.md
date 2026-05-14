<!-- url: https://www.notion.so/35b010d46a7081a8bd20c60860394376 -->
<!-- id: 35b010d4-6a70-81a8-bd20-c60860394376 -->
<!-- title: 📊 TS-7 — Performance, Cost & Observability -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-7](https://www.notion.so/35b010d46a7081d98a3ad878e7e6e904). All v0.1 budgets and cap-enforcement mechanisms hold; v0.2 budgets are *partitions* of v0.1 budgets, never relaxations.
---
## 1. Latency budgets (additive)
<table header-row="true">
<tr>
<td>Surface</td>
<td>Budget</td>
<td>Enforcement</td>
<td>Gate</td>
</tr>
<tr>
<td>v0.1 PostToolUse</td>
<td>p95 \< 50 ms (inviolate, NFR-PERF-1)</td>
<td>Idle gate for trickle (FR-TRICKLE-5); SessionEnd defer for correction signal (FR-AUTHOR-12); debounced snapshot writer (DD-084)</td>
<td>PG-4</td>
</tr>
<tr>
<td>Author pipeline</td>
<td>p95 ≤ 5 s (separate from Stop)</td>
<td>Hard cap on `proposals_per_session = 3` (FR-AUTHOR-3); per-call cost ceiling check before LLM call</td>
<td>PG-1</td>
</tr>
<tr>
<td>Aggregate Stop+Author</td>
<td>p95 ≤ 15 s when proposals exist</td>
<td>Author runs strictly after Stop output commit (FR-AUTHOR-5)</td>
<td>(derived)</td>
</tr>
<tr>
<td>`state-snapshot.json` write</td>
<td>≤ 5 ms p95 isolated; 0 ms PostToolUse attribution</td>
<td>Debounced writer (DD-084) with in-process dirty bit + 5 s timer + non-blocking lock acquisition</td>
<td>PG-2 (regression-gate cell `state-snapshot write` in `tests/perf/regression-gate.test.ts`)</td>
</tr>
<tr>
<td>Trickle deep-scan</td>
<td>\< 5 ms median per SessionEnd; ≤ 100 ms cumulative per PostToolUse window (idle-gated)</td>
<td>Idle gate `trickle.idle_threshold_ms` (default 30 000 ms, bounds \[5 000, 120 000\])</td>
<td>PG-3</td>
</tr>
<tr>
<td>DD-068 hashing</td>
<td>O(1) hash + O(log n) ring-buffer lookup; within v0.1 50 ms p95</td>
<td>Pure-CPU implementation; no FS I/O on hot path</td>
<td>PG-4</td>
</tr>
<tr>
<td>File-creation similarity</td>
<td>≤ 5 ms / Write</td>
<td>Skeleton hashes computed once per file at Write and cached for the session</td>
<td>PG-4</td>
</tr>
<tr>
<td>Statusline render</td>
<td>\< 5 ms per render</td>
<td>Single atomic file read; no multi-step computation; **cancellation-safe pattern** (FR-STATUSLINE-6): `if not exists state-snapshot.json → emit empty badge; else atomic-read → parse → format`. No locks acquired by the script; no temp-files; no follow-up reads. Claude Code may cancel the render mid-flight without leaving partial output or holding shared state.</td>
<td>PG-5</td>
</tr>
</table>
## 2. Cost budget (amended)
### 2.1 Per-session ceiling
- **Per-session ceiling = v0.1 NFR-COST-1 baseline × 1.30** — single auditable top-level number (DD-085, FR-COST-N2). Config key: `cost_ceiling_multiplier = 1.30` (overridable per project, FR-COST-N4).
- **Per-feature partition of the +30% headroom**: Author ≤ 60%, Annotate ≤ 30%, Trickle ≤ 10%.
- Holds across the cassette suite under CG-1 / CG-2.
### 2.2 Enforcement
Before each Author / Annotate LLM call, `CostLedger.totalCostUsd()` is compared against the per-feature share. On overrun:
1. NO LLM call issued for the remainder of the session.
2. Emit `cost_ceiling_hit { feature, total_usd, ceiling_usd }`.
3. Emit `degraded_mode_entered` (DD-061 precedent reused).
Non-LLM work (drift detection, snapshot writer, expiry sweep) continues; **hard-kill at ceiling rejected** — it would terminate useful in-flight work.
### 2.3 Cost-ledger schema (TS-3 §2)
- `CostEntry.stage ∈ { 'stage1', 'stage2', 'author', 'annotate' }`.
- `CostEntry.prompt_version: { stage1?, stage2?, author?, annotate?: string }`.
- v0.2 entries always carry `prompt_version.author = 'v2.0'` or `prompt_version.annotate = 'v2.0'`.
## 3. Telemetry events (v0.2)
Emitted to `metrics.jsonl` (FR-OBS-N1..N5):
<table header-row="true">
<tr>
<td>Event</td>
<td>Hook</td>
<td>Payload</td>
<td>DD</td>
</tr>
<tr>
<td>`tool_invocation_signature`</td>
<td>PostToolUse (Bash/Edit/Write)</td>
<td>`signature_hash`, `kind`</td>
<td>DD-068</td>
</tr>
<tr>
<td>`user_prompt_signature`</td>
<td>UserPromptSubmit</td>
<td>`signature_hash`, `length_bucket`, `refers_to_prior`, `prior_response_id?`</td>
<td>DD-068</td>
</tr>
<tr>
<td>`agent_response_id`</td>
<td>Stop / SubagentStop</td>
<td>`response_id` (defensively hashed in `--anonymized`)</td>
<td>DD-068</td>
</tr>
<tr>
<td>`proposal_generated`</td>
<td>Author tail</td>
<td>`proposal_id`, `kind`, `cost_usd`</td>
<td>DD-088</td>
</tr>
<tr>
<td>`proposal_surfaced`</td>
<td>propose-list/show</td>
<td>`proposal_id`</td>
<td>DD-088</td>
</tr>
<tr>
<td>`proposal_listed` / `proposal_shown`</td>
<td>propose-list / propose-show</td>
<td>`proposal_id?`, `count?`</td>
<td>DD-088</td>
</tr>
<tr>
<td>`proposal_accepted`</td>
<td>propose-accept</td>
<td>`proposal_id`, `kind`, `commit_sha`</td>
<td>DD-081</td>
</tr>
<tr>
<td>`proposal_rejected`</td>
<td>propose-reject</td>
<td>`proposal_id`, `reason?`</td>
<td>DD-081</td>
</tr>
<tr>
<td>`proposal_expired`</td>
<td>SessionStart sweep</td>
<td>`proposal_id`, `fence: 'time' \| 'recurrence' \| 'ignored'`</td>
<td>DD-075</td>
</tr>
<tr>
<td>`proposal_state_transition`</td>
<td>any</td>
<td>`proposal_id`, `from`, `to`, `reason?`</td>
<td>DD-088</td>
</tr>
<tr>
<td>`proposal_validation_failed`</td>
<td>Author tail / propose-show</td>
<td>`reason: 'schema' \| 'hallucination' \| 'ignored' \| 'llm_error'`</td>
<td>DD-087</td>
</tr>
<tr>
<td>`proposal_acceptance_blocked`</td>
<td>propose-accept</td>
<td>`reason: 'name_collision'`, `existing_path_hash`</td>
<td>DD-082</td>
</tr>
<tr>
<td>`proposal_signal_observed`</td>
<td>signal detectors</td>
<td>`kind`, `would_have_fired`, ...</td>
<td>DD-076..078</td>
</tr>
<tr>
<td>`proposal_reverted`</td>
<td>propose-revert-acceptance</td>
<td>`proposal_id`, `commit_sha`</td>
<td>DD-083</td>
</tr>
<tr>
<td>`annotation_proposed`</td>
<td>Annotate tail</td>
<td>`kind`, `uses_sidecar`</td>
<td>DD-069</td>
</tr>
<tr>
<td>`annotate_invocation`</td>
<td>`/coherence:annotate`</td>
<td>`source`, `path` (locally only; hashed in `--anonymized`)</td>
<td>DD-073</td>
</tr>
<tr>
<td>`annotate_blocked`</td>
<td>`/coherence:annotate`</td>
<td>`reason: 'ignored'`</td>
<td>DD-073</td>
</tr>
<tr>
<td>`statusline_install`</td>
<td>install-statusline</td>
<td>`path`, `backup`</td>
<td>DD-070</td>
</tr>
<tr>
<td>`trickle_scan_pass`</td>
<td>PostToolUse idle</td>
<td>`duration_ms`, `files_scanned`, `entries_added`</td>
<td>DD-066</td>
</tr>
<tr>
<td>`signal_cache_pruned`</td>
<td>SessionEnd</td>
<td>`kind`, `removed`</td>
<td>DD-089</td>
</tr>
<tr>
<td>`migration_completed`</td>
<td>SessionStart</td>
<td>`from`, `to`, `duration_ms`</td>
<td>DD-080</td>
</tr>
<tr>
<td>`cost_ceiling_hit`</td>
<td>pre-LLM call</td>
<td>`feature`, `total_usd`, `ceiling_usd`</td>
<td>DD-085</td>
</tr>
</table>
All v0.2 events MUST be privacy-safe by construction: no raw command, file, or prompt content; only hashed signatures and bucketed metadata (FR-OBS-N5, NFR-PRIVACY-N1).
## 4. Status output (`/coherence:status`)
v0.2 additions surface alongside v0.1 outputs (FR-MODES-7):
- Effective mode for current `cwd` (resolved via `mode-resolver`).
- Trickle quota usage this session (FR-TRICKLE-7).
- Per-session expiry-sweep drop count (FR-PROPOSE-12).
- Proposal counts by state (queued / surfaced / accepted / rejected / expired / reverted).
- Cost-ledger split by feature (Author / Annotate / Trickle / Stage 1+2).
### 4.1 `propose-list` / `propose-show` badges (FR-PROPOSE-14)
Each proposal row in `propose-list` and the header of `propose-show` MUST render two derived badges:
- **Time-to-expire**: `min(generated_at + 14d, last_signal_seen + 7d) − now`, formatted as `Nd Nh` (or `expired`). Derived from the three DD-075 fences; the strictest fence wins.
- **Ignore-count**: `consecutive_ignored / proposal_consecutive_ignore_threshold` (e.g. `3/5`). Reset to 0 only on view via `propose-list` / `propose-show` or terminal action; signal recurrence does NOT reset (OQ-v2-22).
Both badges are computed read-only at render time; no schema changes.
### 4.2 Slash-command registration (FR-COMMANDS)
All v0.2 commands listed in BRD-2 §10 are wired in the plugin's `plugin.json` under the `commands` section. Each command entry pins: `name`, `description`, `arguments` (typed positional + flag set), `non_interactive: true` (slash-command constraint), and emits a per-action metric event (see §3) on every invocation. `plugin.json` is the registration source of truth — `/coherence:doctor` cross-checks installed commands against `plugin.json` and warns on mismatch.
## 5. Storage budgets
- DD-068 events combined: ≤ ≈13 MB additional disk under v0.1 90-day rolling retention (FR-OBS-N1e, NFR-PRIVACY-N4). Bound enforced by v0.1's existing rotation policy; no new code path required.
- `proposal-cache.json` bounded by `proposals_per_session ≤ 3` and DD-075 expiry fences.
- `signal-cache.json` bounded by `maxItems` 500 / 500 / 200 + 7-day prune (FR-AUTHOR-13..14).
- `state-snapshot.json` ≈ 200 B.
## 6. Regression gates
New cells under `tests/perf/regression-gate.test.ts`:
- `state-snapshot write` (PG-2): isolated p95 ≤ 5 ms, PostToolUse attribution = 0 ms.
- `signature-hash hot path` (PG-4): adds \< 1 ms p95 to PostToolUse vs. v0.1 baseline.
- `file-creation similarity` (PG-4): ≤ 5 ms / Write.
- `trickle median budget` (PG-3): \< 5 ms median SessionEnd impact.
- `author pipeline p95` (PG-1): ≤ 5 s on the v0.2 reference corpus.
- `statusline render` (PG-5): \< 5 ms via cassette harness.
## 7. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>FRs</td>
<td>NFRs</td>
<td>DDs</td>
</tr>
<tr>
<td>§1 Latency</td>
<td>FR-AUTHOR-3..5, FR-TRICKLE-5..6, FR-STATUSLINE-7</td>
<td>NFR-PERF-N1..N6</td>
<td>DD-066, DD-067, DD-076..078, DD-084</td>
</tr>
<tr>
<td>§2 Cost</td>
<td>FR-COST-N1..N6</td>
<td>NFR-COST-N1..N2</td>
<td>DD-085, DD-091</td>
</tr>
<tr>
<td>§3 Telemetry</td>
<td>FR-OBS-N1..N5, FR-PROPOSE-13, FR-PRIVACY-N1..N4</td>
<td>NFR-PRIVACY-N1..N4, NFR-OBS-N1..N2</td>
<td>DD-068, DD-075, DD-080, DD-082, DD-085, DD-086, DD-088</td>
</tr>
<tr>
<td>§4 Status</td>
<td>FR-MODES-7, FR-PROPOSE-12, FR-PROPOSE-14, FR-TRICKLE-7, FR-COMMANDS, FR-STATUSLINE-6</td>
<td>—</td>
<td>DD-074, DD-075, DD-081</td>
</tr>
<tr>
<td>§6 Regression gates</td>
<td>(verify FRs above)</td>
<td>NFR-PERF-N1..N6</td>
<td>DD-066..084</td>
</tr>
</table>
