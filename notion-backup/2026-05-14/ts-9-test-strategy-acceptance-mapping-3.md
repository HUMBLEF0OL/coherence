<!-- url: https://www.notion.so/35b010d46a70816a9682c531ee3e5efe -->
<!-- id: 35b010d4-6a70-816a-9682-c531ee3e5efe -->
<!-- title: TS-9 — Test Strategy & Acceptance Mapping -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
All release gates from BRD-4 are owned by specific TS modules. v0.1 ships when **all** are green on every CI matrix cell (`os × node × claude_code_version`).
## 9.1 Test Layers Overview
<table header-row="true">
<tr>
<td>Layer</td>
<td>Purpose</td>
<td>Mechanism</td>
<td>Owner module</td>
</tr>
<tr>
<td>Unit</td>
<td>Pure-function correctness (path filter, anchor scan, change-class recount, hallucination regex)</td>
<td>Vitest / Jest</td>
<td>Per module</td>
</tr>
<tr>
<td>Schema</td>
<td>All JSON schemas validated by `ajv`</td>
<td>Schema fixtures</td>
<td>`stateStore`</td>
</tr>
<tr>
<td>Fixture (Stage 1 / Stage 2)</td>
<td>LLM I/O quality gates</td>
<td>Cassette replay</td>
<td>`llmClient`  • `validation`</td>
</tr>
<tr>
<td>Hallucination corpus</td>
<td>Per-language precision / recall</td>
<td>Cassette + corpus</td>
<td>`validation`</td>
</tr>
<tr>
<td>Performance harness</td>
<td>p50/p95 latencies, memory</td>
<td>`tests/perf/` synthetic events</td>
<td>All hook adapters</td>
</tr>
<tr>
<td>E2E</td>
<td>Full host-stub flows</td>
<td>Claude Code stub harness + cassette LLM</td>
<td>Full pipeline</td>
</tr>
<tr>
<td>Security</td>
<td>Path traversal, injection, secret-scan</td>
<td>Negative-test fixtures + `npm audit`</td>
<td>`validation`, `gitAdapter`</td>
</tr>
<tr>
<td>Rollback</td>
<td>Migration, kill-switch, read-only mode</td>
<td>Dedicated tests</td>
<td>`stateStore`, `hookAdapters`</td>
</tr>
</table>
## 9.2 CI Matrix (BRD-4 §4.1)
```yaml
os: [ubuntu-latest, macos-latest, windows-latest]
node_version: [20.x, 22.x]
claude_code_version: [stub-v2.0, stub-v2.1]
```
Any single-cell failure blocks the release (BRD-4 §4.1).
## 9.3 Quality Gates (BRD-4 §4.3)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Threshold</td>
<td>TS owner</td>
<td>Source</td>
</tr>
<tr>
<td>QG-1 Stage 1 schema-valid</td>
<td>≥90%</td>
<td>TS-5 §5.3</td>
<td>DD-057</td>
</tr>
<tr>
<td>QG-2 Stage 1 picks correct canonical</td>
<td>≥80%</td>
<td>TS-5 §5.3</td>
<td>DD-057</td>
</tr>
<tr>
<td>QG-3 Stage 2 patches apply cleanly</td>
<td>≥80%</td>
<td>TS-5 §5.5</td>
<td>DD-057</td>
</tr>
<tr>
<td>QG-4 Hallucination escape rate</td>
<td>≤2%</td>
<td>TS-5 §5.5 (grep)</td>
<td>DD-058</td>
</tr>
<tr>
<td>QG-5 Hallucination grep precision/recall per language</td>
<td>Reported (not floor-gated v0.1)</td>
<td>TS-5 §5.5</td>
<td>DD-058</td>
</tr>
<tr>
<td>QG-6 Per-class fixture coverage</td>
<td>≥5 fixtures/class</td>
<td>TS-5 §5.4</td>
<td>DD-057</td>
</tr>
</table>
Fixture corpus IDs (BRD-5 §5.2.2):
- ID-2 Stage 1 fixture corpus → backs QG-1, QG-2.
- ID-3 Stage 2 per-class fixture corpus → backs QG-3, QG-6.
- ID-4 Hallucination grep corpus (50 valid + 50 hallucinated, 8+2 langs) → backs QG-4, QG-5.
## 9.4 E2E Scenarios (BRD-4 §4.2)
All ≤1% per-scenario flakiness measured by 10 reruns. No quarantined scenarios at release.
<table header-row="true">
<tr>
<td>ID</td>
<td>Scenario</td>
<td>TS owner</td>
</tr>
<tr>
<td>E2E-1</td>
<td>Cold-start → Observe → graduate → Stop patch → commit → revert → DD-035 detection</td>
<td>TS-2, TS-4, TS-6</td>
</tr>
<tr>
<td>E2E-2</td>
<td>Monorepo cross-package coherence (3 packages, canonical algorithm, file-merge)</td>
<td>TS-2 §2.5 step 9, TS-4 §4.11</td>
</tr>
<tr>
<td>E2E-3</td>
<td>Subagent flow (line-level) → Edited classification</td>
<td>TS-2 §2.4</td>
</tr>
<tr>
<td>E2E-3b</td>
<td>Subagent flow with `host-capabilities.json` forced to file-level fallback</td>
<td>TS-2 §2.4</td>
</tr>
<tr>
<td>E2E-4</td>
<td>Failure recovery — kill plugin between Stage 2 calls 3-4, resume from `stop-progress.json`</td>
<td>TS-3 §3.8, TS-5 §5.9</td>
</tr>
<tr>
<td>E2E-5</td>
<td>Hallucination rejection — fabricated import, strict-tier grep rejects</td>
<td>TS-5 §5.5</td>
</tr>
<tr>
<td>E2E-6</td>
<td>Assertion-triggered review (`import_exists`)</td>
<td>TS-5 §5.7, TS-4 §4.2 step 6</td>
</tr>
<tr>
<td>E2E-7</td>
<td>`/coherence:review` mid-session aggregation + cost ledger</td>
<td>TS-2 §2.5, TS-7 §7.4</td>
</tr>
<tr>
<td>E2E-8</td>
<td>Upgrade migration v0.0.x → v0.1</td>
<td>TS-8 §8.5</td>
</tr>
<tr>
<td>E2E-9</td>
<td>Kill-switch end-to-end</td>
<td>TS-6 §6.5</td>
</tr>
</table>
**Cassette policy:** LLM calls in E2E run via cassette replay. Cassette refresh requires explicit CI flag (no silent re-recording).
**E2E-10 — Cross-layer coherence via Stage 1 (FR-LAYERS-5, DD-008):**
- Setup: A fixture repo with a referring doc (CLAUDE.md), a skill (SKILL.md), and a subagent (agents/foo.md) that all reference the same code symbol. Simulate a code change that makes the symbol stale across all three layers simultaneously.
- Trigger: Stop hook fires. Stage 1 receives a trigger group that spans all three layers.
- Expected: Stage 1 produces a single coherent plan identifying the cross-layer impact with the correct canonical. Stage 2 generates patches for all three affected documents. No separate cross-layer pass module is invoked (DD-008 subsumed-by-Stage-1 rule). All patches apply cleanly and are committed atomically.
- Acceptance: This scenario constitutes the explicit E2E proof that FR-LAYERS-5 (cross-layer coherence) is satisfied by Stage 1 alone without a separate pass module.
## 9.5 Performance Gates (BRD-4 §4.4)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Budget</td>
<td>TS owner</td>
</tr>
<tr>
<td>PG-1 PostToolUse p95</td>
<td>\< 50 ms</td>
<td>TS-4 §4.3</td>
</tr>
<tr>
<td>PG-2 SessionStart p95 (medium / monorepo)</td>
<td>\< 2 s / \< 4 s</td>
<td>TS-4 §4.2</td>
</tr>
<tr>
<td>PG-3 Stop p95 (≤12 sections)</td>
<td>\< 10 s</td>
<td>TS-4 §4.6</td>
</tr>
<tr>
<td>PG-4 Stop p95 at DD-056 ceiling (36 sections)</td>
<td>\< 25 s</td>
<td>TS-5 §5.6</td>
</tr>
<tr>
<td>PG-5 Cost p50 / p95 across harness</td>
<td>≤ \$0.07 / ≤ \$0.15</td>
<td>TS-7 §7.2</td>
</tr>
</table>
Harness lives at `tests/perf/` (TS-7 §7.7); reference codebases ID-5 (BRD-5 §5.2.2).
CI fails any merge with \> 30% p95 regression.
## 9.6 Reliability Gates (BRD-4 §4.5)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Threshold</td>
<td>TS owner</td>
</tr>
<tr>
<td>RG-1 Coherence-caused file corruption</td>
<td>0 across full E2E + perf runs</td>
<td>TS-3, TS-6</td>
</tr>
<tr>
<td>RG-2 Atomic write rollback (interrupted writes)</td>
<td>≥1 dedicated test</td>
<td>TS-3 §3.15</td>
</tr>
<tr>
<td>RG-3 Concurrent-session lock contention + degraded-mode escape</td>
<td>≥1 dedicated test</td>
<td>TS-6 §6.6</td>
</tr>
<tr>
<td>RG-4 Crash self-disable (3 induced exceptions)</td>
<td>E2E test</td>
<td>TS-6 §6.5</td>
</tr>
</table>
## 9.7 Security Gates (BRD-4 §4.6)
<table header-row="true">
<tr>
<td>Gate</td>
<td>Threshold</td>
<td>TS owner</td>
</tr>
<tr>
<td>SG-1 `npm audit --audit-level=high`</td>
<td>0 findings</td>
<td>TS-2 §2.11 deps</td>
</tr>
<tr>
<td>SG-2 Path-traversal / out-of-root write tests</td>
<td>All pass</td>
<td>TS-6 §6.3</td>
</tr>
<tr>
<td>SG-3 Patch-validation negatives (shell injection in skill frontmatter, prompt-injection HTML in body)</td>
<td>All rejected</td>
<td>TS-5 §5.5, TS-6 §6.3</td>
</tr>
<tr>
<td>SG-4 Secret scan of repo + release artifact</td>
<td>0 findings</td>
<td>CI</td>
</tr>
</table>
## 9.8 Rollback Gates (BRD-4 §4.8)
<table header-row="true">
<tr>
<td>Gate</td>
<td>TS owner</td>
</tr>
<tr>
<td>RB-1 SemVer + `version.json` written on install/upgrade</td>
<td>TS-8 §8.1</td>
</tr>
<tr>
<td>RB-2 Manual kill-switch → no-op mode</td>
<td>TS-6 §6.5</td>
</tr>
<tr>
<td>RB-3 Crash self-disable after 3 hook exceptions</td>
<td>TS-6 §6.5</td>
</tr>
<tr>
<td>RB-4 Older plugin reads newer state → read-only + upgrade prompt</td>
<td>TS-8 §8.5</td>
</tr>
<tr>
<td>RB-5 Documented `claude plugin install coherence@<old>`</td>
<td>TS-8 §8.6</td>
</tr>
</table>
## 9.9 Documentation Gates (BRD-4 §4.7)
Owned by TS-8 §8.7 (DG-1 .. DG-6).
## 9.10 Acceptance Checklist (BRD-4 §4.9)
v0.1 ships when **all** boxes are checked:
- [ ] All E2E scenarios E2E-1..E2E-9 (incl. E2E-3b) green on every matrix cell, flakiness ≤1%
- [ ] Quality gates QG-1..QG-6 meet thresholds
- [ ] Performance gates PG-1..PG-5 meet budgets, no \> 30% regression
- [ ] Reliability gates RG-1..RG-4 pass, 0 corruption events
- [ ] Security gates SG-1..SG-4 clean
- [ ] Documentation gates DG-1..DG-6 complete
- [ ] Rollback gates RB-1..RB-5 verified
- [ ] Sign-offs from product owner, tech lead, QA lead
- [ ] CHANGELOG and release notes published
- [ ] `release-v0.1.0` tag created on green CI run
## 9.11 Definition of Done (per requirement)
Matches BRD-4 §4.10 verbatim:
1. Implementation merged to main behind passing CI.
2. Linked from at least one E2E or fixture test that exercises it.
3. Mentioned in `coherence-log.md` schema or `/coherence:status` output if user-visible.
4. Documented in the README or slash-command reference if surface-level.
5. Tracked in CHANGELOG with the DD reference.
## 9.12 Test Asset Inventory
<table header-row="true">
<tr>
<td>Asset</td>
<td>ID (BRD-5 §5.2.2)</td>
<td>TS owner</td>
</tr>
<tr>
<td>Stage 1 + Stage 2 prompt files (`prompts/v1/*.md`)</td>
<td>ID-1</td>
<td>TS-5 §5.8</td>
</tr>
<tr>
<td>Stage 1 fixture corpus</td>
<td>ID-2</td>
<td>TS-5 §5.3</td>
</tr>
<tr>
<td>Stage 2 per-class fixture corpus</td>
<td>ID-3</td>
<td>TS-5 §5.4</td>
</tr>
<tr>
<td>Hallucination grep corpus (50 valid + 50 hallucinated, 8+2 langs)</td>
<td>ID-4</td>
<td>TS-5 §5.5</td>
</tr>
<tr>
<td>Performance harness reference codebases (small / medium / large / monorepo)</td>
<td>ID-5</td>
<td>TS-7 §7.7</td>
</tr>
<tr>
<td>Claude Code stub harness for E2E</td>
<td>ID-6</td>
<td>TS-9 §9.4</td>
</tr>
</table>
