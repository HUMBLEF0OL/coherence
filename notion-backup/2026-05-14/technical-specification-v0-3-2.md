<!-- url: https://www.notion.so/35c010d46a70815e9bd2f9a589e6ed9c -->
<!-- id: 35c010d4-6a70-815e-9bd2-f9a589e6ed9c -->
<!-- title: 🛠️ Technical Specification (v0.3) -->
**Parent:** v0.3 · **Status:** Draft 2026-05-10 · **Reads:** BRD-1..BRD-5, DD-093..DD-118.
*Implementation-level blueprint for v0.3. Most slices are short — v0.3 reuses the v0.2 substrate heavily. Substantive change concentrates in TS-3 (new state files), TS-7 (new commands), TS-8 (slim tarball + schema bump), and TS-9 (new perf budgets). TS-4/5/6 are near-stubs documenting that the v0.2 contract carries forward unchanged.*

## Slices
- TS-1 — Architecture — layered architecture; v0.3 deltas (scope-cache layer, plan-store layer, install-time refusal).
- TS-2 — Hooks — 6 existing hooks; SessionStart adds version refusal; PostToolUse consults scope cache.
- TS-3 — Data Model & Storage — 4 new state files, schema_version 2→3, no migrator (DD-094 superseded).
- TS-4 — LLM Pipeline — unchanged from v0.2; full carry-forward.
- TS-5 — Stop Orchestrator & Author Planner — Stop unchanged; planner stays env-gated default OFF (DD-104).
- TS-6 — Validation — 4 existing checks unchanged; 2 new static-analysis gates (M-ARCH-1, M-PRIVACY-1).
- TS-7 — Commands — 4 new commands (export-metrics, ignore-split, de-annotate, scope-debug); 16 existing carry forward.
- TS-8 — Plugin Manifest & Distribution — slim tarball; schema_version 3; new commands wired; npm channel optional.
- TS-9 — Performance — NFR-PERF-N4 scope-cache budget; perf harness adds monorepo fixture.

Child pages (URLs preserved for backup integrity):
- TS-1: https://www.notion.so/35c010d46a708155b3c6c0060e604214
- TS-2: https://www.notion.so/35c010d46a70815b86f2fea15406a4f3
- TS-3: https://www.notion.so/35c010d46a7081658a13e3795c12e5f3
- TS-4: https://www.notion.so/35c010d46a7081209377c025f389ca6f
- TS-5: https://www.notion.so/35c010d46a70817bb124ea53b113a26c
- TS-6: https://www.notion.so/35c010d46a708131925dcdc8af80d451
- TS-7: https://www.notion.so/35c010d46a7081e1a003d99bb2a5a85c
- TS-8: https://www.notion.so/35c010d46a7081e3b574c78ec2cda15a
- TS-9: https://www.notion.so/35c010d46a70819d94f2c67cc71bf000
