<!-- url: https://www.notion.so/35c010d46a7081a2b4a0da71adf2aa52 -->
<!-- id: 35c010d4-6a70-81a2-b4a0-da71adf2aa52 -->
<!-- title: 🛠️ Implementation Plan — v0.3 (M0..M8) -->
**Parent: **[v0.3](https://www.notion.so/35c010d46a7081539285e448bcd2cf35)  ·  **Status: **Draft 2026-05-10 (TSD GREEN)  ·  **Reads: **BRD-1..BRD-5, TS-1..TS-9, DD-093..DD-118.
*Nine milestones. M0 prepares the substrate; M1–M5 build features; M6–M7 close ship-time gates; M8 ships. Each milestone names concrete file deliverables, dependencies on prior milestones, and acceptance gates that must pass before moving on. Estimated total scope: \~2,500 LOC + tests + \~90 fixture cases. Implementable in 6–8 working days for a single developer at v0.2 pace.*
<span color="blue">**Conventions**</span>
- Per-milestone version bump to `0.3.0-pre.<N>` in package.json + plugin.json. M8 final cut bumps to `0.3.0`.
- Each milestone lands as a single squash-merged commit on master, mirroring v0.2's M0..M11 cadence. Working branches use `feat/v0.3-mN-<topic>` naming.
- Acceptance per milestone = (a) typecheck clean, (b) lint clean, (c) all listed tests pass, (d) any DD-cited behaviour observable via integration test or `/coherence:doctor`.
- Static-analysis gates (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-CALIB-1) run only at M6/M7/M8; earlier milestones don't fail on them while the corresponding feature is in-flight.
<span color="blue">**M0 — Bootstrap & legacy cleanup**</span>
- **Goal.** Prepare master for v0.3. Drop legacy artifacts. Wire NFR-COMPAT-N4 refusal. Stub the three new ship-time gate test files.
- **Cites.** DD-117, DD-118, DD-095 amended, DD-094 superseded, DD-080 retired. NFR-ARCH-1, NFR-ARCH-2, NFR-COMPAT-N4.
- **Deliverables: **(a) `package.json#version: 0.3.0-pre.0`; `files[]: ["dist", "plugin.json", "prompts/v2"]` (drops `prompts` bare-glob). (b) Delete `prompts/v1/` from filesystem and `src/state/migrate/v1_to_v2.ts`. (c) Create `src/state/refuseLegacy.ts` (NFR-COMPAT-N4 contract per TS-3); wire into SessionStart hook. (d) Stub `tests/static-analysis/{no-network,no-cross-dev-leak}.test.ts` + `tests/ship/tarball-shape.test.ts` (will be filled in M6). (e) `version.json` schema accepts `schema_version: 3`. (f) Seed `docs/v0.3/CHANGELOG.md` with M0 entry.
- **Tests added: **`tests/unit/state/refuse-legacy.test.ts` (covers fresh-install, pre-v3 refusal, current-v3 proceed).
- **Dependencies.** None.
- **Acceptance.** 575+ tests pass; tarball shape test asserts `prompts/v1/` absent; refuse-legacy unit covers all 3 outcomes; `version.json` schema validation accepts v3.
- **Size estimate.** \~150 LOC (mostly deletions + 1 new file). Half-day.
<span color="blue">**M1 — Scope cache (G-3)**</span>
- **Goal.** Monorepo discovery: walk-all `CLAUDE.md` ancestors with depth cap 8, cache resolved chain, ship `/coherence:scope-debug`.
- **Cites.** FR-SCOPE-1..4, DD-097, DD-098, DD-105, DD-106. NFR-PERF-1, NFR-PERF-N4, NFR-OBS-N5 (`scope_cache_miss` event).
- **Deliverables: **`src/state/scope/walker.ts` (reuses v0.2 P6 walker primitive); `src/state/scope/resolver.ts` (most-specific-wins + opt-in extends merge per DD-105); `src/state/scope/cache.ts` (atomic writer for `scope-cache.json`); `src/state/schemas/scope-cache.schema.json` + `scope-config.schema.json`; `src/commands/scopeDebug.ts`; `plugin.json` adds `coherence:scope-debug` entry; PostToolUse hook reads scope chain via the cache; `tests/perf/codebases/monorepo-{5,100}/` synthetic fixtures.
- **Tests added: **`tests/unit/state/scope/walker.test.ts` (depth cap, ancestor enumeration); `resolver.test.ts` (most-specific + extends merge); `cache.test.ts` (mtime-based eviction); `tests/perf/scope-cache-cold-start.test.ts` (NFR-PERF-N4 ≤200ms); `tests/integration/scope-debug-command.test.ts`.
- **Dependencies.** M0.
- **Acceptance.** `/coherence:scope-debug` on a 5-package fixture prints walked ancestors + winning scope; cold-start ≤200ms on monorepo-100; warm PostToolUse ≤50ms p95; `scope_cache_miss` event emitted (sampled 1:100).
- **Size estimate.** \~600 LOC (walker reuses v0.2; resolver + cache are new). 1–1.5 days.
<span color="blue">**M2 — Team-shared ignore (G-2)**</span>
- **Goal.** Two-file additive ignore. FSM amendment for `ignored_by_team` state. `/coherence:ignore-split` command.
- **Cites.** FR-IGNORE-1, FR-IGNORE-2, DD-096, DD-088 amendment.
- **Deliverables: **`src/commands/ignoreSplit.ts` (idempotent; auto-patches `.gitignore`); `src/state/ignoreReader.ts` amended to merge `coherence/ignore` + `coherence/ignore.local` (committed wins); `src/proposals/store.ts` amends FSM with `ignored_by_team` state (DD-088 amendment); `src/state/schemas/proposal-cache.schema.json` adds the new state value.
- **Tests added: **`tests/unit/proposals/ignored-by-team.test.ts` (FSM transition + v0.2 P15 / P4 constraints honoured); `tests/integration/ignore-split.test.ts` (idempotent run, .gitignore patch).
- **Dependencies.** M0.
- **Acceptance.** ignore-split runs idempotently on fresh repos; FSM transition emits `plan_ignored_by_team` event with audit-trail entry; v0.2 P15 (no duplicate `queued`) + P4 (no second `proposal_accepted`) preserved.
- **Size estimate.** \~250 LOC. Half-day.
<span color="blue">**M3 — Cross-team plan store (G-4)**</span>
- **Goal.** File-only plan store under `coherence/plans/`. Identity hashing. LockManager extension. Auto `.gitignore` patch for signal-cache + session-map.
- **Cites.** FR-PLANS-1..5, DD-099, DD-100, DD-107, DD-108, DD-109. NFR-PRIVACY-N5/N6, NFR-OBS-N5.
- **Deliverables: **`src/state/plans/{writer,reader,audit}.ts`; `appendPlanAudit()` helper (TS-3 C2 namespacing); `src/state/identity.ts` (SHA-256 of `git config user.email`); `src/state/locks.ts` extension for proposal-cache surface (DD-100); `src/state/schemas/plan.schema.json` amended (branch_sha + audit_log fields); `src/commands/doctor.ts` adds plan-staleness check (\>7 days); first-run installer auto-patches `.gitignore` for signal-cache + session-map.
- **Tests added: **`tests/unit/state/plans/writer.test.ts`; `reader.test.ts`; `audit.test.ts`; `tests/unit/state/identity.test.ts`; `tests/integration/cross-team-plan.test.ts` (two-process simulated git merge); `tests/unit/commands/doctor-plan-stale.test.ts`.
- **Dependencies.** M0, M2 (FSM amendment shape).
- **Acceptance.** plan_created/accepted/rejected events emitted; identity = 12-hex SHA-256 in plan files; LockManager extension blocks concurrent writers; doctor flags \>7-day plans; `.gitignore` auto-patch on first-run.
- **Size estimate.** \~500 LOC. 1–1.5 days.
<span color="blue">**M4 — Metrics export + first-run consent (G-5)**</span>
- **Goal.** `/coherence:export-metrics` command. Two-tier consent flow at first run. config.schema.json telemetry namespace.
- **Cites.** FR-EXPORT-1, FR-MARKETPLACE-5, DD-101, DD-115.
- **Deliverables: **`src/commands/exportMetrics.ts` (reuses v0.2 P8 bounded-read; redacts per DD-068; prints curl); `src/state/firstRun.ts` (two-tier consent prompt per TS-8 audit follow-up); `src/state/schemas/config.schema.json` adds `telemetry` object; `src/commands/status.ts` adds Telemetry line; `plugin.json` adds command entry.
- **Tests added: **`tests/integration/export-metrics.test.ts` (redaction verified; curl printed only when `upload_consent: true`); `tests/integration/first-run-consent.test.ts` (interactive + non-interactive paths; re-prompt when recorded_at absent); `tests/unit/commands/status-telemetry-line.test.ts`.
- **Dependencies.** M0; M3 (telemetry events shape).
- **Acceptance.** export-metrics writes redacted JSONL; `metrics_export_started` event emitted; consent persists across SessionStart; upload-OFF blocks curl print.
- **Size estimate.** \~300 LOC. Half-day.
<span color="blue">**M5 — De-annotate + tombstone (G-6/G-8)**</span>
- **Goal.** `/coherence:de-annotate` two-mode. Per-file scan tombstone shape (path-hash + content-hash + git_mtime).
- **Cites.** FR-DEANNOTATE-1/2, FR-TOMBSTONE-1, DD-102, DD-103, DD-110.
- **Deliverables: **`src/commands/deAnnotate.ts` (default strip; `--keep-as-user-anchor` graduates); `src/state/graduation.ts` adds `de_annotate` namespace (most-specific-wins per DD-102); `src/scanner/scanCacheTombstone.ts` (path-hash + content-hash + git_mtime tracking; LRU at 5,000 entries); `src/state/schemas/scan-cache-state.schema.json` augments per-entry shape; tombstone consultation wired into `src/scanner/trickleScanner.ts`.
- **Tests added: **`tests/integration/de-annotate.test.ts` (two-mode + scope persistence + user-edit hint); `tests/unit/scanner/tombstone.test.ts` (mtime invalidation + LRU + composition with v0.2 P7 memo).
- **Dependencies.** M0.
- **Acceptance.** de-annotate two-mode validated; tombstone hits avoid disk re-read on memo presence; LRU evicts past 5,000.
- **Size estimate.** \~350 LOC. 1 day.
<span color="blue">**M6 — Static-analysis gates**</span>
- **Goal.** Fill the M0-stubbed test files with real assertions. Wire 3 gates into `scripts/release-ga.mjs` preflight.
- **Cites.** M-ARCH-1, M-PRIVACY-1, M-LEGACY-1. NFR-ARCH-1, NFR-PRIVACY-N5, NFR-ARCH-2. DD-117, DD-118.
- **Deliverables: **`tests/static-analysis/no-network.test.ts` (grep `src/` for `node:net|node:http|node:https|node:dgram|fetch|XMLHttpRequest`; allowlist tests/cassettes); `tests/static-analysis/no-cross-dev-leak.test.ts` (asserts no codepath writes `signal-cache.json`/`session-map.json` under any `coherence/` path); `tests/ship/tarball-shape.test.ts` (asserts `npm pack --dry-run` excludes `prompts/v1/`); `scripts/release-ga.mjs` runs all 3 as preflight; `package.json` adds `npm run gates`.
- **Dependencies.** M0–M5 complete (gates run against the full v0.3 codebase).
- **Acceptance.** 3 gates pass on master; intentionally-broken local edits trip each gate (smoke-test by introducing then reverting a `fetch()` call).
- **Size estimate.** \~200 LOC. Half-day.
<span color="blue">**M7 — Corpus expansion + calibration**</span>
- **Goal.** Pass M-CALIB-1 floor (per-detector Wilson lower bound ≥0.7, recall ≥0.6) by expanding the synthetic corpus.
- **Cites.** M-CALIB-1, DD-076/077/078, DD-116. Existing v0.2.1 scaffold (`scripts/corpus-calibrate.mjs`, `docs/v0.2.1/calibration-plan.md`).
- **Deliverables: **Expand `tests/fixtures/signal-corpora/bash/` from 7 → \~30 cases (positive/negative/boundary/adversarial axes documented in calibration-plan.md). Same for `tests/fixtures/signal-corpora/correction/` (6 → \~30). Create `tests/fixtures/signal-corpora/file_creation/` from scratch (\~30). Update `tests/unit/signal/signal-corpora.test.ts` runner to handle file_creation kind. Run `npm run calibrate`; if grid recommends, tune `DEFAULT_*` constants in `src/signal/{bashRepetition,fileCreation,agentCorrection}.ts`. Wire `npm run calibrate` into `scripts/release-ga.mjs` preflight.
- **Dependencies.** M0 (calibrate framework already exists from v0.2.1 scaffold).
- **Acceptance.** `npm run calibrate` exits 0; release-artifacts/v0.3-corpus-calibration-\<ts\>.json shows precision_wilson_lower ≥0.7 + recall ≥0.6 for all 3 detectors.
- **Size estimate.** \~70 fixture JSON files + threshold tuning + script wiring. 1–1.5 days.
<span color="blue">**M8 — Release**</span>
- **Goal.** Tag v0.3.0 and ship to Anthropic plugin registry + GitHub release.
- **Cites.** DD-093, DD-114. FR-MARKETPLACE-1/3/4/5. M-INSTALL-1, M-COST-1, M-PERF-1.
- **Deliverables: **`package.json#version: 0.3.0`; `plugin.json#version: 0.3.0`; `README.md` v0.3 walkthrough section; `docs/v0.3/CHANGELOG.md` complete; `docs/v0.3/{commands,state-files,privacy,rollback}.md` (mirrors docs/v0.2/); run all 7 ship-time gates (`npm run gates && npm run calibrate && npm test && npm run pack:size`); `git tag -a v0.3.0 -m 'v0.3.0' master && git push origin v0.3.0`; submit to Anthropic plugin registry; GitHub release with SHA256 in notes.
- **Dependencies.** ALL prior milestones (M0–M7).
- **Acceptance.** v0.3.0 tag exists on origin; GitHub release published with tarball + SHA256; marketplace listing updated to v0.3.0; `/coherence:status` on a fresh clone reports v0.3.0.
- **Size estimate.** Documentation work + release ceremony. Half-day if all gates pass; otherwise iterate.
<span color="blue">**Sequencing summary**</span>
- **Critical path: M0 → M1 → M3 → M4 → M6 → M7 → M8.** M2 and M5 can land in parallel slots once M0 is done.
- **Total estimated scope: **\~2,500 LOC + \~70 fixture files + 25–30 new test files. Roughly 6–8 working days for a single developer at v0.2 cadence.
- **Risk register: **(R1) M-CALIB-1 may not pass on first corpus expansion — iterate by adjusting thresholds OR adding more boundary cases. (R2) NFR-PERF-N4 may need a faster scope cache primitive than naïve walker — fall back to git ls-files-based discovery (v0.2 P6 already supports). (R3) Anthropic registry submission timeline is external; if it lags M8, ship to GitHub first and resubmit registry afterwards.
*Ready to begin implementation. M0 is the unblocking step — it's mechanical (deletions + version bump + 1 new file) and clears all subsequent milestones. Recommend starting M0 immediately.*
— — —
<span color="green">**Audit follow-up round 2 2026-05-10 — plan amendments**</span>
<span color="blue">**M0 amendments**</span>
- P1 fix — add deliverable: amend `src/commands/recover.ts` to constrain rollback to within-major-version per DD-095 amended. v0.2 ships cross-major-version recover via `prompts/v1/` fallback; v0.3 must drop that branch. Implementation: when `recover` detects a target tag with major version != current, refuse with 'cohrence does not roll back across major versions; re-install the target version manually'. Test: `tests/unit/commands/recover-major-version-refusal.test.ts`.
- **P5 fix — 'stub' semantics for static-analysis tests.** The three M0-stubbed test files (`tests/static-analysis/{no-network,no-cross-dev-leak}.test.ts` + `tests/ship/tarball-shape.test.ts`) ship as files containing one `it.skip('TODO: filled in M6', ...)` block. Files exist, vitest discovers them, M6 fills them in by removing `.skip` and adding the assertions. Avoids 'no test files found' noise from vitest while M6 is pending.
- **Updated M0 size estimate.** \~200 LOC (up from \~150) to absorb the recover.ts amendment + tests. Still half-day.
<span color="blue">**M1 amendments**</span>
- P2 fix — add deliverable: `scope_cache_miss` telemetry event with 1:100 sampling. Lives inside `src/state/scope/cache.ts` (the cache writer). Sampling: a deterministic per-process counter `(missCount % 100 === 0)` emits the event; counter resets at SessionStart. Payload `{ ancestor_count, depth_cap_hit, walk_duration_ms }` per TS-3 round-1 follow-up. Test: `tests/unit/state/scope/cache-telemetry.test.ts` (asserts ≤ 1% emission rate).
<span color="blue">**M2 amendments**</span>
- **P3 fix — event-name correction (mirrors TSD C3).** M2 acceptance previously read 'FSM transition emits `plan_ignored_by_team` event' — should be **`proposal_ignored_by_team`** (the v0.2 proposal-cache FSM, not v0.3 plan store). Updated test name: `tests/unit/proposals/proposal-ignored-by-team.test.ts` (renamed from earlier draft). Renames the assertion target accordingly.
<span color="blue">**M3 + M4 — firstRun.ts boundary**</span>
- **P4 clarification.** M0 ships a `src/state/firstRun.ts` stub with `runFreshInstall()` that just writes `version.json#schema_version: 3` (called from refuseLegacy.ts). M3 extends `runFreshInstall()` with the .gitignore auto-patch step (signal-cache.json + session-map.json). M4 extends it with the two-tier consent prompt. Order inside `runFreshInstall()`: (1) write sentinel; (2) patch .gitignore; (3) prompt consent. Each step idempotent.
<span color="blue">**M6 amendments**</span>
- **P7 fix — meta-test for gate sensitivity.** Add `tests/static-analysis/meta-gates-trip.test.ts` that programmatically introduces a transient regression (e.g. writes a `fetch()` call to a tmp file, runs the gate against an isolated fixture, asserts the gate FAILS, then cleans up). Run as part of M6's vitest project so silent gate-pass regressions get caught automatically. \~50 LOC additional.
<span color="blue">**M8 amendments**</span>
- P6 fix — add deliverable: re-frame `docs/v0.2.1/calibration-plan.md` from 'pending' to 'historical' once v0.3 ships. Two options: (a) leave the v0.2.1 path as historical with a 'superseded by v0.3' banner; (b) move the file to `docs/v0.3/calibration-plan.md` and add a redirect note at the v0.2.1 location. Choice: (a) — cheaper and keeps the v0.2.1-as-history snapshot intact for diff tracing.
<span color="blue">**Updated total estimate**</span>
- Round 2 amendments add \~150 LOC + 3 test files across M0/M1/M6. New total: \~2,650 LOC + \~70 fixture files + 28–33 test files. 6–8 days estimate unchanged.
