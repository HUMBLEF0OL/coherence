<!-- url: https://www.notion.so/35d010d46a7081858d6ff32edcce2e2b -->
<!-- id: 35d010d4-6a70-8185-8d6f-f32edcce2e2b -->
<!-- title: 🛠️ 🛠️ Technical Specification (v0.4) -->
**Parent:** v0.4 · **Status:** Draft 2026-05-11 · **Source corpus:** BRD + DD-119..DD-130 + closed OQs
> All 5 sequencing gates closed. All 12 DDs ratified. TSD is authoritative for v0.4 implementation.
*Theme: v0.1 reacts → v0.2 proposes → v0.3 distributes → v0.4 polishes for first impressions.*
---
## Slice index
- TS-1 — Packaging & Build Pipeline — manifest move, autogen stubs, validate gate
- TS-2 — Hook Surface — SessionStart trigger contracts, UserPromptSubmit sentinel dispatch
- TS-3 — State Schemas — tri-partition, trigger-state.json, config.json consent extension
- TS-4 — LLM Pipeline — carry-forward; zero new LLM calls in v0.4
- TS-5 — Migration & Compatibility — refuse_layout discriminant, parseMajor fix
- TS-6 — Security & Privacy — --out path sandboxing, /coherence:consent
- TS-7 — Commands — consent.ts, audit.ts, sentinel dispatch, registration
- TS-8 — Release Pipeline — release-ga.mjs additions, CI wiring
---
## Implementation reading order
TS-5 (compat groundwork) → TS-3 (schema) → TS-1 (packaging) → TS-2 (hooks) → TS-6 (security) → TS-7 (commands) → TS-8 (release pipeline). TS-4 is reference-only.
## Critical path
M0 (manifest move + validate) → M1 (parseMajor + refuseLayout) → M2 (triggerContracts) → M3 (consent + audit commands) → M4 (autogen + sentinel dispatch) → M5 (static-analysis extension + release pipeline)
## Acceptance gates (carry from BRD-4)
M-TRIPLEX-1, M-LAYOUT-1, M-AUDIT-1, M-SEMVER-1, M-VALIDATE-1, M-AUTOGEN-1, M-PARSEMAJOR-1, M-TRIGGER-1, M-COST-1, M-CONSENT-1, M-SANDBOX-1 — all must be green at the v0.4.0 GA tag.
