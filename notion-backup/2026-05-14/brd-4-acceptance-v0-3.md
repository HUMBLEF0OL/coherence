<!-- url: https://www.notion.so/35c010d46a708180bd9ae9a069601528 -->
<!-- id: 35c010d4-6a70-8180-bd9a-e9a069601528 -->
<!-- title: 📊 BRD-4 — Success Metrics & Acceptance (v0.3) -->
**Parent:** [BRD](https://www.notion.so/35c010d46a708133b65dfad745442bf0) · **Status:** Draft 2026-05-10 (post DD-117/118)

Acceptance gates fall into two windows: ship-time (verified at v0.3 GA cut) and post-ship (verified at +60 days post-listing).

**Ship-time acceptance**
- M-COST-1 — Per-session cost ≤ v0.1-baseline × 1.30 (CG-1 + CG-2 partition tests). (NFR-COST-1)
- M-PRIVACY-1 — Static analysis: no path persists `signal-cache.json` or `session-map.json` across developer boundary. CI lint. (NFR-PRIVACY-N5)
- M-CALIB-1 — Corpus-calibrated thresholds (DD-076/077/078) pass Wilson 95% lower bound ≥0.7 against v0.3 corpus. Field calibration → M-CALIB-2 future. (DD-116)
- M-PERF-1 — PostToolUse stays under 50ms p95 in perf harness, including new scope-cache cold-start. (NFR-PERF-1, NFR-PERF-N4)
- M-INSTALL-1 — Install tarball ≤ 10MB on marketplace. (NFR-PERF-8, DD-095)
- M-ARCH-1 — Zero codepath in v0.3 reads/writes remote endpoint, opens network socket, or persists state outside `.claude/coherence/`. Static-analysis gate. (NFR-ARCH-1, DD-117)
- M-LEGACY-1 — v0.3 tarball contains no `prompts/v1/`; install on fresh project produces clean state; install on pre-existing v0.2 state directory refuses cleanly. (NFR-ARCH-2, DD-118)

**Post-ship acceptance (+60 days post-listing)**
- M-ADOPT-1 — ≥3 distinct teams using marketplace install within 60 days. Soft target. (G-1)
- M-IGNORE-1 — ≥1 entry per project on average in committed `coherence/ignore` across alpha cohort. (G-2)
- M-SCOPE-1 — Monorepo discovery passes (PostToolUse < 50ms p95) for repos with ≥5 nested packages × depth 8. (G-3)
- M-PLANS-1 — ≥1 cross-team plan accepted per active branch in alpha cohort, with audit-log entry attributing identity. (G-4)

Acceptance summary — v0.3 GA when all ship-time M-* gates pass. Listing on marketplace is +60 day clock starter.
