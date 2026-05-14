<!-- url: https://www.notion.so/35f010d46a7081cebb44fb2051a72df0 -->
<!-- id: 35f010d4-6a70-81ce-bb44-fb2051a72df0 -->
<!-- title: Design Decisions -->
Cross-version index of all DD-NNN identifiers. For full text and rationale per decision, follow the link into the release's Design Decisions sub-page.
## v0.1 — Foundation (DD-001..DD-040)
Core architecture, two-stage pipeline, section-ref anchor format, cassette system, validation pipeline. Notable: DD-117 file-only architecture.
## v0.2 — Author + annotate modes (DD-041..DD-085)
Quarantine boundary, three author-mode signals, propose-skill / propose-agent pipeline, statusline integration, trickle deep-scan. Net-new kinds defined here.
## v0.3 — Audit + consent (DD-086..DD-100)
/coherence:consent flow, /coherence:audit free tier, --out sandbox helper (DD-128 carry), cost-ledger telemetry.
## v0.4 — Tri-partition tier gate (DD-101..DD-130)
.claude-plugin/plugin.json manifest relocation, parseMajor SemVer fix, autogen command stubs, trigger contracts TC-1 / TC-2.
## v1.0 — Trust + intelligence (DD-131..DD-147)
- DD-131 — Per-section trust ladder; modifying patches auto-apply at score \>= 0.85. Destructive and frontmatter patches always require confirmation.
- DD-132 — Cross-session learning via personal trust-ledger + team aggregate; 180-day staleness window for active contributors.
- DD-133 — asserts: frontmatter pipeline with 5 text-pattern engines and 2 codebase-linked engines.
- DD-134 — /coherence:metrics 5-section report (summary, top drifting, trust, cost trend, revert hotspots).
- DD-135 — /coherence:audit --deep with flag-based confirmation (--confirm-deep \<sig\>) and CI bypass via --no-confirm.
- DD-136 — Milestone order: M0 trust ledger \> M1 trust ladder \> M2 asserts \> M3 metrics + deep audit \> M4 trust signals.
- DD-137 — Trust signals: cosign-signed tarball + SECURITY.md + reproducible build.
- DD-138 — Trust score formula: 30-day half-life (alpha = 0.977), weights accept = +1/+1, revert = -1/+1, edit = 0/+0.5.
- DD-139 — Net-new file gate; promoted developers can auto-land specific kinds via --auto-land.
- DD-140 — Team aggregate conflict resolution: arithmetic mean across active contributors; contested flag at \|aggregate\| \< 0.2 with \>= 2 contributors.
- DD-141..DD-147 — Codebase-linked assert types, asserts violation policy (block / warn), audit-deep stage enum in cost ledger, retro decisions during the v1.0 planning passes.
Full DD text for each version is in Releases \> \<version\> \> Design Decisions.
