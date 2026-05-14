<!-- url: https://www.notion.so/35b010d46a70812885eae82db682b9f8 -->
<!-- id: 35b010d4-6a70-8128-85ea-e82db682b9f8 -->
<!-- title: ⏱️ TS-4 — Hook Pipeline & Runtime Flow -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-4](https://www.notion.so/35b010d46a7081fdad11c61f762961af). v0.2 introduces no new hooks; per-hook handler responsibilities are extended.
---
## 1. SessionStart
> **Note (TS-introduced ordering).** BRD-2 / BRD-4 do not pin the SessionStart sub-step ordering. The sequence below is a TS recommendation; the **only** hard ordering constraints are: (a) migration runs before any reader of v2 schemas, (b) `responseCorrelation` cache clear runs before the first `UserPromptSubmit` peek, (c) state-snapshot bootstrap (step 7) runs after migration and after mode-resolve.
Order of operations at SessionStart (v0.2 additions in **bold**):
1. v0.1 init (state-store open, lock-manager init, host-capabilities probe).
2. **Migration sweep.** If `version.json.schema_version < 2`, run `src/state/migrate/v1_to_v2.ts` exactly once: bump version, widen enums, create the five new state files with `schema_version: 2`, append previous version into `prior_versions[]`. Quarantine-and-continue on any corrupt source file (FR-FAILURE-N1..N2).
3. **Proposal expiry sweep.** Walk `proposal-cache.json.entries`; transition to `expired` any entry triggering DD-075 fences: `now − generated_at ≥ 14 d`, OR signal hash absent from `metrics.jsonl` last 7 d, OR `consecutive_ignored ≥ proposal_consecutive_ignore_threshold` (default 5). Log to `coherence-log.md`; emit `proposal_expired` per drop. (FR-PROPOSE-9, FR-PROPOSE-12)
4. v0.1 re-validation (e.g. anchor index rebuild).
5. **`responseCorrelation`**** cache cleared.** First `user_prompt_signature` after SessionStart MUST emit `prior_response_id: null` even when a prior session published one (FR-OBS-N2).
6. **`mode-resolver`**** primes its per-session cache** from `graduation.json`.
7. **Initial ****`state-snapshot.json`**** write** (post-migration, post-mode-resolve) so cold-session `bin/coherence-statusline.*` invocations never read a missing file (TS-3 §3.5 first-snapshot bootstrap).
## 2. UserPromptSubmit
v0.2 additions (no synchronous LLM work):
- Compute `signature_hash` for the prompt body via `signatureHash`.
- Compute `length_bucket` (FR-OBS-N1c): `sm < 512`, `md < 2048`, `lg < 8192`, `xl ≥ 8192`.
- Compute `refers_to_prior`: case-insensitive regex over first 64 chars (FR-OBS-N1d).
- Peek (not consume) the most recent `agent_response_id` to populate `prior_response_id` (FR-OBS-N3).
- Emit `user_prompt_signature { signature_hash, length_bucket, refers_to_prior, prior_response_id? }` to `metrics.jsonl`. (DD-068)
- No file mutation.
## 3. PostToolUse (Bash / Edit / Write only)
`Read` is excluded (FR-OBS-N1). Order on the hot path is engineered to stay within v0.1's 50 ms p95 budget (NFR-PERF-1, NFR-PERF-N5):
1. `signatureHash` of the normalised invocation (Bash normalisation FR-OBS-N1a, Edit/Write template FR-OBS-N1b). Pure CPU, O(1) hash.
2. Emit `tool_invocation_signature` to `metrics.jsonl`.
3. **Bash branch:** push hash into the bash-repetition ring buffer; if count ≥ 3 in 30 min, **enqueue an Author-pipeline candidate for post-Stop** (do not call LLM here).
4. **Edit/Write branch:** compute file-creation skeleton hash + import-set + heading hierarchy (≤ 5 ms / Write, NFR-PERF-N5); push into `signal-cache.file_creation`; if count ≥ 3 with locality + similarity match, **enqueue an Author-pipeline candidate for post-Stop**.
5. v0.1 detection logic (drift detection, attribution).
6. Set `state-snapshot` dirty bit (in-process; no FS I/O).
7. **Idle gate.** If no buffer write in last `trickle.idle_threshold_ms` (default 30 000 ms), invoke trickle-scanner for one bounded pass (FR-TRICKLE-5) up to `trickle_entries_per_session ≤ 20` (FR-TRICKLE-4). Trickle entries write to `drift-buffer.json` with `source: 'trickle_deep_scan'`, `confidence: low` (FR-TRICKLE-3).
8. Snapshot writer flush check: if dirty AND ≥ 5 s since last flush AND `state-snapshot` lock acquired non-blocking, write `state-snapshot.json`. Otherwise leave dirty (DD-084, FR-STATUSLINE-7).
## 4. Stop / SubagentStop
**Author pipeline has two entry points** (Stop and SessionEnd §5) sharing one set of budgets: `proposals_per_session ≤ 3` and Author cost share ≤ 60% of the +30% headroom (DD-085) apply across both. Stop dispatches Author for `bash_repetition` and `file_creation` candidates; SessionEnd dispatches Author for `agent_correction` candidates only (FR-AUTHOR-12 defers correction-signal computation off the PostToolUse hot path).
Order of operations:
1. **v0.1 healing pipeline runs first and unchanged** (Stage 1 plan → Stage 2 patches → commit). All v0.1 latency / cost guarantees preserved.
2. Emit `agent_response_id { response_id }` (defensively hashed in `--anonymized` output, FR-PRIVACY-N1).
3. Update `responseCorrelation` cache with `lastResponseId` (consumed by next `UserPromptSubmit` peek).
4. **Author pipeline runs after the Stop output is committed** — entry-point #1 (bash_repetition + file_creation candidates only). Failure isolation: a fault in the Author pipeline does NOT corrupt the v0.1 healing UX already presented (FR-AUTHOR-5).
5. **Forced snapshot flush.**
Author pipeline flow (per FR-AUTHOR-1..5, runs only when mode ∈ \{author\} for the relevant scope):
```javascript
for each enqueued signal in this session WHERE kind ∈ {bash_repetition, file_creation}:
  pre-check: schema-validity? coherence/ignore-respect? name-collision pre-check?
    → reject candidate before it lands in proposal-cache.json (generate-time validation)
  invoke proposer (slash_command | skill | agent) via prompts/v2/author/<kind>
  validate result against proposal.schema.json (DD-087)
  hallucination grep (TS-5)
  cost-ledger update with stage='author', prompt_version.author='v2.0'
  if cost > per-feature partition: emit cost_ceiling_hit; enter no-LLM mode for remainder of session
  else: persist proposal-cache entry (queued) + on-disk artifact
```
`agent_correction` candidates are intentionally excluded from the Stop dispatch — they are computed at SessionEnd (§5) per FR-AUTHOR-12, then run through the same pipeline tail under entry-point #2.
Per-session cap: `proposals_per_session ≤ 3` (FR-AUTHOR-3). Stage 1 (planner) is **not** invoked in v0.2-alpha; one proposal per signal (FR-AUTHOR-2).
## 5. SessionEnd
1. **Agent-correction sweep** over the session's `SubagentAttribution` records and Edit/Write history (FR-AUTHOR-12, deferred off the PostToolUse hot path per NFR-PERF-N6):
	- For each Edit/Write that targets a file in `invocation.files_touched`, falls within 5 min of the agent's last touch, and modifies a line set whose `(lines_added + lines_removed)` ≥ 20% of the agent invocation's aggregate → record correction.
	- When ≥ 3 corrections target the same `agent_name` within a 7-day rolling window → enqueue an Author-pipeline candidate of `kind = agent`.
	- **Author pipeline entry-point #2.** Run the Author pipeline tail (§4) for these enqueued candidates (filtered to `kind = agent_correction`), sharing the same `proposals_per_session ≤ 3` and Author cost-share budgets already partly consumed at Stop.
2. **Signal-cache prune.** Drop entries with `last_seen < now − 7d`; emit `signal_cache_pruned { kind, removed }` (FR-AUTHOR-14).
3. **`responseCorrelation`**** cache cleared** to prevent cross-session leakage (FR-OBS-N2).
4. Forced `state-snapshot.json` flush.
5. v0.1 SessionEnd work runs unchanged (rotation policy, summary).
## 6. Trickle pass internals
> **Note (TS-introduced selection policy).** DD-066 mandates an idle-gated, bounded-pass scanner but does **not** specify the file-selection policy. The "small batch from v0.1 anchor index, not-recently-touched" approach below is a TS recommendation; implementation PRs MAY refine.
```javascript
if now − last_buffer_write < idle_threshold_ms: skip
if entries_this_session >= per_session_cap: skip
select a small batch of not-recently-touched files from the v0.1 anchor index
for each file (PathFilter must allow):
  compute a low-cost drift heuristic
  if heuristic positive: append BufferEntry { source: 'trickle_deep_scan', confidence: low, ... }
emit trickle_scan_pass { duration_ms, files_scanned, entries_added }
update scan-cache/state.json
```
Median budget impact MUST be \< 5 ms; verified by PG-3 (NFR-PERF-N3).
## 7. Buffer lifecycle invariants
- `BufferEntry.source` enum widened additively. Trickle entries default to `confidence: low`, inheriting v0.1 FR-STOP-21 handling at Stop (FR-TRICKLE-3).
- All buffer writes go through StateStore atomic-write + lock-manager (NFR-RELIABILITY-N1).
## 8. Failure semantics
<table header-row="true">
<tr>
<td>Failure</td>
<td>Behaviour</td>
<td>DD</td>
</tr>
<tr>
<td>Migration corrupt input</td>
<td>Quarantine corrupt/old file, write fresh default, log, continue.</td>
<td>DD-080, FR-FAILURE-N2</td>
</tr>
<tr>
<td>`proposal-cache.json` illegal transition</td>
<td>Raise `ProposalStateError`, quarantine the cache file (mirrors `StateStore.read`).</td>
<td>DD-088, FR-FAILURE-N3</td>
</tr>
<tr>
<td>Author pipeline error</td>
<td>v0.1 Stop output already committed; log, do not surface error in chat; continue session.</td>
<td>FR-AUTHOR-5</td>
</tr>
<tr>
<td>Cost-ceiling overrun</td>
<td>Enter no-LLM mode for remainder of session; emit `cost_ceiling_hit { feature, total_usd, ceiling_usd }`.</td>
<td>DD-085, FR-COST-N3</td>
</tr>
<tr>
<td>`proposal.schema.json` validation failure</td>
<td>Drop the proposal; emit `proposal_validation_failed { reason }`.</td>
<td>FR-PROPOSE-13, DD-087</td>
</tr>
<tr>
<td>Trickle scan failure</td>
<td>Skip the pass; do not retry within the same hook; log and continue.</td>
<td>DD-066</td>
</tr>
</table>
## 9. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>FRs</td>
<td>NFRs</td>
<td>DDs</td>
</tr>
<tr>
<td>§1 SessionStart</td>
<td>FR-FAILURE-N1..N2, FR-PROPOSE-9, FR-PROPOSE-12, FR-OBS-N2, FR-MODES-3</td>
<td>NFR-RELIABILITY-N1</td>
<td>DD-080, DD-075, DD-068, DD-074</td>
</tr>
<tr>
<td>§2 UserPromptSubmit</td>
<td>FR-OBS-N1..N1d, FR-OBS-N3</td>
<td>NFR-PRIVACY-N1, NFR-PERF-N5</td>
<td>DD-068</td>
</tr>
<tr>
<td>§3 PostToolUse</td>
<td>FR-OBS-N1, FR-AUTHOR-6..9, FR-TRICKLE-1..5, FR-STATUSLINE-7</td>
<td>NFR-PERF-N4..N6</td>
<td>DD-068, DD-076, DD-077, DD-066, DD-084</td>
</tr>
<tr>
<td>§4 Stop</td>
<td>FR-AUTHOR-1..5, FR-OBS-N3, FR-COST-N3</td>
<td>NFR-PERF-N1, NFR-COST-N1..N2</td>
<td>DD-067, DD-068, DD-085</td>
</tr>
<tr>
<td>§5 SessionEnd</td>
<td>FR-AUTHOR-10..14, FR-OBS-N2</td>
<td>NFR-PERF-N6</td>
<td>DD-078, DD-089</td>
</tr>
<tr>
<td>§6 Trickle</td>
<td>FR-TRICKLE-1..7</td>
<td>NFR-PERF-N3</td>
<td>DD-066</td>
</tr>
<tr>
<td>§8 Failure</td>
<td>FR-FAILURE-N1..N3, FR-PROPOSE-13</td>
<td>NFR-RELIABILITY-N1..N2</td>
<td>DD-080, DD-085, DD-087, DD-088</td>
</tr>
</table>
