<!-- url: https://www.notion.so/35f010d46a70817bb94cd2f899959b3c -->
<!-- id: 35f010d4-6a70-817b-b94c-d2f899959b3c -->
<!-- title: BRD-5 — Roadmap & Post-GA Commitments -->
BRD-5 — ROADMAP & POST-GA COMMITMENTS (v1.0)
Sequencing gates (all closed 2026-05-13 — BRD authoring fully unblocked)
- Gate 1 — Trust score formula → DD-138 (exponential decay normalized ratio; 30-day half-life; cap 200 events; div-by-zero guard).
- Gate 2 — Net-new file trust threshold → DD-139 (score ≥ 0.85; ≥ 5 sections with positive score; ≥ 30-day ledger; hint + explicit /coherence:trust --promote).
- Gate 3 — Codebase assertion types → DD-141 (symbol_exists + file_exists in v1.0; multi-language via param suffix).
- Gate 4 — asserts: violation policy → DD-143 (per-assertion nested YAML with optional policy field; default warn; max 10 per section).
- Gate 5 — Team trust aggregate conflict resolution → DD-140 (recency-weighted per-author mean over personal trust scores).
Post-GA commitments (carry forward)
- TC-1 / TC-2 trigger contracts from v0.4 continue (DD-129). v1.0 adds no new trigger contracts. Field-calibration execution remains trigger-contract only.
- Architectural commitments DD-117 (no backend ever) and DD-118 (no legacy version support) carry forward permanently. v1.0 introduces no new architectural commitments.
Deferred to v1.1
- export_documented assertion type — deferred per DD-141 (complexity vs value tradeoff; requires per-language export scanning).
- signature_matches assertion type — deferred per DD-141 (high regex false-positive risk across doc/code format divergence).
- AST-based assertion types — deferred per DD-141 (require language-specific AST parsers; high complexity).
- Configurable token budget thresholds via coherence/config.json#audit.token_thresholds — deferred per DD-135 amendment (v1.0 hardcodes 2000/5000).
- Trust ladder for destructive patches — deferred indefinitely; current rule (DD-131 pass 1) keeps destructive patches always-confirm regardless of score, as the highest-risk review gate.
Non-goals (permanent or post-v2.0)
- Hosted backend, database, or network upload service — permanent non-goal (DD-117 / NFR-ARCH-1).
- Cross-organisation trust federation — permanent non-goal. Trust is per-repository.
- AI-generated assertion suggestions — non-goal. Coherence does not propose asserts: values; that is author intent.
- Automatic threshold tuning from field telemetry — non-goal. DD-116 field-calibration remains trigger-contract only (hint to user, no auto-flip).
- GUI / web dashboard for metrics — permanent non-goal. File-only plugin; a web surface would require a backend.
Marketplace status
Anthropic plugin registry listing submitted at v0.4 GA per M-LISTING-1; awaiting Anthropic review. cosign signing + SECURITY.md + Rekor transparency log delivered as v1.0 M4 trust signals strengthen the listing irrespective of review timeline. Acceptance of v1.0 is not gated on listing approval (which is an external review process).
Acceptance summary
v1.0 GA when all FR-\* pass; all M-\* gates green at tag; M6 README claims published; cosign-signed tarball available with Rekor entry. Tech Spec (TS-1..TS-N) is the next deliverable after BRD freeze.
——— BRD-5 AUDIT PASS 3 AMENDMENTS 2026-05-13 ———
Milestone implementation ordering (DD-136)
Distinct from the 5 spec-freeze sequencing gates above. DD-136 prescribes a trust-first implementation ordering for the M0–M4 milestones because the trust ledger (M0) is load-bearing infrastructure for M1 trust scoring, M3 metrics (revert rate, trust scores), and indirectly for G-2 team aggregate.
- M0 — Trust ledger foundation: trust-ledger.json schema, atomic writes, LRU eviction, division-by-zero guard. Implements FR-LEDGER-1, FR-LEDGER-5, NFR-TRUST-1/2, DD-138 formula.
- M1 — Trust ladder: per-section auto-apply rules, promote hint, /coherence:trust command suite, --auto-land scope. Implements FR-TRUST-1..5, FR-MANIFEST-5, DD-131/139/146.
- M2 — asserts: frontmatter: text-pattern registry, codebase-linked engine, per-assertion policy, language-suffix parsing. Implements FR-ASSERTS-1..5, DD-133/141/143.
- M3 — Metrics + deep audit: /coherence:metrics 5-section render, /coherence:audit free + --deep tiers, section-symbol-index.json. Implements FR-METRICS-1..3, FR-AUDIT-2..5, FR-TELEMETRY-1, DD-134/135/142/147.
- M4 — Trust signals + repair: cosign signing, SECURITY.md, README Verification, /coherence:repair extension for orphan trust keys, --unsigned local release. Implements FR-SIGN-1..5, FR-REPAIR-1, DD-137/144/145. M4 may run in parallel with M2–M3 once M0–M1 are complete (no dependency).
Per-DD-136: M0 must complete first; M1 depends on M0; M2 depends on M1 (for trust-ledger schema reads in validation pipeline); M3 depends on M2 (metrics surface assertion violations); M4 is parallel-capable from M2 onwards.
