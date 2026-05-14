<!-- url: https://www.notion.so/35d010d46a70818793f8d6742c77fb5e -->
<!-- id: 35d010d4-6a70-8187-93f8-d6742c77fb5e -->
<!-- title: BRD-5 — Roadmap & Post-GA Commitments (v0.4) -->
**Parent:** [📋 BRD](https://www.notion.so/35d010d46a7081e0a2d9f7a928fbaa58) · [v0.4](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · **Status:** Draft 2026-05-11

## Sequencing gates (all closed)
- ✅ Gate #1 — `v0.3.0` GA tagged. Marketplace submission proceeds as independent operational task (M-LISTING-1).
- ✅ Gate #2 — `claude plugin validate` gating policy decided: tiered (errors halt; warnings log). (DD-123 ratified)
- ✅ Gate #3 — State-storage tri-partition decided. (DD-120 ratified)
- ✅ Gate #4 — Manifest layout migration = strict re-install. (DD-122 ratified)
- ✅ Gate #5 — v1.0 Notion scope = placeholder + Roadmap-bullet inlining. (OQ-v4-07 closed)
v0.4 BRD / Tech Spec authoring fully unblocked.

## v0.4.1 fast-follow (tentative — trigger-based)
Scope: trust signals — signed tarball, reproducible build, SECURITY.md, M6 static-analysis gates as verifiable README claims.
Trigger fires on any of:
1. ≥3 distinct installers request signed tarball/SBOM/reproducible build within 30 days of v0.4 GA.
2. Public CVE in any direct dep requiring fast-patch beyond v0.4 patch cadence.
3. Marketplace listing rejected/flagged for missing SECURITY.md/disclosure path.
4. Supply-chain audit issue ≥ medium.
If none fire by v0.4 GA + 30 days → trust-signal scope rolls to v0.5.
Evidence sources: GitHub issues (1, 4), CVE feed (2), marketplace email (3). Weekly manual triage. (DD-126)

## Post-GA commitments (automatic via trigger contracts)
- Author-pipeline planner promotion — `triggerContracts.ts` emits CLI hint when rolling 30-day window shows ≥25% cross-kind co-occurrence. User flips `COHERENCE_AUTHOR_PLANNER=1`. (DD-104; DD-129)
- Field calibration re-tune — emits CLI hint when ≥50 sessions × ≥30 days of metrics.jsonl data accumulated. Wilson 95% lower bound ≥0.7 acceptance criterion. (DD-116; DD-129)

## Operational tasks
- npm squat claim — Claim npm name `cohrence` as squat-prevention placeholder. No publish. DD-093.

## Deferred to v1.0
- Auto-apply / graduated trust ladder — DD-065 trust contract preserved. Net-new files never auto-land.
- Assertion checking (`asserts:` frontmatter).
- Quality-metrics dashboard.
- Cross-session pattern learning beyond 7-day rolling window (explicit opt-in).
- Deep `/coherence:audit` — token budget analysis, bloat warnings, cross-section consistency.

## Architectural commitments (permanent)
- DD-117 (no backend, ever) — v0.4 marketplace introduces no hosted services.
- DD-118 (no legacy version support) — applies recursively. v0.4 extends to manifest-layout migration (DD-122).
v0.4 introduces no new architectural commitments.

## Acceptance summary
v0.4 GA when: All FR-* pass; gate matrix green; M-LISTING-1 submitted; M-FIRSTIMPRESSION-1 + M-ABANDONMENT-1 at +30 days.
