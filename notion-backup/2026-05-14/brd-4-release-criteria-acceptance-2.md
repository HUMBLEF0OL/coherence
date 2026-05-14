<!-- url: https://www.notion.so/35b010d46a7081199331dda1062fc202 -->
<!-- id: 35b010d4-6a70-8119-9331-dda1062fc202 -->
<!-- title: ✅ BRD-4 — Release Criteria & Acceptance -->
**Parent:** [📘 BRD](https://www.notion.so/35b010d46a7081718781cd2cb908ac52) · **Status:** Draft 1 · 2026-05-09
> Inherits v0.1's matrix `[ubuntu, macos, windows] × [20.x, 22.x] × [stub-v2.0, stub-v2.1]`. Every gate must be green on every cell.
---
## 1. State Files & Schemas (summary)
<table header-row="true">
<tr>
<td>File</td>
<td>Status</td>
<td>Schema source</td>
</tr>
<tr>
<td>`.claude/coherence/version.json`</td>
<td>Bumped to `schema_version: 2` with `prior_versions`</td>
<td>DD-080</td>
</tr>
<tr>
<td>`.claude/coherence/drift-buffer.json`</td>
<td>Enum widened (`  • trickle_deep_scan / annotate / author`)</td>
<td>DD-066, DD-080</td>
</tr>
<tr>
<td>`.claude/coherence/cost-ledger.json`</td>
<td>Enum widened (`  • author / annotate`)</td>
<td>DD-091, DD-080</td>
</tr>
<tr>
<td>`.claude/coherence/host-capabilities.json`</td>
<td>Three optional fields added</td>
<td>DD-090</td>
</tr>
<tr>
<td>`.claude/coherence/graduation.json` **(new)**</td>
<td>`{ schema_version, global_mode, scopes: [...] }`</td>
<td>DD-074, DD-080</td>
</tr>
<tr>
<td>`.claude/coherence/proposal-cache.json` **(new)**</td>
<td>`{ schema_version, entries: [...] }`  • lifecycle FSM</td>
<td>DD-088</td>
</tr>
<tr>
<td>`.claude/coherence/signal-cache.json` **(new)**</td>
<td>Discriminated union: `bash_repetition` / `file_creation` / `agent_correction`</td>
<td>DD-089</td>
</tr>
<tr>
<td>`.claude/coherence/scan-cache/state.json` **(new)**</td>
<td>Trickle operational state</td>
<td>DD-066 (OQ-v2-30)</td>
</tr>
<tr>
<td>`.claude/coherence/state-snapshot.json` **(new)**</td>
<td>\~200 B; debounced writer</td>
<td>DD-070, DD-084</td>
</tr>
<tr>
<td>`.claude/coherence/proposals/<kind>/<id>/manifest.json` **(new directory)**</td>
<td>Per-proposal envelope. **`proposal.schema.json`** required fields (DD-087): `proposal_id` (UUID v4), `kind` ∈ `{slash_command, skill, agent, annotate}`, `created_at` (ISO-8601), `signal_refs[]` (back-refs to `signal-cache.json` entries), `proposed_path`, `body`, `prompt_version.author`, `cost_usd ≥ 0`, `validation.{name_collision, hallucination_grep_passed}`. Closed schema (`additionalProperties: false`).</td>
<td>DD-072, DD-087</td>
</tr>
<tr>
<td>`prompts/v2/manifest.json` **(new)**</td>
<td>`{ stage1_version, stage2_version, author_version, annotate_version }`</td>
<td>DD-091</td>
</tr>
</table>
Default `coherence/ignore` template gains `proposals/` and `proposal-cache.json` so users do not accidentally commit local proposals (DD-072).
## 2. Functional Gates (FG-v0.2)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Description</td>
<td>DD ref</td>
</tr>
<tr>
<td>FG-1</td>
<td>v1 → v2 migration on a synthetic v1 corpus produces correct v2 state, quarantines pre-migration files, appends `prior_versions`, no data loss.</td>
<td>DD-080</td>
</tr>
<tr>
<td>FG-2</td>
<td>`/coherence:graduate annotate <dir>` enables annotate mode for that scope; `/coherence:graduate --status` reflects the change; SessionStart respects the persisted mapping.</td>
<td>DD-074</td>
</tr>
<tr>
<td>FG-3</td>
<td>`/coherence:annotate <ignored-path>` refuses with the documented error and emits `annotate_blocked { reason: 'ignored' }`.</td>
<td>DD-073, OQ-v2-19</td>
</tr>
<tr>
<td>FG-4</td>
<td>Annotate-generated proposal applied via `/coherence:propose-accept` produces a doc whose anchors match v0.1 format byte-for-byte and survive `/coherence:doctor`.</td>
<td>DD-069</td>
</tr>
<tr>
<td>FG-5</td>
<td>Bash repetition fixture (3 normalised matches in 30 min) emits exactly one Author proposal of `kind = slash_command`.</td>
<td>DD-076</td>
</tr>
<tr>
<td>FG-6</td>
<td>File-creation fixture (3 structurally-similar files) emits exactly one Author proposal of `kind = skill`.</td>
<td>DD-077</td>
</tr>
<tr>
<td>FG-7</td>
<td>Agent-correction fixture (3 corrections per agent over 7 days, 5-min window, ≥ 20% invocation-aggregate line ratio) emits exactly one Author proposal of `kind = agent`.</td>
<td>DD-078</td>
</tr>
<tr>
<td>FG-8</td>
<td>Proposal lifecycle FSM rejects every illegal transition; `state_history` is append-only; quarantine fires on illegal transition.</td>
<td>DD-088</td>
</tr>
<tr>
<td>FG-9</td>
<td>`/coherence:propose-accept <id>` against an existing target path refuses by default; `--rename` succeeds; `--overwrite <retyped-path>` quarantines the original then writes.</td>
<td>DD-082</td>
</tr>
<tr>
<td>FG-10</td>
<td>`/coherence:propose-revert-acceptance <id>` produces a `[coherence-revert]` commit detected by v0.1 `revertDetect`; cache state transitions to `reverted`.</td>
<td>DD-083</td>
</tr>
<tr>
<td>FG-11</td>
<td>DD-075 expiry: time-fence drops proposals at 14 d; signal-recurrence-fence drops at 7 d quiet; consecutive-ignored counter drops at default 5.</td>
<td>DD-075, OQ-v2-22</td>
</tr>
<tr>
<td>FG-12</td>
<td>DD-068 events emitted on every PostToolUse Bash/Edit/Write (Read excluded), every UserPromptSubmit, every Stop/SubagentStop. Cross-session `prior_response_id` is `null` after SessionStart.</td>
<td>DD-068 audit</td>
</tr>
<tr>
<td>FG-13</td>
<td>`/coherence:install-statusline` writes `statusLine`, creates backup, asks for explicit confirmation; `/coherence:uninstall-statusline` reverses cleanly.</td>
<td>DD-070</td>
</tr>
<tr>
<td>FG-14</td>
<td>Statusline OSC 8 degradation tier matches `host-capabilities.url_scheme_handler` value (osc8 / osc52 / plain).</td>
<td>DD-071</td>
</tr>
<tr>
<td>FG-15</td>
<td>Trickle deep-scan respects per-session cap (≤ 20), idle gate (`trickle.idle_threshold_ms`), and emits `trickle_scan_pass`. Median budget impact \< 5 ms.</td>
<td>DD-066</td>
</tr>
<tr>
<td>FG-16</td>
<td>`share-metrics --anonymized` fixture test asserts no raw command/path/prompt content in output for any DD-068 event.</td>
<td>DD-086</td>
</tr>
</table>
## 3. Performance Gates (PG-v0.2)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Threshold</td>
<td>DD</td>
</tr>
<tr>
<td>PG-1</td>
<td>Author-pipeline p95 latency ≤ 5 s on the v0.2 reference corpus.</td>
<td>DD-067</td>
</tr>
<tr>
<td>PG-2</td>
<td>`state-snapshot.json` write ≤ 5 ms p95 isolated; 0 ms PostToolUse attribution.</td>
<td>DD-084</td>
</tr>
<tr>
<td>PG-3</td>
<td>Trickle median budget impact \< 5 ms (NFR-PERF-1 partition).</td>
<td>DD-066</td>
</tr>
<tr>
<td>PG-4</td>
<td>DD-068 hashing on PostToolUse hot path within v0.1 50 ms p95 budget (no regression vs. v0.1 baseline).</td>
<td>DD-076</td>
</tr>
<tr>
<td>PG-5</td>
<td>Statusline script render \< 5 ms (success-metric proxy via cassette harness).</td>
<td>Overview</td>
</tr>
</table>
## 4. Cost Gates (CG-v0.2)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Threshold</td>
<td>DD</td>
</tr>
<tr>
<td>CG-1</td>
<td>Aggregate cost ≤ v0.1 baseline × 1.30 across the cassette suite.</td>
<td>DD-085</td>
</tr>
<tr>
<td>CG-2</td>
<td>Per-feature partition Author ≤ 60%, Annotate ≤ 30%, Trickle ≤ 10% of headroom holds across the cassette suite.</td>
<td>DD-085</td>
</tr>
<tr>
<td>CG-3</td>
<td>`cost_ceiling_hit` event emits and degraded-mode entry occurs on a synthetic over-budget run.</td>
<td>DD-085</td>
</tr>
</table>
## 5. Privacy Gates (SG-v0.2)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Threshold</td>
<td>DD</td>
</tr>
<tr>
<td>SG-1</td>
<td>DD-068 12-hex hash collision rate \< 1.8 × 10⁻⁷ on a 10 000-entry corpus drawn from a realistic verb/flag/path pool collapsed through `normaliseBashCommand`.</td>
<td>DD-068</td>
</tr>
<tr>
<td>SG-1a</td>
<td>**Signature determinism**: identical normalised input MUST produce identical 12-hex hash across runs and OS matrix cells.</td>
<td>DD-068</td>
</tr>
<tr>
<td>SG-1b</td>
<td>**`refers_to_prior`**** heuristic** precision/recall fixture: dedicated test corpus of corrective vs. neutral prompts asserts the heuristic regex (FR-OBS-N1d) does not silently regress.</td>
<td>DD-068</td>
</tr>
<tr>
<td>SG-2</td>
<td>`share-metrics --anonymized` fixture (FG-16) green.</td>
<td>DD-086</td>
</tr>
<tr>
<td>SG-3</td>
<td>No write under `.claude/skills/`, `.claude/agents/`, `~/.claude/settings.json` happens without a typed slash command. Verified by E2E quarantine fixture.</td>
<td>DD-065</td>
</tr>
</table>
## 6. Release Gates (RG-v0.2)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Description</td>
<td>DD</td>
</tr>
<tr>
<td>RG-1</td>
<td>All v0.1 BRD-4 acceptance gates remain green (no regression).</td>
<td>v0.1</td>
</tr>
<tr>
<td>RG-2</td>
<td>All FG / PG / CG / SG gates above green on every CI matrix cell.</td>
<td>this</td>
</tr>
<tr>
<td>RG-3</td>
<td>CHANGELOG enumerates every DD covered (DD-065..DD-092).</td>
<td>DG</td>
</tr>
<tr>
<td>RG-4</td>
<td>`docs/privacy.md` enumerates the v0.2 event redaction matrix.</td>
<td>DD-086</td>
</tr>
<tr>
<td>RG-5</td>
<td>v0.2.1 calibration commitment: release-note checklist item "v0.2.1 must include calibration outcome" tracked.</td>
<td>DD-092</td>
</tr>
</table>
## 7. Release Plan & Calibration Commitment
### 7.1 Release sequence
1. **v0.1.0** ships (CHANGELOG dated 2026-05-09).
2. **v0.1.1** ships the DD-068 telemetry events (already implemented 2026-05-09; see CHANGELOG).
3. **v0.2-alpha** ships Annotate + Author + Statusline + Trickle behind `THRESHOLD_DEFAULTS` per DD-076/077/078 with `proposals_per_session ≤ 3` cap.
4. **v0.2.0** GA ships once acceptance gates above are green on all matrix cells. Decision on Proposer planner stage (DD-067) made on v0.2-alpha telemetry.
5. **v0.2.1 calibration patch** lands per DD-092 trigger:
	- **Trigger:** ≥ 50 opted-in sessions of `proposal_signal_observed` events via `/coherence:share-metrics --anonymized` (DD-086) **OR** 30 days post-v0.1.1 (≈ 2026-06-09), whichever first.
	- **Procedure:** for each kind, choose threshold maximising projected precision subject to **precision ≥ 0.7** within per-kind tunable bounds (DD-076 count ∈ \[2, 6\], window ∈ \[10, 60\] min; DD-077 count ∈ \[2, 6\], Jaccard ∈ \[0.6, 0.95\]; DD-078 lines-ratio ∈ \[0.10, 0.40\], occurrences ∈ \[2, 5\]).
	- **If unattainable:** retain v0.2.0 defaults; reschedule to v0.2.2 with the failed attempt logged in CHANGELOG.
### 7.2 Documentation deliverables
- `CHANGELOG.md` entry per release with full DD coverage list and (for v0.2.1) sample size, per-threshold deltas, projected precision, and confidence interval.
- `docs/privacy.md` updated with the v0.2 event redaction matrix.
- `docs/commands.md` extended with all new slash commands (FR-COMMANDS table).
- `docs/state-files.md` extended with the five new state files.
- v0.2 implementation plan (milestone-broken, written separately, following v0.1's plan format).
## 8. Sign-off Checklist
<table header-row="true">
<tr>
<td>Item</td>
<td>Status</td>
</tr>
<tr>
<td>All FG-1..FG-16 green on every matrix cell</td>
<td>☐</td>
</tr>
<tr>
<td>All PG-1..PG-5 green</td>
<td>☐</td>
</tr>
<tr>
<td>All CG-1..CG-3 green</td>
<td>☐</td>
</tr>
<tr>
<td>All SG-1..SG-3 green</td>
<td>☐</td>
</tr>
<tr>
<td>All v0.1 BRD-4 gates remain green (no regression)</td>
<td>☐</td>
</tr>
<tr>
<td>CHANGELOG enumerates DD-065..DD-092</td>
<td>☐</td>
</tr>
<tr>
<td>`docs/privacy.md` v0.2 redaction matrix landed</td>
<td>☐</td>
</tr>
<tr>
<td>v0.2.1 calibration commitment tracked in release notes</td>
<td>☐</td>
</tr>
<tr>
<td>Product owner sign-off</td>
<td>☐</td>
</tr>
<tr>
<td>Tech lead sign-off</td>
<td>☐</td>
</tr>
<tr>
<td>QA lead sign-off</td>
<td>☐</td>
</tr>
</table>
