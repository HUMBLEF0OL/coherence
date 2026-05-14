<!-- url: https://www.notion.so/35b010d46a708156b8f6fbbb8ac00f68 -->
<!-- id: 35b010d4-6a70-8156-b8f6-fbbb8ac00f68 -->
<!-- title: 🚀 BRD-4 — Release Criteria & Acceptance -->
**Parent:** [📘 10. BRD — Coherence v0.1](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea)
---
v0.1 release tag (`release-v0.1.0`) requires every gate below to pass on every CI matrix combination. Gates are aligned to DD-063 (E2E suite), DD-057 / DD-058 (fixture suites), DD-059 (performance harness), and DD-064 (rollback machinery).
## 4.1 CI Matrix
```yaml
os: [ubuntu-latest, macos-latest, windows-latest]
node_version: [20.x, 22.x]
claude_code_version: [stub-v2.0, stub-v2.1]
```
All gates below run on every cell of this matrix. Any single-cell failure blocks the release.
## 4.2 E2E Scenario Gate (DD-063)
All five scenarios **must** pass with ≤1% per-scenario flakiness measured by 10 reruns. No quarantined scenarios at release time.
<table header-row="true">
<tr>
<td>ID</td>
<td>Scenario</td>
<td>What it validates</td>
</tr>
<tr>
<td>E2E-1</td>
<td>Cold-start flow</td>
<td>Install → Observe mode → 3 PostToolUse events → graduate → Stop produces a patch → user accepts → `[coherence]` commit lands → user runs `git revert` → DD-035 detection registers revert.</td>
</tr>
<tr>
<td>E2E-2</td>
<td>Monorepo cross-package coherence</td>
<td>3-package fixture (api, web, mobile), each with [CLAUDE.md](http://CLAUDE.md) → cross-package shared-utility change → DD-049 canonical algorithm produces correct canonical → Stage 2 patches all packages coherently → DD-008 file-merge handles same-file overlaps cleanly.</td>
</tr>
<tr>
<td>E2E-3</td>
<td>Subagent flow (line-level)</td>
<td>Subagent writes a file → user edits 30% of subagent-owned lines → SessionEnd → DD-013 classification = Edited (not Accepted, not Discarded).</td>
</tr>
<tr>
<td>E2E-3b</td>
<td>Subagent flow (file-level fallback)</td>
<td>Same as E2E-3 but with `host-capabilities.json` forced to `file-level-fallback`; classification still produces a stable, documented result.</td>
</tr>
<tr>
<td>E2E-4</td>
<td>Failure recovery</td>
<td>Start Stop pipeline → kill plugin process between Stage 2 calls 3 and 4 → restart → verify `stop-progress.json` resumption skips done sections, completes pending ones, produces correct final state.</td>
</tr>
<tr>
<td>E2E-5</td>
<td>Hallucination rejection</td>
<td>Synthetic Stage 2 patch containing a fabricated import (`from '@/lib/nonexistent'`) → strict-tier grep rejects → patch does not commit → entry logged to `revalidation-log.md`.</td>
</tr>
<tr>
<td>E2E-6</td>
<td>Assertion-triggered review</td>
<td>Section frontmatter declares `asserts: import_exists "from 'express'"`; codebase no longer imports `express` → SessionStart re-validation flags the assertion → Stop review surfaces it in the dedicated “Assertion failures” section with the 3-action UX (Patch / Update assertion / Dismiss); `last-verified` age is shown.</td>
</tr>
<tr>
<td>E2E-7</td>
<td>`/coherence:review` mid-session</td>
<td>Buffer accumulates 3+ trigger groups mid-session → user runs `/coherence:review` → Stage 1 + Stage 2 run against current buffer → accepted patches commit → buffer clears accepted entries → subsequent Stop with no new entries is a no-op; `coherence_session_cost` aggregates across review and Stop.</td>
</tr>
<tr>
<td>E2E-8</td>
<td>Upgrade migration</td>
<td>Pre-existing `.claude/coherence/` state from a prior `schema_version` → new plugin install runs the documented `migrate_v{n}_to_v{n+1}` chain at SessionStart → buffer, velocity, and pending state are preserved with no data loss; older plugin reading the migrated state enters read-only mode.</td>
</tr>
<tr>
<td>E2E-9</td>
<td>Kill-switch end-to-end</td>
<td>Plugin active with non-empty buffer → `touch .claude/coherence/DISABLED` → next PostToolUse, SubagentStop, Stop, and SessionStart return without I/O or LLM calls → `/coherence:status` reports the disabled state → remove sentinel → next hook restores normal operation with buffer intact and zero data loss (validates DD-019 + FR-INSTALL-7).</td>
</tr>
</table>
LLM calls in E2E run via cassette replay. Cassette refresh requires explicit CI flag (no silent re-recording).
## 4.3 Fixture Quality Gate (DD-057, DD-058)
<table header-row="true">
<tr>
<td>ID</td>
<td>Gate</td>
<td>Threshold</td>
</tr>
<tr>
<td>QG-1</td>
<td>Stage 1 planner produces schema-valid JSON across the planner fixture set</td>
<td>≥ 90%</td>
</tr>
<tr>
<td>QG-2</td>
<td>Stage 1 planner picks correct canonical (matches expected role assignments)</td>
<td>≥ 80%</td>
</tr>
<tr>
<td>QG-3</td>
<td>Stage 2 patches apply cleanly across the per-class fixture set (apply / escalate / disagree)</td>
<td>≥ 80%</td>
</tr>
<tr>
<td>QG-4</td>
<td>Hallucination escape rate across DD-058 corpus (50 valid + 50 hallucinated, 8+2 langs)</td>
<td>≤ 2%</td>
</tr>
<tr>
<td>QG-5</td>
<td>Hallucination grep precision · recall published per language</td>
<td>reported, not gated below floor in v0.1</td>
</tr>
<tr>
<td>QG-6</td>
<td>Per-class fixture coverage</td>
<td>≥ 5 fixtures per class</td>
</tr>
</table>
## 4.4 Performance Gate (DD-059)
Measured by `tests/perf/` harness across small / medium / large / monorepo reference codebases. CI fails any merge that regresses any p95 by \> 30%.
<table header-row="true">
<tr>
<td>ID</td>
<td>Gate</td>
<td>Budget</td>
</tr>
<tr>
<td>PG-1</td>
<td>PostToolUse p95 latency</td>
<td>\< 50 ms typical</td>
</tr>
<tr>
<td>PG-2</td>
<td>SessionStart p95 (medium / monorepo)</td>
<td>\< 2 s / \< 4 s</td>
</tr>
<tr>
<td>PG-3</td>
<td>Stop p95 typical (≤12 sections)</td>
<td>\< 10 s</td>
</tr>
<tr>
<td>PG-4</td>
<td>Stop p95 at DD-056 ceiling (36 sections)</td>
<td>\< 25 s</td>
</tr>
<tr>
<td>PG-5</td>
<td>Cost p50 / p95 across the perf harness</td>
<td>≤ \$0.07 / ≤ \$0.15</td>
</tr>
</table>
## 4.5 Reliability Gate
<table header-row="true">
<tr>
<td>ID</td>
<td>Gate</td>
<td>Threshold</td>
</tr>
<tr>
<td>RG-1</td>
<td>Coherence-caused file corruption events</td>
<td>0 across the full E2E + perf runs</td>
</tr>
<tr>
<td>RG-2</td>
<td>Atomic write rollback test (interrupted writes)</td>
<td>≥ 1 dedicated test passing</td>
</tr>
<tr>
<td>RG-3</td>
<td>Concurrent-session lock contention test</td>
<td>≥ 1 dedicated test passing; degraded-mode escape verified</td>
</tr>
<tr>
<td>RG-4</td>
<td>Crash self-disable trigger</td>
<td>E2E test verifying 3 induced exceptions → `disabled` sentinel created</td>
</tr>
</table>
## 4.6 Security Gate
<table header-row="true">
<tr>
<td>ID</td>
<td>Gate</td>
<td>Threshold</td>
</tr>
<tr>
<td>SG-1</td>
<td>`npm audit --audit-level=high`</td>
<td>0 findings</td>
</tr>
<tr>
<td>SG-2</td>
<td>Path-traversal / out-of-root write tests</td>
<td>all pass</td>
</tr>
<tr>
<td>SG-3</td>
<td>Patch-validation negative tests (shell injection in skill frontmatter, etc.)</td>
<td>all rejected</td>
</tr>
<tr>
<td>SG-4</td>
<td>Secret-scan of repo + release artifact</td>
<td>0 findings</td>
</tr>
</table>
## 4.7 Documentation Gate
<table header-row="true">
<tr>
<td>ID</td>
<td>Gate</td>
<td>Status required</td>
</tr>
<tr>
<td>DG-1</td>
<td>README with install + Observe mode walkthrough</td>
<td>Complete</td>
</tr>
<tr>
<td>DG-2</td>
<td>Slash-command reference (`/coherence:status`, `/review`, `/repair`, `/recover`, `/doctor`)</td>
<td>Complete</td>
</tr>
<tr>
<td>DG-3</td>
<td>State-file schema reference (buffer, pending, host-capabilities, version, progress)</td>
<td>Complete</td>
</tr>
<tr>
<td>DG-4</td>
<td>Rollback procedure documented + tested</td>
<td>Complete</td>
</tr>
<tr>
<td>DG-5</td>
<td>CHANGELOG with all DDs landed</td>
<td>Complete</td>
</tr>
<tr>
<td>DG-6</td>
<td>Privacy & data-handling document (what is sent to Anthropic API for Stage 1 / Stage 2; what is stored locally in `metrics.jsonl`, `coherence-log.md`, `subagent-history.jsonl`; how `.gitignore` and `coherence/ignore` are honoured; how `/coherence:share-metrics --anonymized` works)</td>
<td>Complete</td>
</tr>
</table>
## 4.8 Rollback Gate (DD-064)
<table header-row="true">
<tr>
<td>ID</td>
<td>Gate</td>
<td>Verification</td>
</tr>
<tr>
<td>RB-1</td>
<td>SemVer + `version.json` manifest written on install/upgrade</td>
<td>Verified by E2E install test</td>
</tr>
<tr>
<td>RB-2</td>
<td>Manual kill-switch (`.claude/coherence/disabled`) loads plugin in no-op mode</td>
<td>Dedicated test</td>
</tr>
<tr>
<td>RB-3</td>
<td>Crash self-disable after 3 hook exceptions per session</td>
<td>Dedicated test</td>
</tr>
<tr>
<td>RB-4</td>
<td>Older plugin reading newer state → read-only mode + upgrade prompt</td>
<td>Dedicated test</td>
</tr>
<tr>
<td>RB-5</td>
<td>Documented rollback command (`claude plugin install coherence@<old>`)</td>
<td>Smoke-tested</td>
</tr>
</table>
## 4.9 Acceptance Checklist
v0.1 is shippable when **all** below are checked. This is the literal sign-off list.
- [ ] All E2E scenarios E2E-1 .. E2E-9 (incl. E2E-3b) green on every matrix cell, flakiness ≤1%
- [ ] Quality gates QG-1 .. QG-6 meet thresholds
- [ ] Performance gates PG-1 .. PG-5 meet budgets, no \>30% regression
- [ ] Reliability gates RG-1 .. RG-4 pass, 0 corruption events
- [ ] Security gates SG-1 .. SG-4 clean
- [ ] Documentation gates DG-1 .. DG-6 complete
- [ ] Rollback gates RB-1 .. RB-5 verified
- [ ] Sign-offs from product owner, tech lead, QA lead
- [ ] CHANGELOG and release notes published
- [ ] `release-v0.1.0` tag created on green CI run
## 4.10 Definition of Done (per requirement)
A functional / non-functional requirement is **Done** when:
1. Implementation merged to main behind passing CI.
2. Linked from at least one E2E or fixture test that exercises it.
3. Mentioned in `coherence-log.md` schema or `/coherence:status` output if user-visible.
4. Documented in the README or slash-command reference if surface-level.
5. Tracked in CHANGELOG with the DD reference.
