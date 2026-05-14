<!-- url: https://www.notion.so/35c010d46a708155b3c6c0060e604214 -->
<!-- id: 35c010d4-6a70-8155-b3c6-c0060e604214 -->
<!-- title: v0.3 TS-1 — Architecture -->
Layered architecture (unchanged from v0.2; deltas additive).
Layer 1 Hooks: 6 same as v0.2 (SessionStart, PostToolUse, UserPromptSubmit, SubagentStop, Stop, PreCompact).
Layer 2 Detection/Signal: anchor scanner, section index, signal cache, bash/file/agent detectors. v0.3 adds src/state/scope/ for monorepo discovery (FR-SCOPE-1..4).
Layer 3 Pipeline: two-stage LLM (planner → patch writer), Stop orchestrator. Unchanged.
Layer 4 State: atomic writers, schema validation, locks. v0.3 adds plan-store (src/state/plans/) and scope-cache writer.
v0.3 deltas (additive): Scope-cache (FR-SCOPE-1..4) walks CLAUDE.md ancestors depth cap 8, caches in scope-cache.json (DD-106). Cross-team plan store (FR-PLANS-1..5) file-only coherence/plans/<branch-sha>/<id>.json reusing v0.2 LockManager (DD-100). No backend (DD-117). Install-time version refusal (NFR-COMPAT-N4) — SessionStart detects pre-v3 schema in version.json and refuses; no auto-migration (DD-094 superseded by DD-118).
Invariants: DD-065 quarantine boundary (Author/Annotate proposers never write outside .claude/coherence/proposals/<kind>/<id>/; v0.3 plan store only writes user-owned coherence/plans/). Per-store strict (P5). Bounded reads/writes (P6, P8). No backend (DD-117) — M-ARCH-1 enforces.
Module map (v0.3 additions): src/state/scope/ (walker, cache writer, resolver). src/state/plans/ (reader/writer, branch-sha helper, audit-log emitter). src/state/refuseLegacy.ts (NFR-COMPAT-N4) — replaces never-built v2_to_v3 migrator. src/commands/{exportMetrics,ignoreSplit,deAnnotate,scopeDebug}.ts.
