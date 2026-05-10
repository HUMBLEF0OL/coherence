# BRD-5 §1 — v0.2 Risk Register Sign-off

**Status:** Draft awaiting tech-lead + product-owner countersign for v0.2.0 GA.
**Cut date:** 2026-05-10.

Each row links the risk to its closing artifact (test, code module, or
documentation reference). To accept the row as **Mitigated**, both
sign-off columns must be filled. Risks marked **Accepted** carry a
known limitation that ships in v0.2-alpha and is documented in DG-6
(privacy.md) or DG-4 (rollback.md).

| ID | Risk | Closing artifact | Status | Tech-lead | Product-owner |
|----|------|------------------|--------|-----------|---------------|
| R-v0.2-01 | Author proposals misjudged → noise erodes v0.1 trust | DD-065 quarantine + SG-3 boundary tests + DD-067 cap + DD-092 calibration | Mitigated | _ | _ |
| R-v0.2-02 | PostToolUse 50 ms p95 budget regresses | DD-084 hot-path-zero-cost + tests/perf/v0.2-regression-gate.test.ts | Mitigated | _ | _ |
| R-v0.2-03 | v1 → v2 migration corrupts v0.1 state | DD-080 single coordinated atomic migrator + tests/rollback/v1-to-v2-migration.test.ts + D8 lock protection | Mitigated | _ | _ |
| R-v0.2-04 | DD-068 hash collisions leak content via signal aggregation | SG-1 12-hex collision bound test + DG-6 privacy review | Mitigated (legal review pending) | _ | _ |
| R-v0.2-05 | Annotate mode silently mutates user-owned docs | DD-065 quarantine + D2 manifest target_path overwrite + sidecar fallback | Mitigated | _ | _ |
| R-v0.2-06 | Statusline install corrupts user `~/.claude/settings.json` | install-statusline backup-then-write + uninstall-statusline restore + tests/security/v0.2/sg-3-statusline-install.test.ts | Mitigated | _ | _ |
| R-v0.2-07 | OSC 8 click affordance produces garbled badges in unsupported terminals | DD-071 four-tier degradation (claude_url > osc8 > osc52 > plain) + Q6 doctor probe extensions | Mitigated | _ | _ |
| R-v0.2-08 | Author + Annotate cost stack pushes session over budget | DD-085 60/30/10 partition + tests/cost/cg-author-share.test.ts + degraded-mode fallback | Mitigated | _ | _ |
| R-v0.2-09 | Proposal queue grows unboundedly | DD-075 three-fence expiry + DD-088 terminal states + E7 metrics.jsonl recurrence loader | Mitigated | _ | _ |
| R-v0.2-10 | Subagent provenance shape blocks DD-078 | OQ-v2-24 reformulation: invocation-aggregate ratio + S1 file-level fallback | Mitigated | _ | _ |
| R-v0.2-11 | v0.2-alpha consolidation feedback contradicts the no-planner choice | DD-067 staged adoption + M9 planner stage shipped (env-gated) + alpha telemetry observation | Mitigated | _ | _ |
| R-v0.2-12 | Cross-session `prior_response_id` leakage | FR-OBS-N2 explicit cache clear at SessionStart / SessionEnd + R3+S1 derivation logic | Mitigated | _ | _ |

## Known limitations carrying into v0.2-alpha

| Limitation | Source | Mitigation |
|---|---|---|
| `slash_command` accept ships markdown only | N5 design choice | User-facing warning in `propose-accept` rendered output (R1); CHANGELOG documents requirement to write JS handler manually |
| `agent_response_id` in file-level subagent mode falls back to `files_touched.length` | S1 fix | Length bucket may be uninformative; documented in DG-6 |
| `tests/cassettes/author/` cassettes are synthetic, not real-burn | M5 carry-over | Real-burn cost evidence captured during v0.2-alpha telemetry observation window |
| Legal review of DG-6 privacy.md | M10 deliverable | Required before v0.2.0 GA tag; not gating v0.2-alpha |
| `metrics.jsonl` retention via `runRetentionSweep` | T4 fix wires it at SessionStart | Inherited from v0.1 NFR-OBS-2 |

## Sign-off semantics

A v0.2.0 GA tag MUST NOT be cut until:
1. Every "Mitigated" row above is countersigned by tech-lead AND product-owner.
2. DG-6 legal review has signed off (additional row to be added below upon completion).
3. M9 planner-branch decision artifact (`docs/v0.2/dd-067-decision-<date>.md`)
   has been published based on alpha telemetry data.
4. M8 telemetry observation window has closed (≥50 sessions OR 30 days from
   `v0.2-alpha` tag, whichever first).

## Sign-off block

- [ ] **Tech lead:** _name_ ____________________________________ (date: ____ )
- [ ] **Product owner:** _name_ ________________________________ (date: ____ )
- [ ] **Legal review (DG-6):** _name_ __________________________ (date: ____ )
- [ ] **DD-067 planner-branch decision:** _date_ ________________
- [ ] **M8 observation window closed:** _date_ ________________
