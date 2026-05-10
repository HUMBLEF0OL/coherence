# Coherence v0.3 Implementation Plan

> **For agentic workers:** This is a milestone-broken plan, not a step-broken plan. Hand each milestone to `subagent-driven-development` (recommended) or `executing-plans` to be decomposed into TDD-sized steps. Sequencing rules and gate bindings in each milestone are normative — milestones are not "done" until every listed BRD-4 gate is green on every CI matrix cell. The CI matrix is inherited verbatim from v0.2: `[ubuntu-latest, macos-latest, windows-latest] × [20.x, 22.x] × [stub-v2.0, stub-v2.1]`.

> **v0.2 is the substrate.** Every milestone in this plan is a *delta* on top of a shipped-in-master v0.2 (HEAD `9a48f34` at plan inception, after all audit passes + lint cleanup + docs updates). v0.2 does **not** ship as a separate marketplace release per **DD-118** (no legacy version support burden); v0.3 is the first published version. The plan refuses to start work that depends on v0.2 internals before those internals are confirmed live in master, and treats every assumption v0.3 makes as a closed Open Question (DD-093..DD-118).

> **Two architectural commitments are permanent (DD-117, DD-118).** No backend / database / hosted upload service — ever. No legacy version support — each major version stands alone, no migrators across major bumps. These are NFR-ARCH-1 and NFR-ARCH-2 in BRD-3 and are enforced by ship-time static-analysis gates (M-ARCH-1, M-LEGACY-1) wired into `scripts/release-ga.mjs` preflight.

## Overview

Coherence v0.3 turns the plugin from **a single-developer tool** (v0.2: solo-dev session-aware proactive proposals) into **a team-distributable plugin** (v0.3: marketplace-installable, monorepo-aware, cross-team plan visibility, ergonomic carry-overs). The plan slices implementation into **9 milestones (M0..M8)** following the dependency contour of the v0.3 spec corpus (DD-093..DD-118, BRD-1..BRD-5, TS-1..TS-9, post-2026-05-10 audit-round-2 amendments): bootstrap on v0.2 substrate + drop legacy artifacts → scope cache (G-3) → team-shared ignore (G-2) → cross-team plan store (G-4) → metrics export + first-run consent (G-5) → de-annotate + tombstone (G-6/G-8) → static-analysis gates (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1) → corpus expansion + calibration (M-CALIB-1) → tag and ship to Anthropic plugin registry.

**Risk front-loading is hard-wired.** The two architectural commitments **DD-117** (no backend, ever) and **DD-118** (no legacy version support) are stood up in **M0** as a structural commitment — `prompts/v1/` deletion, `src/state/migrate/v1_to_v2.ts` deletion, `src/commands/recover.ts` constrained to within-major-version, and `src/state/refuseLegacy.ts` written and wired into SessionStart. Three ship-time gate test files are stubbed in M0 (`it.skip` blocks) and filled in M6. The corpus calibration framework already exists in v0.2.1 scaffold (`scripts/corpus-calibrate.mjs`); M7 expands the corpus to ~30 cases per detector and tunes thresholds until M-CALIB-1 (precision Wilson lower bound ≥ 0.7, recall ≥ 0.6) passes. The critical path is **M0 → M1 → M3 → M4 → M6 → M7 → M8**; M2 (team-shared ignore) and M5 (de-annotate + tombstone) are parallelizable side tracks.

## Critical Path Diagram

```text
M0  ──►  M1  ──►  M3  ──►  M4  ──►  M6  ──►  M7  ──►  M8
boot-    scope    cross-   metrics  static   corpus   tag +
strap    cache    team     export   analy-   expan-   ship to
+ DD-    + scope- plans    + first- sis      sion +   marketplace
117/118  debug    + plan-  run      gates    calib    + GitHub
cleanup  + monorepo store  consent  filled   tuning   release
+ stub   fixtures + lock-           in M6    M-CALIB- + docs/v0.3/
gates    NFR-PERF Manager  DD-115             1 floor  + tag
DD-095   -N4      DD-100                                v0.3.0
amend    + scope_  DD-107
+ recov  cache_   identity
.ts      miss     hash
amend    sample
                                            ▲                       ▲
                                            │                       │
                                            ├─── M2 ────────────────┤
                                            │   team-shared ignore  │
                                            │   /coherence:ignore-  │
                                            │   split + FSM         │
                                            │   proposal_ignored_   │
                                            │   by_team             │
                                            │                       │
                                            └─── M5 ────────────────┘
                                                de-annotate +
                                                tombstone
                                                FR-DEANNOTATE-1/2 +
                                                FR-TOMBSTONE-1
                                                DD-102/103/110

Parallelizable side tracks:
 - M2 may start as soon as M0 lands — depends only on M0's substrate cleanup + FSM state additions to proposal-cache.json
 - M5 may start as soon as M0 lands — depends only on M0's substrate cleanup; tombstone augments existing scan-cache schema
 - docs/v0.3/ drafting drips from M2 onward; final pass in M8
```

## Architectural commitments (BRD-3 NFR-ARCH-1/2; permanent, never deferred)

These are **not** scope deferrals to a future version. They are permanent rejections of features that conflict with the project's identity. Listed here so future implementations don't accidentally re-introduce them.

| Capability | Reason rejected | Reference |
|---|---|---|
| Server-backed plan store / shared central database | DD-117 — file-only architecture is the end state | DD-099 amended |
| Hosted upload service / TLS-pinned client / GDPR retention windows | DD-117 — telemetry stays file-export + user-driven curl | DD-101 amended |
| Cross-major-version migration paths (`v1→v2`, `v2→v3`) | DD-118 — each major version stands alone | DD-080 retired, DD-094 superseded |
| `prompts/v1/` in v0.3+ tarball | DD-118 — slim tarball; runtime only | DD-095 amended |
| `/coherence:recover` cross-major-version rollback | DD-118 — within-major-version only | DD-095 amended |
| `coherence/ignore` migration path for v0.2 users | DD-118 — fresh state on install | DD-111 retired |
| Multi-channel publishing (npm registry as primary distribution) | DD-093 — Anthropic registry only; npm name optional squat-prevention only | BRD-5 |

## Scope-deferred to future versions (v0.4+; legitimate later work)

These are scope deferrals, not architectural rejections. They may legitimately ship in a future version once they have justification.

| Capability | Deferred to | Reference |
|---|---|---|
| Author-pipeline planner promotion to default ON | v0.4+ pending real telemetry showing ≥25% cross-kind co-occurrence (DD-067) | DD-104 ratified |
| Field calibration of DD-076/077/078 against real `metrics.jsonl` | v0.4+ once distributed version accumulates ≥50 sessions × ≥30 days | DD-116, M-CALIB-2 |
| Auto-generated runnable slash command handlers (v0.2 ships docs-only) | v0.4+ | BRD-5 |
| Cross-session pattern learning beyond a single 7-day rolling window | v0.4+ (explicit opt-in required) | BRD-5 |
| Auto-apply, assertion checking, quality-metrics | v1.0 | BRD-5 (per v0.3 Overview Non-goals) |

## Milestones

---

### M0 — Bootstrap & legacy cleanup

**Goal:** Prepare master for v0.3. Drop legacy artifacts mandated by DD-117/DD-118. Wire NFR-COMPAT-N4 refusal contract. Stub the three new ship-time gate test files. Amend `recover.ts` to constrain rollback to within-major-version.

**TS sections implemented:** TS-1 §"v0.3 deltas" (refuseLegacy module), TS-2 §"SessionStart adds NFR-COMPAT-N4 version refusal", TS-3 §"Schema versioning" + audit-round-2 §"C4 — schema_version two-tier convention", TS-8 audit-round-2 §"C5 — tarball schema inclusion mechanism" + §"C6 — firstRun.ts ownership".

**BRD-4 gates closed:** **M-LEGACY-1 stub** (real impl in M6 — file shipped with `it.skip` block per round-2 P5). Foundation for **M-INSTALL-1** (10 MB tarball cap; honoured trivially after `prompts/v1/` deletion).

**DDs landed:** DD-117 (codified by removing all backend codepaths — there are none in v0.2 to remove, but the architectural commitment is documented in code comments at the top of `src/index.ts`). DD-118 (codified by deletion of legacy artifacts + refuseLegacy.ts). DD-095 amended (slim tarball: `package.json#files[]` explicit subset). DD-094 superseded + DD-080 retired (deletion of v1_to_v2 migrator).

**Key deliverables:**

- **Version & manifest bumps:**
  - `package.json#version`: `0.2.0-alpha.1` → `0.3.0-pre.0`
  - `package.json#files[]`: explicit subset `["dist", "plugin.json", "prompts/v2"]` (drops `prompts` bare-glob that would include `prompts/v1/`)
  - `plugin.json#version`: same bump

- **Legacy artifact deletions:**
  - `prompts/v1/` directory tree (all v0.1-era prompts; preserved in v0.2 git history if needed)
  - `src/state/migrate/v1_to_v2.ts` (DD-080 single-coordinated-migrator; carries no v0.3 purpose per DD-118)
  - Any tests referencing the deleted migrator

- **New module: `src/state/refuseLegacy.ts`** (NFR-COMPAT-N4):
  - Reads `.claude/coherence/version.json#schema_version` at SessionStart
  - Outcomes: `=== 3` → proceed; `< 3` → emit one-line CLI message ("cohrence v0.3 does not migrate from earlier major versions; remove `.claude/coherence/` or run on a fresh project"), exit cleanly without engaging degradedMode; absent → call `firstRun.runFreshInstall()`

- **New module: `src/state/firstRun.ts`** (skeleton; extended in M3 + M4):
  - `runFreshInstall()` writes `version.json#schema_version: 3` (sentinel)
  - Idempotent: if sentinel already exists, no-op
  - M3 will add `.gitignore` patcher; M4 will add consent prompt

- **Recover amendment: `src/commands/recover.ts`** (DD-095 amended):
  - When `recover` detects a target tag with major version != current major version, refuse with: "cohrence does not roll back across major versions; re-install the target version manually"
  - Within-major-version rollback unchanged

- **Stubbed ship-time gate test files** (filled in M6):
  - `tests/static-analysis/no-network.test.ts` — `it.skip('TODO: filled in M6 (M-ARCH-1 NFR-ARCH-1 DD-117)')`
  - `tests/static-analysis/no-cross-dev-leak.test.ts` — `it.skip('TODO: filled in M6 (M-PRIVACY-1 NFR-PRIVACY-N5 DD-109)')`
  - `tests/ship/tarball-shape.test.ts` — `it.skip('TODO: filled in M6 (M-LEGACY-1 NFR-ARCH-2 DD-118)')`

- **Schema sentinel:**
  - `src/state/schemas/version.schema.json` accepts `schema_version: 3`
  - `tests/unit/state/refuse-legacy.test.ts` covers all 3 outcomes (fresh install, pre-v3 refusal, current-v3 proceed)

- **Test added:** `tests/unit/commands/recover-major-version-refusal.test.ts` (recover refuses cross-major-version targets)

- **CHANGELOG seed:** `docs/v0.3/CHANGELOG.md` initial entry naming the M0 deliverables and citing DD-093..DD-118.

**Acceptance:**
- Typecheck clean; lint clean; vitest run = 575+/575+ (existing + new tests pass)
- `npm pack --dry-run` output excludes any path containing `prompts/v1/`
- Refuse-legacy unit covers all 3 outcomes
- `version.json` schema accepts v3
- `src/state/migrate/v1_to_v2.ts` and `prompts/v1/` absent from filesystem and from `git ls-files`
- Recover refuses target tag `v0.2.0` with clear message; accepts target tag `v0.3.0-pre.0`

**Size:** ~200 LOC (mostly deletions + 2 new files). **Half-day.** (Round-2 amendment bumped from ~150 LOC to absorb recover.ts amendment.)

---

### M1 — Scope cache (G-3)

**Goal:** Monorepo discovery — walk all `CLAUDE.md` ancestors with depth cap 8, cache the resolved scope chain, ship `/coherence:scope-debug`, emit `scope_cache_miss` telemetry sampled 1:100. Foundation for any future feature that consumes per-package scope.

**TS sections implemented:** TS-1 §"Scope-cache subsystem", TS-2 §"PostToolUse adds scope-cache consultation", TS-3 §"v0.3 new state files" (scope-cache.json + coherence/scope.json), TS-3 round-1 §"Telemetry events" (scope_cache_miss), TS-7 §"`/coherence:scope-debug`", TS-9 §"NFR-PERF-N4 scope-cache cold-start ≤ 200 ms".

**BRD-4 gates closed:** **M-PERF-1** (PostToolUse 50ms p95 — must hold including scope-cache consultation post-warm), **M-SCOPE-1 prep** (post-ship gate; ship-time test on monorepo-5 fixture). Foundation for FR-SCOPE-1..4.

**DDs landed:** DD-097 (walk-all CLAUDE.md ancestors, depth cap 8), DD-098 (sidecar `coherence/scope.json`), DD-105 (most-specific-wins + opt-in `extends:`), DD-106 (dedicated `scope-cache.json` sibling of state-snapshot).

**Key deliverables:**

- **New modules:**
  - `src/state/scope/walker.ts` — bounded ancestor walk (reuses v0.2 P6 walker primitive: depth 8, 500-file cap, expanded skipDirs)
  - `src/state/scope/resolver.ts` — most-specific-wins by default; explicit `extends:` opt-in for merge per DD-105
  - `src/state/scope/cache.ts` — atomic writer for `scope-cache.json` (per-store strict, mtime-based eviction); emits `scope_cache_miss` telemetry sampled 1:100 (deterministic per-process counter; resets at SessionStart)

- **Schemas:**
  - `src/state/schemas/scope-cache.schema.json` — plugin-managed; tracks v3 sentinel; shape `{ schema_version: 3, generated_at, entries: { [filePath]: { ancestor_chain: string[], extends_resolved: object, mtime } } }`
  - `src/state/schemas/scope-config.schema.json` — user-owned; per-file `schema_version: 1`; shape `{ schema_version: 1, scope_id?, extends?: string, ignore?, mode?, ... }`

- **Command:** `src/commands/scopeDebug.ts` — `/coherence:scope-debug <path>`; prints walked ancestors, hits, resolved chain (most-specific first), winning scope per key with `extends:` expansion, cache hit/miss + age. Read-only.

- **Plugin manifest:** `plugin.json` slashCommands[] gains `coherence:scope-debug`.

- **Hook wiring:** PostToolUse hook reads scope chain via `src/state/scope/resolver.ts`; cache hit → use chain; miss → walk + populate + emit `scope_cache_miss` (sampled).

- **Perf fixtures:**
  - `tests/perf/codebases/monorepo-100/` (synthetic; 100 packages × depth 8; CLAUDE.md in 30%; coherence/scope.json in 5%)
  - `tests/perf/codebases/monorepo-5/` (smaller for ship-time CI)

- **Tests added:**
  - `tests/unit/state/scope/walker.test.ts` (depth cap, ancestor enumeration, skipDirs)
  - `tests/unit/state/scope/resolver.test.ts` (most-specific + extends merge)
  - `tests/unit/state/scope/cache.test.ts` (mtime-based eviction)
  - `tests/unit/state/scope/cache-telemetry.test.ts` (asserts ≤ 1% emission rate)
  - `tests/perf/scope-cache-cold-start.test.ts` (NFR-PERF-N4 ≤ 200 ms on monorepo-100)
  - `tests/integration/scope-debug-command.test.ts`

**Acceptance:**
- `/coherence:scope-debug` on a 5-package fixture prints walked ancestors + winning scope correctly
- Cold-start ≤ 200 ms on monorepo-100; warm PostToolUse ≤ 50 ms p95
- Cache invalidates when `CLAUDE.md` mtime in any ancestor changes
- `scope_cache_miss` event emitted (sampled 1:100; counter behaviour verified by unit test)

**Size:** ~600 LOC + fixtures. **1–1.5 days.**

---

### M2 — Team-shared ignore (G-2)

**Goal:** Two-file additive ignore (`coherence/ignore` committed + `coherence/ignore.local` personal). FSM amendment in `proposal-cache.json` for `proposal_ignored_by_team` state. `/coherence:ignore-split` command.

**TS sections implemented:** TS-3 §"v0.3 new state files" (`coherence/ignore` + `coherence/ignore.local`), TS-3 round-1 §"Telemetry events" + round-2 §"C3 fix — proposal_ignored_by_team", TS-7 §"`/coherence:ignore-split`".

**BRD-4 gates closed:** Foundation for **M-IGNORE-1** (post-ship; ≥1 entry per project on average in committed `coherence/ignore` across alpha cohort).

**DDs landed:** DD-096 (two-file additive model, committed-wins-on-conflict), DD-088 amendment (FSM gains `ignored_by_team` state).

**Key deliverables:**

- **Command:** `src/commands/ignoreSplit.ts` — `/coherence:ignore-split` (no args; idempotent):
  - If `coherence/ignore.local` absent: create empty file at that path
  - If absent in `.gitignore`: append `coherence/ignore.local` line under `# cohrence — personal ignore` heading
  - If both already exist: print 'already split, no-op'; exit 0

- **Reader update:** ignore reader (whichever module owns it in v0.2; verify at M2 kickoff) amended to merge `coherence/ignore` + `coherence/ignore.local` additively, committed wins on conflict per DD-096.

- **FSM amendment: `src/proposals/store.ts`**:
  - Add `ignored_by_team` state per DD-088 amendment
  - Transition: pending → `ignored_by_team` when a teammate adds a path to committed `coherence/ignore` matching the proposal's anchor
  - v0.2 P15 constraint honoured: single transition merges into `state_history` without duplicating prior `queued` entry
  - v0.2 P4 constraint honoured: no second `proposal_accepted` emit on accepted-then-revoked-then-team-ignored path
  - Emits `proposal_ignored_by_team` telemetry event (round-2 C3 fix; NOT `plan_ignored_by_team`) with payload `{ proposal_id_hash: 32-hex, ignore_path_hash: 12-hex }`

- **Schema bump:** `src/state/schemas/proposal-cache.schema.json` adds `ignored_by_team` to allowed state values.

- **Plugin manifest:** `plugin.json` slashCommands[] gains `coherence:ignore-split`.

- **Tests added:**
  - `tests/unit/proposals/proposal-ignored-by-team.test.ts` (FSM transition + v0.2 P15 / P4 constraints honoured) — round-2 P3 fix renamed from `plan-ignored-by-team`
  - `tests/integration/ignore-split.test.ts` (idempotent run on fresh + existing repos; .gitignore patch correctness)

**Acceptance:**
- `/coherence:ignore-split` runs idempotently on fresh repos
- FSM transition emits `proposal_ignored_by_team` event with audit-trail entry
- v0.2 P15 (no duplicate `queued`) + P4 (no second `proposal_accepted`) preserved via test cases

**Size:** ~250 LOC. **Half-day.**

---

### M3 — Cross-team plan store (G-4)

**Goal:** File-only plan sharing across team. `coherence/plans/<branch-sha-12>/<id>.json` files. SHA-256 identity hashing. LockManager extension. Plan-staleness check in doctor. `.gitignore` auto-patch for signal-cache + session-map (NFR-PRIVACY-N5).

**TS sections implemented:** TS-1 §"Cross-team plan store", TS-3 §"v0.3 new state files" (plan store), TS-3 §"Plan file format — detail", TS-3 round-1 §"Telemetry events" (plan_created/accepted/rejected), TS-3 round-1 §"C2 clarification" (appendPlanAudit vs appendProposalState namespacing).

**BRD-4 gates closed:** Foundation for **M-PLANS-1** (post-ship; ≥1 cross-team plan accepted per active branch in alpha cohort with audit-log entry).

**DDs landed:** DD-099 amended (file-only is permanent end state per DD-117), DD-100 (LockManager extension), DD-107 (SHA-256 identity hash), DD-108 (branch-scoped, trunk via merge), DD-109 (signals stay per-developer).

**Key deliverables:**

- **New modules:**
  - `src/state/plans/writer.ts` — plan file creation, branch-sha prefix from `git rev-parse --short=12 HEAD` at creation time, atomic write
  - `src/state/plans/reader.ts` — plan listing per branch
  - `src/state/plans/audit.ts` — `appendPlanAudit()` helper (round-2 C2 namespacing — separate from `appendProposalState()` despite shared AuditEntry shape)
  - `src/state/identity.ts` — SHA-256 hash of `git config user.email`; plain name in CLI display only, never persisted to plan files

- **Schema:** `src/state/schemas/plan.schema.json` extended with `branch_sha` + `audit_log` fields. Per-file `schema_version: 1` (user-owned file evolves independently from plugin sentinel — round-2 C4 convention).

- **LockManager extension: `src/state/locks.ts`** — extend existing v0.2 LockManager (DD-041 hostname/pid + 30s/5s age fence) to gate proposal-cache + plan-store writes per DD-100.

- **firstRun.ts extension** (M0 stub → M3 extension): `runFreshInstall()` adds `.gitignore` auto-patcher step that appends `signal-cache.json` + `session-map.json` paths under `# cohrence — per-developer state (do not commit)` heading. Idempotent.

- **Doctor amendment: `src/commands/doctor.ts`** — adds plan-staleness check; flags any plan in `coherence/plans/<branch-sha>/` whose `created_at` is > 7 days old.

- **Telemetry events** (round-1 G5 + round-2 C3 final roster):
  - `plan_created` `{ plan_id_hash: 32-hex, branch_sha: 12-hex, kind: enum, author_hash: 12-hex }`
  - `plan_accepted` (above + `actor_hash`, `duration_minutes`)
  - `plan_rejected` (above + `reason: enum`: stale | superseded | rejected_explicit)

- **Tests added:**
  - `tests/unit/state/plans/writer.test.ts` (atomic write, branch-sha helper)
  - `tests/unit/state/plans/reader.test.ts` (per-branch listing)
  - `tests/unit/state/plans/audit.test.ts` (append-only, AuditEntry shape)
  - `tests/unit/state/identity.test.ts` (hash determinism, plain-name CLI rendering)
  - `tests/integration/cross-team-plan.test.ts` (two-process simulated git merge — Node forks)
  - `tests/unit/commands/doctor-plan-stale.test.ts`

**Dependencies:** M0 (substrate); M2 (FSM amendment shape — proposal-cache schema bump must land before plan store writes use it).

**Acceptance:**
- `plan_created`/`accepted`/`rejected` events emitted with hashed identity
- Plan files schema-validate
- LockManager extension blocks concurrent writers for the proposal-cache surface
- Doctor flags >7-day plans
- `.gitignore` auto-patch on first-run; `git ls-files` confirms `signal-cache.json` and `session-map.json` are NOT tracked

**Size:** ~500 LOC. **1–1.5 days.**

---

### M4 — Metrics export + first-run consent (G-5)

**Goal:** `/coherence:export-metrics` command (file export only, upload via user-driven curl per DD-117). First-run two-tier telemetry consent UX (DD-115). config.schema.json telemetry namespace.

**TS sections implemented:** TS-7 §"`/coherence:export-metrics`", TS-8 audit-round-1 §"First-run telemetry consent flow", TS-3 round-1 §"Telemetry events" (metrics_export_started).

**BRD-4 gates closed:** Foundation for **M-PRIVACY-1 surface** (the upload-OFF gate is honoured by the export command; static-analysis gate verifies enforcement at M6).

**DDs landed:** DD-101 amended (file-export is permanent end state per DD-117), DD-115 (opt-out local / opt-in upload).

**Key deliverables:**

- **Command: `src/commands/exportMetrics.ts`** — `/coherence:export-metrics [--out <path>] [--since <ISO>] [--anonymized]`:
  - Reads `.claude/coherence/metrics.jsonl` using v0.2 P8 bounded-read primitive (tail-reads when > 5 MB)
  - Filters by `--since` timestamp
  - Redacts per DD-068 event-redaction matrix (verify each event kind produces output free of raw paths)
  - Writes JSONL to `<out>` (default: `metrics-export-<ts>.jsonl` in cwd)
  - Appends audit-log entry to `coherence-log/exports.jsonl`
  - Prints copy-paste `curl` command at end-of-export, **only if** `config.json#telemetry.upload_consent === true`; otherwise prints "upload consent not granted; edit `.claude/coherence/config.json` to enable"
  - Exit 0 on success; exit 1 on read error or empty result

- **firstRun.ts extension** (M3 extension → M4 final): `runFreshInstall()` adds two-tier consent prompt:
  1. "Local telemetry collection — hashed events written only to `.claude/coherence/metrics.jsonl` on this machine. Default: yes (opt-out)?" — Y/n
  2. "Upload telemetry — you initiate `/coherence:export-metrics` manually; nothing leaves your machine without your action. Default: no (opt-in)?" — y/N
  - Persists choices in `.claude/coherence/config.json#telemetry: { local_collection, upload_consent, recorded_at, plugin_version: '0.3.0', non_interactive_default? }`
  - Non-interactive shell → defaults (local ON, upload OFF), `non_interactive_default: true` flag set, re-prompt next interactive session
  - Re-prompts on subsequent SessionStart if `recorded_at` absent (config corruption or partial install)

- **Schema:** `src/state/schemas/config.schema.json` adds `telemetry` object additive at v0.3.

- **Status command amendment: `src/commands/status.ts`** — adds line: `Telemetry: local=on/off, upload=on/off`.

- **Plugin manifest:** `plugin.json` slashCommands[] gains `coherence:export-metrics`.

- **Tests added:**
  - `tests/integration/export-metrics.test.ts` (redaction verified; curl printed only on `upload_consent: true`; bounded-read on > 5 MB jsonl)
  - `tests/integration/first-run-consent.test.ts` (interactive + non-interactive paths; re-prompt on missing `recorded_at`)
  - `tests/unit/commands/status-telemetry-line.test.ts`

**Dependencies:** M0 (refuseLegacy + firstRun.ts skeleton); M3 (telemetry events shape; firstRun.ts extension order).

**Acceptance:**
- `/coherence:export-metrics` writes redacted JSONL; curl printed only when consent granted
- `metrics_export_started` event emitted with `{ since, anonymized, event_count_bucket }`
- Consent persists across SessionStart; re-prompt on missing `recorded_at`
- M-PRIVACY-1 enforcement evident: upload-OFF blocks the curl-print path

**Size:** ~300 LOC. **Half-day.**

---

### M5 — De-annotate + tombstone (G-6/G-8)

**Goal:** `/coherence:de-annotate` two-mode command. Per-file scan tombstone shape (path-hash + content-hash + git_mtime; LRU at 5,000; composes with v0.2 P7 doc-content memo).

**TS sections implemented:** TS-7 §"`/coherence:de-annotate`", TS-3 round-1 §"Per-file scan tombstone (FR-TOMBSTONE-1, DD-103)".

**BRD-4 gates closed:** None directly; ergonomic carry-overs from v0.2 polish.

**DDs landed:** DD-102 (de-annotate scope: per-doc / per-directory / global; most-specific-wins), DD-103 (tombstone shape), DD-110 (de-annotate two-mode: default strip; --keep-as-user-anchor graduates).

**Key deliverables:**

- **Command: `src/commands/deAnnotate.ts`** — `/coherence:de-annotate <path> [--scope per-doc|per-directory|global] [--keep-as-user-anchor]`:
  - Default scope: per-doc
  - Default mode: strip `auto-annotated: true` blocks within scope
  - With `--keep-as-user-anchor`: retain anchor, flip `auto-annotated` to `false` (graduates to user-owned)
  - Persists scope decision in `graduation.json` under `de_annotate` key (most-specific-wins per DD-074 mental model). Future scans honour the decision.
  - Hint emitted when surrounding content has been user-edited since the auto-annotation: 'Run with --keep-as-user-anchor to preserve.'

- **Graduation namespace:** `src/state/graduation.ts` adds `de_annotate` namespace (additive; no schema bump needed).

- **Tombstone module:** Either `src/scanner/scanCacheTombstone.ts` (new) or extend `src/scanner/trickleScanner.ts`:
  - Tombstone entry shape: `{ path_hash: 12-hex SHA-256 of normalised path, content_hash: 12-hex SHA-256 of file body, git_mtime: ISO8601, inserted_at: ISO8601, expires_at?: ISO8601 }`
  - Path normalisation: repo-relative + forward-slashes + lowercased on case-insensitive filesystems
  - Eviction: when `stat()` shows mtime > tombstone `git_mtime`, invalid; LRU at 5,000 entries
  - Cache key composition with v0.2 P7 memo: tombstone consultation BEFORE doc read; memo consultation INSIDE detector; on tombstone hit where memo has same docPath, no disk re-read

- **Schema:** `src/state/schemas/scan-cache-state.schema.json` augments per-entry shape with the tombstone fields.

- **Trickle scanner wiring:** `src/scanner/trickleScanner.ts` consults tombstone before reading each candidate doc; misses populate the tombstone after scan; per-store mutex governs writes (v0.2 DD-066, no per-file lock per round-1 finalised position).

- **Plugin manifest:** `plugin.json` slashCommands[] gains `coherence:de-annotate`.

- **Tests added:**
  - `tests/integration/de-annotate.test.ts` (two-mode + scope persistence + user-edit hint)
  - `tests/unit/scanner/tombstone.test.ts` (mtime invalidation + LRU + composition with v0.2 P7 memo)

**Dependencies:** M0 (substrate cleanup).

**Acceptance:**
- De-annotate two-mode validated; scope persistence confirmed via re-scan
- Tombstone hits avoid disk re-read on memo presence
- LRU evicts past 5,000 entries
- User-edit hint emitted when surrounding content modified since auto-annotation

**Size:** ~350 LOC. **1 day.**

---

### M6 — Static-analysis gates

**Goal:** Fill the M0-stubbed test files with real assertions. Wire all 3 gates into `scripts/release-ga.mjs` preflight. Add meta-test for gate sensitivity (round-2 P7).

**TS sections implemented:** TS-6 §"New v0.3 ship-time gates", TS-6 audit-round-1 §"M-CALIB-1 ship-time gate".

**BRD-4 gates closed:** **M-ARCH-1** (no remote endpoints, no writes outside `.claude/coherence/` or `coherence/`), **M-PRIVACY-1** (no codepath writes signal-cache or session-map under any committed path), **M-LEGACY-1** (tarball excludes `prompts/v1/`).

**DDs landed:** Enforces DD-117, DD-118 architectural commitments via static analysis.

**Key deliverables:**

- **`tests/static-analysis/no-network.test.ts`** (M-ARCH-1):
  - Walks `src/` for imports of `node:net|node:http|node:https|node:dgram` and globals `fetch|XMLHttpRequest|WebSocket`
  - Allowlists `tests/cassettes/` (LLM API responses) and `dist/` (compiled output)
  - Asserts zero literal HTTPS endpoint URLs in `src/` except in cassette fixtures
  - Asserts zero writes to paths outside `.claude/coherence/` or `coherence/` (the user-owned root)

- **`tests/static-analysis/no-cross-dev-leak.test.ts`** (M-PRIVACY-1):
  - Asserts no codepath in `src/` writes `signal-cache.json` or `session-map.json` under any path that starts with `coherence/` (committed) — only `.claude/coherence/` (gitignored) writes allowed
  - Lints `.gitignore` for explicit entries (signal-cache.json + session-map.json)

- **`tests/ship/tarball-shape.test.ts`** (M-LEGACY-1):
  - Asserts `npm pack --dry-run` output excludes any `prompts/v1/` entries
  - Asserts `dist/state/schemas/` is non-empty post-build (round-2 C5 follow-up — catches schema-import regression)

- **`tests/static-analysis/meta-gates-trip.test.ts`** (round-2 P7):
  - Programmatically introduces a transient regression (writes `fetch()` call to a tmp file inside an isolated fixture directory, runs the gate against it, asserts gate FAILS)
  - Cleans up tmp regression
  - Repeats for each gate
  - Run as part of M6's vitest project so silent gate-pass regressions get caught automatically

- **Release pipeline:** `scripts/release-ga.mjs` runs all 3 gates as preflight before tagging:
  ```
  npm run gates && npm run calibrate && npm test && npm run pack:size
  ```

- **Package script:** `package.json` adds `npm run gates` = `vitest run tests/static-analysis tests/ship`.

**Dependencies:** M0–M5 complete (gates run against the full v0.3 codebase; M6 is the integration milestone for everything that came before).

**Acceptance:**
- All 3 gates pass on master
- Meta-test trips each gate programmatically (verifies sensitivity)
- `scripts/release-ga.mjs` halts if any gate fails

**Size:** ~250 LOC (round-2 amendment added meta-test; up from ~200). **Half-day.**

---

### M7 — Corpus expansion + calibration (M-CALIB-1)

**Goal:** Pass M-CALIB-1 floor (per-detector Wilson lower bound ≥ 0.7, recall ≥ 0.6) by expanding the synthetic corpus to ~30 cases per detector. Tune detector defaults if grid recommends. Wire `npm run calibrate` into release-ga preflight.

**TS sections implemented:** TS-6 audit-round-1 §"M-CALIB-1 ship-time gate".

**BRD-4 gates closed:** **M-CALIB-1** (precision Wilson lower bound ≥ 0.7 + recall ≥ 0.6 per detector against the v0.3 corpus).

**DDs landed:** Honours DD-076 / DD-077 / DD-078 (detector thresholds), DD-092 amended via DD-116 (corpus calibration as v0.3 substrate baseline; field calibration deferred to v0.4 as M-CALIB-2).

**Key deliverables:**

- **Corpus expansion** under `tests/fixtures/signal-corpora/`:
  - `bash/` from 7 → ~30 cases per axis (positive/negative/boundary/adversarial). Axes per `docs/v0.2.1/calibration-plan.md`: repeated test runners, repeated git, repeated build commands, distinct commands, normaliser-eligible variations, embedded timestamps/log paths/PIDs, etc.
  - `correction/` from 6 → ~30 cases. Axes: burst within window, ratio at exactly 0.20, cross-day spread, other-agent bleed, etc.
  - `file_creation/` from 0 → ~30 cases (NEW corpus). Axes: 3 same-dir + structural Jaccard ≥ 0.8; 3 same-dir + import-set match; 3 markdown skill files + heading-hierarchy match; 3 different-dir locality miss; mixed-language same-dir; comment-heavy files; node_modules adversarial.

- **Test runner extension:** `tests/unit/signal/signal-corpora.test.ts` updated to handle `file_creation` kind (new fixture format with `samples: [{filePath, content}]`).

- **Threshold tuning:** Run `npm run calibrate`. If grid recommends, update `DEFAULT_BASH_REPETITION_*` (`src/signal/bashRepetition.ts`), `DEFAULT_FILE_CREATION_*` (`src/signal/fileCreation.ts`), `DEFAULT_AGENT_CORRECTION_*` (`src/signal/agentCorrection.ts`).

- **Release-pipeline wiring:** `scripts/release-ga.mjs` preflight runs `npm run calibrate` and fails fast on calibration-floor breach.

- **Artifact:** `release-artifacts/v0.3-corpus-calibration-<ts>.json` committed (or referenced from CHANGELOG; choose at M7).

**Dependencies:** M0 (calibrate framework already exists from v0.2.1 scaffold; M0's deletions don't touch it).

**Acceptance:**
- `npm run calibrate` exits 0
- `release-artifacts/v0.3-corpus-calibration-<ts>.json` shows `precision_wilson_lower ≥ 0.7` AND `recall ≥ 0.6` for all 3 detectors

**Size:** ~70 fixture JSON files + threshold tuning + script wiring. **1–1.5 days.**

---

### M8 — Release

**Goal:** Tag `v0.3.0` and ship to Anthropic plugin registry + GitHub release. Documentation cut.

**TS sections implemented:** TS-8 §"Distribution channels" + §"Release pipeline".

**BRD-4 gates closed:** **M-INSTALL-1** (10 MB tarball cap), **M-COST-1** (per-session cost ≤ × 1.30 baseline; CG-1 + CG-2 partition tests), **M-PERF-1** (PostToolUse 50ms p95).

**DDs landed:** DD-093 (registry only), DD-114 (signing follows Anthropic policy), FR-MARKETPLACE-1/3/4/5.

**Key deliverables:**

- **Final version bumps:**
  - `package.json#version`: `0.3.0`
  - `plugin.json#version`: `0.3.0`

- **Documentation cut:**
  - `README.md` v0.3 walkthrough section (mirrors v0.2 walkthrough format)
  - `docs/v0.3/CHANGELOG.md` complete with M0–M8 entries + DD coverage matrix
  - `docs/v0.3/commands.md` (mirrors `docs/v0.2/commands.md`)
  - `docs/v0.3/state-files.md` (covers scope-cache, plans, scope, ignore.local)
  - `docs/v0.3/privacy.md` (extends v0.2 redaction matrix with 6 new event kinds + telemetry consent flow)
  - `docs/v0.3/rollback.md` (within-major-version recover only)
  - **Round-2 P6:** `docs/v0.2.1/calibration-plan.md` gets a 'superseded by v0.3' banner at the top

- **Ship-time gate run:**
  ```
  npm run gates && npm run calibrate && npm test && npm run pack:size
  ```

- **Tag + push:**
  ```
  git tag -a v0.3.0 -m 'v0.3.0' master
  git push origin v0.3.0
  ```

- **GitHub release:** Created automatically by tag push; release notes include SHA256 of the tarball (FR-MARKETPLACE-4) and a summary of v0.3 features.

- **Marketplace submission:** Update the Anthropic plugin registry listing to v0.3.0 (the listing was raised earlier; M8 is when it gets a concrete tag to point at).

**Dependencies:** ALL prior milestones (M0–M7).

**Acceptance:**
- `v0.3.0` tag exists on origin/master
- GitHub release published with tarball + SHA256 in notes
- Anthropic registry listing updated to v0.3.0
- `/coherence:status` on a fresh clone reports v0.3.0
- All ship-time gates green (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-CALIB-1, M-COST-1, M-INSTALL-1, M-PERF-1)

**Size:** Documentation work + release ceremony. **Half-day if all gates pass; otherwise iterate on whichever gate failed.**

---

## Sequencing summary

**Critical path:** M0 → M1 → M3 → M4 → M6 → M7 → M8.

**Parallel slots:** M2 (team-shared ignore) and M5 (de-annotate + tombstone) can land any time after M0, in any order, before M6.

**Total estimated scope** (post round-2 audit amendments): ~2,650 LOC + ~70 fixture files + 28–33 new test files. Roughly 6–8 working days for a single developer at v0.2 cadence.

## Risk register

| Risk | Mitigation |
|---|---|
| **R1** — M-CALIB-1 may not pass on first corpus expansion | Iterate threshold sweep grid; add boundary cases to corpus; if one detector is structurally hard to calibrate (e.g. agent_correction), add `--allow-incomplete` escape hatch but require explicit reasoning in release notes |
| **R2** — NFR-PERF-N4 may need a faster scope-cache primitive than naive walker | Fall back to `git ls-files`-based discovery (v0.2 P6 already supports this); cache the ancestor list per repo root, not per file |
| **R3** — Anthropic registry submission timeline is external | Ship to GitHub release first via `git tag`; resubmit registry afterwards with the existing pending-listing thread |
| **R4** — Recover.ts amendment (M0 P1) may break existing test scenarios that recover across versions | M0's `recover-major-version-refusal.test.ts` covers the new behaviour; existing recover tests for within-version paths must stay green; if any test references a v0.1 → v0.2 recover scenario, update or delete it |
| **R5** — firstRun.ts evolves across M0/M3/M4 — risk of three-way merge confusion | Round-2 P4 + C6 resolution: M0 ships sentinel-write stub; M3 prepends gitignore patcher inside `runFreshInstall()`; M4 appends consent prompt inside same function. Each step idempotent. Tests at each milestone cover the cumulative state. |

## Acceptance summary

v0.3 GA when:
1. All M0–M7 milestone acceptance criteria pass on master
2. All 7 ship-time gates green (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-CALIB-1, M-COST-1, M-INSTALL-1, M-PERF-1)
3. `v0.3.0` tag pushed to `origin/master`
4. Anthropic registry listing updated to point at v0.3.0
5. GitHub release published with SHA256 of tarball

Post-ship (+60 days post-marketplace-listing):
- M-ADOPT-1 (≥3 distinct teams using marketplace install)
- M-IGNORE-1 (≥1 entry per project on average in committed `coherence/ignore`)
- M-SCOPE-1 (monorepo discovery passes on real ≥5-package repo with depth 8)
- M-PLANS-1 (≥1 cross-team plan accepted per active branch)

These post-ship metrics are not v0.3 GA blockers; failing them becomes future-version work, not a v0.3 amendment.

---

## Cross-references

- **BRD slices:** [BRD-1 Personas](https://www.notion.so/35c010d46a7081028c7ac3287ae9a51c), [BRD-2 FRs](https://www.notion.so/35c010d46a7081e0b319d08705d179ee), [BRD-3 NFRs](https://www.notion.so/35c010d46a7081c2a010cb13993184f4), [BRD-4 Metrics](https://www.notion.so/35c010d46a708180bd9ae9a069601528), [BRD-5 Roadmap](https://www.notion.so/35c010d46a70815e9648e842493b141b)
- **TSD slices:** [TS-1 Architecture](https://www.notion.so/35c010d46a708155b3c6c0060e604214), [TS-2 Hooks](https://www.notion.so/35c010d46a70815b86f2fea15406a4f3), [TS-3 Data Model](https://www.notion.so/35c010d46a7081658a13e3795c12e5f3), [TS-4 LLM Pipeline](https://www.notion.so/35c010d46a7081209377c025f389ca6f), [TS-5 Stop & Planner](https://www.notion.so/35c010d46a70817bb124ea53b113a26c), [TS-6 Validation](https://www.notion.so/35c010d46a708131925dcdc8af80d451), [TS-7 Commands](https://www.notion.so/35c010d46a7081e1a003d99bb2a5a85c), [TS-8 Manifest & Distribution](https://www.notion.so/35c010d46a7081e3b574c78ec2cda15a), [TS-9 Performance](https://www.notion.so/35c010d46a70819d94f2c67cc71bf000)
- **Notion mirror of this plan:** [Implementation Plan — v0.3 (M0..M8)](https://www.notion.so/Implementation-Plan-v0-3-M0-M8-35c010d46a7081a2b4a0da71adf2aa52)
- **DD register:** Notion DD-093..DD-118 (24 active + 4 retired) under v0.3 Design Decisions sub-page
- **Source corpus:** v0.2 plan at `docs/superpowers/plans/2026-05-09-coherence-v0.2.md`; v0.1 plan at `docs/superpowers/plans/2026-05-09-coherence-v0.1.md`
