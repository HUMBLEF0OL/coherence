# Coherence v0.1 Implementation Plan

> **For agentic workers:** This is a milestone-broken plan, not a step-broken plan. Hand each milestone to `subagent-driven-development` (recommended) or `executing-plans` to be decomposed into TDD-sized steps. Sequencing rules and gate bindings in each milestone are normative — milestones are not "done" until every listed BRD-4 gate is green on every CI matrix cell.

## Overview

Coherence v0.1 is a single-package Node.js (20.x/22.x LTS) Claude Code plugin that detects documentation-vs-code drift across three layers (referring docs, skills, subagents), runs a two-stage Anthropic Sonnet-4.5 pipeline at `Stop` / `/coherence:review` to produce surgical patches, validates them deterministically (format → apply → change-class recount → line-count ratio → two-tier hallucination grep), and commits each approved bundle as one `[coherence]`-prefixed git commit. The plan slices implementation into **12 milestones (M0..M11)** following the dependency contour of the spec: bootstrap → durable state → safe hook shell → deterministic detection → SessionStart pipeline → subagent + mid-session → LLM client + Stage 1 → Stage 2 + validation → Stop orchestrator + git → slash commands + UX → test gates harness → docs + release. Risk front-loading is hard-wired: **R-14 schema migration** stands up in M1 (with the `migrate_v{n}_to_v{n+1}` chain and quarantine), **R-4 Stop crash resume** stands up in M8 alongside `stop-progress.json` (E2E-4 lands the same milestone), **R-1 hallucination escape** stands up in M7 with the DD-058 corpus and QG-4 gate. Critical path is **M0 → M1 → M2 → M4 → M8 → M11**; M3+M6 and M10 fixture-authoring are parallelizable side tracks.

## Critical Path Diagram

```text
                                    ┌────────────────────────────────────────────────────────┐
                                    │                                                        │
M0  ──►  M1  ──►  M2  ──►  M3  ──►  M4  ────────────────────────►  M8  ──►  M9  ──►  M10 ──► M11
bootstrap state    hook    detect   SessionStart                   Stop     slash    test    docs
        +          shell  +buffer   +revalidate                    pipeline cmds     gates  +release
        schemas    +safety          +assertion                     +git     +UX      +E2E
        +migrate                    +revert                        +commit
        (R-14)                      +velocity                      +resume
                                                                   (R-4)
                            ▲       ▲                               ▲
                            │       │                               │
                            └───────┴─── M5 (subagent + mid-session)┤
                                                                    │
                                    M6 ────────────────────► M7 ────┘
                                    LLM client                Stage 2
                                    +cassettes                +validation
                                    +Stage 1                  +halluc grep
                                    +canonical                +DD-058 corpus
                                    algo                      (R-1)

Parallelizable side tracks:
 - M6 may start as soon as M1 is done; runs in parallel with M3..M5
 - M10 reference-codebase + cassette authoring may start in M3
 - DG-* doc drafting (M11) may begin incrementally from M2 onward
```

## Milestones

---

### M0 — Project Bootstrap

**Goal:** Produce a buildable, lintable, type-checked, CI-green empty plugin scaffold that already satisfies the cross-platform matrix and conventional-commit policy.

**TS sections implemented:** TS-1 §1.2 (deployment shape only), TS-8 §8.1 (manifest skeleton), TS-8 §8.8 (distribution constraints), TS-9 §9.2 (CI matrix wiring).

**BRD-4 gates closed (foundational only):** none fully closed; the matrix `os × node × claude_code_version` from BRD-4 §4.1 is wired here so every later gate inherits it. SG-1 (`npm audit --audit-level=high` → 0) wired but enforced from M1 onward. SG-4 (secret scan in CI) wired here.

**Key deliverables:**
- `package.json` (name `coherence`, `"type": "module"`, `engines.node: ">=20"`, scripts `build|test|lint|typecheck|audit`).
- `plugin.json` — Claude Code plugin manifest stub declaring hooks (`SessionStart`, `PostToolUse`, `UserPromptSubmit`, `SubagentStop`, `Stop`, `SessionEnd`, `PreCompact`), slash commands (`/coherence:status|review|repair|recover|doctor|graduate|enable-sidecars|share-metrics`), and `min_claude_code_version` (NFR-COMPAT-3).
- `tsconfig.json` (strict, ESM, `moduleResolution: "node16"` per TS-2 §2.11).
- `.eslintrc.cjs` + `prettier.config.js` + lint rule forbidding `hookAdapters` / `slashCommands` import cycles (TS-2 §2.3).
- `vitest.config.ts` with multi-project layout for `tests/unit`, `tests/schema`, `tests/fixtures`, `tests/perf`, `tests/e2e`, `tests/security`, `tests/rollback`.
- `.github/workflows/ci.yml` — matrix `[ubuntu-latest, macos-latest, windows-latest] × [20.x, 22.x] × [stub-v2.0, stub-v2.1]`; jobs: lint, typecheck, unit, schema, audit, secret-scan.
- `.husky/commit-msg` + `scripts/check-coherence-commit.mjs` enforcing conventional-commits AND the `[coherence]` prefix rule for tool-emitted commits (DD-005, FR-PERMISSION-4).
- `commitlint.config.cjs` with `[coherence]` allowed prefix.
- `src/index.ts` exporting empty default object.
- `LICENSE` (preserve existing) + `README.md` stub with the install + observe-mode walkthrough scaffold (DG-1 placeholder).
- `CHANGELOG.md` seeded (DG-5 placeholder).
- `.gitignore`, `.npmignore`, `.editorconfig` (LF/UTF-8 default; respect `core.autocrlf` on Windows — see R-12).

**Test artifacts:** none (smoke test that `npm run build && npm test` exits 0 on every matrix cell).

**Risks mitigated:** R-12 (CI matrix gives Windows coverage from day one), foundational footing for R-6.

**Parallelizable tracks within milestone:** ESLint/Prettier config and CI workflow may be authored in parallel with `package.json` and `tsconfig.json`; commit-message guard is independent of build wiring.

**Done when:**
- [ ] `npm ci && npm run build && npm test && npm run lint && npm run typecheck && npm audit --audit-level=high` passes locally on Linux, macOS, and Windows.
- [ ] CI green on every matrix cell with the empty `src/index.ts`.
- [ ] Pushing a commit without `feat:` / `fix:` / `[coherence]` prefix is rejected by `commit-msg` hook.
- [ ] `plugin.json` validates against Claude Code's published manifest schema (or a documented stub schema if upstream not yet published).
- [ ] Install size measured (`npm pack && du -k`) is < 10 MB (NFR-PERF-8) — track in CI as a soft warning, hard gate in M11.

**Dependencies:** none (root milestone).

---

### M1 — Persistent State Layer + Schema Migration Harness (R-14)

**Goal:** Deliver `stateStore` with atomic writes, advisory locks, schema validation via `ajv` draft-07, quarantine-on-corruption, and a working `migrate_v{n}_to_v{n+1}` chain — proven against a synthetic v0.0.x → v0.1 fixture.

**TS sections implemented:** TS-3 (entire), TS-8 §8.5 (migration chain), TS-8 §8.6 (rollback artifacts), TS-7 §7.8 (NFR-MAINT-2).

**BRD-4 gates closed:**
- **RG-2** atomic-write rollback dedicated test.
- **RB-1** SemVer + `version.json` written on install/upgrade.
- **RB-4** older-plugin reads newer state → read-only mode + upgrade prompt.
- Partial **RG-1** foundation (zero-corruption invariant exercised by quarantine + atomic writes).
- **NFR-MAINT-2** schema migration chain.
- **NFR-RELIABILITY-1, -7** (atomic writes, quarantine retention).

**Key deliverables:**
- `src/types/index.ts` — public-type barrel: `BufferEntry`, `CoherencePlan`, `Patch`, `HostCapabilities`, `ChangeClass`, `SectionRef` branded string (TS-3 §3.14, NFR-MAINT-3).
- `src/state/stateStore.ts` — temp+rename atomic writes, ajv-validated reads, append-only mutation for `pending.md` / `coherence-log.md` / `metrics.jsonl` / `subagent-history.jsonl` via temp+rename of full file.
- `src/state/locks.ts` — advisory `<file>.lock` (TS-6 §6.6, FR-FAILURE-3, FR-FAILURE-3b, DD-041): `{pid, started_at, hostname, namespace_hint}`, alive-check via `process.kill(pid, 0)` for same hostname/namespace; age-only fence cross-host; 30 s buffer fence / 5 s scanner fence (reserved); exponential backoff 10/20/40 ms cap 500 ms total ≤5 s; degraded-mode flag after 3 consecutive timeouts.
- `src/state/quarantine.ts` — last-10-per-file retention, `quarantine/<filename>.<unix-ts>.bak` (NFR-RELIABILITY-7).
- `src/state/schemas/` — JSON Schema (draft-07) files per state file: `config.schema.json`, `version.schema.json`, `host-capabilities.schema.json`, `drift-buffer.schema.json`, `velocity.schema.json`, `stop-progress.schema.json`, `cost-ledger.schema.json`, `subagent-stats.schema.json`, `section-index.schema.json`, plus the `plan.schema.json` (Stage 1 output, used in M6).
- `src/state/migrate/` — one file per `v{n}_to_v{n+1}` step (only `v0` → `v1` for v0.1 first ship; chain is in place for v0.2+). On failure: quarantine, fresh defaults, log, continue (FR-FAILURE-2).
- `src/state/pathNormaliser.ts` — DD-027: OS canonical realpath, forward-slash, lowercase casing tracked but case-sensitive comparison; section-ref normalisation per FR-DETECT-15 (`[a-z0-9_-]+`).
- `src/state/sentinels.ts` — read-only helpers for `.claude/coherence/DISABLED` and `.claude/coherence/disabled` (TS-3 §3.1 split rationale).
- `src/state/init.ts` — first-touch creation of `.claude/coherence/` per TS-3 §3.1 (called by SessionStart in M2/M4).
- `src/util/time.ts` — shared `nowIsoUtc()` helper (`new Date().toISOString()`) used by every log writer to satisfy **NFR-OBS-5** (ISO-8601 UTC timestamps everywhere).
- `tests/schema/` — round-trip validation per state file (RG-2: write → kill mid-rename → recover).
- `tests/rollback/migration.test.ts` — synthetic v0.0.x state file in `tests/fixtures/migration/v0/`, run migrate, assert v1 shape, assert pre-migration backup in `quarantine/`, assert `prior_versions` appended (DD-064). **This is the R-14 + E2E-8 harness foundation.**
- `tests/rollback/atomic-write.test.ts` — induced crash mid-rename verifies no partial write (RG-2).
- `tests/rollback/quarantine-retention.test.ts` — 11 corruption events → only 10 backups kept.

**Test artifacts:** `tests/fixtures/migration/v0/*` synthetic state corpus; `tests/fixtures/state/valid/*.json` and `tests/fixtures/state/corrupt/*.json` schema-fixture corpus.

**Risks mitigated:** **R-14** (schema migration harness landed *with* the storage layer, not at the end). R-12 line-ending preservation (NFR-COMPAT-5) covered by atomic-write tests on Windows.

**Parallelizable tracks within milestone:**
- Schema files (one per state file) can be authored in parallel.
- Lock manager and quarantine can be authored in parallel with the migration chain.

**Done when:**
- [ ] All schemas validate against valid fixtures and reject every corrupt fixture (RG-1 foundation).
- [ ] `migrate_v0_to_v1` runs on the v0.0.x synthetic fixture, leaves a `quarantine/<file>.<ts>.bak` copy, appends prior version to `version.json#prior_versions`.
- [ ] Lock contention test simulates 3 timeouts on a single file → degraded-mode flag set (FR-FAILURE-4).
- [ ] Older-plugin reads-newer-state test enters read-only mode and refuses writes (RB-4).
- [ ] Atomic-write rollback test passes on Windows + macOS + Linux.

**Dependencies:** M0.

---

### M2 — Hook Adapter Shell, Kill-Switches, Crash Self-Disable

**Goal:** Wire every Claude Code hook event to a no-op shell that already enforces both kill-switch sentinels, crash self-disable on 3 exceptions/session, degraded-mode after 3 lock timeouts, and the universal first-step kill-switch check from TS-4 §4.1. No detection logic yet.

**TS sections implemented:** TS-2 §2.1 (`hookAdapters`), TS-4 §4.1 (universal first step), TS-6 §6.5 (kill-switches), TS-6 §6.6 (locking semantics — wired to M1's lock manager).

**BRD-4 gates closed:**
- **RB-2** Manual kill-switch → no-op mode.
- **RB-3** Crash self-disable after 3 hook exceptions.
- **RG-3** Concurrent-session lock contention + degraded-mode escape (dedicated test).
- **RG-4** Crash self-disable E2E (3 induced exceptions).
- **FR-INSTALL-7**, **FR-FAILURE-4..8** wired.

**Key deliverables:**
- `src/hooks/index.ts` — registration entrypoint consumed by `plugin.json`.
- `src/hooks/sessionStart.ts`, `postToolUse.ts`, `userPromptSubmit.ts`, `subagentStop.ts`, `stop.ts`, `sessionEnd.ts`, `preCompact.ts` — each begins with `if (sentinels.isDisabled()) return success();` (TS-4 §4.1).
- `src/hooks/exceptionGuard.ts` — wraps every handler; on `catch` increments per-session counter; on 3rd exception writes `.claude/coherence/disabled` with diagnostic body (FR-FAILURE-6).
- `src/hooks/degradedMode.ts` — flag set on 3 consecutive lock timeouts (FR-FAILURE-4) — surfaced in statusline by M9.
- `src/state/init.ts` integration — first SessionStart creates `.claude/coherence/` skeleton (FR-INSTALL-2) but no other writes.
- `tests/rollback/kill-switch.test.ts` — both `DISABLED` (manual) and `disabled` (auto) sentinels make every hook return success without I/O / LLM / `additionalContext`.
- `tests/rollback/crash-self-disable.test.ts` — 3 induced hook exceptions → `disabled` file present, 4th hook is no-op (RG-4).
- `tests/rollback/concurrent-locks.test.ts` — simulate two PIDs holding `<file>.lock`, force 3 consecutive 5 s timeouts → degraded-mode flag set, subsequent writes skipped, statusline payload set (RG-3).

**Test artifacts:** `tests/fixtures/hooks/synthetic-events/*.json` — event payloads for each hook.

**Risks mitigated:** **R-3** (lock contention lag → degraded mode), **R-6** (buggy release → crash self-disable), **R-3** statusline indicator wired.

**Parallelizable tracks within milestone:** each hook stub + its test can be authored in parallel; the exception guard and degraded-mode flag are shared infra written first.

**Done when:**
- [ ] Every hook stub returns success in < 10 ms when sentinel present.
- [ ] RG-3 and RG-4 tests pass on every CI matrix cell.
- [ ] Manual `touch .claude/coherence/DISABLED` survives a `/coherence:recover` (only `disabled` is removed) — verified by test.
- [ ] No hook ever throws past `exceptionGuard`.

**Dependencies:** M1 (needs `stateStore`, locks, sentinels, paths normaliser).

---

### M3 — Detection Core: PostToolUse, Anchor Scanner, Buffer Lifecycle

**Goal:** Make `PostToolUse` actually detect drift: path filter against `watches:` globs, append to `drift-buffer.json`, scan anchors at SessionStart for integrity, and run the buffer state machine. Buffer payload is **hash-only** (path + sectionRef + contentHash); no raw section content persists (NFR-PRIVACY-4). No mid-session refresh yet (M5), no LLM, no Stop yet.

**TS sections implemented:** TS-2 §2.7 (anchor scanner), TS-3 §3.3 (buffer schema), TS-3 §3.4 (anchors + frontmatter format, fences-skip rule), TS-4 §4.3 (PostToolUse — minus mid-session refresh step 5..6), TS-4 §4.9 (buffer state machine), DD-007 / DD-025 / DD-026 / DD-027 / DD-040 / DD-050.

**BRD-4 gates closed:**
- **PG-1** PostToolUse p95 < 50 ms (initial pass; final regression gate at M10).
- **FR-DETECT-1..6, -12, -13, -15** owned.
- **FR-BUFFER-1..4, -7** owned.
- **FR-LAYERS-1..2** anchor location rules enforced (HTML allowed only in prose docs; YAML-only for skills/agents).

**Key deliverables:**
- `src/detection/pathFilter.ts` — pure-JS glob match (no FS reads beyond cached doc-section index); honours `coherence/ignore` + `.gitignore` (NFR-PRIVACY-5) **before** any glob match.
- `src/detection/anchorScanner.ts` — stack-based parser, paired open/close `<!-- coherence:section ... -->`, skip fenced code blocks (` ``` ` and `~~~`, R-18); detects orphan opens, missing closes, duplicate `id=` per file (FR-DETECT-12); GitHub-slug heading fallback with `-1`/`-2` disambiguation; one warning/file/session.
- `src/detection/yamlFrontmatter.ts` — `js-yaml` parser; reject HTML coherence comments inside `.claude/skills/*/SKILL.md` and `.claude/agents/*.md` body (DD-050).
- `src/detection/sectionIndex.ts` — caches normalised section refs once per session in `section-index.json` (R-17 mitigation, FR-DETECT-15).
- `src/detection/discovery.ts` — restricts skill discovery to `.claude/skills/*/SKILL.md` and agent discovery to `.claude/agents/*.md` (FR-DETECT-13, DD-040). Files outside silently ignored.
- `src/buffer/lifecycle.ts` — `[empty] → [pending] → ([cleared] | [deferred] → [persisted])` state machine (TS-4 §4.9, DD-010); writes/reads under buffer lock with 30 s stale fence.
- `src/buffer/contentHash.ts` — sha256 of section content for the DD-051 reset-on-content-change rule (TS-3 §3.3).
- `src/hooks/postToolUse.ts` (filled in) — kill-switch → ignore-checks → path filter → buffer append; **without** silent context refresh (deferred to M5).
- `tests/unit/detection/*` — anchor scanner happy path, orphan open, missing close, duplicate id, fenced-code false-positive (R-18 regression fixture), heading-fallback collision.
- `tests/unit/buffer/*` — state-machine transitions; pending.md cap of 200 entries with oldest-pruned, 14-day staleness (FR-BUFFER-7); content-hash reset rule.
- `tests/perf/postToolUse.bench.ts` — initial bench against the small fixture codebase (perf gate hardened in M10).
- `tests/security/path-traversal.test.ts` — first SG-2 cases: `..` paths, symlinks pointing outside project root, ignore globs honoured (NFR-SECURITY-2/4, NFR-PRIVACY-5).
- `tests/security/buffer-no-raw-content.test.ts` — **NFR-PRIVACY-4** negative: drive a Stop → assert every entry in `drift-buffer.json` and `pending.md` carries only `{path, sectionRef, contentHash}` and no raw section text; assert `contentHash` is sha256 (DD-026, DD-051).
- `tests/security/utf8-roundtrip.test.ts` — **NFR-I18N-2**: section body containing CJK + emoji + RTL Arabic + combining diacritics round-trips bytes-identically through detection → buffer → (in M7) Stage 2 patch apply.

**Test artifacts:** `tests/fixtures/codebases/small/` (also reused by M10 perf harness) — minimal repo with `CLAUDE.md`, `.claude/skills/foo/SKILL.md`, `.claude/agents/bar.md`, `coherence/ignore`, plus a `.env` file the plugin must never read.

**Risks mitigated:** **R-7** (anchor ID collisions detected & reported), **R-17** (path normalisation tested on macOS + Windows runners), **R-18** (fenced-code false-positive regression fixture).

**Parallelizable tracks within milestone:**
- Anchor scanner and path filter are independent.
- Section index can be built in parallel with buffer lifecycle.
- Fixture codebase `small/` authoring can run alongside code work and is consumed again by M4 and M10.

**Done when:**
- [ ] PostToolUse p95 < 50 ms against the `small` fixture (PG-1 first-pass; final hardening in M10).
- [ ] All `tests/unit/detection/*` and `tests/unit/buffer/*` green.
- [ ] Path-traversal SG-2 cases all rejected.
- [ ] No HTML coherence anchor allowed into a skill/agent body (rejected by scanner + fixture test).
- [ ] `.env` and `coherence/ignore`-listed files never opened (covered by privacy negative tests).
- [ ] `drift-buffer.json` and `pending.md` carry no raw section content — only `{path, sectionRef, contentHash}` (NFR-PRIVACY-4 negative test green).
- [ ] Non-ASCII (CJK + emoji + RTL) section content round-trips bytes-identically through the detection path (NFR-I18N-2).

**Dependencies:** M2 (hook shell).

---

### M4 — SessionStart Pipeline, Re-validation, Assertions, Revert Detection, Velocity

**Goal:** Implement the full deterministic SessionStart sequence (TS-4 §4.2 steps 1–9) including `pending.md` re-validation, `<!-- coherence-pending -->` finalize sweep, assertion engine (`import_exists`), revert detection (≥80% line removals), velocity counter (DD-011) + consecutive-defer counter (DD-051), and `revalidation-log.md`.

**TS sections implemented:** TS-3 §3.7 (`velocity.json`), TS-3 §3.11 (`coherence-log.md`), TS-4 §4.2 (entire), TS-4 §4.7 (SessionEnd persistence), TS-5 §5.7 (assertion engine — definition only; failures fed to Stop synthetic group in M8), DD-035, DD-038, DD-051, DD-053, DD-054.

**BRD-4 gates closed:**
- **PG-2** SessionStart p95 < 2 s medium / < 4 s monorepo (initial pass; full perf harness M10).
- **FR-DETECT-11, -14**, **FR-BUFFER-5, -6**, **FR-STOP-19** (assertion synthetic group authored — actual Stage-1/2 surfacing lands in M8).
- **NFR-OBS-3** revalidation log.

**Key deliverables:**
- `src/hooks/sessionStart.ts` — full sequence per TS-4 §4.2:
  1. Kill-switch
  2. Migration (delegates to M1)
  3. Anchor integrity sweep (delegates to M3)
  4. `<!-- coherence-pending -->` finalize sweep (≥7 days → `[coherence] finalize` commit)
  5. `pending.md` re-validation (FR-DETECT-6, FR-BUFFER-7)
  6. Assertion evaluation (FR-STOP-19, DD-054)
  7. Revert detection scan (FR-DETECT-14, DD-035)
  8. `additionalContext` injection (DD-012 Mechanism 1 — startup variant)
  9. Reset compaction caches
- `src/detection/assertions.ts` — `import_exists "<token>"` evaluator over indexed code files; failures append synthetic-trigger buffer entries with `source: "assertion"`.
- `src/detection/revertDetect.ts` — scan `[coherence]` commits since previous SessionStart for ≥80% line removals (DD-035); feeds `velocity.ts`.
- `src/buffer/velocity.ts` — `revert_window_start`, `revert_count`, `revert_timestamps[]`, `consecutive_defer_sessions`, `last_defer_session_id`, `auto_ignored` (TS-3 §3.7); 2 reverts/30 days → auto-add to `coherence/ignore` with one-line notice (FR-BUFFER-5).
- `src/state/revalidationLog.ts` — append entries with `(a) entry-drop reasons (b) Stage-2 validation failures` (FR-OBS-4, NFR-OBS-3).
- `src/state/finalizeSweep.ts` — locate `<!-- coherence-pending: YYYY-MM-DD -->` markers ≥7 days; commit with `[coherence] finalize` prefix (DD-038).
- `src/hooks/sessionEnd.ts` — persist deferred buffer to `pending.md` atomically; reset session-scoped state (cost-ledger, drift-buffer); finalise subagent classifications (FR-DETECT-16; full subagent logic in M5).
- `src/hooks/preCompact.ts` — clear `last_refreshed_section_set` + `last_refreshed_flagged_agents` (TS-4 §4.8). Wall-time fallback (DD-039) + `compaction_detected` event emission stubbed (full integration with metrics in M9/M10).
- `tests/unit/sessionStart/*` — each step in isolation.
- `tests/unit/velocity/*` — DD-011 + DD-051 transitions, including content-hash reset.
- `tests/unit/assertions/*` — `import_exists` true/false on indexed code; synthetic trigger group format.
- `tests/integration/sessionStart.test.ts` — full sequence on a fixture project with a stale `pending.md`, an aged finalize marker, and a failing assertion.

**Test artifacts:** `tests/fixtures/codebases/medium/` (used here, M5, and M10); `tests/fixtures/migration/aged-pending/`; `tests/fixtures/assertions/{ts,py,go,rs,java,cs,rb,php}/import_exists/{pass,fail}.txt`.

**Risks mitigated:** **R-9** (velocity auto-ignore surfaces a notice + opt-out path), **R-7** anchor collision recovery integrated into SessionStart step 3.

**Parallelizable tracks within milestone:** assertion engine + revert detection + velocity counter are all independent and can be authored in parallel.

**Done when:**
- [ ] Full SessionStart runs on the `medium` fixture in < 2 s p95 (initial bench).
- [ ] Aged finalize marker produces a `[coherence] finalize` commit with the correct `section:` body.
- [ ] Velocity auto-ignore triggers on the second revert within 30 days (test).
- [ ] Failed `import_exists` produces a synthetic buffer entry with `source: "assertion"`.
- [ ] `revalidation-log.md` records every dropped entry with reason.

**Dependencies:** M3.

---

### M5 — Subagent Tracker + UserPromptSubmit + Mid-Session Refresh

**Goal:** Stand up the subagent state machine (line-level / file-level fallback per `host-capabilities`), the rolling-window stats, the 2-message keyword classifier, the silent context refresh out of `PostToolUse` (DD-012 Mechanism 1), and the conversational-mention out of `UserPromptSubmit` (Mechanism 2).

**TS sections implemented:** TS-2 §2.4 (subagent tracker), TS-3 §3.12 (subagent files), TS-4 §4.3 step 5–6 (compaction detection + silent refresh), TS-4 §4.4 (UserPromptSubmit), TS-4 §4.5 (SubagentStop), TS-4 §4.10 (mid-session mechanisms summary), DD-013, DD-022, DD-023, DD-034, DD-039, DD-062.

**BRD-4 gates closed:**
- **FR-DETECT-7..8, -10, -16, -17** owned.
- **FR-MIDSESSION-1..4** owned.
- **FR-LAYERS-3..4** rolling-window thresholds (>25% discard / >50% edit / sudden shift >20pp on last 5 vs prior 10).
- **NFR-COST-3** silent-refresh cap (≤1 per buffer change, ~50 tok).

**Key deliverables:**
- `src/subagent/tracker.ts` — provenance capture (line-level when host exposes `subagent_invocation_id` + ranges; file-level fallback within `min(5 min, same agent turn)`).
- `src/subagent/window.ts` — 2-message keyword classifier window (FR-DETECT-16), final state at SessionEnd.
- `src/subagent/stats.ts` — rolling 50-window aggregates; threshold detector for `discarded > 25%`, `edited > 50%`, `sudden shift > 20pp on last 5 vs prior 10`.
- `src/subagent/retroReclassify.ts` — 7-day revert-to-`rejected` reclassification (FR-DETECT-17).
- `src/hooks/subagentStop.ts` — kill-switch → provenance capture → append `subagent-history.jsonl` line → update `subagent-stats.json`; opens classifier window.
- `src/hooks/userPromptSubmit.ts` — kill-switch → long-agent-turn boundary detector (≥60 s OR 5+ tool calls OR 5+ min user silence, FR-MIDSESSION-2) → conditional `additionalContext` for conversational mention only when **all three FR-MIDSESSION-3 conditions hold simultaneously**: (a) buffer has ≥3 distinct trigger groups, (b) ≥15 min since last Stop or `/coherence:review`, (c) post-long-agent-turn boundary just crossed (DD-012 Mechanism 2). Never blocks (FR-MIDSESSION-4).
- `src/detection/compaction.ts` — compaction detection in PostToolUse step 5 with **explicit FR-MIDSESSION-1c thresholds**: trigger when `token_drop_pct ≥ 50% AND token_drop_abs ≥ 5,000` between consecutive PostToolUse events; 10-min idle fallback when host doesn't surface counts (`token_count_in_posttooluse=false`); 30-min wall-time fallback per DD-039 even when PreCompact fires; emits `compaction_detected` event (`mode: token-delta | time-fallback`).
- `src/hooks/postToolUse.ts` (extended) — step 5 (compaction) + step 6 (silent refresh: ~50 tokens, capped 1/buffer change).
- `tests/unit/subagent/*` — line-level + file-level fallback paths; classifier window; threshold detector; retro-reclassify.
- `tests/unit/midsession/*` — silent-refresh trigger conditions; conversational-mention condition matrix; long-turn boundary detector.
- `tests/integration/E2E-3-skel.test.ts` — subagent line-level → Edited classification (foundation for E2E-3, completed at M11).
- `tests/integration/E2E-3b-skel.test.ts` — `host-capabilities.json` forced to file-level fallback (foundation for E2E-3b).

**Test artifacts:** `tests/fixtures/subagent/{line-level,file-level}/*.json` — synthetic SubagentStop events; classifier-window message corpora.

**Risks mitigated:** **R-5** (subagent attribution probe + fallback proven before M11 E2E).

**Parallelizable tracks within milestone:** tracker / classifier / threshold detector are independent; UserPromptSubmit + compaction detection are independent.

**Done when:**
- [ ] Line-level provenance test produces accurate `lines_added`/`lines_removed` ranges.
- [ ] File-level fallback test attributes within the `min(5 min, same turn)` window.
- [ ] Threshold detector flags `refactor-bot` in the canonical example from TS-7 §7.4 (`accepted=18 edited=5 discarded=27 trend: shift -22pp`).
- [ ] Silent refresh fires once per buffer change (token-cost cap NFR-COST-3 verified).
- [ ] UserPromptSubmit never blocks the prompt path (latency test: < 100 ms p95).

**Dependencies:** M3, M4 (compaction detection wired to SessionStart cache reset).

---

### M6 — LLM Client, Cassette Infrastructure, Stage 1 Planner, Canonical Selection (Parallel side track)

**Goal:** Build the `llmClient` (Anthropic SDK wrapper with prompt caching + cost ledger + cassette replay), author `prompts/v1/`, implement Stage 1 (Coherence Planner) end-to-end against the ID-2 fixture corpus, and wire the FR-STOP-14 Canonical Selection Algorithm.

**TS sections implemented:** TS-2 §2.6 (LLM client), TS-5 §5.1 (pipeline shape), TS-5 §5.2 (provider/model), TS-5 §5.3 (Stage 1), TS-5 §5.8 (prompt management), TS-4 §4.11 (canonical algorithm), DD-015, DD-016, DD-018, DD-028, DD-049, DD-057.

**BRD-4 gates closed:**
- **QG-1** Stage 1 schema-valid ≥ 90%.
- **QG-2** Stage 1 picks correct canonical ≥ 80%.
- **NFR-MAINT-1** versioned prompts.

**Key deliverables:**
- `src/llm/client.ts` — Anthropic SDK wrapper; loads prompts from `prompts/v{n}/manifest.json`; stamps Stage 1 / Stage 2 cache prefix (FR-STOP-13, NFR-COST-6); per-call cost tracking; never sees state files directly.
- `src/llm/cassette.ts` — record/replay raw API responses; refresh requires explicit `COHERENCE_REFRESH_CASSETTES=1` env flag (no silent re-recording per BRD-4 §4.2). Determinism check fails CI if a recorded cassette would change.
- `src/llm/costLedger.ts` — `cost-ledger.json` with `prompt_versions` per row (DD-057, FR-OBS-6); session-scoped, reset at SessionEnd.
- `prompts/v1/stage1-planner.md` — six rules (canonical singularity, declared-role honour, architecture/skill/CLAUDE.md tiebreakers, JSON-only output) per [📋 8. Patch Quality & Prompt Design] Stage 1.
- `prompts/v1/stage2-patch.md` — placeholder authored here, validated end-to-end in M7.
- `prompts/v1/manifest.json` — pins model name (`claude-sonnet-4.5-...`), temperature, schema versions, fixture identifiers.
- `src/pipeline/canonical.ts` — Canonical Selection Algorithm (FR-STOP-14, TS-4 §4.11): deepest common ancestor `D` → filter at-or-above `D` (DD-028) → nearest-wins (DD-018) → DD-016 depth-score tiebreak → lex-path final tiebreak.
- `src/pipeline/grouping.ts` — union-find over `triggering_files` overlap (FR-DETECT-3, DD-025).
- `src/pipeline/stage1.ts` — Stage 1 invocation; reads sections fresh from disk; deterministic input prep (no LLM-generated summary).
- `src/validation/planValidator.ts` — exactly one `canonical`; all flagged sections accounted for; reject `role: no-change + relation: omits` as contradictory (FR-STOP-3, FR-STOP-16); fall back to independent patches on failure with `revalidation-log.md` warning.
- `tests/fixtures/stage1/*` — ID-2 corpus: ≥ enough cases to drive QG-1 ≥ 90% and QG-2 ≥ 80% (target ~30+ scenarios across single-file, multi-file, cross-layer, declared-canonical, demoted-canonical, contradictory-plan).
- `tests/cassettes/stage1/*.json` — recorded Anthropic responses for the fixture corpus.
- `tests/fixtures/stage1/qg-runner.test.ts` — runs the corpus, computes QG-1 and QG-2, fails if below threshold.
- `tests/unit/canonical/*` — DD-018 nearest-wins, DD-016 tiebreak, DD-028 filter; declared-canonical absolute honour rule (DD-015 rule 2).

**Test artifacts:** ID-2 Stage 1 fixture corpus + cassettes; declared-canonical test set; demoted-canonical fixture (`demoted_canonicals` reporting).

**Risks mitigated:** **R-11** (prompt regression — versioned prompts + cassette policy + QG gate before any prompt-version bump), **R-2** (cost telemetry plumbed before Stop pipeline lands).

**Parallelizable tracks within milestone:**
- This whole milestone runs **in parallel with M3, M4, M5** as a side track (depends only on M1).
- Within: cassette infra, prompt authoring, fixture authoring, and canonical algorithm are all independent.

**Done when:**
- [ ] QG-1 ≥ 90% across the fixture corpus (cassette-replay).
- [ ] QG-2 ≥ 80%.
- [ ] Canonical Selection Algorithm passes all DD-016/-018/-028 unit tests.
- [ ] `prompts/v1/manifest.json` pins model + temperature + cassette IDs.
- [ ] Cassette refresh fails without `COHERENCE_REFRESH_CASSETTES=1`.

**Dependencies:** M1 (uses `stateStore`, schemas, cost-ledger schema).

---

### M7 — Stage 2 Patch Writer + Validation Pipeline + Hallucination Corpus (R-1)

**Goal:** Implement the Stage 2 patch writer (per-section parallel calls, max 8 concurrent), the five-step validation pipeline (format → apply → sanity recount → line-count ratio → two-tier hallucination grep), the per-language registry (TS/JS, Python, Go, Rust, Java, C#, Ruby, PHP), the prompt-injection-rejection rules for skill/agent diffs (NFR-SECURITY-7), and the DD-058 hallucination corpus that anchors **R-1**.

**TS sections implemented:** TS-2 §2.7 (validation), TS-5 §5.4 (Stage 2), TS-5 §5.5 (validation pipeline + hallucination grep), TS-6 §6.3 (security surfaces), DD-008, DD-017, DD-032, DD-033, DD-042, DD-047, DD-058.

**BRD-4 gates closed:**
- **QG-3** Stage 2 patches apply cleanly ≥ 80%.
- **QG-4** Hallucination escape rate ≤ 2%.
- **QG-5** per-language precision/recall (reported, not floor-gated).
- **QG-6** ≥ 5 fixtures per change-class.
- **SG-3** patch-validation negatives (shell injection in skill frontmatter, prompt-injection HTML in body) — all rejected.

**Key deliverables:**
- `src/pipeline/stage2.ts` — per-section call; reads section fresh from disk (FR-STOP-15); enforces ≤ 8 concurrency (NFR-PERF-10); `role: no-change` short-circuits to `NO_PATCH_NEEDED` without API call (FR-STOP-16).
- `src/validation/format.ts` — unified diff parser (`parse-diff`); accept `NO_PATCH_NEEDED` / `ESCALATE` / `PLAN_DISAGREES <reason>` literals (DD-008, DD-033, DD-042).
- `src/validation/apply.ts` — `git apply --check` against current section content.
- `src/validation/sanity.ts` — deterministic change-class recount (DD-017); whitespace-only `-` lines ignored; class wins over LLM-claimed (FR-STOP-6b).
- `src/validation/lineRatio.ts` — `(added+removed)/original > 0.40` → auto-`ESCALATE`.
- `src/validation/hallucination.ts` — two-tier per-token grep (DD-032/DD-047): strict tier (paths `/`, `\`, `::`; member-access `foo.bar`; import-line tokens; length-≥16 with structural marker; length-≥6 mixed-case-with-digit) over changed-files-this-session; loose tier over whole-project; ≥ 3 unknown loose-only tokens → demote class one tier (FR-STOP-7).
- `src/validation/registries/{ts-js,python,go,rust,java,csharp,ruby,php}.ts` — import-line tokenisers per language.
- `src/validation/promptInjection.ts` — reject diffs introducing new `<!-- ... -->` HTML comment in skill/agent body (frontmatter excluded); reject instruction-shape regex `(?i)(coherence:|role:|you are|ignore (the |all )?(previous|prior) instructions)` (NFR-SECURITY-7); reject `coherence:` frontmatter alterations (FR-LAYERS-2, DD-043).
- `src/state/revalidationLog.ts` (extended) — Stage 2 failure entries with check identifier and rejected payload (FR-OBS-4).
- `prompts/v1/stage2-patch.md` (finalised) — surgical-only, no rewrites for style, change-class enforced, plan-disagree escape hatch, negative examples per [📋 8. Patch Quality & Prompt Design] Stage 2.
- `tests/fixtures/stage2/{additive,modifying,destructive,frontmatter}/*` — ID-3 corpus with ≥ 5 fixtures per class (QG-6).
- `tests/fixtures/hallucination/{8langs}/{valid,hallucinated}/` — ID-4 corpus: 50 valid + 50 hallucinated across 8 primary + 2 secondary languages (DD-058).
- `tests/cassettes/stage2/*.json` — recorded responses.
- `tests/security/prompt-injection.test.ts` — SG-3 cases: HTML coherence comment introduced into a SKILL.md body, instruction-shaped HTML, allowed-tools shell construct injected into agent frontmatter — all rejected.
- `tests/unit/validation/line-endings.test.ts` — patch-side line-ending preservation: CRLF-input → CRLF-output and LF-input → LF-output round-trips run on every CI matrix cell (NFR-COMPAT-5, R-12).
- `tests/fixtures/stage2/qg-runner.test.ts` — drives QG-3, QG-4, QG-5, QG-6 thresholds.

**Test artifacts:** ID-3 Stage 2 corpus + cassettes; ID-4 hallucination corpus (per-language manifests).

**Risks mitigated:** **R-1** (hallucination escape — DD-058 corpus + QG-4 gate now enforced before Stop ships), **R-12** (line-ending preservation proven in patch-apply path), **R-16** (prompt injection via skill/agent body — SG-3 + validator).

**Parallelizable tracks within milestone:**
- Each of the 5 validation checks is independent.
- Per-language registry files can be parallelised across 8 modules.
- Hallucination corpus authoring (50 valid + 50 hallucinated per language) parallelises trivially.
- Stage 2 prompt and per-class fixture authoring run alongside validator code.

**Done when:**
- [ ] QG-3 ≥ 80% on ID-3 cassette replay.
- [ ] QG-4 ≤ 2% on ID-4 corpus across all 8+2 languages.
- [ ] QG-5 published (per-language precision/recall numbers in CI artifact).
- [ ] QG-6 ≥ 5 fixtures per class verified.
- [ ] SG-3 negative tests all rejected.
- [ ] Stage 2 honours ≤ 8 concurrency under load (test: 36 sections in cassette mode complete with `concurrent_active <= 8`).

**Dependencies:** M6 (LLM client, cassette infra, Stage 1 plan as input).

---

### M8 — Stop Orchestrator + Git Adapter + `[coherence]` Commit + Resume (R-4)

**Goal:** Tie M3..M7 together: trigger-source grouping, cap enforcement (DD-056), Stage 1 → Stage 2 orchestration, file-level merge, bundle assembly, atomic `[coherence]` commits with the section-list body, `stop-progress.json` checkpointing per Stage 2 call, and crash-resume that proves R-4. Buffer mutations on approve/skip wired here.

**TS sections implemented:** TS-2 §2.5 (Stop pipeline orchestrator, all 15 steps), TS-3 §3.8 (`stop-progress.json`), TS-3 §3.11 (`coherence-log.md` schema), TS-5 §5.6 (caps), TS-5 §5.9 (failure handling), TS-6 §6.4 (git adapter + pre-flight), TS-2 §2.2 / FR-LAYERS-5 (cross-layer expansion), DD-005, DD-008, DD-049, DD-052, DD-056, DD-061.

**BRD-4 gates closed:**
- **PG-3** Stop p95 < 10 s typical (≤ 12 sections).
- **PG-4** Stop p95 < 25 s ceiling (36 sections, 8 concurrent).
- **PG-5** Cost p50 / p95 ≤ $0.07 / $0.15 (cassette-mode estimate; live verification at M11).
- **RG-1** **partial** — zero-corruption invariant proven for the atomic-write + quarantine + checkpoint paths via `git-preflight.test.ts` and `E2E-4.test.ts`; the *full* 0-corruption sweep across E2E + perf runs lands in M10 (perf) and M11 (E2E).
- **E2E-4 foundation** crash mid-Stage-2-call-3-of-4 → resume from `stop-progress.json`.
- **FR-STOP-1..12, -15..21**, **FR-LAYERS-5** (cross-layer expansion on plan ingestion), **FR-PERMISSION-4** (commit format), **FR-FAILURE-5** (git pre-flight) all owned.

**Key deliverables:**
- `src/pipeline/stop.ts` — orchestrator state machine (TS-2 §2.5 steps 1–15).
- `src/pipeline/caps.ts` — DD-056 hard caps (3 groups, 12 sections/group, 36 total Stage 2 calls, 30k input tokens, 8k output tokens, ≤ 8 concurrency); canonical-first defer overflow with user-visible "N sections deferred" notice (FR-STOP-11).
- `src/pipeline/merge.ts` — per-file merge of multiple Stage 2 patches; overlap rejects all of file with consolidated review note (FR-STOP-8).
- `src/pipeline/bundle.ts` — atomic plan-derived bundle vs individual; same-section across independent groups stays separate (FR-STOP-9, FR-STOP-18).
- `src/pipeline/crossLayerExpand.ts` — on Stage 1 plan ingestion, scan the other two layers' indexed sections for `watches:` / anchor references to each canonical concept in the plan and fold matching files into the same review batch (**FR-LAYERS-5**, DD-008 Coherence Pass). Bounded by DD-056 caps; overflow defers per FR-STOP-11.
- `src/pipeline/checkpoint.ts` — atomic rewrite of `stop-progress.json` between every Stage 2 call (FR-STOP-12); resume logic skips entries with `status: done`.
- `src/git/adapter.ts` — shell out to `git` CLI (D-4, NFR-COMPAT-1..2). Pre-flight: refuse if `MERGE_HEAD` / `CHERRY_PICK_HEAD` / `REBASE_HEAD` / `rebase-apply/` / `rebase-merge/` present; warn-but-proceed on detached HEAD; refuse if targeted doc paths have unrelated working-tree changes; never `git add .` (only explicit doc paths); on non-zero `git commit` → `git reset HEAD && git checkout -- <docs>`, defer the buffer entry.
- `src/git/coherenceCommit.ts` — commit message format: `[coherence] <summary>` body lines `section: <workspace-relative-path>#<id-or-heading-anchor>` one per modified section (FR-PERMISSION-4, DD-005). Marker injection for additive auto-applied: `<!-- coherence-pending: YYYY-MM-DD -->` (DD-038).
- `src/state/coherenceLog.ts` — newest-first append to `coherence-log.md` using the **DD-052 table-shaped per-event entry variants** (`auto-applied` | `reviewed` | `finalize` | `quarantine`); references git refs only, no inline diffs (TS-3 §3.11, FR-OBS-1, DD-052, NFR-OBS-1).
- `src/hooks/stop.ts` — full Stop hook wiring: empty buffer no-op (FR-BUFFER-1), single-section group skips Stage 1 (FR-STOP-2), invokes orchestrator, returns review-ready payload (UI rendered in M9).
- `tests/integration/stop-pipeline.test.ts` — empty buffer no-op; single-section group skipping Stage 1; full multi-group cap test; bundle atomicity; same-section-across-groups stays separate.
- `tests/integration/cross-layer-expand.test.ts` — single-layer trigger with stale references in the other two layers → review batch contains all three files in one coherent plan (FR-LAYERS-5).
- `tests/integration/E2E-4.test.ts` — kill plugin between Stage 2 calls 3 and 4; resume reads `stop-progress.json`, skips done sections, completes; **R-4 closure**.
- `tests/integration/git-preflight.test.ts` — every pre-flight branch (rebase in progress, merge in progress, dirty unrelated changes, detached HEAD warn-proceed); **R-8 closure**.
- `tests/perf/stop-typical.bench.ts`, `tests/perf/stop-ceiling.bench.ts` — PG-3 and PG-4 (cassette-mode for LLM portion).

**Test artifacts:** `tests/fixtures/codebases/{large,monorepo}/` (used here, M10, M11) — large + monorepo reference codebases with cross-package coherence (E2E-2 setup).

**Risks mitigated:** **R-4** (Stop crash mid-run — checkpoint + resume + E2E-4), **R-2** (cost cap enforcement proven), **R-8** (git pre-flight prevents overwriting unrelated edits), **R-15** (LLM outage degrades cleanly: buffer → `pending.md` + user notice).

**Parallelizable tracks within milestone:**
- Git adapter + pre-flight is independent of merge/bundle.
- Cap enforcement, grouping integration, and checkpoint logic are independent.
- Large + monorepo fixture authoring runs alongside code work.

**Done when:**
- [ ] PG-3 met on cassette-mode `medium` fixture.
- [ ] PG-4 met on cassette-mode 36-section synthetic with 8-way concurrency.
- [ ] E2E-4 passes 10/10 reruns (≤ 1% flakiness).
- [ ] Every pre-flight branch covered with a green test.
- [ ] `[coherence]` commit format validated against the conventional-commit rule from M0.
- [ ] LLM outage simulation (cassette returns 503) → buffer persists to `pending.md`, user-visible one-liner, no crash.

**Dependencies:** M4, M5, M7.

---

### M9 — Slash Commands + Permission UX + Statusline + Observe/Graduated Modes

**Goal:** Ship every `/coherence:*` command with its canonical output contract, the consolidated Stop review UX (FR-PERMISSION-*, including the assertion-failure 3-action UX and demoted-canonical notice), the statusline badge `[🧭 N]` / `[🧭 ⚠]`, the Observe ↔ Graduated mode toggle, the sidecar fallback for hosts that strip unknown frontmatter keys, and the `--estimate` mode for `/review`.

**TS sections implemented:** TS-2 §2.8 (slash commands), TS-6 §6.1 (permission model + assertion UX + demoted-canonical UX), TS-7 §7.3 (observability surfaces), TS-7 §7.4 (`/coherence:status` canonical output incl. DD-044 limitation footer), TS-7 §7.5 (telemetry retention), TS-7 §7.6 (share-metrics file-write), TS-8 §8.3 (Observe + Graduated only), DD-002, DD-021, DD-038, DD-043, DD-044, DD-046, DD-048, DD-055, DD-060.

**BRD-4 gates closed:**
- **NFR-PERF-7** `/coherence:status` < 250 ms.
- **NFR-OBS-2** 90-day rolling `metrics.jsonl` retention with `metrics-summary.json` rollover.
- **FR-COMMANDS-1..7** owned.
- **FR-PERMISSION-1..3, -5..10** owned.
- **FR-MIDSESSION-5..6** `/coherence:review` + `--estimate`.

**Key deliverables:**
- `src/commands/status.ts` — canonical fixed-order output (DD-055, NFR-OBS-4) per TS-7 §7.4: header → capabilities → sentinels → buffer → recent activity → subagent stats → velocity → cost. Conditional rows omitted when empty. Fixed footer line per **DD-044 / FR-DETECT-9**: `"Mid-session branch switches: not detected — Stop-time re-validation"` (documented limitation surfaced in canonical output).
- `src/commands/review.ts` — runs `stopPipeline` mid-session against current buffer; `--estimate` runs Stage 1 only (or pure heuristic); costed in `cost-ledger.json`.
- `src/commands/repair.ts` — anchor-collision resolution, schema-drift fixes, buffer corruption, `pending.md` mismatches (FR-PERMISSION-6).
- `src/commands/recover.ts` — clear quarantine, reset locks, drop progress files, remove `disabled` (auto) but **not** `DISABLED` (manual) sentinel (FR-FAILURE-7).
- `src/commands/doctor.ts` — host-capability probes per TS-8 §8.4: `subagent_attribution`, `frontmatter_preserves_unknown_keys`, `hook_event_shapes`, `token_count_in_posttooluse`. Writes `host-capabilities.json` atomically. Exposes `doctor.run({initialProbe:true})` so the **first SessionStart in a project invokes it once, seeds `host-capabilities.json`, and subsequent sessions read the cache** (FR-INSTALL-3, FR-INSTALL-6). On host-version delta detected at SessionStart, log a one-line nudge to re-run `/coherence:doctor` (no auto-reprobe).
- `src/commands/graduate.ts` — toggles `mode: observe ↔ graduated` in `config.json`; `--revert` restores Observe; persists in `version.json`.
- `src/commands/enableSidecars.ts` — provisions `.claude/coherence/sidecars/<name>.yaml` for skills/agents when host strips unknown frontmatter (FR-COMMANDS-7).
- `src/commands/shareMetrics.ts` — `--anonymized` redactor: drops project paths, replaces section refs with anonymous IDs, one-shot, user confirms before egress (DD-060, DG-6).
- `src/permissions/review.ts` — consolidated Stop review UI per TS-4 §4.6:
  - `[auto-applied]` rows for additive class in Graduated mode.
  - `[needs review]` rows with show-diff expand.
  - `[Assertion failures]` separate section with **Patch / Update assertion / Dismiss** + `last-verified` age (FR-PERMISSION-8, FR-PERMISSION-10).
  - Demoted-canonical line: "N other declared-canonical section(s) were treated as references for this change" (FR-STOP-20, FR-PERMISSION-9).
  - Plan-derived bundles render as one expandable row (FR-STOP-9).
- `src/permissions/classes.ts` — change-class gating: additive auto-applies in Graduated; `frontmatter` always confirms (FR-PERMISSION-3).
- `src/observability/statusline.ts` — `[🧭 N]` non-empty buffer, `[🧭 ⚠]` degraded mode, hidden when empty (FR-PERMISSION-7).
- `src/state/observations.ts` — append low-confidence findings + canonical demotions to `observations.md` (FR-STOP-21, FR-PERMISSION-9).
- `src/state/metrics.ts` — `metrics.jsonl` event emitter for the catalogue in TS-7 §7.5: `patch_proposed`, `patch_applied`, `patch_reverted`, `patch_deferred`, `hallucination_grep_result`, `cost_per_stop`, `compaction_detected`, `degraded_mode_entered`, `kill_switch_seen`, `subagent_classification`. All LLM-sourced events carry `prompt_version: { stage1, stage2 }` per DD-057.
- `src/state/metricsRetention.ts` — SessionStart-driven retention sweep: entries in `metrics.jsonl` older than 90 days are aggregated (counts only, no content) into `metrics-summary.json` and truncated from the rolling log (**NFR-OBS-2**, DD-060).
- `tests/unit/commands/*` — every command's contract.
- `tests/integration/status-canonical.test.ts` — diff-stable output across multiple runs (DD-055); also asserts every line in every log file (`coherence-log.md`, `metrics.jsonl`, `revalidation-log.md`, `subagent-history.jsonl`, `drift-buffer.json` entries) matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z` (**NFR-OBS-5**).
- `tests/unit/state/coherence-log-no-rotate.test.ts` — retention sweep skips `coherence-log.md` (NFR-OBS-1: append-only, no rotation in v0.1).
- `tests/integration/review-estimate.test.ts` — `--estimate` skips Stage 2.
- `tests/integration/permission-flow.test.ts` — Observe vs Graduated branching; frontmatter always-confirm.

**Test artifacts:** Snapshot fixtures for canonical status output; consolidated-review HTML/text snapshots.

**Risks mitigated:** **R-9** (velocity auto-ignore surfaced in `/status`), **R-10** (`/share-metrics --anonymized` redaction proven before any release).

**Parallelizable tracks within milestone:** every command is independent; statusline + metrics emitter run alongside command work.

**Done when:**
- [ ] `/coherence:status` < 250 ms p95 against the `medium` fixture.
- [ ] Status output is byte-identical between two consecutive runs with identical state.
- [ ] All 8 slash commands have green contract tests.
- [ ] `/coherence:graduate` flips additive auto-apply on; `--revert` flips it off; verified end-to-end against the M8 pipeline.
- [ ] Sidecar fallback test: simulated host that strips unknown frontmatter → `enable-sidecars` provisions correct sidecar files.
- [ ] `/coherence:share-metrics --anonymized` writes to a user-chosen file path (no network egress); HTTPS POST is explicitly out of v0.1 (TS-7 §7.6).
- [ ] `/coherence:status` includes the DD-044 mid-session-branch-switch limitation footer (verified in `status-canonical.test.ts`).
- [ ] `metrics-summary.json` rollover: synthetic `metrics.jsonl` with > 90-day-old entries → entries truncated, summary counts present (NFR-OBS-2).

**Dependencies:** M8.

---

### M10 — Performance Harness + Reference Codebases + Memory Cap + Live Cost Verification

**Goal:** Stand up `tests/perf/` with 4 reference codebases (small / medium / large / monorepo), wire the regression gate (CI fails any merge with > 30% p95 regression on any cell), and verify live (non-cassette) cost p50/p95 in a release-candidate harness.

**TS sections implemented:** TS-7 §7.1 (latency budgets — final hardening), TS-7 §7.2 (cost budgets — live verification), TS-7 §7.7 (perf harness design, DD-059).

**BRD-4 gates closed:**
- **PG-1** PostToolUse p95 < 50 ms — final regression-gated.
- **PG-2** SessionStart p95 final.
- **PG-3, PG-4** Stop budgets — final regression-gated.
- **PG-5** Cost p50/p95 (live verification with bounded cassette-burn budget).
- **NFR-PERF-9** memory < 50 MB p95 / < 80 MB p99.
- **NFR-PERF-8** install size < 10 MB hard-gated.

**Key deliverables:**
- `tests/perf/codebases/{small,medium,large,monorepo}/` — ID-5 reference codebases. Each seeds a representative `.claude/coherence/` state.
- `tests/perf/harness.ts` — runs each hook in isolation against synthetic events; records p50/p95/p99 latencies + RSS memory.
- `tests/perf/baseline.json` — committed baseline; CI compares the latest run; > 30% regression on any p95 fails.
- `tests/perf/stop-ceiling.bench.ts` — 36 sections, 3 groups, 8 concurrent Stage 2 calls in cassette mode (NFR-PERF-5).
- `tests/perf/install-size.test.ts` — `npm pack`-output size < 10 MB hard gate.
- `tests/perf/memory.bench.ts` — Stop ceiling memory < 50 MB p95.
- `scripts/release-candidate-cost-burn.mjs` — opt-in non-cassette run against an Anthropic test key budget (≤ $5 per run); produces PG-5 evidence for release notes; gated behind `COHERENCE_LIVE_COST_RUN=1`.

**Test artifacts:** ID-5 reference codebases (committed). `tests/perf/baseline.json`. Live-burn artifact stored under `release-artifacts/cost-evidence-<ts>.json`.

**Risks mitigated:** **R-2** (cost spikes — caught by live-burn evidence before release), **R-3** (lock contention lag — PG-1 final regression gate).

**Parallelizable tracks within milestone:** each codebase is independent; harness + each bench file independent.

**Done when:**
- [ ] All PG-1..PG-5 met on every CI matrix cell.
- [ ] Memory p95 < 50 MB on every cell; p99 < 80 MB.
- [ ] Install size < 10 MB hard-gated.
- [ ] `tests/perf/baseline.json` committed; CI comparison wired.
- [ ] Live-burn evidence stored for the release-candidate run.

**Dependencies:** M9 (full surface available to bench).

---

### M11 — E2E Harness, Full Gate Sweep, Hardening, Docs DG-1..DG-6, Release

**Goal:** Build the Claude Code stub harness (ID-6), close every remaining E2E scenario E2E-1..E2E-10 + E2E-3b (each ≤ 1% flakiness across 10 reruns), close the remaining RG/SG/RB gates not closed in earlier milestones, ship the DG-1..DG-6 documentation set, run the BRD-4 §4.9 acceptance checklist, and tag `release-v0.1.0`.

**TS sections implemented:** TS-8 §8.7 (DG-1..DG-6), TS-9 §9.4 (E2E-1..E2E-9 + E2E-3b; E2E-LAYERS plan-added), TS-9 §9.6 (RG-1..RG-4 final closure), TS-9 §9.7 (SG-1..SG-4 final closure), TS-9 §9.8 (RB-1..RB-5), TS-9 §9.10 (acceptance checklist), TS-9 §9.11 (DoD).

**BRD-4 gates closed (all remaining):**
- **E2E-1..E2E-9, E2E-3b** all green ≤ 1% flakiness on every CI matrix cell (BRD-4 §4.2 mandatory set); **E2E-LAYERS** plan-added FR-LAYERS-5 scenario also green.
- **RG-1..RG-4** finalised (most done in M1/M2/M8).
- **SG-1..SG-4** all green (SG-1 audit gate hard-enforced, SG-2 path-traversal full coverage, SG-3 prompt-injection from M7 finalised, SG-4 secret scan).
- **RB-1..RB-5** all green.
- **DG-1..DG-6** all shipped.
- **NFR-MAINT-4** ≥ 80% coverage on non-LLM modules.

**Key deliverables:**
- `tests/e2e/harness/claudeCodeStub.ts` — ID-6 stub host: emits hook events, exposes `additionalContext`, simulates host-capability variants, host-version pinning (`stub-v2.0` and `stub-v2.1`).
- `tests/e2e/E2E-1.test.ts` — cold-start → Observe → graduate → Stop patch → commit → revert → DD-035 detection (full BRD-4 §4.2 path).
- `tests/e2e/E2E-2.test.ts` — monorepo cross-package coherence (3 packages, canonical algo, file-merge).
- `tests/e2e/E2E-3.test.ts`, `E2E-3b.test.ts` — finalise from M5 skeletons.
- `tests/e2e/E2E-5.test.ts` — hallucination rejection (fabricated import → strict-tier rejects).
- `tests/e2e/E2E-6.test.ts` — assertion-triggered review.
- `tests/e2e/E2E-7.test.ts` — `/coherence:review` mid-session aggregation + cost ledger.
- `tests/e2e/E2E-8.test.ts` — full upgrade migration v0.0.x → v0.1 (composes the M1 R-14 harness).
- `tests/e2e/E2E-9.test.ts` — kill-switch end-to-end.
- `tests/e2e/E2E-10.test.ts` — cross-layer coherence via Stage 1 (FR-LAYERS-5, DD-008): three layers stale simultaneously → single coherent plan, three patches, atomic commit. **(Plan-added scenario; goes beyond BRD-4 §4.2 enumeration. Not required for BRD-4 §4.9 release sign-off; included as the executable contract for FR-LAYERS-5.)**
- `tests/security/{path-traversal,secrets,frontmatter-shell}.test.ts` — finalised SG-2/SG-3/SG-4.
- `tests/security/audit.test.ts` — `npm audit --audit-level=high` returns 0 (SG-1).
- `tests/security/network-egress.test.ts` — asserts every outbound HTTPS call originates only from `src/llm/client.ts`; any egress from hooks, state modules, or commands fails the test (**NFR-PRIVACY-3**, OWASP A02).
- `tests/security/api-key-no-persist.test.ts` — **NFR-SECURITY-3**: set `ANTHROPIC_API_KEY=ck-FAKE-PROBE-VALUE-123`, drive a full Stop pipeline, then grep every file under `.claude/coherence/`, `tests/cassettes/`, `release-artifacts/`, and CI log artifacts — the literal must not appear anywhere.
- `docs/README.md` — install + Observe-mode walkthrough; includes a **"Known limitations"** section citing **DD-044 / FR-DETECT-9** (mid-session branch switches: not detected; Stop-time re-validation only) (DG-1).
- `docs/commands.md` — slash-command reference (DG-2).
- `docs/state-files.md` — schema reference (DG-3).
- `docs/rollback.md` — rollback procedure documented + tested (DG-4).
- `CHANGELOG.md` — every DD-001..DD-064 referenced (DG-5).
- `scripts/changelog-dd-coverage.mjs` — build-time check that **CHANGELOG.md mentions every DD-001..DD-064 verbatim** with the milestone where each landed; CI fails release if any DD ID is missing. Captures the 12 DDs implicitly covered today (DD-003, DD-004, DD-009, DD-019, DD-020, DD-024, DD-029, DD-030, DD-031, DD-037, DD-045, DD-063) explicitly in the release notes (DG-5 acceptance).
- `docs/privacy.md` — privacy & data-handling document with Anthropic API surface, local storage, ignore semantics, `/share-metrics --anonymized` mechanics; **legal review required** (DG-6).
- `scripts/release.mjs` — runs the BRD-4 §4.9 acceptance checklist, tags `release-v0.1.0` only if every box ticks green on every matrix cell.
- Coverage reporting wired to ≥ 80% on non-LLM modules (NFR-MAINT-4).

**Test artifacts:** ID-6 Claude Code stub harness; cassette set covering every E2E scenario; security negative-test corpus; release evidence bundle.

**Risks mitigated:** **R-6** finalised (release process gated by acceptance checklist), **R-10** finalised (DG-6 + opt-in share-metrics shipped), **R-12** (full Windows E2E coverage), **R-14** finalised (E2E-8 closes the migration gate).

**Parallelizable tracks within milestone:**
- Each E2E scenario is independent.
- Doc authoring (DG-1..DG-6) runs alongside test work; legal review for DG-6 is its own thread.
- Coverage uplift can run in parallel with E2E.

**Done when:**
- [ ] BRD-4 §4.9 acceptance checklist all 10 boxes ticked, signed off by product owner, tech lead, QA lead.
- [ ] All E2E scenarios green ≤ 1% flakiness across 10 reruns on every matrix cell, no quarantined scenarios.
- [ ] All QG / PG / RG / SG / RB / DG gates green.
- [ ] `release-v0.1.0` tag created on a green CI run.
- [ ] CHANGELOG and release notes published.
- [ ] DG-6 legal review signed off.

**Dependencies:** M10.

---

## Out-of-scope (v0.2+)

Explicit deferrals; do not implement in v0.1 even if surface area appears trivial.

| Capability | Deferred to | Reference |
|---|---|---|
| Greenfield-mode bootstrapping | v0.2 | DD-006 (TS-1 §1.5) |
| Trickle-scan throttling | v0.2 | DD-014 (TS-1 §1.5; `scan-cache.json` reservation TS-3 §3.1) |
| Trickle-scan child process model | v0.2 | DD-036 (TS-1 §1.5) |
| Author mode (proposing new skills/agents) | v0.2 | BRD-5 §5.3 |
| Annotate mode (auto-injection of metadata) | v0.2 | BRD-5 §5.3 |
| `/coherence:graduate` Observe → Annotate → Author transitions | v0.2 | BRD-5 §5.3 (TS-8 §8.3) |
| Author-mode signal collection (repeated bash → slash; repeated patterns → skill scaffolds) | v0.2 | BRD-5 §5.3 |
| Marketplace distribution / `plugin.json` publishing polish | v0.3 | BRD-5 §5.3 (TS-1 §1.2 row "Marketplace packaging") |
| Team-shared `coherence-ignore` (committed to repo) | v0.3 | BRD-5 §5.3 |
| Monorepo `scope:` declarations across nested CLAUDE.md | v0.3 | BRD-5 §5.3 |
| Cross-team plan visibility (multi-developer sessions) | v0.3 | BRD-5 §5.3 |
| Active complex `asserts:` predicates beyond `import_exists` | v1.0 | BRD-5 §5.3 (TS-5 §5.7) |
| Token-budget bloat warnings | v1.0 | BRD-5 §5.3 |
| `/coherence:audit` deep audit command | v1.0 | BRD-5 §5.3 |
| Quality metrics dashboard | v1.0 | BRD-5 §5.3 |
| Cross-session pattern learning | v1.0 | BRD-5 §5.3 |
| External integrations (GitHub / Jira / Linear) | v1.0+ | BRD-5 §5.3 |
| Localization / non-English UI | TBD | BRD-5 §5.3 (NFR-I18N-1) |
| Fuzzy / semantic pattern detection | TBD | BRD-5 §5.3 |

## Open questions / decisions deferred to implementation

These are TS-level open engineering choices (TS-2 §2.11 + items the spec leaves to the implementer's first-contact judgment). All of them are below the BRD grain and should be resolved in the first PR that touches the relevant module — none of them gate a milestone closing.

1. **Diff library selection** (TS-2 §2.11): `parse-diff` + `apply-diff` vs `jsdiff`. Resolve in the first M7 validation PR. Constraint: must round-trip correctly across CRLF/LF on Windows (NFR-COMPAT-5, R-12).
2. **Plugin manifest v2.x exact shape**. The TSD pins to "v2.x stable hook surface" (D-1) but doesn't fix the exact JSON shape. Resolve against whichever `claude-code` host version is in CI matrix at the start of M0; pin in `plugin.json` and lock via `min_claude_code_version`.
3. **Anthropic SDK version pin**. M6 first PR. Pin to a specific minor that supports prompt-cache markers and structured response variants required by Stage 1 schema validation.
4. **Conventional-commits ↔ `[coherence]` prefix interaction**. M0 commit-msg guard must allow both `feat: ...` (human) and `[coherence] ...` (tool) without conflict. Resolve by exempting any commit author equal to the configured `[coherence]` author identity.
5. **`/coherence:share-metrics` egress endpoint**. TS-7 §7.6 explicitly says "the receiving endpoint is out of v0.1 scope (could be a local file write or an opt-in HTTPS POST documented in DG-6)." Default: write a redacted JSON file to a user-chosen path; HTTPS POST not implemented in v0.1.
6. **Live-burn cost evidence script funding**. M10 release-candidate cost-burn assumes an Anthropic test key with ≤ $5 budget. Confirm key + budget before M10 start; otherwise rely on cassette-derived PG-5 estimates and document the gap in release notes.
7. **`hook_event_shapes` versioning strategy** in `host-capabilities.json`. The TSD shows `"PostToolUse": "v1"` as a literal — first M2/M9 implementer must define how versions advance and whether a host-version delta forces re-probe automatically vs only on `/coherence:doctor`.
8. **Statusline rendering API**. Claude Code may expose this via plugin manifest or a runtime API; resolve in M9 first PR.
9. **`subagent-trace.json` lifecycle**. TS-3 §3.1 lists this file but TS-3 §3.12 only details `subagent-history.jsonl` and `subagent-stats.json`. Treat as in-session scratch (truncated at SessionEnd alongside `drift-buffer.json`); confirm at M5 start.

## Suggested execution mode

**Recommendation: hybrid — sequential trunk on the critical path with two worktree-parallel side tracks.**

Rationale follows the milestone DAG:

- **Critical path (sequential, single trunk):** M0 → M1 → M2 → M3 → M4 → M8 → M9 → M10 → M11. Each of these milestones unblocks the next and shares ownership of the storage / hook / pipeline layer; running them in parallel risks merge conflicts on the same files (`stateStore`, hook adapters, the Stop orchestrator) and deferred-integration debugging cost. Use `subagent-driven-development` with one subagent per milestone, two-stage review between milestones.

- **Side track A (worktree-parallel from M1 forward):** M6 (LLM client + cassettes + Stage 1 + canonical algo) and M7 (Stage 2 + validation + hallucination corpus). These milestones touch `src/llm/*`, `src/pipeline/canonical.ts`, `src/pipeline/stage{1,2}.ts`, `src/validation/*`, `prompts/v1/*`, and `tests/fixtures/{stage1,stage2,hallucination}/*` — disjoint from the hooks/state critical path. Run in a parallel worktree with periodic rebases. M7 only needs to merge into trunk before M8 starts.

- **Side track B (worktree-parallel from M3 forward):** M10 reference-codebase authoring (`tests/perf/codebases/*`) + ID-5 fixture + ID-4 hallucination corpus + ID-6 stub harness skeleton. Pure data + scaffolding; merges cleanly anytime before M10 starts.

- **M5 (subagent + mid-session)** stays on the critical path because it composes M3 (PostToolUse step 5/6) and M4 (compaction cache reset).

- **M11 docs (DG-1..DG-6)** can drip-feed from M2 onward in a third worktree to reduce end-of-project crunch; only DG-6 (privacy review) requires the full M9 surface to be authoritatively documented.

Concretely: launch `subagent-driven-development` on M0; once M1 completes, fork a worktree-parallel track for M6+M7 and a second worktree for fixture/corpus authoring while the trunk continues with M2..M5; merge M7 before M8 begins; re-converge for M8..M11. This shaves the LLM-pipeline track off the critical path without introducing cross-milestone integration debt.
