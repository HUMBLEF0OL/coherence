<!-- url: https://www.notion.so/35b010d46a7081b284d5e2c645ed6e5f -->
<!-- id: 35b010d4-6a70-81b2-84d5-e2c645ed6e5f -->
<!-- title: 📐 BRD-3 — Non-Functional Requirements -->
**Parent:** [📘 BRD](https://www.notion.so/35b010d46a7081718781cd2cb908ac52) · **Status:** Draft 1 · 2026-05-09
> Inherits **all** v0.1 NFRs unchanged unless explicitly amended below. New ceilings are *partitions* of v0.1 budgets, not relaxations.
---
## 1. NFR-PERF (additive)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>NFR-PERF-N1</td>
<td>Author-pipeline p95 latency ≤ **5 s**, accounted separately from v0.1 NFR-PERF-4 (Stop p95 ≤ 10 s). Aggregate Stop+Author p95 ≤ 15 s when proposals exist.</td>
<td>DD-067</td>
</tr>
<tr>
<td>NFR-PERF-N2</td>
<td>Statusline render overhead \< **5 ms** per render.</td>
<td>Overview success metric</td>
</tr>
<tr>
<td>NFR-PERF-N3</td>
<td>Trickle deep-scan adds \< **5 ms** median to SessionEnd budget; ≤ **100 ms** cumulative per PostToolUse window (gated by idle detection).</td>
<td>DD-066, Overview</td>
</tr>
<tr>
<td>NFR-PERF-N4</td>
<td>`state-snapshot.json` write ≤ **5 ms p95 isolated**, with **0 ms attributed** to PostToolUse (verified by new regression-gate cell `state-snapshot write` in `tests/perf/regression-gate.test.ts`).</td>
<td>DD-084</td>
</tr>
<tr>
<td>NFR-PERF-N5</td>
<td>DD-068 signature hashing on PostToolUse hot path: O(1) hash + O(log n) ring-buffer lookup, within v0.1 50 ms p95 PostToolUse budget. File-creation similarity hashing ≤ 5 ms / Write.</td>
<td>DD-076, DD-077</td>
</tr>
<tr>
<td>NFR-PERF-N6</td>
<td>v0.1 NFR-PERF-1 (PostToolUse 50 ms p95) is **inviolate** — Author-mode work that would risk regression MUST run at SessionEnd or be deferred (e.g. agent-correction signal computation per FR-AUTHOR-12).</td>
<td>DD-078, DD-084</td>
</tr>
</table>
## 2. NFR-COST (amended)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>NFR-COST-N1</td>
<td>Per-session cost ceiling = v0.1 baseline × **1.30** (single auditable top-level number). Per-feature allocation: Author ≤ 60%, Annotate ≤ 30%, Trickle ≤ 10% of the +30% headroom.</td>
<td>DD-085</td>
</tr>
<tr>
<td>NFR-COST-N2</td>
<td>On ceiling overrun the plugin transitions to **no-LLM mode** for the remainder of the session (graceful degradation, not hard kill). Inherits v0.1 DD-061 degraded-mode precedent. *Hard-kill at ceiling rejected* — it would terminate useful in-flight non-LLM work (drift detection, snapshot writer, expiry sweep); degraded-mode entry is the safer choice.</td>
<td>DD-085</td>
</tr>
</table>
## 3. NFR-PRIVACY (additive)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>NFR-PRIVACY-N1</td>
<td>All v0.2 telemetry events MUST be privacy-safe by construction (no raw command, file, or prompt content). DD-068 hashing scheme (SHA-256 / 12-hex / 48-bit) MUST achieve birthday-bound collision probability \< 1.8 × 10⁻⁷ on a 10 000-entry corpus, verified by a fixture-driven 10 k-entry collision-rate test.</td>
<td>DD-068</td>
</tr>
<tr>
<td>NFR-PRIVACY-N2</td>
<td>`coherence/ignore` is the **single** privacy boundary; per-doc Annotate (`/coherence:annotate <path>`) MUST refuse on ignored paths (FR-ANNOTATE-8). No per-feature opt-out list shall bypass this gate.</td>
<td>DD-073</td>
</tr>
<tr>
<td>NFR-PRIVACY-N3</td>
<td>Cross-session leakage of `lastResponseId` is forbidden (FR-OBS-N2).</td>
<td>DD-068</td>
</tr>
<tr>
<td>NFR-PRIVACY-N4</td>
<td>**DD-068 storage budget**: combined disk footprint of `tool_invocation_signature`, `user_prompt_signature`, and `agent_response_id` events MUST stay within ≈ **13 MB** additional disk under v0.1's 90-day rolling retention window. Bound is enforced by v0.1's existing rotation policy; no new code path required.</td>
<td>DD-068</td>
</tr>
</table>
## 4. NFR-RELIABILITY (additive)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>NFR-RELIABILITY-N1</td>
<td>All five new v0.2 state files (`graduation.json`, `proposal-cache.json`, `signal-cache.json`, `scan-cache/state.json`, `state-snapshot.json`) MUST be registered in `SCHEMA_NAMES` / `FILE_TO_SCHEMA` and participate in v0.1 atomic-write, lock-manager, and quarantine-on-corruption semantics.</td>
<td>DD-080</td>
</tr>
<tr>
<td>NFR-RELIABILITY-N2</td>
<td>The proposal state machine (DD-088) is closed: only the listed transitions are legal. `state_history` is append-only.</td>
<td>DD-088</td>
</tr>
<tr>
<td>NFR-RELIABILITY-N3</td>
<td>Lock policy: a single `signal-cache` lock guards `signal-cache.json`; a single `state-snapshot` lock guards `state-snapshot.json`. Per-kind contention inside `signal-cache` is negligible at the rates DD-076 / DD-077 / DD-078 specify.</td>
<td>DD-089, DD-084</td>
</tr>
</table>
## 5. NFR-OBS (additive)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>NFR-OBS-N1</td>
<td>Every accepted proposal MUST land as a single `[coherence] accept proposal <id>` git commit. Reverts MUST land as `[coherence-revert]` commits picked up by the unmodified v0.1 `revertDetect`. Audit trail integrity (NFR-OBS-1 inherited) is preserved end-to-end.</td>
<td>DD-081, DD-083</td>
</tr>
<tr>
<td>NFR-OBS-N2</td>
<td>`proposal-cache.json.state_history` is append-only and provides per-proposal lifecycle audit comparable to `coherence-log.md` for healing patches.</td>
<td>DD-088</td>
</tr>
</table>
## 6. NFR-COMPAT (additive)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>NFR-COMPAT-N1</td>
<td>v0.2 plugin MUST honour v0.1 cached `host-capabilities.json` probes (fields are additive and optional). `additionalProperties: false` is preserved — open-typed extension is forbidden.</td>
<td>DD-090</td>
</tr>
<tr>
<td>NFR-COMPAT-N2</td>
<td>New optional `host-capabilities.json` fields: `url_scheme_handler` (`'osc8' \| 'osc52' \| 'plain'`), `statusline_install_path` (`string`), `subagent_invocation_id_emitted` (`boolean`; defaults to `subagent_attribution` value when absent for back-compat). The pre-existing v0.1 field `frontmatter_preserves_unknown_keys` is **unchanged** and continues to drive the DD-069 sidecar fallback for skill/agent annotation.</td>
<td>DD-090, DD-069</td>
</tr>
<tr>
<td>NFR-COMPAT-N3</td>
<td>Workspace-trust prompt for `/coherence:install-statusline` is inherited from Claude Code; no Coherence-side handling needed.</td>
<td>DD-070</td>
</tr>
</table>
## 7. NFR-MAINT (additive)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>NFR-MAINT-N1</td>
<td>DD-076/077/078 numerical thresholds encoded as `THRESHOLD_DEFAULTS` constants overridable via `coherence/config.json`. v0.2.1 calibration patch is therefore a constants-only change — **no schema bump**.</td>
<td>DD-092</td>
</tr>
<tr>
<td>NFR-MAINT-N2</td>
<td>`prompts/v1/` and `prompts/v2/` ship side-by-side. Stage-1 / Stage-2 prompts and contracts are **unchanged** between v0.1 and v0.2.</td>
<td>DD-091</td>
</tr>
</table>
