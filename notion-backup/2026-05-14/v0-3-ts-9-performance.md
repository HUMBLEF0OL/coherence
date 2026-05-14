<!-- url: https://www.notion.so/35c010d46a70819d94f2c67cc71bf000 -->
<!-- id: 35c010d4-6a70-819d-94f2-c67cc71bf000 -->
<!-- title: v0.3 TS-9 — Performance -->
Carry-forward budgets (v0.2 unchanged):
NFR-PERF-1 — PostToolUse ≤ 50 ms p95. Includes new scope-cache consultation (FR-SCOPE-1); cold-start amortised by FR-SCOPE-4 (see NFR-PERF-N4).
NFR-PERF-N3 — trickle scanner cumulative budget < 100 ms per PostToolUse window. v0.3 inherits tests/perf/trickle-budget.test.ts.
NFR-PERF-8 — install size ≤ 10 MB. Slim tarball (DD-095 amended) makes comfortable.
New v0.3 budget: NFR-PERF-N4 — scope-cache cold-start ≤ 200 ms for repos up to 100 packages × depth 8. Cold start = first PostToolUse after process boot, scope-cache empty. After cold-start NFR-PERF-1 (50 ms p95) governs warm calls. New perf test tests/perf/scope-cache-cold-start.test.ts uses monorepo fixture below.
Perf harness fixtures (additions): tests/perf/codebases/monorepo-100/ — synthetic monorepo 100 packages × depth 8, CLAUDE.md in 30%, coherence/scope.json in 5%. Used for NFR-PERF-N4 + M-SCOPE-1 (post-ship). tests/perf/codebases/monorepo-5/ — smaller (5 packages × depth 4) for M-SCOPE-1 ship-time gate.
Telemetry overhead: metrics.jsonl write rate within v0.2 envelope (~1–10 events/session). v0.3 adds 4 new event kinds for cross-team plan transitions (plan_created, plan_accepted, plan_rejected, plan_ignored_by_team) + 1 export-metrics audit event. All hashed per DD-068. Total per-session bound < 50 events. 90-day retention sweep at SessionStart unchanged (v0.2 T4).
Cost ceiling: per-session cost ceiling = v0.1-baseline × 1.30 (DD-085 + DD-112). v0.3 candidate features non-LLM (export-metrics, ignore-split, scope-debug, de-annotate); G-7 author-pipeline planner env-gated default OFF (DD-104). Ceiling not stressed at default settings. CG-1 (per-session aggregate) and CG-2 (per-stage 60/30/10 partition) carry forward.
