# Coherence v0.3 — CHANGELOG

> v0.3 turns Coherence from a single-developer tool (v0.2: solo-dev session-aware
> proactive proposals) into a team-distributable plugin. This file is the
> rolling delta against v0.2 master, organised by milestone (M0..M8) per
> [docs/superpowers/plans/2026-05-10-coherence-v0.3.md](../superpowers/plans/2026-05-10-coherence-v0.3.md).

## Architectural commitments (permanent — DD-117 / DD-118)

- **No backend, ever.** File-only plugin in perpetuity. Cross-team plans live
  as committed files under `coherence/plans/` (git is the substrate). No
  hosted upload service, no project-side server, no database. NFR-ARCH-1.
- **No legacy version support.** Each major version stands alone — no
  `v1→v2` / `v2→v3` migrators, no `prompts/v1/` in the tarball, no rollback
  across major bumps. NFR-ARCH-2.

## M0 — Bootstrap & legacy cleanup

**Substrate.** Master HEAD at plan inception, after v0.2 audit passes + lint
cleanup + docs updates.

**Version bumps.**
- `package.json#version` → `0.3.0-pre.0`
- `package.json#files[]` → `["dist", "plugin.json", "prompts/v2"]` (drops the
  bare `prompts` glob that would have shipped `prompts/v1/`)
- `plugin.json#version` → `0.3.0-pre.0`

**Legacy artifacts removed.**
- `prompts/v1/` directory tree. The stage1/stage2 prompt bodies and manifest
  fields (`schema_version`, `stage1_version`, `stage2_version`, `cassette_ids`)
  were folded into the unified `prompts/v2/manifest.json` — they are still
  active code, only the directory name was historical. DD-095 amended.
- `src/state/migrate/v1_to_v2.ts` — DD-080 single-coordinated-migrator. v0.3
  has no migration chain to participate in. DD-080 retired, DD-094 superseded.
- `tests/rollback/v1-to-v2-migration.test.ts` — paired test for the deleted
  migrator. The remaining preconditions/security/integration/e2e tests had
  their migrator references rewritten to either reference the new
  `refuseLegacy` contract or have the `v1→v2` assertion retired with a comment.

**New modules.**
- `src/state/refuseLegacy.ts` — NFR-COMPAT-N4 contract. Reads
  `.claude/coherence/version.json#schema_version` at SessionStart. Outcomes:
    - `=== 3` → proceed
    - `< 3` → emit one-line CLI message ("cohrence v0.3 does not migrate
      from earlier major versions; remove `.claude/coherence/` or run on a
      fresh project") and return cleanly without engaging degradedMode
    - absent → call `firstRun.runFreshInstall()`
- `src/state/firstRun.ts` (skeleton) — owns the v3 sentinel write via
  `initCoherenceDir`. M3 will hang the `.gitignore` patcher off this; M4 will
  hang the consent prompt off this.

**Wiring.**
- `src/hooks/sessionStart.ts` step 2 replaced: `runMigrations(...)` →
  `refuseLegacy(...) → runFreshInstall(...)` for fresh installs only.
- `HookResult` extends with optional `refusedLegacy?: boolean`.

**Recover amendment.** `src/commands/recover.ts` now accepts an optional
`target` (rollback target tag). When the target's major (treating
`major.minor` as the breaking-change key for 0.x plugins) differs from the
current plugin's major, recover refuses with: "cohrence does not roll back
across major versions; re-install the target version manually." Within-major
rollback paths are unchanged. DD-095 amended under DD-118.

**Schema.** `src/state/schemas/version.schema.json` already accepted v3
(integer, minimum 0); init.ts's `CURRENT_SCHEMA_VERSION` and `PLUGIN_VERSION`
constants bumped.

**Stubbed ship-time gates.** Three test files added, each guarded by
`it.skip` with an inline TODO citing the milestone that fills it:
- `tests/static-analysis/no-network.test.ts` — M-ARCH-1 / NFR-ARCH-1 / DD-117
- `tests/static-analysis/no-cross-dev-leak.test.ts` — M-PRIVACY-1 / NFR-PRIVACY-N5 / DD-109
- `tests/ship/tarball-shape.test.ts` — M-LEGACY-1 / NFR-ARCH-2 / DD-118

`vitest.config.ts` gains `static-analysis` and `ship` projects so these dirs
are discovered by `npm test`.

**New tests.**
- `tests/unit/state/refuse-legacy.test.ts` — covers fresh / pre-v3 (1, 2) /
  current-v3 / corrupt outcomes.
- `tests/unit/commands/recover-major-version-refusal.test.ts` — refuses
  `v0.2.0` and `v0.1.5` when running v0.3.x; accepts `v0.3.0-pre.0` and the
  no-target form.

**Acceptance closed.**
- Typecheck + lint + tests green
- `prompts/v1/` and `src/state/migrate/v1_to_v2.ts` absent from filesystem
- `npm pack --dry-run` excludes any path under `prompts/v1/` (filled fully in M6)
- refuse-legacy unit covers all outcomes
- recover refuses cross-major-version targets

## M1 — Scope cache (G-3)

DDs landed: DD-097 (walk-all CLAUDE.md ancestors, depth cap 8), DD-098
(sidecar `coherence/scope.json`), DD-105 (most-specific-wins + opt-in
`extends:`), DD-106 (dedicated `scope-cache.json` sibling of state-snapshot).

Modules:
- `src/state/scope/walker.ts` — bounded ancestor walk (depth 8, expanded
  skipDirs mirrors v0.2 P6 trickle scanner)
- `src/state/scope/resolver.ts` — most-specific-wins + `extends:` flag;
  `ignore[]` arrays merge additively
- `src/state/scope/cache.ts` — atomic writer for `scope-cache.json`,
  mtime-based eviction, 1:100 deterministic miss-counter sampling

Schemas: `scope-cache.schema.json` (plugin-managed `schema_version: 3`),
`scope-config.schema.json` (user-owned `schema_version: 1`).

Command: `/coherence:scope-debug <path>` — prints walked ancestors, per-key
provenance, cache hit/miss, and `extends:` opt-in status.

Telemetry: emits `scope_cache_miss` sampled 1:100; counter resets at
SessionStart.

Tests: walker (5), resolver (4), cache (5), cache-telemetry (3),
scope-debug-command integration (2), perf cold-start NFR-PERF-N4 (1).

## M2 — Team-shared ignore (G-2)

DDs landed: DD-096 (two-file additive model, committed-wins-on-conflict),
DD-088 amendment (FSM gains `ignored_by_team` state).

Two-file model:
- `coherence/ignore` — committed (team-shared)
- `coherence/ignore.local` — gitignored (per-developer)

Modules:
- `src/commands/ignoreSplit.ts` — `/coherence:ignore-split` idempotent setup
- `src/proposals/teamIgnore.ts` — FSM transition helper +
  `ignoreLineMatchesAnchor` predicate; emits `proposal_ignored_by_team`
  telemetry (round-2 C3 fix; NOT `plan_ignored_by_team`)
- `src/detection/pathFilter.ts` — amended to read both files at the new
  `coherence/` root

FSM: `ALLOWED_TRANSITIONS` extended; non-terminal states (queued, surfaced,
ignored) can fall to `ignored_by_team`. Schema bump on `proposal-cache.json`
(state enum + state_history.state enum). v0.2 P15 + P4 constraints honoured.

Tests: FSM transitions + telemetry payload (7), `/coherence:ignore-split`
idempotent run on fresh + existing repos (5).

## M3 — Cross-team plan store (G-4)

DDs landed: DD-099 amended (file-only end state per DD-117), DD-100
(LockManager extension), DD-107 (SHA-256 author_hash), DD-108 (branch-scoped
plan store, trunk via merge), DD-109 (signals stay per-developer).

Modules:
- `src/state/plans/writer.ts` — atomic plan create/write; deterministic
  `plan_id` from `branch_sha + author_hash + title + created_at`
- `src/state/plans/reader.ts` — per-branch + cross-branch listing,
  stale-plan filter
- `src/state/plans/audit.ts` — `appendPlanAudit()` (round-2 C2 namespacing
  separate from `appendProposalState`)
- `src/state/identity.ts` — `hashEmail()` 12-hex SHA-256; display name
  available in CLI surfaces only, never persisted

LockManager: `withCacheLock(filePath, namespace, fn)` helper added; gates
proposal-cache + plan-store writes per DD-100.

`firstRun.runFreshInstall()` extended: appends `signal-cache.json` and
`session-map.json` to `.gitignore` under `# cohrence — per-developer state
(do not commit)` header. Idempotent.

Doctor amendment: `runDoctor({ projectRoot })` flags any plan older than
`STALE_PLAN_THRESHOLD_DAYS` (7).

Tests: writer (5), reader (4), audit (4), identity (5), cross-team
integration with simulated branch merge + LockManager serialisation (2),
doctor stale-plan check (3).

## M4 — Metrics export + first-run consent (G-5)

DDs landed: DD-101 amended (file-export end state per DD-117), DD-115
(opt-out local / opt-in upload).

Modules:
- `src/state/consent.ts` — `recordTelemetryConsent`, `setTelemetryConsent`,
  `readTelemetryConsent`. Persists to `config.json#telemetry`.
- `src/commands/exportMetrics.ts` — `/coherence:export-metrics`. Reads
  `metrics.jsonl` (v0.2 P8 bounded-read at > 5 MB), filters by `--since`,
  redacts per DD-068 matrix, optional `--anonymized` hashing of
  `proposal_id`/`signal_hash`/`session_id`. Emits
  `metrics_export_started` event with `event_count_bucket`.

Curl line printed iff `upload_consent === true`. Audit log appended to
`.claude/coherence/coherence-log/exports.jsonl`.

Schema: `config.schema.json` gains `telemetry` namespace (additive).

Status amendment: `Telemetry: local=on/off, upload=on/off (defaults; will
re-prompt next interactive session)` line added.

Tests: export-metrics integration (6), first-run consent persistence +
re-prompt (5), status telemetry line (3).

## M5 — De-annotate + tombstone (G-6/G-8)

DDs landed: DD-102 (de-annotate scope: per-doc / per-directory / global;
most-specific-wins), DD-103 (tombstone shape), DD-110 (de-annotate two-mode:
default strip; --keep-as-user-anchor graduates).

Modules:
- `src/scanner/scanCacheTombstone.ts` — pure tombstone cache:
  `upsertTombstone`, `queryTombstone`, `normaliseTombstonePath`,
  `hashTombstoneKey`, `hashContent`. LRU at 5,000 (configurable for
  fast tests via `maxEntries`). Composes with v0.2 P7 doc-content memo.
- `src/commands/deAnnotate.ts` — `/coherence:de-annotate <target>
  [--scope per-doc|per-directory|global] [--keep-as-user-anchor]`. Strips
  or graduates auto-annotated blocks; persists scope decision in
  `graduation.json#de_annotate`. User-edit hint emitted on large recently
  modified targets.
- `src/state/graduation.ts` — `de_annotate` namespace + `setDeAnnotate` /
  `resolveDeAnnotate` helpers (most-specific-wins).

Schema: `graduation.schema.json` adds `de_annotate` array (additive).

Tests: tombstone (12 — including LRU + composition with v0.2 P7 memo),
de-annotate integration (5).

## M6 — Static-analysis gates

Closed: **M-ARCH-1** (NFR-ARCH-1, DD-117), **M-PRIVACY-1** (NFR-PRIVACY-N5,
DD-109), **M-LEGACY-1** (NFR-ARCH-2, DD-118).

Filled M0 stubs:
- `tests/static-analysis/no-network.test.ts` — walks `src/`, asserts no
  network imports, no global network constructors, no non-Anthropic HTTPS URLs
- `tests/static-analysis/no-cross-dev-leak.test.ts` — asserts per-developer
  state files never written under committed `coherence/` root + firstRun
  patches `.gitignore` correctly
- `tests/ship/tarball-shape.test.ts` — `npm pack --dry-run` excludes
  `prompts/v1/` and `src/state/migrate/v1_to_v2.ts`; ≤ 10 MB; dist schemas
  present

Round-2 P7 meta-test: `tests/static-analysis/meta-gates-trip.test.ts`
programmatically introduces synthetic regressions and asserts each gate
trips on them.

`scripts/release-ga.mjs` rewritten for v0.3: typecheck → lint → build →
gates → calibrate → tests → pack:size before tag.

Package script: `npm run gates` runs the static-analysis + ship vitest
projects.

## M7 — Corpus expansion + calibration (M-CALIB-1)

Closed: **M-CALIB-1** (per-detector Wilson 95% lower bound ≥ 0.7, recall ≥ 0.6).

Corpus expanded from 13 to 72 fixtures across three detectors:
- `bash_repetition`: 7 → 32 cases
- `agent_correction`: 6 → 25 cases
- `file_creation`: 0 → 15 cases (NEW)

Generator: `scripts/generate-corpus-fixtures.mjs` (idempotent — skips
existing files).

Corpus runner: `tests/unit/signal/signal-corpora.test.ts` extended for
`file_creation` kind.

Calibration result (`release-artifacts/v0.3-corpus-calibration-<ts>.json`):

| Detector | n | precision_lower | recall | recommended |
|---|---|---|---|---|
| bash_repetition | 32 | 0.839 | 1.000 | count=3, windowMin=30 (default) |
| agent_correction | 25 | 0.772 | 1.000 | count=3, ratio=0.2, windowMin=5 (default) |
| file_creation | 15 | 0.741 | 1.000 | count=3, jaccard=0.7 (default 0.8 → calibration recommends 0.7; left at default for v0.3, revisit in v0.4) |

`scripts/corpus-calibrate.mjs` strings + artifact path bumped from
`v0.2.1` to `v0.3`.

## M8 — Release

Final version bumps:
- `package.json#version` → `0.3.0`
- `plugin.json#version` → `0.3.0`
- `src/state/init.ts#PLUGIN_VERSION` → `'0.3.0'`
- `src/state/consent.ts#DEFAULT_PLUGIN_VERSION` → `'0.3.0'`

Documentation cut:
- `README.md` — v0.3 walkthrough section
- `docs/v0.3/CHANGELOG.md` — this file
- `docs/v0.3/commands.md` — slash command reference
- `docs/v0.3/state-files.md` — v0.3 state surfaces + two-tier `schema_version`
- `docs/v0.3/privacy.md` — telemetry events + redaction matrix
- `docs/v0.3/rollback.md` — within-major-version recover only
- `docs/v0.2.1/calibration-plan.md` — superseded banner appended

Tag: `v0.3.0` cut locally; release-ga script honours the new gates +
calibration preflight.

## Architectural commitments (BRD-3 NFR-ARCH-1/2; permanent, never deferred)

These are **not** scope deferrals. Listed here so future implementations
don't accidentally re-introduce them.

| Capability | Reason rejected | Reference |
|---|---|---|
| Server-backed plan store / shared central database | DD-117 — file-only architecture is the end state | DD-099 amended |
| Hosted upload service / TLS-pinned client / GDPR retention windows | DD-117 — telemetry stays file-export + user-driven curl | DD-101 amended |
| Cross-major-version migration paths (`v1→v2`, `v2→v3`) | DD-118 — each major version stands alone | DD-080 retired, DD-094 superseded |
| `prompts/v1/` in v0.3+ tarball | DD-118 — slim tarball; runtime only | DD-095 amended |
| `/coherence:recover` cross-major-version rollback | DD-118 — within-major-version only | DD-095 amended |
| `coherence/ignore` migration path for v0.2 users | DD-118 — fresh state on install | DD-111 retired |
| Multi-channel publishing (npm registry as primary distribution) | DD-093 — Anthropic registry only; npm name optional squat-prevention only | BRD-5 |

## Post-M8 audit closures (deep code-quality pass)

A second audit (focused on edge cases + correctness, not spec coverage)
flagged 6 bugs and 9 test gaps. Closures:

**Bugs fixed:**
- **B1** `refuseLegacy` now distinguishes legacy refusal (`schema_version < 3`,
  message: "does not migrate from earlier major versions") from
  future-major refusal (`schema_version > 3`, message: "found state from a
  NEWER major version on disk; upgrade the plugin"). Coerces JSON-string
  versions (`"3"`) to integer.
- **B4** `findStalePlans` now parses both timestamps via `Date.parse` so
  timezone-offset ISO strings (`...+05:30`) compare correctly against UTC.
  Plans with unparseable `created_at` are surfaced as stale (worst case)
  rather than silently misclassified.
- **B5** `readBoundedJsonl` only drops the first line of the tail-read when
  it's actually mid-line. Detected by reading one byte before the tail
  boundary; a `\n` there means the boundary fell on a record edge and the
  first line is intact.
- **B6** `redact` and `anonymise` are now recursive — DD-068 redaction
  applies to nested objects and arrays at any depth, defending against
  future event-payload extensions that nest raw data.
- **B7** `ANNOTATE_BLOCK_RE` tolerates CRLF line endings on Windows
  checkouts (`\r?\n` between the section line and `auto-annotated:`).
- **N8** `readBranchShaShort` no-git fallback bumped from `'unknown00000'`
  (non-hex `u`/`n`) to `NO_GIT_SENTINEL_BRANCH_SHA = '00000000000a'` so it
  satisfies `team-plan.schema.json` `^[0-9a-f]{12}$`.

**Edge cases hardened:**
- **E1** `firstRun.patchGitignore` and `ignoreSplit.runIgnoreSplit` strip a
  UTF-8 BOM before parsing. A BOM-prefixed `.gitignore` no longer causes
  re-append.
- **E6** `lifecycle.acceptPlan` and `rejectPlan` throw new
  `PlanNotFoundError` / `MalformedPlanError` instead of raw `ENOENT`/
  `SyntaxError`, with the offending file path attached.
- **E10** `tarball-shape.test.ts` now uses `shell: true` on every platform.
  Linux/macOS CI cells with shell-script `npm` shims (nvm, n, volta) no
  longer ENOENT.

**Test coverage added (+20 tests, 745 → 765):**
- T1: future-major / string version / missing schema_version (5 cases) →
  `tests/unit/state/refuse-legacy.test.ts`
- T3: timezone-offset ISO + unparseable timestamp (5 cases) →
  `tests/unit/state/plans/reader.test.ts`
- T4: recursive redaction + recursive anonymisation (2 cases) →
  `tests/integration/export-metrics.test.ts`
- T6: CRLF anchor + multi-anchor + graduated-anchor no-op (3 cases) →
  `tests/integration/de-annotate.test.ts`
- T7: BOM-prefixed .gitignore idempotency (1 case) →
  `tests/integration/first-run-consent.test.ts`
- T8: `withCacheLock` releases lock when `fn` throws (1 case) →
  `tests/integration/cross-team-plan.test.ts`
- T9: `acceptPlan`/`rejectPlan` raise typed errors for missing/malformed
  plan files (2 cases) → `tests/unit/state/plans/lifecycle.test.ts`

**Items accepted as documented limitations:**
- **B2** `parseMajor` formula `major*1000 + minor` is correct for 0.x.y
  pre-1.0 plugins (where `major.minor` is the breaking-change key) but
  conflates within-major minor bumps once the project reaches 1.0+. Not
  blocking v0.3; flag for revision when a v1.0.0 cut is planned.
- **E5** Two plans with the same `branch_sha + author_hash + title +
  created_at` (millisecond resolution) produce identical `plan_id` and the
  second write overwrites the first. Deterministic by design (M3 spec);
  documented in [docs/v0.3/state-files.md](state-files.md). Caller
  responsibility to vary title or wait ≥1 ms between rapid creations.
- **E9** `consent.promptInteractive` is a placeholder — Claude Code hooks
  run with stdout NOT being a TTY, so the interactive Y/n prompt is never
  reached. Defaults always apply (local ON, upload OFF). Future work:
  surface the prompt as a slash-command output rather than spawning a TTY
  question. Tracked as future v0.4 deliverable; not blocking v0.3.
- **N4** `/coherence:export-metrics --out <path>` accepts an absolute path
  outside the project root. Intentional — user-supplied. Worth flagging
  for the security review, not blocking.
