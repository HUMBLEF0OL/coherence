<!-- url: https://www.notion.so/35c010d46a708131925dcdc8af80d451 -->
<!-- id: 35c010d4-6a70-8131-925d-cdc8af80d451 -->
<!-- title: v0.3 TS-6 — Validation -->
v0.3 keeps all four v0.2 runtime validations and adds two static-analysis gates that run at CI/ship time.
Runtime (v0.2 carry-forward): Hallucination check (src/validation/hallucination.ts) rejects patches referencing nonexistent symbols/files/APIs. Multi-language registries (TS, Python, Go, Rust, Java, Ruby). Sanity check, line-ratio gate, prompt-injection screen — src/validation/{sanity,lineRatio,promptInjection}.ts. Plan validator + proposal validator. All unchanged.
New v0.3 ship-time gates:
M-ARCH-1 (NFR-ARCH-1, DD-117): grep/AST scan asserts zero codepath in src/ imports node:net/http/https/dgram or fetch/XMLHttpRequest globals; zero literal HTTPS endpoint URLs except in tests/cassettes; zero writes outside .claude/coherence/ or user-owned coherence/. tests/static-analysis/no-network.test.ts.
M-PRIVACY-1 (NFR-PRIVACY-N5, DD-109): asserts no codepath in src/ writes signal-cache.json or session-map.json under any coherence/ (committed) path. tests/static-analysis/no-cross-dev-leak.test.ts. CI lints .gitignore for explicit entries; install adds them automatically (FR-IGNORE adjacent).
M-LEGACY-1 (NFR-ARCH-2, DD-118): asserts published tarball (npm pack --dry-run) contains no prompts/v1/ entries. tests/ship/tarball-shape.test.ts.
Audit follow-up 2026-05-10:
M-CALIB-1 (DD-076/077/078; DD-092 amended via DD-116): scripts/corpus-calibrate.mjs reports per-detector Wilson 95% lower bound. Acceptance: precision_wilson_lower ≥ 0.7 AND recall ≥ 0.6 per non-skipped detector. npm run calibrate preflight in scripts/release-ga.mjs — release fails fast on calibration-floor breach. Corpus expansion to ~30 cases per detector is M7 work; gate stays in CI by gating release, not test suite.
Test layout: corpus-calibrate gated in release-ga.mjs preflight, NOT vitest regular runs (CI speed). vitest has tests/unit/signal/signal-corpora.test.ts (v0.2 carry) asserting fixture expected_fired matches detector output — unrelated to calibration floor.
M-CALIB-2 (re-tune against real metrics.jsonl ≥50 sessions × ≥30 days): BRD-5 post-GA work, NOT v0.3 ship-time gate.
Updated ship-time gate roster: M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-CALIB-1. Four total, all failing-fast in release-ga preflight.
