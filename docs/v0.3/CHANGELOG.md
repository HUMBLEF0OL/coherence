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
