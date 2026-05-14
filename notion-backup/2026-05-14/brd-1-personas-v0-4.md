<!-- url: https://www.notion.so/35d010d46a708109b3c4d3fe3ae28142 -->
<!-- id: 35d010d4-6a70-8109-b3c4-d3fe3ae28142 -->
<!-- title: BRD-1 — Personas & Use Cases (v0.4) -->
**Parent:** [📋 BRD](https://www.notion.so/35d010d46a7081e0a2d9f7a928fbaa58) · [v0.4](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · **Status:** Draft 2026-05-11

## P1 · Solo developer (continued from v0.3)
v0.4 changes for this persona:
- (a) Official marketplace install path replaces git-clone workflow.
- (b) `/coherence:consent` replaces silent default — consent state explicitly surfaced/modifiable.
- (c) `/coherence:audit` bundles doctor + scope-debug + status into single self-diagnosis report.
- (d) `/coherence:export-metrics --out` sandboxed to project root by default.

## P2 · Team developer (continued from v0.3)
- `triggerContracts.ts` (FR-TRIGGER-1) emits one-time CLI hints when field telemetry thresholds met — no code release required to promote author-planner or trigger calibration re-tune.
- All existing v0.3 team features unchanged.

## P3 · Tech lead / reviewer (continued from v0.3)
- `parseMajor` correctness (FR-PARSEMAJOR-1): refuse-future-version gate in `refuseLegacy.ts` will work correctly once any v1.0.x cut exists.

## P4 · First installer / marketplace browser (elevated in v0.4)
Primary new persona v0.4 optimises for. Every v0.4 goal measured against this persona's first-impressions experience:
- G-1 — Official marketplace listing → P4 finds coherence through standard Anthropic plugin discovery.
- G-2 — `/coherence:consent` explicit consent surface; `/coherence:audit` self-diagnosis; autogen stubs (DD-130) make all 25 slash commands discoverable on install.
- G-3 — Author-planner upgrade automatic when warranted via `triggerContracts.ts` CLI hint.
- G-4 — `parseMajor` correctness ensures no incorrect refusal of minor-version bump.
Success signals: M-FIRSTIMPRESSION-1 (p50 install-to-first-accept < 24h); M-ABANDONMENT-1 (< 30% abandon within 7 days).

## P5 · Plugin marketplace curator (new in v0.4)
- `claude plugin validate` passes clean — M-VALIDATE-1.
- Manifest at `.claude-plugin/plugin.json` with required fields populated — FR-MANIFEST-1, FR-MANIFEST-4.
- Slash commands discoverable via `commands/<name>.md` stubs — FR-AUTOGEN-1.
- Listing metadata accurate — OQ-v4-09 closure.
NOT needed yet (v0.4.1): SECURITY.md / responsible disclosure path; signed tarball / reproducible build / SBOM; M6 README claims (DD-126).
