<!-- url: https://www.notion.so/35b010d46a708161b853cd1f72017a41 -->
<!-- id: 35b010d4-6a70-8161-b853-cd1f72017a41 -->
<!-- title: 🧪 TS-9 — Test Strategy & Acceptance Mapping -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Maps each BRD-4 acceptance gate to the TS module that owns it and the harness that exercises it. Inherits v0.1 [TS-9](https://www.notion.so/35b010d46a70816a9682c531ee3e5efe).
---
## 1. Harness inventory
<table header-row="true">
<tr>
<td>Harness</td>
<td>Path</td>
<td>Purpose</td>
</tr>
<tr>
<td>Unit</td>
<td>`tests/unit/**`</td>
<td>Pure-function and module-level (signature-hash, normalisation, FSM transitions, mode-resolver, signal detectors, etc.).</td>
</tr>
<tr>
<td>Schema</td>
<td>`tests/schema/**`</td>
<td>JSON Schema validators for `proposal.schema.json`, `proposal-cache.json`, `signal-cache.json`, `graduation.json`, `state-snapshot.json`, `host-capabilities.json` extensions.</td>
</tr>
<tr>
<td>Integration</td>
<td>`tests/integration/**`</td>
<td>Multi-module flows: SessionStart migration, PostToolUse → signal-cache, SessionEnd correction sweep, Stop → Author pipeline tail.</td>
</tr>
<tr>
<td>E2E</td>
<td>`tests/e2e/**`</td>
<td>Whole-session fixtures across CI matrix: install → mode flip → signal → propose → accept → revert.</td>
</tr>
<tr>
<td>Cassettes</td>
<td>`tests/cassettes/author/**`, `tests/cassettes/annotate/**`</td>
<td>Recorded LLM responses for deterministic Author + Annotate pipeline runs (FR-COST-N6).</td>
</tr>
<tr>
<td>Perf / regression-gate</td>
<td>`tests/perf/regression-gate.test.ts`</td>
<td>p95 latency cells (state-snapshot, signature-hash, file-creation similarity, trickle, author p95, statusline render).</td>
</tr>
<tr>
<td>Security / privacy</td>
<td>`tests/security/**`</td>
<td>`anonymizeRecord()` allowlist tests, cross-session leak tests, refers_to_prior precision/recall corpus.</td>
</tr>
<tr>
<td>Rollback</td>
<td>`tests/rollback/**`</td>
<td>`/coherence:propose-revert-acceptance` E2E with v0.1 `revertDetect` reuse.</td>
</tr>
</table>
## 2. Functional gates → ownership
<table header-row="true">
<tr>
<td>Gate</td>
<td>Owning TS</td>
<td>Harness</td>
</tr>
<tr>
<td>FG-1 v1→v2 migration</td>
<td>TS-3, TS-8</td>
<td>Integration + Unit (synthetic v1 corpus)</td>
</tr>
<tr>
<td>FG-2 `/coherence:graduate`</td>
<td>TS-2, TS-3</td>
<td>Integration</td>
</tr>
<tr>
<td>FG-3 annotate vs ignore</td>
<td>TS-5, TS-6</td>
<td>Integration + fixture</td>
</tr>
<tr>
<td>FG-4 Annotate byte-for-byte anchor + doctor survival</td>
<td>TS-5, TS-3</td>
<td>E2E</td>
</tr>
<tr>
<td>FG-5 Bash repetition signal</td>
<td>TS-2, TS-4</td>
<td>Integration fixture</td>
</tr>
<tr>
<td>FG-6 File-creation pattern signal</td>
<td>TS-2, TS-4</td>
<td>Integration fixture</td>
</tr>
<tr>
<td>FG-7 Agent-correction signal (OQ-v2-24 invocation-aggregate)</td>
<td>TS-2, TS-4</td>
<td>Integration fixture (3 corrections / agent / 7 d / 5 min / ≥ 20%)</td>
</tr>
<tr>
<td>FG-8 Proposal FSM rejects illegal transitions; `state_history` append-only; quarantine</td>
<td>TS-3</td>
<td>Unit + Schema</td>
</tr>
<tr>
<td>FG-9 propose-accept collision policy (default refuse / `--rename` / `--overwrite`)</td>
<td>TS-6</td>
<td>Integration + E2E</td>
</tr>
<tr>
<td>FG-10 propose-revert-acceptance via git revert; `revertDetect` picks up</td>
<td>TS-6</td>
<td>Rollback E2E</td>
</tr>
<tr>
<td>FG-11 DD-075 expiry fences (14 d / 7 d / N-ignored)</td>
<td>TS-4</td>
<td>Integration (synthetic time)</td>
</tr>
<tr>
<td>FG-12 DD-068 events on every relevant hook + cross-session `prior_response_id` null after SessionStart</td>
<td>TS-4, TS-7</td>
<td>Integration + Security</td>
</tr>
<tr>
<td>FG-13 install-statusline / uninstall-statusline</td>
<td>TS-6, TS-8</td>
<td>E2E (mock settings.json)</td>
</tr>
<tr>
<td>FG-14 OSC 8 / 52 / plain tier matches `url_scheme_handler`</td>
<td>TS-6, TS-8</td>
<td>Cassette harness for statusline</td>
</tr>
<tr>
<td>FG-15 Trickle per-session cap, idle gate, metric, \< 5 ms median</td>
<td>TS-4, TS-7</td>
<td>Integration + perf</td>
</tr>
<tr>
<td>FG-16 `share-metrics --anonymized` no raw content</td>
<td>TS-6</td>
<td>Security fixture</td>
</tr>
</table>
## 3. Performance gates → ownership
<table header-row="true">
<tr>
<td>Gate</td>
<td>Owning TS</td>
<td>Harness</td>
</tr>
<tr>
<td>PG-1 Author p95 ≤ 5 s</td>
<td>TS-5, TS-7</td>
<td>Cassette harness</td>
</tr>
<tr>
<td>PG-2 state-snapshot write ≤ 5 ms p95 isolated; 0 ms PostToolUse</td>
<td>TS-2, TS-7</td>
<td>regression-gate cell `state-snapshot write`</td>
</tr>
<tr>
<td>PG-3 Trickle median impact \< 5 ms</td>
<td>TS-4, TS-7</td>
<td>regression-gate cell `trickle median budget`</td>
</tr>
<tr>
<td>PG-4 DD-068 hashing within v0.1 50 ms p95</td>
<td>TS-4, TS-7</td>
<td>regression-gate cell `signature-hash hot path`, `file-creation similarity`</td>
</tr>
<tr>
<td>PG-5 Statusline render \< 5 ms</td>
<td>TS-2, TS-7</td>
<td>Cassette harness; **separate cells per OS variant** — `coherence-statusline.sh` (Linux/macOS) and `coherence-statusline.ps1` (Windows) — to enforce the budget on both shells</td>
</tr>
</table>
## 4. Cost gates → ownership
<table header-row="true">
<tr>
<td>Gate</td>
<td>Owning TS</td>
<td>Harness</td>
</tr>
<tr>
<td>CG-1 Aggregate ≤ v0.1 × 1.30</td>
<td>TS-5, TS-7</td>
<td>Cassette suite</td>
</tr>
<tr>
<td>CG-2 Per-feature partition (60/30/10 of headroom)</td>
<td>TS-5, TS-7</td>
<td>Cassette suite</td>
</tr>
<tr>
<td>CG-3 `cost_ceiling_hit`  • degraded-mode entry on synthetic over-budget</td>
<td>TS-5, TS-7</td>
<td>Integration with synthetic ledger</td>
</tr>
</table>
## 5. Privacy / security gates → ownership
<table header-row="true">
<tr>
<td>Gate</td>
<td>Owning TS</td>
<td>Harness</td>
</tr>
<tr>
<td>SG-1 12-hex collision rate \< 1.8 × 10⁻⁷ on 10 k corpus</td>
<td>TS-6</td>
<td>Fixture-driven corpus test</td>
</tr>
<tr>
<td>SG-1a Signature determinism across runs / OS</td>
<td>TS-6</td>
<td>Cross-platform unit test</td>
</tr>
<tr>
<td>SG-1b `refers_to_prior` precision/recall fixture</td>
<td>TS-6</td>
<td>Curated test corpus of corrective vs. neutral prompts</td>
</tr>
<tr>
<td>SG-2 `share-metrics --anonymized` fixture (= FG-16)</td>
<td>TS-6</td>
<td>Security fixture</td>
</tr>
<tr>
<td>SG-3 No write under `.claude/skills/`, `.claude/agents/`, `~/.claude/settings.json` without typed slash command</td>
<td>TS-6</td>
<td>E2E quarantine fixture</td>
</tr>
</table>
## 6. Release gates → ownership
<table header-row="true">
<tr>
<td>Gate</td>
<td>Owning TS</td>
<td>How verified</td>
</tr>
<tr>
<td>RG-1 v0.1 BRD-4 gates remain green</td>
<td>v0.1 (no regression)</td>
<td>Full v0.1 suite re-run on every CI cell</td>
</tr>
<tr>
<td>RG-2 All v0.2 FG/PG/CG/SG green on every cell</td>
<td>(all)</td>
<td>CI matrix</td>
</tr>
<tr>
<td>RG-3 CHANGELOG enumerates the v0.2 ratified DDs in the range DD-065..DD-092 (DD-079 is intentionally vacated; 27 ratified DDs total)</td>
<td>—</td>
<td>`scripts/changelog-dd-coverage.mjs` (with vacated-id allowlist)</td>
</tr>
<tr>
<td>RG-4 `docs/privacy.md` v0.2 redaction matrix</td>
<td>TS-6</td>
<td>Manual review + lint</td>
</tr>
<tr>
<td>RG-5 v0.2.1 calibration commitment tracked</td>
<td>TS-9 §7</td>
<td>Release-note checklist item</td>
</tr>
</table>
## 7. v0.2.1 calibration corpus (DD-092)
Commitment: tune DD-076 / DD-077 / DD-078 thresholds against opt-in telemetry; constants-only change, no schema bump (NFR-MAINT-N1).
- **Trigger:** ≥ 50 opted-in sessions of `proposal_signal_observed` events via `/coherence:share-metrics --anonymized` (DD-086) **OR** 30 days post-v0.1.1 (whichever first).
- **Procedure:** for each kind, choose threshold maximising projected precision subject to **precision ≥ 0.7** within bounds:
	- DD-076: count ∈ \[2, 6\], window ∈ \[10, 60\] min.
	- DD-077: count ∈ \[2, 6\], Jaccard ∈ \[0.6, 0.95\].
	- DD-078: lines-ratio ∈ \[0.10, 0.40\], occurrences ∈ \[2, 5\].
- **If unattainable:** retain v0.2.0 defaults; reschedule to v0.2.2; failed attempt logged in CHANGELOG.
- **Test corpus:** `tests/fixtures/calibration/v0.2.1/`. Used by an offline tuner script that emits a `calibration-report.md` with sample size, per-threshold deltas, projected precision, and 95% CI.
## 8. Reference corpus for Author p95 (PG-1)
Curated under `tests/fixtures/author-corpus/` and exercised through `tests/cassettes/author/**`. Contains:
- Bash-repetition fixture (3 normalised matches in 30 min).
- File-creation fixture (3 structurally-similar files with locality + import-set + heading-hierarchy match).
- Agent-correction fixture (3 corrections / agent / 7 d / 5-min window / ≥ 20% line ratio).
- One mixed-signal fixture for the v0.2-final planner trigger evaluation (FR-AUTHOR-2).
## 9. Sign-off coverage
The BRD-4 §8 sign-off checklist is mirrored into the release CI summary; each item maps to either an FG/PG/CG/SG gate or a manual review artifact (privacy doc, CHANGELOG, calibration release-note checklist).
## 10. Section traceability
Full bidirectional matrix in TS-10. Coverage at this layer:
- Every FG-\* row (BRD-4 §2) maps to at least one harness here.
- Every PG / CG / SG row (BRD-4 §3..§5) maps to at least one harness here.
- Every NFR-PERF-N\* threshold has an enforcing regression-gate cell.
- Every privacy-by-construction NFR has a security fixture.
