# Changelog

All notable changes to coherence will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
