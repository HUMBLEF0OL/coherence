# Coherence v0.3.0

First team-distributable release of the `cohrence` Claude Code plugin.

## Highlights

- **Monorepo scope-cache (G-3)** — `/coherence:scope-debug`, depth-8 ancestor walks of `CLAUDE.md` + `coherence/scope.json`, mtime-keyed eviction, 1:100 telemetry sampling. PostToolUse populates the cache on the hot path.
- **Two-file additive ignore (G-2)** — `coherence/ignore` (committed) + `coherence/ignore.local` (personal) via `/coherence:ignore-split`. SessionStart runs the team-ignore FSM sweep; matching proposals transition to `ignored_by_team`.
- **Cross-team plan store (G-4)** — `coherence/plans/<branch-sha>/<plan-id>.json` files. Three new slash commands: `/coherence:plan-create`, `/coherence:plan-accept`, `/coherence:plan-reject`. SHA-256 author-hash identity, deterministic plan ids, `withCacheLock` serialisation.
- **Metrics export + first-run consent (G-5)** — `/coherence:export-metrics` writes redacted JSONL; copy-paste curl printed only when `upload_consent: true`. Two-tier consent (local opt-out, upload opt-in).
- **De-annotate + tombstone (G-6/G-8)** — `/coherence:de-annotate` two-mode (strip / keep-as-user-anchor) × three-scope. Trickle scanner consults tombstones before re-reading.
- **Ship-time gates** — `npm run gates` enforces `M-ARCH-1` (no backend), `M-PRIVACY-1` (no cross-dev leak), `M-LEGACY-1` (slim tarball). Wired into `scripts/release-ga.mjs`.

## Architectural commitments (permanent)

- **DD-117 — No backend, ever.** Plugin is file-only in perpetuity. No hosted upload, no project-side server.
- **DD-118 — No legacy version support.** Each major version stands alone. No v1→v2 / v2→v3 migrators, no rollback across major bumps.

## What's in the tarball

`dist/`, `plugin.json`, `prompts/v2/` (with the stage1/stage2 prompts plus v0.2 author/annotate prompts). Schemas copied to `dist/state/schemas/` at build time (19 files).

## Acceptance

- **Tests:** 813 passing across unit / integration / e2e / security / perf / preconditions / rollback / schema / cost / static-analysis / ship / fixtures
- **Gates:** 14/14 green (`npm run gates`)
- **Calibration:** 3/3 detectors pass M-CALIB-1 (Wilson 95% lower ≥ 0.7, recall = 1.0):
    - `bash_repetition`    : n=32, lower=0.839
    - `agent_correction`   : n=25, lower=0.772
    - `file_creation`      : n=15, lower=0.741
- **Audit history:** 4 independent audit passes closed, +48 tests added, 25 issues fixed

## Tarball

- Artifact: `cohrence-0.3.0.tgz`
- SHA-256: `736a195e2c7954e9542f94bf234c68a60166c036c254dac65e5d4d09b9afce40`
- Size: 11 files declared (`dist`, `plugin.json`, `prompts/v2`), 583 files total in pack manifest after dist expansion

## Install

```
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install
npm run build
```

Wire into Claude Code via `plugin.json`. Marketplace install is pending Anthropic registry submission.
