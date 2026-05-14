<!-- url: https://www.notion.so/35d010d46a708120a6a3cab4f8ec984c -->
<!-- id: 35d010d4-6a70-8120-a6a3-cab4f8ec984c -->
<!-- title: BRD-3 — Non-Functional Requirements (v0.4) -->
**Parent:** [📋 BRD](https://www.notion.so/35d010d46a7081e0a2d9f7a928fbaa58) · [v0.4](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · **Status:** Draft 2026-05-11

## Architectural commitments (permanent — NFR-ARCH-1/2)
- NFR-ARCH-1 (carry, permanent) — No backend, database, or hosted service ever. Enforced by ship-time gate M-ARCH-1. (DD-117)
- NFR-ARCH-2 (carry, permanent) — No legacy version support. No migrator from v0.3 plugin.json layout → v0.4 .claude-plugin/plugin.json layout. Users re-install. DD-118 extended by DD-122 (FR-LAYOUT-1). M-LEGACY-1.

## Security
- NFR-SECURITY-N1 (new) — `--out` path sandboxing for `/coherence:export-metrics`. Default in-tree only. Explicit `--allow-out-of-tree` flag + stderr warning for out-of-tree writes. (DD-128; FR-SANDBOX-1)

## Privacy
- NFR-PRIVACY-N5 (carry + extended) — Telemetry consent explicitly surfaced. `/coherence:consent` replaces silent-default model. Consent change logged with ISO timestamp in config.json. (DD-127; FR-CONSENT-1)
- NFR-PRIVACY-N6 (carry) — Plan author identity hashed end-to-end (DD-107). Plain name only in CLI display.

## Compatibility
- NFR-COMPAT-N4 (extended) — Manifest layout migration = strict re-install. `refuseLegacy.ts` extended with `refuse_layout` discriminant. (DD-122; FR-LAYOUT-1)
- NFR-COMPAT-N5 (new) — `parseMajor` correctness for ≥1.0.0. Ship-gate unit test asserts:
  - parseMajor('1.0.0') === parseMajor('1.0.99')
  - parseMajor('1.0.0') !== parseMajor('2.0.0')
  - parseMajor('0.3.0') !== parseMajor('1.0.0')
  (DD-124; FR-PARSEMAJOR-1)
- NFR-COMPAT-3 (carry) — `min_claude_code_version` bumped only if v0.4 feature requires newer Claude Code.

## Performance
- NFR-PERF-1 (carry) — PostToolUse 50ms p95. `triggerContracts.ts` at SessionStart uses bounded-read primitive only — < 20ms p95 with metrics.jsonl present.
- NFR-PERF-N5 (new) — Build/ship-time only:
  - `claude plugin validate` < 2s local run.
  - `scripts/generate-command-stubs.mjs` < 100ms for 25 stubs.
  - Validate result cache (sha256-keyed) eliminates re-runs on unchanged trees.

## Cost
- NFR-COST-1 (carry) — Per-session cost ceiling 0 sessions over v0.1-baseline × 1.30 (DD-112). v0.4 cost characterisation:
  - G-3 trigger-contract: non-LLM. Zero token cost.
  - G-2 ergonomics commands: user-initiated; not on hot path.
  - G-1 autogen: 25 stubs × ~50 tokens/stub ≈ 1.3k tokens static markdown.
  - G-4 parseMajor: O(1). Zero cost.

## Observability
- NFR-OBS-1 (carry) — Audit log captures every consent change with ISO timestamp. Trigger contract CLI hints one-time per threshold crossing (tracked in trigger-state.json).
