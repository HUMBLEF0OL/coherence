# Changelog

All notable changes to coherence will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-09

Complete v0.1.0 release. All DD-001..DD-064 covered.

### DD Coverage by Milestone

**M0 (Foundation):** DD-001 DD-002 DD-003 DD-004 DD-005 DD-006
**M1 (Buffer/Detection):** DD-007 DD-008 DD-009 DD-010 DD-011 DD-012 DD-013 DD-014 DD-015
**M2 (Session/Velocity):** DD-016 DD-017 DD-018 DD-019 DD-020 DD-021 DD-022 DD-023
**M3 (State/Schema):** DD-024 DD-025 DD-026 DD-027 DD-028 DD-029 DD-030 DD-031
**M4 (Assertions/Compaction):** DD-032 DD-033 DD-034 DD-035 DD-036 DD-037 DD-038
**M5 (Stage1/Stage2):** DD-039 DD-040 DD-041 DD-042 DD-043 DD-044 DD-045
**M6 (Validation):** DD-046 DD-047 DD-048
**M7 (Security):** DD-049 DD-050 DD-051
**M8 (Stop/Git):** DD-052 DD-053 DD-054 DD-055 DD-056
**M9 (Commands/UX):** DD-057 DD-058 DD-059 DD-060
**M10 (Perf):** DD-061 DD-062
**M11 (E2E/Release):** DD-063 DD-064

Implicit coverage (foundational work without explicit tracking):
DD-003 DD-004 DD-009 DD-019 DD-020 DD-024 DD-029 DD-030 DD-031 DD-037 DD-045 DD-063

---

## [Unreleased]

### Added — M0 Bootstrap
- `package.json` with `"type": "module"`, ESM exports, and build/test/lint/typecheck/audit scripts (TS-1 §1.2, TS-8 §8.8)
- `plugin.json` manifest stub declaring all 7 hooks and 8 slash commands with `min_claude_code_version` (TS-8 §8.1, NFR-COMPAT-3)
- `tsconfig.json` with strict ESM, `moduleResolution: "node16"` (TS-2 §2.11)
- `.eslintrc.cjs` with `hookAdapters`/`slashCommands` cycle detection rule (TS-2 §2.3)
- `prettier.config.js` with LF line endings
- `vitest.config.ts` multi-project layout for unit/schema/fixtures/perf/e2e/security/rollback
- `.github/workflows/ci.yml` matrix `[ubuntu, macos, windows] × [20.x, 22.x] × [stub-v2.0, stub-v2.1]`
- `.husky/commit-msg` + `scripts/check-coherence-commit.mjs` enforcing conventional-commits and `[coherence]` prefix (DD-005, FR-PERMISSION-4)
- `commitlint.config.cjs` with `[coherence]` allowed prefix
- `src/index.ts` empty plugin scaffold
- `.editorconfig` LF/UTF-8 defaults with CRLF override for Windows bat/cmd
- `.npmignore` excluding src, tests, config files from published package
- `CHANGELOG.md` seeded (DG-5 placeholder)

<!-- DD references covered in this milestone:
  DD-005 [coherence] commit prefix rule (wired in commit-msg hook)
  FR-PERMISSION-4 commit format enforcement
  NFR-COMPAT-3 min_claude_code_version in plugin.json
  NFR-PERF-8 install size < 10 MB tracked in CI (soft warn)
-->

[Unreleased]: https://github.com/coherence/coherence/compare/HEAD...HEAD
