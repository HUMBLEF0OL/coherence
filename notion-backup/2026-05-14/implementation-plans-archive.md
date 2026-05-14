<!-- url: https://www.notion.so/35f010d46a70810589c2f3736efd925a -->
<!-- id: 35f010d4-6a70-8105-89c2-f3736efd925a -->
<!-- title: 📋 Implementation Plans (archive) -->
Archive of all implementation plans moved out of the coherence repo on 2026-05-13 (post v1.0.0 ship). Each plan below links to its full markdown source in git history at master/cb52271 — the permalinks survive any future master rewrites because they pin a specific commit SHA. The repo lives at [github.com/HUMBLEF0OL/coherence](https://github.com/HUMBLEF0OL/coherence).
**Plans**
- v0.1 (2026-05-09, 679 lines, Shipped) — [full markdown](https://github.com/HUMBLEF0OL/coherence/blob/cb52271eb9aa792bcbc36bd97af13ab65511d216/docs/superpowers/plans/2026-05-09-coherence-v0.1.md)
- v0.2 (2026-05-09, 632 lines, Shipped) — [full markdown](https://github.com/HUMBLEF0OL/coherence/blob/cb52271eb9aa792bcbc36bd97af13ab65511d216/docs/superpowers/plans/2026-05-09-coherence-v0.2.md)
- v0.3 (2026-05-10, 568 lines, Shipped) — [full markdown](https://github.com/HUMBLEF0OL/coherence/blob/cb52271eb9aa792bcbc36bd97af13ab65511d216/docs/superpowers/plans/2026-05-10-coherence-v0.3.md)
- v0.4 (2026-05-11, 1862 lines, Shipped) — [full markdown](https://github.com/HUMBLEF0OL/coherence/blob/cb52271eb9aa792bcbc36bd97af13ab65511d216/docs/superpowers/plans/2026-05-11-coherence-v0.4.md)
- v1.0 (2026-05-13, 1122 lines, Shipped — [v1.0.0 release](https://github.com/HUMBLEF0OL/coherence/releases/tag/v1.0.0)) — [full markdown](https://github.com/HUMBLEF0OL/coherence/blob/cb52271eb9aa792bcbc36bd97af13ab65511d216/docs/superpowers/plans/2026-05-13-coherence-v1.0.md)
**v0.1 — initial release**
Goal: a single-package Node.js Claude Code plugin that detects documentation-vs-code drift across three layers (referring docs, skills, subagents), runs a two-stage Anthropic Sonnet-4.5 pipeline at Stop / /coherence:review to produce surgical patches, validates them deterministically (format → apply → change-class recount → line-count ratio → two-tier hallucination grep), and commits each approved bundle as one \[coherence\]-prefixed git commit. 12 milestones M0..M11 — critical path: M0 → M1 → M2 → M4 → M8 → M11.
**v0.2 — proactive detection (substrate: v0.1)**
Goal: extends v0.1 with proactive detection on top of the quarantine boundary (DD-065): watches for recurring user behaviour (DD-076 bash-repetition, DD-077 file-creation, DD-078 agent-correction), anchor-less docs (DD-069 annotate proposer), and idle-window drift (DD-066 trickle scanner). Surfaces proposals on demand through /coherence:propose-\*. v0.2 did NOT ship as a separate marketplace release per DD-118 — v0.3 was the first published version. Milestones M0..M10.
**v0.3 — team workflows (substrate: v0.2)**
Goal: extends v0.2 to team workflows — monorepo scope-cache (DD-097), two-file additive ignore (DD-096), cross-team plan store rooted at coherence/ (DD-099 amended; DD-117 file-only), file-only metrics export with first-run consent (DD-115), de-annotate + tombstone ergonomics (DD-103, DD-110), and ship-time static-analysis gates (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1). First published version. Two permanent architectural commitments introduced: DD-117 no backend ever; DD-118 no legacy version support.
**v0.4 — marketplace polish (substrate: v0.3.0)**
Goal: ship the official Anthropic marketplace listing structural requirements, first-impressions ergonomics polish, telemetry-gated trigger contracts, and the parseMajor correctness fix — all as v0.4.0.
- M0 — Manifest relocation + validate gate (DD-119, DD-121, DD-123). plugin.json moves to .claude-plugin/plugin.json.
- M1 — parseMajor fix + refuseLayout (DD-122, DD-124). SemVer major digit only.
- M2 — Trigger contracts (DD-129, DD-120). TC-1 author-planner promotion, TC-2 calibration re-tune.
- M3 — Consent + sandbox + audit (DD-125, DD-127, DD-128). /coherence:consent and /coherence:audit ship; --out always-on sandbox.
- M4 — Autogen stubs + sentinel dispatch (DD-130). commands/\<name\>.md generated from manifest.
- M5 — Tri-partition enforcement + release pipeline + version bumps + docs.
**v1.0 — trust + intelligence (substrate: v0.4.0)**
Goal: ship the trust + intelligence release — per-section trust ladder, cross-session learning, asserts: frontmatter, /coherence:metrics, deep /coherence:audit, and trust signals (cosign + SECURITY.md) — as v1.0.0.
- M0 — Trust Ledger Foundation (TS-2, DD-138 weighted score formula with 30-day half-life).
- M1 — Trust Ladder (per-section auto-apply gate; /coherence:trust 5-section status; team aggregate; auto-accept sweep).
- M2 — asserts: Validation Pipeline (7 engines: 5 text-pattern + symbol_exists / file_exists codebase-linked).
- M3 — Metrics + Deep Audit (/coherence:metrics, token-budget classifier, /coherence:audit --deep with flag-based cost gate).
- M4 — Trust Signals + Repair Extensions (cosign keyless OIDC, SECURITY.md, /coherence:repair --reassociate / --expire-orphans).
- Task 6 — Version bump 1.0.0 + docs + final ship gate.
Three audit passes folded inline. 23 M-gates closed; NFR-PERF bounds verified empirically: N6 ≈ 26 ms, N6-EXT ≈ 22 ms, N7 ≈ 3 ms, N8 ≈ 17.5 ms p95. Shipped as [v1.0.0](https://github.com/HUMBLEF0OL/coherence/releases/tag/v1.0.0) with cosign keyless OIDC signing.
