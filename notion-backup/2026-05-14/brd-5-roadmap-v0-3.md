<!-- url: https://www.notion.so/35c010d46a70815e9648e842493b141b -->
<!-- id: 35c010d4-6a70-815e-9648-e842493b141b -->
<!-- title: 🗺️ BRD-5 — Roadmap & Post-GA Commitments (v0.3) -->
**Parent:** [BRD](https://www.notion.so/35c010d46a708133b65dfad745442bf0) · **Status:** Draft 2026-05-10 (post DD-117/118)

**Sequencing gates (simplified for the no-audience reality)**
- Gate #1 — Tag and ship v0.3 directly. No v0.2 alpha period required (no users), no v0.2.1 separate calibration release.
- Gate #2 — Corpus calibration passes M-CALIB-1 floor. `scripts/corpus-calibrate.mjs` reports per-detector Wilson lower bound ≥0.7 against expanded corpus. Folded into v0.3 ship-time acceptance, not separate v0.2.1 release.
- Retired gates: v0.2.0 GA tag (no audience), v0.2-alpha telemetry (no alpha distribution), marketplace target choice (closed by DD-093), cross-team architecture choice (closed by DD-099).

**Architectural commitments — permanently rejected**
- Server-backed plan store / shared central database (DD-117).
- Hosted upload service / TLS-pinned client / GDPR retention windows / project-side data warehouse (DD-117).
- Cross-major-version migration paths (DD-118).
- Multi-channel publishing (npm registry as primary; DD-093).

**Post-GA commitments (still open, version-deferred)**
- Author-pipeline planner promotion. Once future version's telemetry shows ≥1-month rolling ≥25% cross-kind co-occurrence per DD-067, `COHERENCE_AUTHOR_PLANNER` flips to default ON. (DD-104)
- Field calibration. Once any version distributed and accumulates ≥50 sessions × ≥30 days observation, re-tune DD-076/077/078 thresholds against real `metrics.jsonl` using `scripts/corpus-calibrate.mjs --source=field`. (DD-116)

**Deferred to future versions (scope, not architecture)**
- Auto-generated runnable slash command handlers (v0.2 ships docs-only; future may auto-write JS handler).
- Cross-session learning.
- Auto-apply, assertion checking, quality-metrics.
