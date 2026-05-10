# Coherence v0.2 Implementation Plan

> **For agentic workers:** This is a milestone-broken plan, not a step-broken plan. Hand each milestone to `subagent-driven-development` (recommended) or `executing-plans` to be decomposed into TDD-sized steps. Sequencing rules and gate bindings in each milestone are normative — milestones are not "done" until every listed BRD-4 gate is green on every CI matrix cell. The CI matrix is inherited verbatim from v0.1: `[ubuntu-latest, macos-latest, windows-latest] × [20.x, 22.x] × [stub-v2.0, stub-v2.1]`.

> **v0.1 is the substrate.** Every milestone in this plan is a *delta* on top of a shipped, green v0.1 (M0..M11 of the v0.1 plan). The plan refuses to start work that depends on v0.1 internals before those internals are confirmed live, and treats every assumption v0.2 makes about v0.1 as an Open Question that must be ratified or deferred before the relevant milestone closes.

## Overview

Coherence v0.2 turns the plugin from **reactive** (v0.1: passively heal docs that already exist and already have anchors at session end) into **proactive** (v0.2: detect anchor-less docs, recurring user behaviour patterns, and idle-window drift; surface proposals on demand; ambient statusline). The plan slices implementation into **11 milestones (M0..M10)** following the dependency contour of the v0.2 spec corpus (DD-065..DD-092, OQ-v2-01..OQ-v2-31, BRD-1..BRD-5, TS-1..TS-9): bootstrap on v0.1 substrate → DD-065 quarantine boundary stand-up → state schema v1→v2 + new state files → graduation/mode-resolver + statusline → privacy-safe signal detectors against synthetic fixtures → live signal-cache + proposalStore + post-Stop Author pipeline → SessionEnd Author pipeline + agent-correction signal + revert-acceptance → Annotate proposer + trickle deep-scan → propose-* command surface + permission UX → perf/cost/privacy gate harness → E2E sweep + v0.2-alpha telemetry → DD-067 planner branch decision and v0.2.0 GA + DD-092 v0.2.1 calibration patch commitment.

**Risk front-loading is hard-wired.** The load-bearing trust constraint **DD-065** (Author mode is proposal-only; never writes net-new files into `.claude/skills/` / `.claude/agents/` / `.claude/commands/` / `~/.claude/settings.json` without an explicit user-typed `/coherence:propose-accept <id>`) is stood up in **M1** as a structural quarantine boundary plus a CI-enforced **SG-3 negative test** before any signal detector or LLM call exists in the codebase. The 7-day rolling window detection logic and Author-pipeline grouping semantics are exercised on **synthetic fixture sessions** in **M4** before the first live LLM Author call lands in **M5**. Schema migration **v1→v2** lands in **M2** with the same atomic-write + quarantine-and-continue contract that protected v0.1's R-14. The DD-067 staged-adoption rule — *Author-pipeline planner / consolidation stage ships in v0.2 final ONLY if v0.2-alpha telemetry shows ≥25% of `propose-accept` / `propose-reject` actions span ≥2 distinct signal kinds within a 30-min window* — is reflected as a conditional milestone (**M9**) whose execution is gated on the v0.2-alpha telemetry artifact produced at the end of M8. The critical path is **M0 → M1 → M2 → M3 → M5 → M8 → M10**; M4 (signal detectors against synthetic fixtures), M6 (Annotate + Trickle), and M7 (commands + statusline UX polish) are parallelizable side tracks.

## Critical Path Diagram

```text
                    ┌──────────────────────────────────────────────────────────────────────┐
                    │                                                                      │
M0  ──►  M1  ──►  M2  ──►  M3  ──────────────────────►  M5  ──►  M8  ──►  M9  ──►  M10
v0.2     DD-065   schema   graduation                   post-Stop  alpha    [planner   GA
bootstrap quaran- v1→v2    + mode-                      Author     ship +   branch    +v0.2.1
+ v0.1   tine     + new    resolver                     pipeline   tele-    decision  calib.
sub-     boundary state    + state-                     +signal-   metry              commit-
strate   (R-v0.2- files    snapshot                     cache      observ-            ment
verify    01/05)  (R-v0.2- + status-                    + propose- ation              (DD-067
+ OQ     + SG-3    03)     line                         Store      window              gating)
freeze   test                                                     (R-v0.2-11)
                                            ▲                       ▲
                                            │                       │
                                            └─── M4 ─────────────────┤
                                            signal detectors        │
                                            on synthetic fixtures   │
                                            (R-v0.2-01)            │
                                                                    │
                                                M6 ────────────────►┤
                                                Annotate + Trickle  │
                                                (R-v0.2-02/-08)     │
                                                                    │
                                                M7 ────────────────►┤
                                                propose-* commands  │
                                                + statusline UX     │
                                                (R-v0.2-01/-09)     │

Parallelizable side tracks:
 - M4 may start as soon as M2 lands — depends only on v1→v2 schemas (signal-cache, drift-buffer enum widening)
 - M6 (Annotate + Trickle) may start as soon as M3 lands — depends only on graduation.json + proposalStore
 - M7 (commands + UX polish) may start as soon as proposalStore exists in M5; finishes alongside M8
 - DG (docs) drafting drips from M2 onward; final pass in M10
```

## Out-of-scope / Deferred (v0.3+ per BRD-5 §3)

Explicit deferrals; do not implement in v0.2 even if surface area appears trivial. Source: v0.2 BRD-5 §3 plus DD references.

| Capability | Deferred to | Reference |
|---|---|---|
| Auto-apply / graduated trust ladder for accepted proposals | v1.0 candidate | DD-065, BRD-5 §3 |
| Egress / opt-in HTTPS upload of anonymised metrics (file-write only ships in v0.2) | v0.3 | DD-086, BRD-5 §3 (provisional `/coherence:upload-metrics`) |
| Plugin marketplace packaging, team-shared `coherence-ignore`, monorepo `scope:` declarations | v0.3 | BRD-5 §3 |
| Cross-session pattern learning beyond a single 7-day rolling window | v1.0 (explicit opt-in required) | BRD-5 §3 |
| `/coherence:audit` deep audit + assertion checking | v1.0 | BRD-5 §3 |
| `/coherence:de-annotate` (rollback of Annotate-mode anchors via `auto-annotated: true` discriminator) | v0.3 | BRD-5 §3, DD-069 |
| Per-file scan tombstones under `scan-cache/<hash>.json` | v0.3 (directory shape reserved by DD-066 amendment) | BRD-5 §3, DD-066 |
| Author-pipeline planner / proposal consolidation stage **if v0.2-alpha telemetry threshold not met** | v0.3 (otherwise ships in v0.2 final M9) | DD-067 staged adoption, BRD-5 §3 |

## Milestones

---

### M0 — v0.2 Bootstrap on v0.1 Substrate

**Goal:** Verify v0.1.0 has shipped and v0.1.1 has landed (DD-068 telemetry events live), prove every assumption v0.2 makes about v0.1 is either resolved (🟢 OQ-v2-XX → DD-XXX) or explicitly deferred, and produce the v0.2 working branch / spec-freeze artifact. **No production code change yet — this milestone exists to refuse to start without a known-good substrate.**

**TS sections implemented:** TS-1 §1 (v0.2 plugin shape recap + delta — no code change, only documentation of the inherited substrate), TS-8 §1 (install / upgrade flow precondition).

**BRD-4 gates closed:** none directly; M0 is the precondition gate. Confirms v0.1 BRD-4 §4.9 acceptance checklist is signed off and v0.1.1 patch has shipped. Foundation for **FG-12** (DD-068 events emitted on every PostToolUse Bash/Edit/Write (Read excluded), every UserPromptSubmit, every Stop/SubagentStop) — final closure in M8 once the signal-cache + observation harness exists.

**Key deliverables:**
- `docs/v0.2/PRECONDITION.md` checklist asserting:
  - v0.1.0 git tag `release-v0.1.0` is present, signed, and CI-green on every matrix cell.
  - v0.1.1 has shipped with the **DD-068 three privacy-safe Author-signal events** (`tool_invocation_signature`, `user_prompt_signature`, `agent_response_id`) live in `metrics.jsonl`. CHANGELOG entry dated 2026-05-09 cited verbatim.
  - **OQ-v2 status sweep**: every OQ-v2 entry on the Open Questions page is one of: 🟢 Resolved (links to DD), ⚫ Deferred (links to BRD-5 §3 row), or 🟡 In progress with a specific milestone owner. **No 🔴 Open entry may remain.** OQ-v2-04 (frontmatter round-trip), OQ-v2-21 (proposal-id hashing rigor), OQ-v2-24 (subagent provenance reformulation), and OQ-v2-30/31 (scan-cache shape) are individually called out in the artifact with their resolution path.
  - DD numbering integrity: register continues from DD-065 (v0.1 ended at DD-064); no DD-064 collision.
- `version.json#prior_versions[]` confirms `{schema_version: 1, migrated_at: <ts>}` will be appended cleanly by the v1→v2 migrator (precondition for M2).
- **Spec-freeze artifact** under `docs/superpowers/plans/v0.2-spec-freeze-2026-05-09.md` enumerating DD-065..DD-092, the calibration commitment chain (DD-076/077/078 default-locked → DD-092 v0.2.1 commit), and the deferral list above.
- Working branch policy: trunk merges from `dev → v0.2-trunk`; v0.2-alpha tag will be cut at M8 close; v0.2.0 tag at M10 close.

**Test artifacts:** none code-side; `tests/preconditions/v0.2-substrate.test.ts` is a metadata-only test that asserts (a) `version.json.schema_version === 1`, (b) DD-068 event names are present in the v0.1.1 emitter source, (c) `release-v0.1.0` tag exists.

**Risks mitigated:** **spec-freeze parallel-planning risk** (BRD-5 §2 dependency-surface validation precondition; no direct R-v0.2-NN counterpart — recorded as a process risk against the BRD-5 §2 row). Without this milestone, v0.2 work proceeds against assumptions about v0.1 that may shift, producing rework debt the calibration commitment cannot absorb. **R-v0.2-12** (Cross-session `prior_response_id` leakage) — FR-OBS-N2 wired in v0.1.1 emitter (foundation here; regression test closes alongside FG-12 in M4/M8) so the v0.2 substrate inherits an already-cleared `responseCorrelation` cache at SessionStart / SessionEnd.

**Parallelizable tracks within milestone:** PRECONDITION checklist authoring runs in parallel with the OQ-v2 status sweep and the spec-freeze artifact.

**Done when:**
- [ ] PRECONDITION checklist signed off by tech lead and product owner.
- [ ] No 🔴 OQ-v2 entry remains; every entry is 🟢 / 🟡 / ⚫.
- [ ] v0.1.0 + v0.1.1 tags are reachable from `dev`.
- [ ] DD-068 events verified live: synthetic v0.1.1 session emits `tool_invocation_signature`, `user_prompt_signature`, `agent_response_id` to `metrics.jsonl`.
- [ ] `tests/preconditions/v0.2-substrate.test.ts` passes on every matrix cell.
- [ ] **FR-OBS-N1a..N1e** wired (Bash normalisation contract, Edit/Write path template, length-bucket boundaries, `refers_to_prior` regex, ≤ 13 MB storage budget) in the v0.1.1 emitter and reflected in the spec-freeze artifact.
- [ ] **FR-OBS-N2** cross-session leak: `responseCorrelation` cleared in `sessionStartHook` and `sessionEndHook`; first `user_prompt_signature` after `SessionStart` carries `prior_response_id: null`. Regression test bound to FG-12 closure target.
- [ ] **FR-PRIVACY-N1** (`anonymizeRecord()` allowlist) extended to cover the three DD-068 events end-to-end (final closure in M10 with FR-PRIVACY-N2..N4).

**Dependencies:** v0.1 M11 (release). This is the v0.2 root milestone.

---

### M1 — DD-065 Quarantine Boundary + SG-3 Negative Test (load-bearing trust)

**Goal:** Stand up the **single load-bearing trust constraint of v0.2** — DD-065 — as a structural code boundary plus an enforcement test that fails CI if any code path other than `propose-accept` / `install-statusline` / `uninstall-statusline` writes outside `.claude/coherence/`. **No proposers, no detectors, no LLM yet — this milestone exists to make the quarantine boundary unbreakable before anything that could try to break it lands.**

**TS sections implemented:** TS-2 §4 (Module boundaries — *“`propose-accept` is the single 'cross the boundary' operator”*), TS-6 §1 (DD-065 quarantine boundary), TS-6 §2 (privacy posture inheritance), TS-3 §1 (on-disk layout: `.claude/coherence/proposals/<kind>/<id>/` reserved).

**BRD-4 gates closed (foundational only):** **SG-3** (no write under `.claude/skills/`, `.claude/agents/`, `~/.claude/settings.json` without a typed slash command — verified by E2E quarantine fixture). **FR-PERMISSION-N1..N3** (write-capability isolation: propose-accept and install/uninstall-statusline are the only crossing operators; coherence-prefixed accept/revert commits). The remainder of SG-* gates (SG-1, SG-1a, SG-1b, SG-2) inherit this foundation in M4..M8.

**Key deliverables:**
- `src/proposals/quarantine.ts` — single `writeProposal(kind, id, ...)` function, hard-coded write target `.claude/coherence/proposals/<kind>/<id>/`. Refuses to accept any write path that resolves outside that prefix (post-realpath, post-normalisation per v0.1 `pathNormaliser`). Uses v0.1 `stateStore` atomic-write + lock-manager + quarantine-on-corruption (no fork, no patch — TS-2 §2 v0.1 surface reuse).
- `src/proposals/manifest.ts` — `manifest.json` writer per proposal: `{proposal_id, kind, signal_hash, generated_at, expires_at, state, ignored_count, schema_version: 2}` (DD-072 vocabulary). Proposal IDs are deterministic content-derived UUIDs (DD-072 + OQ-v2-21 hashing rigor).
- `src/permissions/proposeAccept.ts` (skeleton) — the **only** code path with a write capability outside `.claude/coherence/`. v0.2 hard-codes that this function is invoked exclusively by the typed `/coherence:propose-accept <id>` command surface; module-level export refuses any other caller via a stack-frame check or unique invocation token. (DD-065 enforcement; full collision-policy + git commit lands in M5/M7).
- ESLint custom rule `no-out-of-quarantine-write`: AST scan flags any `fs.writeFileSync` / `fs.promises.writeFile` / `fs.appendFileSync` / `fs.createWriteStream` whose path argument cannot be statically proven to resolve under `.claude/coherence/` — fails lint unless the call site is in the allow-list (`src/permissions/proposeAccept.ts`, `src/permissions/installStatusline.ts`, v0.1 inherited writers under `.claude/coherence/`).
- `tests/security/sg-3-quarantine-boundary.test.ts` — **the SG-3 fixture**. Spins a fixture session, runs every v0.2 module entry-point that is allowed to exist at this milestone (none yet), grep-asserts that no file under `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, `~/.claude/settings.json` has been touched. Wires a property-based fuzzer that randomises proposal payloads and asserts the boundary holds.
- `tests/security/sg-3-eslint.test.ts` — feeds the lint rule synthetic offending source files (e.g. a fake `src/proposers/badAuthor.ts` that tries `fs.writeFileSync('.claude/skills/foo/SKILL.md')`) and asserts lint fails.
- Glossary update: documents `quarantine` disambiguation per DD-072 — v0.1's `quarantine/` (state-corruption recovery, `.bak` retention) vs v0.2's `proposals/` directory (trust isolation).
- `coherence/ignore` default-template patch: adds `proposals/` and `proposal-cache.json` so users do not accidentally commit local proposals (DD-072).

**Test artifacts:** `tests/fixtures/quarantine/` — fake skill/agent/command directories under a sandbox root that the SG-3 test sweeps after every code path.

**Risks mitigated:** **R-v0.2-01** (Author proposals misjudged → noise erodes the trust v0.1 built — DD-065 quarantine is the front-line mitigation), **R-v0.2-05** (Annotate mode silently mutates user-owned docs — DD-065 quarantine is the structural shared mitigation). DD-065 rationale §2 calls this out explicitly: *"Net-new skill/agent files are higher-risk than v0.1's surgical patches: a fabricated skill becomes future agent context, multiplying any hallucination across every later session. The blast radius justifies the strictest possible default."*

**Parallelizable tracks within milestone:** ESLint rule, SG-3 fixture, and the `quarantine.ts` writer are independent and may be authored in parallel.

**Done when:**
- [ ] SG-3 fixture green on every CI matrix cell.
- [ ] ESLint `no-out-of-quarantine-write` rule fails CI on the planted-offender fixture.
- [ ] `propose-accept` skeleton refuses calls from non-command-surface callers (unit test).
- [ ] No code path in `src/` writes outside `.claude/coherence/` (lint sweep clean).

**Dependencies:** M0.

---

### M2 — State Schema v1 → v2 Migrator + New State Files (R-v0.2-03)

**Goal:** Ship the single coordinated **v1 → v2 migrator** (DD-080), the five new state files (`graduation.json`, `proposal-cache.json`, `signal-cache.json`, `state-snapshot.json`, `scan-cache/state.json`), and the additive enum widenings on `drift-buffer.json` (source enum) and `cost-ledger.json` (stage enum + `prompt_version` shape). The migrator inherits v0.1's atomic-write + lock-manager + quarantine-on-corruption contract. **No new behaviours surface yet — this milestone exists to make v0.2 schemas safely upgradeable on a v0.1 install.**

**TS sections implemented:** TS-3 §1 (on-disk layout v0.2 view), TS-3 §2 (schema changes to v0.1 files — additive enum widenings), TS-3 §3 (new state files — graduation, proposal-cache, signal-cache, state-snapshot, scan-cache), TS-8 §2 (v1 → v2 migrator), TS-4 §1 (SessionStart migration sweep step).

**BRD-4 gates closed:**
- **FG-1** (v1 → v2 migration on synthetic v1 corpus produces correct v2 state, quarantines pre-migration files, appends `prior_versions`, no data loss).
- **RG-2** atomic-write rollback (partial — RG-2 covers all FG/PG/CG/SG green; this milestone closes the migration component; final RG-2 closure in M8/M10).
- **NFR-MAINT** (additive) — schema migration chain extended to v2.
- **FR-FAILURE-N1, N2** single atomic v1→v2 migrator + quarantine-and-continue on corrupt source file during migration.
- Foundation for **FR-MODES-1..7** (graduation.json present, mode-resolver and `--status` flag wiring lands in M3).
- Foundation for **FR-PROPOSE-9, FR-PROPOSE-12** (proposal-cache schema present, expiry sweep wiring lands in M3).
- Foundation for **FR-PROPOSE-13** schema (`proposal.schema.json` per DD-087): the cache-writer-time validation lands in M5; the propose-show-time read validation lands in M7.

**Key deliverables:**
- `src/state/migrate/v1_to_v2.ts` — single coordinated migrator. Atomic semantics; sub-steps per TS-8 §2.1: (a) bump `version.json.schema_version` 1→2, append `{schema_version: 1, migrated_at}` to `prior_versions[]`; (b) widen `drift-buffer.json` `BufferEntry.source` enum (additive — `proposer`, `annotate`, `trickle_deep_scan`, `signal_bash`, `signal_file`, `signal_correction`); (c) widen `cost-ledger.json` `CostEntry.stage` enum + `prompt_version` shape; (d) create empty `graduation.json` `{schema_version:2, global_mode:"observe", scopes:[]}` (DD-074); (e) create empty `proposal-cache.json` (DD-088); (f) create empty `signal-cache.json` with three buckets `bash_repetition`, `file_creation`, `agent_correction` and per-bucket `maxItems` caps (DD-089); (g) create empty `scan-cache/state.json` (DD-066, OQ-v2-30 reservation); (h) create empty `state-snapshot.json` (DD-070, DD-084); (i) extend in-process `SCHEMA_NAMES`/`FILE_TO_SCHEMA`. Emits `migration_completed {from:1, to:2, duration_ms}`.
- `src/state/migrate/index.ts` — slot the new migrator into the `if (schemaVersion < 2)` branch, preserving v0.1's `migrate_v0_to_v1` chain unchanged.
- `src/state/schemas/v2/*.schema.json` — JSON Schema (draft-07) for each new state file. `proposal-cache.json` includes the FSM state machine `queued → surfaced → ignored | accepted | rejected | reverted | expired` with `state_history[]` append-only contract (DD-088).
- `src/state/scan-cache.ts` — v0.2 introduces the directory `.claude/coherence/scan-cache/` with `state.json` only; `<hash>.json` per-file tombstones are reserved (DD-066 amendment) and **not** materialised in v0.2 (deferred per BRD-5 §3).
- `src/hooks/sessionStart.ts` (extended) — TS-4 §1 ordering: v0.1 init → migration sweep → proposal expiry sweep stub (full sweep wires in M3) → v0.1 re-validation → `responseCorrelation` cache cleared → mode-resolver primes (lands M3) → initial `state-snapshot.json` write (lands M3 once mode-resolver is wired). The hard ordering constraints from TS-4 are: (a) migration runs before any reader of v2 schemas, (b) `responseCorrelation` cache clear runs before the first `UserPromptSubmit` peek, (c) state-snapshot bootstrap runs after migration and after mode-resolve.
- `tests/rollback/v1-to-v2-migration.test.ts` — synthetic v1 fixture under `tests/fixtures/migration/v1/` with all v0.1 state files + a deliberately corrupt `drift-buffer.json`. Asserts: schemas validate post-migration, prior_versions appended, corrupt file quarantined, fresh defaults written, `migration_completed` event present, **no v1 file lost** (atomic semantics).
- `tests/schema/v2/*.test.ts` — round-trip validation per new state file (RG-2 inherited).
- `tests/integration/sessionStart-migration.test.ts` — first SessionStart on a v1 install runs the migrator exactly once; second SessionStart no-ops. Lock-manager prevents concurrent migration on simultaneous sessions.

**Test artifacts:** `tests/fixtures/migration/v1/{valid,corrupt-buffer,corrupt-cost-ledger}/` — synthetic v1 corpora; `tests/fixtures/state/v2/{valid,invalid}/` schema-fixture corpus.

**Risks mitigated:** **R-v0.2-03** (v1 → v2 migration corrupts v0.1 state — DD-080 single atomic migrator + FR-FAILURE-N2 quarantine-and-continue + FG-1 fixture). The v1 → v2 schema bump is the only structural change v0.1's storage layer has ever seen; doing it as a single coordinated migrator (not a chain of N small steps) keeps the SessionStart cost flat and the failure mode atomic.

**Parallelizable tracks within milestone:** Each new state file's schema + migration sub-step is independent. The five new schemas can be authored in parallel; the migrator orchestrates them.

**Done when:**
- [ ] All v2 schemas validate against valid fixtures and reject every invalid fixture.
- [ ] `migrate_v1_to_v2` runs on the synthetic v1 fixture, leaves a `quarantine/<file>.<ts>.bak` for any corrupt file, appends prior version to `version.json#prior_versions`, creates all five new state files with `schema_version: 2`.
- [ ] Older-plugin-reads-newer-state test (inherited RB-4): a v0.1 binary against a v2 install enters read-only mode (v0.1 already implements this at the version-check layer; v0.2 confirms no regression).
- [ ] Atomic-write rollback: kill mid-rename during migration → no partial v2 state, full v1 state intact (RG-2 inherited).
- [ ] First SessionStart runs migration exactly once across all matrix cells.

**Dependencies:** M1 (boundary lint must be green before new state-write code lands).

---

### M3 — Graduation + Mode Resolver + State-Snapshot + Statusline Scripts

**Goal:** Wire the **mode lifecycle** (`/coherence:graduate <mode> [<path>]` + `graduation.json` per-scope resolution, DD-074), the **state-snapshot debounced writer** (DD-084), the **proposal expiry sweep** (DD-075 fences), and the **statusline scripts** (`bin/coherence-statusline.{sh,ps1}` + `bin/coherence-subagent-statusline.sh`, DD-070/DD-071) with OSC 8 / OSC 52 / plain-text graceful degradation. **Statusline scripts are read-only consumers of `state-snapshot.json` (FR-STATUSLINE-6, cancellation-safe single atomic file read).** Statusline install/uninstall slash commands are hard-isolated inside `installStatusline.ts` per DD-065 (only second cross-the-boundary operator beyond `propose-accept`).

**TS sections implemented:** TS-3 §3.1 (`graduation.json`), TS-3 §3.5 (`state-snapshot.json` first-snapshot bootstrap), TS-4 §1 step 7 (initial state-snapshot write), TS-4 §6 (Stop / SubagentStop / SessionEnd flush), TS-1 §1 (statusline scripts under `bin/`), TS-1 §5 (statusline read-only consumer of `state-snapshot.json`), TS-6 §6 (Statusline install/uninstall safety), TS-6 §7 (OSC 8 / 52 / plain degradation), TS-8 §4 (Host-capability probe extensions DD-090), TS-8 §5 (Statusline install/uninstall flow).

**BRD-4 gates closed:**
- **FG-2** `/coherence:graduate annotate <dir>` flip + `--status` reflection + SessionStart respects the persisted mapping.
- **FG-13** `/coherence:install-statusline` writes statusLine + creates backup + asks for explicit confirmation; `/coherence:uninstall-statusline` reverses cleanly.
- **FG-14** statusline OSC 8 degradation tier matches `host-capabilities.url_scheme_handler` (osc8 / osc52 / plain).
- **FR-MODES-1..7** mode lifecycle (global default `observe`, per-scope override, most-specific-wins resolution, persisted to `graduation.json`, `--status` flag, hard invariant that mode never enables auto-apply, `/coherence:status` integration).
- **FR-STATUSLINE-1..10** statusline integration end-to-end: scripts under `bin/`, opt-in install command with backup, plugin-shipped subagentStatusLine, OSC 8 / 52 / plain three-tier graceful degradation, cancellation-safe single atomic-read pattern, **debounced state-snapshot writer** (FR-STATUSLINE-7 — 5 s minimum interval, lock-protected, forced flush at Stop / SubagentStop / SessionEnd), **`/coherence:doctor` probe drift check** (FR-STATUSLINE-8), **`FORCE_HYPERLINK=1` override + supported-terminals doc list** (FR-STATUSLINE-9), and **first-snapshot bootstrap exempt from the 5 s debounce floor** (FR-STATUSLINE-10).
- **FR-PROPOSE-9, -12** proposal expiry sweep (DD-075: 14-day fence + 7-day signal-recurrence + consecutive-ignored counter).
- **FR-PERMISSION-N2** statusline-config write capability isolated to `installStatusline.ts` only.
- **PG-5** statusline render overhead < 5 ms per render (success-metric proxy via cassette harness).
- **PG-2** state-snapshot.json write ≤ 5 ms p95 isolated; 0 ms PostToolUse attribution (DD-084 amendment, OQ-v2-20 resolution).
- **NFR-PERF-N2** statusline render overhead < 5 ms per render (matches PG-5).
- **NFR-PERF-N4** state-snapshot write ≤ 5 ms p95 isolated, 0 ms attributed to PostToolUse, verified by new regression-gate cell `state-snapshot write` in `tests/perf/regression-gate.test.ts` (matches PG-2).

**Key deliverables:**
- `src/state/graduation.ts` — read/write `graduation.json` with atomic write through v0.1 `stateStore`.
- `src/modes/resolver.ts` — O(log n) path-prefix-match resolver; per-session cache primed at SessionStart step 6 (TS-4 §1 ordering rule). Resolution order: per-doc → per-dir → global; never bypasses DD-065 quarantine.
- `src/commands/graduate.ts` — `/coherence:graduate <mode> [<path>]` command, where `<mode> ∈ {observe, annotate, author}`. `/coherence:graduate --status` prints the current per-scope mapping and the effective mode for `cwd` (FR-MODES-5).
- `src/state/proposalCache.ts` — full read/write FSM machinery for `proposal-cache.json`. Append-only `state_history[]` mutations.
- `src/proposals/expirySweep.ts` — invoked at SessionStart step 3 (TS-4 §1). Walks `proposal-cache.json.entries`, transitions to `expired` any entry meeting any DD-075 fence: `now − generated_at ≥ 14 d` OR signal hash absent from `metrics.jsonl` last 7 days OR `consecutive_ignored ≥ proposal_consecutive_ignore_threshold` (default 5). Logs to `coherence-log.md`; emits `proposal_expired` per drop. Idempotent; lock-protected.
- `src/state/snapshotWriter.ts` — DD-084 debounced writer. PostToolUse only sets an in-process **dirty bit** (no FS I/O); flush conditions: (a) Stop / SubagentStop / SessionEnd hooks (already off the hot path), (b) opportunistically by a debounced writer with **≥5 s minimum interval**, guarded by `lockManager` (`src/state/locks.ts`). NFR-PERF-1 budget allocation: **5 ms p95 isolated**, **0 ms attributed to PostToolUse**. New regression-gate cell `state-snapshot write` added to `tests/perf/regression-gate.test.ts`.
- `src/observability/statusline.ts` — primary (`claude://`) + three-tier fallback (OSC 8 → OSC 52 → plain), per DD-071:
  1. **Preferred** — `claude://run/coherence:propose-skill` URI scheme (gated by `host-capabilities.json.claude_url_scheme_supported` probe; DD-090 `host-capabilities.json` v0.2 fields per FR-STATUSLINE-8).
  2. **Fallback A** — OSC 8 hyperlink wrapping the slash command (gated by `host-capabilities.json.terminal_hyperlink === 'osc8'`).
  3. **Fallback B** — OSC 52 copy-to-clipboard (gated by `terminal_hyperlink === 'osc52'`).
  4. **Fallback C** — plain text, e.g. `[2 proposals → /coherence:propose-skill]`.
  Honours `FORCE_HYPERLINK=1` override per DD-071 footnote.
- `bin/coherence-statusline.sh`, `bin/coherence-statusline.ps1`, `bin/coherence-subagent-statusline.sh` — read-only consumers of `state-snapshot.json` only. **Cancellation-safe** (Claude Code cancels in-flight statusline runs on new updates) — single atomic file-existence + atomic-read pattern, no multi-step computation (FR-STATUSLINE-6, DD-070 footnote).
- `src/commands/installStatusline.ts` — settings.json **backup-then-write** (FR-PERMISSION-N2). Backup path `~/.claude/settings.json.coherence-backup-<ts>`. Refuses to overwrite if user has manually edited the statusline section since the last backup (diff check). The **only** module other than `proposeAccept` that writes outside `.claude/coherence/`; passes the M1 SG-3 fixture + ESLint allow-list.
- `src/commands/uninstallStatusline.ts` — restores most recent backup; reports the backup file path.
- `tests/unit/modes/resolver.test.ts` — most-specific-wins per DD-074, including: docs-prefix-scope vs docs/api.md exact-path-scope, global fallback.
- `tests/unit/state/snapshot-debounce.test.ts` — DD-084 hot-path-zero-cost: 1000 PostToolUse simulated → 0 disk writes; debounced writer flushes once per ≥5 s window.
- `tests/perf/regression-gate.test.ts` (extended) — new cell `state-snapshot write < 5 ms p95 isolated`; PostToolUse cell unchanged from v0.1 baseline.
- `tests/perf/statusline-render.test.ts` — PG-5 statusline render < 5 ms per render (cassette-driven harness across OSC 8 / OSC 52 / plain tier matrices).
- `tests/integration/proposal-expiry-sweep.test.ts` — synthetic `proposal-cache.json` with three entries hitting the three DD-075 fences; SessionStart sweeps all three to `expired`, leaves un-fenced entries alone.
- `tests/security/sg-3-statusline-install.test.ts` — `/coherence:install-statusline` IS allowed to write `~/.claude/settings.json`; any **other** module attempting that write fails the test (regression of M1 boundary).
- `tests/integration/statusline-osc8.test.ts` — three terminal capability matrices: OSC 8 supported (iTerm2-style), OSC 52 only (Terminal.app-style), plain (CI / Windows Terminal default) — emit correct escape sequences in each.

**Test artifacts:** `tests/fixtures/graduation/{global-only, per-dir, per-doc, conflict}/` — graduation.json fixture corpora; `tests/fixtures/statusline/{state-snapshots/}` — synthetic snapshot files driving the bin scripts.

**Risks mitigated:** **R-v0.2-02** (PostToolUse 50 ms p95 budget regresses) — DD-084 amendment removes any synchronous snapshot write from the hot path; OQ-v2-20 resolution; PG-2 / PG-4 regression-gate cells. **R-v0.2-06** (statusline install corrupts user `~/.claude/settings.json`) — install/uninstall isolated to `installStatusline.ts` with explicit confirmation + automatic backup, lint rule and SG-3 fixture extended, `/coherence:uninstall-statusline` reversal. **R-v0.2-07** (OSC 8 click affordance produces garbled badges in unsupported terminals) — DD-071 single-segment OSC 8 wrap + 3-tier graceful degradation (claude:// → OSC 8 → OSC 52 → plain) with `host-capabilities.url_scheme_handler` probe.

**Parallelizable tracks within milestone:** Mode-resolver + graduation.json + `/coherence:graduate` are independent of statusline + state-snapshot. Within statusline: Bash and PowerShell scripts are independent; OSC tier detection is independent of script bodies.

**Done when:**
- [ ] `/coherence:graduate annotate docs/` flips mode for `docs/` only; `/coherence:graduate observe` resets global; `/coherence:graduate --status` prints effective mode for `cwd` (FR-MODES-5 test).
- [ ] **FR-MODES-6** hard invariant: changing mode never enables auto-apply; DD-065 quarantine boundary is preserved at every mode level (regression covers SG-3 boundary while resolver returns `author`).
- [ ] **FR-MODES-7** `/coherence:status` surfaces the effective mode for the current `cwd` alongside v0.1 outputs.
- [ ] SessionStart proposal expiry sweep transitions stale entries to `expired` and logs `proposal_expired` events.
- [ ] PostToolUse p95 unchanged from v0.1 baseline ± regression budget (DD-084 hot-path-zero verified).
- [ ] `state-snapshot.json` write 5 ms p95 isolated on every matrix cell.
- [ ] Statusline script renders correct escape sequence on each terminal capability (OSC 8 / OSC 52 / plain).
- [ ] `/coherence:install-statusline` produces a backup, writes settings.json, and `/coherence:uninstall-statusline` restores the backup (round-trip test).
- [ ] SG-3 fixture green: only `proposeAccept` and `installStatusline` may cross the quarantine boundary.

**Dependencies:** M2 (graduation.json + state-snapshot.json schemas).

---

### M4 — Signal Detectors (Bash, File-Creation, Agent-Correction) on Synthetic Fixtures (R-v0.2-01)

**Goal:** Implement the three Author signal detectors — **bash repetition** (DD-076: 3 normalised matches in 30-min rolling window), **file-creation pattern** (DD-077: 3 files + locality + structural similarity Jaccard ≥ 0.8), **agent-output correction** (DD-078 amended: 5-min window, ≥ 20% line-diff invocation-aggregate ratio, 3 occurrences per agent in 7-day window) — and prove their precision against synthetic fixture sessions **before any live LLM Author call exists**. Threshold defaults are locked per DD-076/077/078; numerical tuning is delegated to **DD-092** v0.2.1 calibration patch (driven by `proposal_signal_observed { ..., would_have_fired }` shadow events emitted from this milestone onward).

**TS sections implemented:** TS-2 §1 (new modules — `signal-detectors`, `signal-cache`, `signatureHash`), TS-2 §3 (dependency graph — PostToolUse → signatureHash → signalCache → bashRepetition / fileCreation; SessionEnd → agentCorrection sweep), TS-4 §3 (PostToolUse v0.2 additions — signature hash + signal-cache append, no LLM), TS-4 §5 (SessionEnd v0.2 additions — agent-correction sweep, no LLM yet), TS-6 §5 (Privacy-safe telemetry: hashing / normalisation / cross-session leak — covers §5.1–§5.4).

**BRD-4 gates closed:**
- **FG-5** bash repetition fixture (3 normalised matches in 30 min) emits exactly one Author proposal of `kind = slash_command` (signal-firing component lands here; full proposal emission folds into M5).
- **FG-6** file-creation fixture (3 structurally-similar files) emits exactly one Author proposal of `kind = skill` (signal-firing component lands here).
- **FG-7** agent-correction fixture (3 corrections per agent over 7 days, 5-min window, ≥ 20% invocation-aggregate line ratio) emits exactly one Author proposal of `kind = agent` (signal-firing component lands here).
- **FG-12** DD-068 events emitted on every PostToolUse Bash/Edit/Write (Read excluded), every UserPromptSubmit, every Stop/SubagentStop. Cross-session `prior_response_id` is `null` after SessionStart (FR-OBS-N2 regression covered here).
- **FR-AUTHOR-6, -7** bash-repetition signal + normalisation contract (DD-076 — 3 matches in 30 min; whitespace/path/UUID/timestamp/numeric placeholder normalisation; match key is the DD-068 12-hex `signature_hash`; single source of truth `src/util/signatureHash.ts`).
- **FR-AUTHOR-8, -9** file-creation signal (DD-077 — 3 files + locality + first-5-non-blank-lines SHA-256 / import-set Jaccard ≥ 0.8 / heading-hierarchy match; tunable `author.file_pattern.*`).
- **FR-AUTHOR-10, -11, -12** agent-correction signal (DD-078 amended, OQ-v2-24 reformulation against `SubagentAttribution` invocation-aggregate at `src/subagent/tracker.ts:11-19`; ≥ 3 corrections per agent in 7-day rolling window; computation deferred to SessionEnd).
- **FR-AUTHOR-13** signal-cache circuit breakers (DD-089: bash 500, file-creation 500, agent-correction 200; caps are bounds, not knobs).
- **FR-OBS-N1** `proposal_signal_observed { kind, would_have_fired, signal_hash }` shadow events emitted to `metrics.jsonl` regardless of whether a proposal is actually generated (drives DD-092 calibration).
- **FR-OBS-N1a..N1e** Bash normalisation contract, Edit/Write path template, length-bucket boundaries, `refers_to_prior` heuristic regex, and ≤ 13 MB additional storage budget — all consumed by detectors here (registered in M0; bound to detector implementation in this milestone).
- **SG-1** DD-068 12-hex hash collision rate < 1.8 × 10⁻⁷ on a 10 000-entry corpus through `normaliseBashCommand`.
- **SG-1a** signature determinism: identical normalised input produces identical 12-hex hash across runs and OS matrix cells.
- **SG-1b** `refers_to_prior` heuristic precision/recall fixture: dedicated corpus of corrective vs. neutral prompts asserts the FR-OBS-N1d regex does not silently regress.
- **NFR-PRIVACY (additive)** all signal payloads are sha256 hashes only — no raw bash strings, no raw user prompts, no raw agent output (privacy-safe by construction; SG-1..SG-3 inherit).
- **NFR-PERF-N5** DD-068 signature hashing on PostToolUse hot path: O(1) hash + O(log n) ring-buffer lookup, within v0.1 50 ms p95 PostToolUse budget; file-creation similarity hashing ≤ 5 ms / Write.
- **NFR-PERF-N6** v0.1 NFR-PERF-1 (PostToolUse 50 ms p95) inviolate — agent-correction signal computation deferred to SessionEnd per FR-AUTHOR-12.
- **PG-4** DD-068 hashing on PostToolUse hot path within v0.1 50 ms p95 budget (no regression vs. v0.1 baseline).

**Key deliverables:**
- `src/signal/signatureHash.ts` — single source of truth for hashing across signal detectors, telemetry, and proposal collision pre-checks (TS-2 §4 — *“`signatureHash` is the single source of truth”*). DD-068 `tool_invocation_signature` / `user_prompt_signature` formats reused. Length-prefix sha256 truncation per OQ-v2-21 hashing rigor (e.g., DD-068 12-hex truncation discipline).
- `src/signal/normalize.ts` — bash-command normalisation (whitespace collapse, env-var stripping, `cd`-prefix tolerance) per DD-076. Pure function; round-trips deterministically.
- `src/signal/signalCache.ts` — in-memory ring buffers with `maxItems` caps per bucket (`bash_repetition: 500`, `file_creation: 500`, `agent_correction: 200` — DD-089 / TS-3 §3.3 schema). Atomic flush to `signal-cache.json` via DD-084 debounced writer; pruned at SessionEnd to honour 7-day rolling window for `agent_correction`.
- `src/signal/bashRepetition.ts` — DD-076 detector: 3 normalised matches in a 30-min rolling window. Triggered from PostToolUse on `Bash` tool invocations. Threshold defaults locked; tunable knobs `bash_repetition_count`, `bash_repetition_window_min` exposed in `config.json` for DD-092 calibration.
- `src/signal/fileCreation.ts` — DD-077 detector: 3 files + locality (same directory or sibling) + structural similarity (Jaccard ≥ 0.8 on tokenised content). Triggered from PostToolUse on `Write` / `Edit` tool invocations. Tunable knobs `file_creation_count`, `file_creation_jaccard`, `file_creation_locality_window`.
- `src/signal/agentCorrection.ts` — DD-078 amended detector: invocation-aggregate (not line-level) per OQ-v2-24 reformulation, against shipped `SubagentAttribution` at `src/subagent/tracker.ts:11-19`. Triggered at SessionEnd sweep. Default thresholds: 5-min window, line-ratio ≥ 0.20 (lines_added + lines_removed / total_lines), 3 occurrences per agent in 7-day window. Tunable knobs `agent_correction_window_min`, `agent_correction_line_ratio`, `agent_correction_count`, `agent_correction_window_days`.
- `src/hooks/postToolUse.ts` (extended) — invokes `signatureHash` → `signalCache` append on every tool invocation; in-process only (no FS I/O). DD-068 events still emitted as in v0.1.1.
- `src/hooks/sessionEnd.ts` (extended) — agent-correction sweep over the session's accumulated `SubagentAttribution` events; emits `proposal_signal_observed` (with `would_have_fired: true | false`) per detector, regardless of v0.2 mode. **Does not yet enqueue Author proposals** — that wiring lands in M5.
- `tests/fixtures/signal-corpora/` — three synthetic session corpora (one per signal kind) covering positive cases (threshold met → would_have_fired=true), negative cases (threshold missed → would_have_fired=false), boundary cases (exactly-at-threshold), and adversarial cases (3 different commands → no false-positive).
- `tests/unit/signal/bash-repetition.test.ts` — DD-076 threshold cases including normalisation (`ls -la` ≡ `ls   -la` ≡ `cd /tmp && ls -la` → same hash).
- `tests/unit/signal/file-creation.test.ts` — Jaccard threshold sweeps; locality boundary cases.
- `tests/unit/signal/agent-correction.test.ts` — invocation-aggregate ratio cases; 7-day window expiry.
- `tests/integration/signal-shadow-mode.test.ts` — end-to-end synthetic session: detectors fire, `proposal_signal_observed` events present in `metrics.jsonl`, signal-cache pruned at SessionEnd, **no proposals generated** (because Author-pipeline LLM not yet wired). Confirms SG-3 boundary still green: nothing written outside `.claude/coherence/`.

**Test artifacts:** `tests/fixtures/signal-corpora/{bash, file, correction}/{positive, negative, boundary, adversarial}/` — synthetic session JSONLs.

**Risks mitigated:** **R-v0.2-01** (Author proposals misjudged → noise erodes the trust v0.1 built — DD-067 hard cap + DD-075 expiry + DD-092 calibration patch). Without exercising thresholds against synthetic fixtures before live LLM calls, the v0.2-alpha telemetry artifact (M8) would have no signal/noise floor to compare against, breaking the DD-092 calibration commitment. **R-v0.2-10** (Subagent provenance shape (per-line vs per-invocation) blocks DD-078 — OQ-v2-24 reformulation: invocation-aggregate ratio + `files_touched` overlap; FR-AUTHOR-10 codifies the shipped shape against `SubagentAttribution`). **R-v0.2-12** (Cross-session `prior_response_id` leakage — FR-OBS-N2 explicit cache clear at SessionStart / SessionEnd; regression test bound to FG-12 closure).

**Parallelizable tracks within milestone:** All three detectors are independent; `signatureHash` + `signalCache` are shared infra written first.

**Done when:**
- [ ] All three detectors green on every fixture corpus (positive, negative, boundary, adversarial).
- [ ] `proposal_signal_observed` events emitted with `would_have_fired` field on every detector trigger evaluation.
- [ ] PostToolUse p95 unchanged ± regression budget.
- [ ] `signal-cache.json` schema-valid after every fixture session; pruning at SessionEnd respects 7-day window.
- [ ] Tunable thresholds reachable from `config.json` overrides (DD-092 calibration foundation).
- [ ] **FR-AUTHOR-13** `signal-cache.json` per-bucket `maxItems` caps enforced as bounds (bash 500, file-creation 500, agent-correction 200 per DD-089).

**Dependencies:** M2 (signal-cache schema, drift-buffer enum widening).

---

### M5 — Author Pipeline (post-Stop entry point) + proposalStore + LLM Contract

**Goal:** Wire the **first Author entry point** at the post-Stop hook (TS-5 §1: "two Author entry points") to enqueue `bash_repetition` and `file_creation` signals into `proposalStore`, invoke the **Author LLM contract** (DD-091: same v0.1 model `claude-sonnet-4-5-20251022`, `temperature: 0`, but new `prompts/v2/author/*` prompts, partitioned cost-ledger stage), and produce proposal artifacts under `.claude/coherence/proposals/{skills,commands}/<id>/`. **Hard cap `proposals_per_session ≤ 3`** (FR-AUTHOR-3) shared with the SessionEnd entry point that lands in M6. **No Stage 1 grouping reuse** (DD-067) — Author owns its own input contract, prompt(s), and output schema.

**TS sections implemented:** TS-5 §1 (pipeline taxonomy + two Author entry points), TS-5 §2 (Author pipeline contracts — input envelope, output schema, validation), TS-5 §2.1 (one invocation per enqueued signal), TS-4 §6 (Stop hook v0.2 additions — Author pipeline entry point #1 + snapshot flush), TS-9 §8 (Reference corpus for Author p95: `tests/fixtures/author-corpus/`).

**BRD-4 gates closed:**
- **FR-AUTHOR-1..3** Author pipeline contract (input, output, ≤3-per-session cap, two-phase validation generate-time + accept-time).
- **FR-AUTHOR-4** Author-pipeline p95 latency budget: ≤ 5 s, accounted separately from v0.1 Stop budget — verified by PG-1 cassette-driven measurement.
- **FR-AUTHOR-5** failure isolation: Author runs after Stop output is committed; Author failure does not corrupt the v0.1 healing UX already presented.
- **FR-AUTHOR-14** SessionEnd pruning sweep over `signal-cache.json` drops every entry with `last_seen < now - 7d` and emits `signal_cache_pruned { kind, removed }` (wired into the SessionEnd extension here; second Author entry point in M6 reuses the prune).
- **FR-PROPOSE-1..6** proposal queue write semantics (queued → surfaced FSM transitions).
- **FR-PROPOSE-13 (writer-side)** proposal payloads validated against `proposal.schema.json` (DD-087) at the cache-writer boundary; the propose-show read-side validation lands in M7.
- **FR-FAILURE-N3** illegal proposal-state transitions raise `ProposalStateError` and quarantine the cache file (mirrors `StateStore.read` quarantine path).
- **FR-COST-N1..N5** cost-ledger partition: Author cost share ≤ 60% of v0.1 baseline +30% headroom (DD-085). New `cost-ledger.json` `stage` enum value `author`. Author/Annotate share v0.1 model `claude-sonnet-4-5-20251022` with `temperature: 0`; `prompts/v2/manifest.json` carries `author_version: "v2.0"`.
- **FR-COST-N6 (Author half)** Author cassettes under `tests/cassettes/author/`.
- **PG-1** Author-pipeline p95 latency ≤ 5 s on the v0.2 reference corpus (cassette-driven harness).
- **CG-1, CG-2** cost-budget gates against the v0.2 cassette suite — Author share verified (final closure in M8).
- **NFR-PERF-N1** Author-pipeline p95 latency ≤ 5 s, accounted separately from v0.1 NFR-PERF-4 (Stop p95 ≤ 10 s); aggregate Stop+Author p95 ≤ 15 s when proposals exist. (Foundation for full PG/RG closure in M8.)
- **SG-3 inherited** — Author writes only to `.claude/coherence/proposals/<kind>/<id>/`; SG-3 fixture re-asserted.

**Key deliverables:**
- `prompts/v2/manifest.json` — pins model `claude-sonnet-4-5-20251022`, `temperature: 0`, prompt versions for `author/skill.md`, `author/slash-command.md` (more in M6: `author/agent.md`, `annotate/anchor.md`).
- `prompts/v2/author/skill.md` — Author proposer prompt for skill scaffolds. Input envelope per TS-5 §2.1: `{signal_kind, signal_hash, signal_evidence: <hashed>, recent_context: <hashed window>, candidate_skill_name_suggestions, output_schema}`. Output: structured JSON proposal with `name`, `description`, `purpose`, `usage`, `frontmatter`, optional `body_md`, no fabricated paths/imports (validated against v0.1 hallucination corpus discipline).
- `prompts/v2/author/slash-command.md` — same shape as skill, output schema for `.claude/commands/<name>.md` artifact.
- `src/llm/authorPipeline.ts` — separate module from v0.1 `stage1.ts` / `stage2.ts` (DD-067 — no reuse of Stage 1). Reuses v0.1 `llmClient` (Anthropic SDK wrapper + cassette + cost-ledger), but with `stage: "author"` partition. Per-signal invocation; one signal in → one proposal out (or `NO_PROPOSAL` literal per DD-091).
- `src/proposals/store.ts` — full read/write API over `proposal-cache.json` + `proposals/<kind>/<id>/`. Append-only `state_history[]` mutations; FSM enforced (queued → surfaced → ignored | accepted | rejected | reverted | expired).
- `src/proposals/collisionPrecheck.ts` — pre-check using `signatureHash` against existing entries; refuses to enqueue if a `signal_hash` already has a non-terminal entry (queued / surfaced / ignored). Prevents proposal-storms from a single recurring signal.
- `src/hooks/stop.ts` (extended) — TS-4 §6 ordering: v0.1 Stop pipeline runs unchanged; **after** v0.1 commits land, Author pipeline entry point #1 dequeues `bash_repetition` and `file_creation` candidates from `signalCache` whose thresholds were met during the session and that did not already have a non-terminal `proposal-cache` entry. Calls `authorPipeline.propose(signal)` per entry, up to `proposals_per_session - already_proposed_this_session`. Writes proposals to quarantine via `proposalStore`. Emits `proposal_proposed { proposal_id, kind, signal_kind }` per success and `proposal_skipped_budget` per skip.
- `src/validation/proposalValidator.ts` — schema-validates Author output against `prompts/v2/manifest.json` output schema; rejects on hallucinated paths (reuses v0.1 hallucination grep corpus from `src/validation/hallucination.ts`); rejects on prompt-injection patterns (reuses v0.1 `promptInjection.ts`); rejects on instruction-shaped HTML in skill body.
- `tests/cassettes/author/{bash, file}/*.json` — recorded Anthropic responses for the M4 fixture corpora.
- `tests/integration/author-post-stop.test.ts` — synthetic Stop with three eligible signals + one collision (existing surfaced entry) → 2 new proposals materialised, 1 skipped via collision pre-check, ≤3 cap respected, all writes inside `.claude/coherence/proposals/`.
- `tests/security/sg-3-author-pipeline.test.ts` — adversarial cassette returns a payload that tries to write outside quarantine (e.g. `path: "../../skills/evil/SKILL.md"`) → `proposalValidator` rejects, `quarantine.ts` rejects, no FS effect.
- `tests/cost/cg-author-share.test.ts` — drives the Author cassette suite, asserts `cost-ledger.json` Author-stage entries sum to ≤ 60% of (v0.1 baseline × 0.30) per session.

**Test artifacts:** Author cassette corpus + recorded responses; ID-2 v0.2 fixture corpus reused from M4.

**Risks mitigated:** **R-v0.2-01** (Author proposals misjudged) — proposal validator reuses v0.1 hallucination grep corpus; SG-3 fixture extended to cover Author output; DD-067 hard cap respected. **R-v0.2-08** (Author + Annotate cost stack pushes session over budget) — cost-ledger partition gated at CG-1/CG-2; no Author entry point may exceed its 60% share; degrade-to-no-LLM mode (DD-061 precedent) on overrun.

**Parallelizable tracks within milestone:** Prompt authoring (skill.md, slash-command.md), `authorPipeline.ts` glue, `proposalStore.ts`, and `collisionPrecheck.ts` are all independent.

**Done when:**
- [ ] Synthetic Stop with eligible signals produces ≤3 proposals; cap respected across reruns.
- [ ] Author cassette suite green on every matrix cell with cost share ≤ 60% per session.
- [ ] Author validator rejects every adversarial cassette payload (SG-3 extension).
- [ ] No regression on v0.1 PG-3 Stop p95 (Author runs **after** v0.1 Stop).
- [ ] M5 leaves new entries in `queued`; transition to `surfaced` is M7's responsibility (verified there).

**Dependencies:** M3, M4.

---

### M6 — Annotate Mode + Trickle Deep-Scan + SessionEnd Author Entry Point

**Goal:** Ship **Annotate mode** (DD-069: byte-for-byte v0.1 anchor format + `auto-annotated: true` discriminator + sidecar fallback honoured), the **trickle deep-scan** (DD-066 / FR-TRICKLE: idle-gated PostToolUse, per-session cap ≤ 20 entries, ≤ 100ms cumulative per PostToolUse, gated by idle detection per Goals success metric), and the **second Author entry point** at SessionEnd for `agent_correction` candidates (TS-5 §1 — invocation-aggregate ratio is only computable at SessionEnd per DD-078 amended / OQ-v2-24; `proposals_per_session ≤ 3` cap shared with the post-Stop Author entry point from M5).

**TS sections implemented:** TS-5 §1 (Author entry point #2 — SessionEnd tail for `agent_correction`), TS-5 §3 (Annotate proposer), TS-2 §1 (annotate-proposer module + trickle-scanner module), TS-2 §5 (Three-layer healing extension — v0.2 fourth-layer addition), TS-4 §3 (PostToolUse idle path → trickle), TS-4 §5 (SessionEnd v0.2 additions — agentCorrection sweep + Author pipeline entry point #2 + signalCache prune + snapshot flush).

**BRD-4 gates closed:**
- **FG-3** `/coherence:annotate <ignored-path>` refuses with the documented error and emits `annotate_blocked { reason: 'ignored' }`.
- **FG-4** Annotate-generated proposal applied via `/coherence:propose-accept` produces a doc whose anchors match v0.1 format byte-for-byte and survive `/coherence:doctor`.
- **FG-15** trickle deep-scan respects per-session cap (≤ 20), idle gate (`trickle.idle_threshold_ms`), emits `trickle_scan_pass`, median budget impact < 5 ms.
- **FR-ANNOTATE-1..N** Annotate proposer (anchor-less doc detection, byte-for-byte anchor format, sidecar fallback, `auto-annotated: true` flag).
- **FR-TRICKLE-1..N** trickle deep-scan (idle detection threshold default 30 s, per-session cap default 20 entries via `scan-cache/state.json.per_session_cap`, ≤ 100 ms cumulative per PostToolUse).
- **FR-AUTHOR-10..12** SessionEnd Author entry point closes the agent-correction signal loop (final closure of the per-detector signal here; FR-AUTHOR-13 cap and FR-AUTHOR-14 prune wired in M4/M5).
- **FR-COST-N6 (Annotate half)** cassettes under `tests/cassettes/annotate/`.
- **CG-1, CG-2** Annotate share ≤ 30%, Trickle share ≤ 10% of the +30% headroom (DD-085 partition; final closure in M8).
- **PG-3** trickle median budget impact < 5 ms (NFR-PERF-1 partition).
- **PG-4 inherited** PostToolUse p95 unchanged including the trickle path (gated by idle detection; ≤ 100 ms cumulative budget).
- **NFR-PERF-N3** trickle deep-scan adds < 5 ms median to SessionEnd budget; ≤ 100 ms cumulative per PostToolUse window.
- **SG-3** boundary re-asserted across Annotate + Trickle outputs.

**Key deliverables:**
- `prompts/v2/author/agent.md` — Author proposer prompt for agent definitions (covers `agent_correction` signal kind).
- `prompts/v2/annotate/anchor.md` — Annotate proposer prompt: input is anchor-less doc + heading structure; output is anchor placement plan + `<!-- coherence:section ... -->` HTML comments + `auto-annotated: true` frontmatter flag (DD-069). Honours v0.1 sidecar fallback (skill/agent docs) by emitting a sidecar manifest instead of inline frontmatter when the host strips unknown keys.
- `src/proposers/annotateProposer.ts` — anchor-less doc detection (no v0.1 anchors present, no `coherence:` frontmatter); guards against denylist (`coherence/ignore`); enqueues to `proposalStore` with `kind: 'annotate'`. Triggered by `/coherence:annotate <path>` or, when graduation mode for the doc's scope is `annotate` or `author`, automatically at SessionEnd before the Author entry point (DD-073 Annotate opt-in: hybrid global mode + denylist + per-doc command).
- `src/scanner/trickleScanner.ts` — DD-066 trickle deep-scan. Triggered from PostToolUse only when (a) host is idle ≥ `idle_threshold_ms` (default 30 s, configurable via `scan-cache/state.json`), (b) `entries_this_session < per_session_cap` (default 20), (c) cumulative trickle CPU this PostToolUse < 100 ms. Walks unedited tracked docs in deterministic order; appends `trickle_deep_scan` source entries to `drift-buffer.json` (enum already widened in M2). Persists `last_pass_at` and `entries_this_session` in `scan-cache/state.json`.
- `src/hooks/sessionEnd.ts` (extended) — full TS-4 §5 ordering: agent-correction sweep (M4) → enqueue surviving candidates → Annotate proposer (if mode allows) → Author pipeline entry point #2 (DD-067 separate pipeline; **shares** `proposals_per_session` budget with the post-Stop entry point from M5) → signalCache.prune() → snapshotWriter.flush().
- `src/hooks/postToolUse.ts` (extended) — adds the trickle entry point at the end of the pipeline; idle-detection probe is non-blocking (returns `false` immediately if any tool call is in flight).
- `tests/fixtures/annotate-corpora/{simple-md, with-headings, sidecar-required, denylisted}/` — anchor-less doc fixtures.
- `tests/fixtures/trickle-corpora/{idle-period, busy-session, cap-saturation}/` — synthetic PostToolUse event streams driving trickle.
- `tests/integration/sessionEnd-author-correction.test.ts` — synthetic SessionEnd with agent-correction candidates → up to 3 proposals across the post-Stop + SessionEnd entry points (shared cap).
- `tests/integration/annotate-roundtrip.test.ts` — anchor-less doc → annotate proposal → manual `propose-accept` (lands M7) → resulting doc with `auto-annotated: true` frontmatter passes v0.1 `coherence:doctor` validation (closes OQ-v2-04 in code).
- `tests/perf/trickle-budget.test.ts` — busy-session fixture: trickle never fires; idle-session fixture: trickle fires within 30 s of last PostToolUse, never exceeds 100 ms cumulative.

**Test artifacts:** Annotate cassette corpus, trickle synthetic event streams, anchor-less doc fixture corpus.

**Risks mitigated:** **R-v0.2-02** (PostToolUse 50 ms p95 budget regresses) — strict idle gating + per-session cap + cumulative budget prevents trickle regressions on PG-3 / PG-4 cells. **R-v0.2-11** (v0.2-alpha consolidation feedback contradicts the no-planner choice) — Author entry point #2 ships in v0.2-alpha so the v0.2-alpha telemetry artifact (M8) has data for the M9 planner-branch decision.

**Parallelizable tracks within milestone:** Annotate proposer + Trickle scanner + SessionEnd wiring are independent. Annotate cassette + Trickle fixture corpora can be authored in parallel with code work.

**Done when:**
- [ ] Annotate proposer round-trips through v0.1 `coherence:doctor` (no warnings, no quarantine — closes OQ-v2-04 in test).
- [ ] Trickle stays within 100 ms cumulative budget on every PostToolUse (perf test).
- [ ] SessionEnd Author entry point shares `proposals_per_session` budget with post-Stop entry point (integration test: 3 post-Stop proposals → 0 SessionEnd proposals).
- [ ] CG-1 / CG-2 cost partitions verified across the full v0.2 cassette suite.
- [ ] SG-3 boundary green for Annotate + Trickle outputs.
- [ ] **FR-PERMISSION-N4** `coherence/ignore` semantics extend to per-doc Annotate (FR-ANNOTATE-8); `PathFilter` (`src/detection/pathFilter.ts`) is the canonical gate consulted by both Annotate proposer and Trickle scanner.

**Dependencies:** M3 (graduation.json + mode-resolver), M4 (signal-cache + agent-correction), M5 (Author pipeline + proposalStore).

---

### M7 — propose-* Command Surface + Permission UX + Statusline State Wiring

**Goal:** Ship the **`/coherence:propose-*` command set** that surfaces proposals to the user (DD-081 dedicated slash-command set), the **`/coherence:propose-accept` collision-policy + `git commit`** path (DD-082 name-collision: refuse + suffix), the **`/coherence:propose-revert-acceptance`** path (DD-083 via `git revert`), and the statusline-snapshot wiring that drives the OSC 8 click target. Every command has a canonical fixed-order output contract (inherits v0.1 `/coherence:status` discipline DD-055).

**TS sections implemented:** TS-2 §3 (commands/ dependency graph — graduate / annotate / propose-list / propose-show / propose-accept / propose-reject / propose-revert-acceptance / install-statusline / uninstall-statusline), TS-2 §1 (propose-* commands module), TS-6 §3 (Revert path).

**BRD-4 gates closed:**
- **FG-8** proposal lifecycle FSM rejects every illegal transition; `state_history` is append-only; quarantine fires on illegal transition.
- **FG-9** `/coherence:propose-accept <id>` against an existing target path refuses by default; `--rename` succeeds; `--overwrite <retyped-path>` quarantines the original then writes.
- **FG-10** `/coherence:propose-revert-acceptance <id>` produces a `[coherence-revert]` commit detected by v0.1 `revertDetect`; cache state transitions to `reverted`.
- **FG-11** DD-075 expiry: time-fence drops at 14 d; signal-recurrence-fence drops at 7 d quiet; consecutive-ignored counter drops at default 5.
- **FR-PROPOSE-7..12** propose-* command contracts (list, show, accept, reject, revert-acceptance, expiry sweep, status surfacing).
- **FR-PROPOSE-10** name-collision policy: default refuse + `proposal_acceptance_blocked { reason: 'name_collision', existing_path_hash }` event + `--rename` / `--overwrite <retyped-path>` flags; `--overwrite` quarantines the existing file via `quarantineFile()` before writing; never silently overwrites.
- **FR-PROPOSE-11** new config keys `proposal_expiry_days = 14`, `proposal_signal_recurrence_days = 7`, `proposal_consecutive_ignore_threshold = 5`.
- **FR-PROPOSE-13 (read-side)** `/coherence:propose-show` re-validates against `proposal.schema.json` (DD-087); on failure the proposal is dropped and `proposal_validation_failed { reason }` is logged.
- **FR-PROPOSE-14** `/coherence:propose-list` and `/coherence:propose-show` render per-item time-to-expire badge (derived from `expires_at` and the three DD-075 fences) and ignore-count badge (`consecutive_ignored`).
- ships the `/coherence:graduate`, `/coherence:annotate`, `/coherence:propose-list`, `/coherence:propose-show`, `/coherence:propose-accept`, `/coherence:propose-reject`, `/coherence:propose-revert-acceptance`, `/coherence:install-statusline`, `/coherence:uninstall-statusline` command surface (BRD-2 §10 `FR-COMMANDS` table — non-interactive slash commands wired in `plugin.json` with metrics emitted on every action).
- **FR-PERMISSION-N1, N3** propose-accept is the only cross-the-boundary write path (alongside install-statusline from M3); every accept commit prefixed `[coherence] accept proposal <id>`, every revert commit prefixed `[coherence-revert]`.
- **NFR-PERF** `/coherence:propose-list` < 250 ms p95 (inherits v0.1 `/coherence:status` budget; snapshot-driven).

**Key deliverables:**
- `src/commands/propose-list.ts` — read `proposal-cache.json` + per-proposal `manifest.json`; render canonical fixed-order output: queued → surfaced → ignored summary, sorted by `last_signal_at` desc. Transitions `queued → surfaced` for any entry surfaced this invocation; appends to `state_history[]`.
- `src/commands/propose-show.ts` — reads single proposal artifact + `manifest.json`; **re-validates** against `proposal.schema.json` on read (TS-2 §3 dependency edge); refuses to render if schema-invalid (corruption indicator). Displays the artifact body, signal evidence, and the exact slash command that would accept it.
- `src/commands/propose-accept.ts` — the second cross-the-boundary operator. Steps: (a) read proposal artifact + manifest; (b) re-run `proposalValidator` (defence in depth); (c) **collision policy** (DD-082): if the target path already exists, refuse and suggest a suffixed alternative (`SKILL.md` → `SKILL-2.md`, never overwrite); (d) `quarantineFile` the existing target if any (defence-in-depth); (e) `fs.writeFile` to the live path (the only write outside `.claude/coherence/` other than statusline install); (f) `git add <path> && git commit -m "[coherence] accept proposal <id> (<kind>: <name>)"` reusing v0.1 `git/coherenceCommit.ts` format and pre-flight; (g) transition proposal state to `accepted` with `state_history[]` entry. Emits `proposal_accepted`.
- `src/commands/propose-reject.ts` — `proposalStore.transition(rejected)` only; no FS effect on the live tree. Emits `proposal_rejected`.
- `src/commands/propose-revert-acceptance.ts` — DD-083: invokes `git revert <accept-commit-sha>`; v0.1 `revertDetect.ts` (which scans `[coherence]` commits since previous SessionStart for ≥80% line removals) picks up the revert as a velocity signal. Transitions proposal state to `reverted`. Emits `proposal_reverted`.
- `src/commands/annotate.ts` — `/coherence:annotate <path>` invokes the M6 `annotateProposer` ad-hoc against an explicit path, regardless of current graduation mode. Result lands in `proposalStore` like any other proposal.
- `src/permissions/proposalUX.ts` — UI rendering for `/coherence:propose-list` and the consolidated Stop review: `[surfaced]` / `[queued]` / `[ignored]` rows; click target chain (DD-071 OSC 8 → OSC 52 → plain). Reuses v0.1 `permissions/review.ts` discipline.
- `src/observability/statusline.ts` (extended from M3) — now reads live proposal counts from `state-snapshot.json` (DD-070 architecture); `state-snapshot` is updated on every proposalStore transition via the DD-084 debounced writer.
- `tests/integration/propose-list.test.ts` — fixture proposal-cache with mixed states; output is byte-stable across reruns; `surfaced_count` increments correctly.
- `tests/integration/propose-accept-collision.test.ts` — DD-082 collision: existing `SKILL.md` at target → accept refuses, suggests `SKILL-2.md`; user-driven retry with the suffix → succeeds; original file untouched.
- `tests/integration/propose-revert-roundtrip.test.ts` — accept → revert-acceptance → v0.1 `revertDetect` flags the revert; subsequent SessionStart velocity counter increments (DD-083 closes the loop).
- `tests/security/sg-3-propose-accept.test.ts` — adversarial proposal artefact whose target path resolves outside the workspace via `..` traversal → `propose-accept` rejects (defence-in-depth pathNormaliser check).

**Test artifacts:** Synthetic proposal-cache fixtures covering every FSM transition; canonical output snapshots for `propose-list` / `propose-show`.

**Risks mitigated:** **R-v0.2-01** (Author proposals misjudged → DD-065 quarantine boundary held by `propose-accept`'s defence-in-depth: validator + quarantine pre-write + path normaliser + lint rule + SG-3 fixture). **R-v0.2-09** (proposal queue grows unboundedly) — DD-075 three-fence expiry + DD-088 terminal states + expiry sweep at SessionStart already wired in M3, surfaced through propose-* commands here.

**Parallelizable tracks within milestone:** Each command is independent; statusline wiring runs alongside command work.

**Done when:**
- [ ] All 7 v0.2 commands have green contract tests.
- [ ] `/coherence:propose-list` < 250 ms p95.
- [ ] DD-082 collision policy tested and refuses every overwrite case.
- [ ] DD-083 revert-acceptance round-trips through v0.1 `revertDetect` (velocity counter increments).
- [ ] SG-3 fixture green for adversarial accept payloads.

**Dependencies:** M5 (proposalStore), M6 (Annotate proposer for `/coherence:annotate`).

---

### M8 — v0.2-alpha Ship + Telemetry Observation Window (R-v0.2-11)

**Goal:** Cut the **v0.2-alpha** tag (per BRD-4 §7 release sequence step 3), ship Annotate + Author + Statusline + Trickle behind `THRESHOLD_DEFAULTS` per DD-076/077/078 with the `proposals_per_session ≤ 3` cap, and **observe telemetry for ≥30 days or ≥50 opted-in sessions, whichever comes first** (per DD-092 acceptance criterion). The observation window output drives two binary decisions: (a) the **DD-067 planner-branch decision** at M9 — does v0.2 final ship with a Proposer planner stage? (b) the **DD-092 calibration deltas** for the v0.2.1 patch.

**TS sections implemented:** TS-7 §1 (latency budgets — additive PG-1..PG-5 final hardening), TS-7 §2.1 (cost ceiling = v0.1 baseline × 1.30, partitioned 60/30/10 across Author/Annotate/Trickle), TS-7 §3 (Telemetry events), TS-7 §6 (Regression gates), TS-9 §1..§4 (harness inventory, functional/perf/cost gate ownership).

**BRD-4 gates closed:**
- **PG-1..PG-5** all v0.2 latency budgets final-regression-gated (Author p95 ≤ 5 s, state-snapshot ≤ 5 ms p95 isolated, trickle median < 5 ms, PostToolUse hashing within v0.1 50 ms p95, statusline render < 5 ms).
- **CG-1, CG-2, CG-3** all cost partitions final-regression-gated against the cassette suite (×1.30 aggregate ceiling, 60/30/10 Author/Annotate/Trickle partition, `cost_ceiling_hit` event verified on synthetic over-budget run).
- **SG-1, SG-1a, SG-1b, SG-2, SG-3** all v0.2 privacy/security gates green (12-hex collision rate, signature determinism, `refers_to_prior` precision/recall, share-metrics anonymized fixture, DD-065 quarantine boundary).
- **RG-1, RG-2** v0.2-alpha release gate (partial): all v0.1 BRD-4 gates remain green (RG-1) and all v0.2 FG/PG/CG/SG green on every matrix cell (RG-2); RG-3..RG-5 close in M10.
- **FR-OBS-N1..N5** full v0.2 telemetry catalogue emitted with privacy-safe-by-construction guarantee — see deliverables.
- **FG-12** DD-068 events emitted on every PostToolUse Bash/Edit/Write (Read excluded), every UserPromptSubmit, every Stop/SubagentStop; cross-session `prior_response_id` is `null` after SessionStart (final closure of FG-12; foundation in M0/M4).
- **FG-16** `share-metrics --anonymized` fixture asserts no raw command/path/prompt content in output for any DD-068 event.

**Key deliverables:**
- `tests/perf/v0.2-regression-gate.test.ts` — extends v0.1 perf harness with v0.2 cells: PostToolUse (with trickle path), state-snapshot write, propose-list, Author pipeline post-Stop tail, SessionEnd Author tail. Baselines committed.
- `tests/cost/v0.2-cassette-suite.test.ts` — full cassette suite covering Author + Annotate + Stop + post-Stop pipeline; Author share ≤ 60%, Annotate ≤ 30%, Trickle ≤ 10% of v0.1 baseline × 0.30 headroom (DD-085).
- `tests/security/v0.2-sg-sweep.test.ts` — SG-3 boundary, signal-hashing-only-no-raw, no-network-egress (inherits v0.1 NFR-PRIVACY-3), no-API-key-persist (inherits v0.1 NFR-SECURITY-3).
- `tests/unit/commands/shareMetrics.dd068.test.ts` — FG-16 fixture: `share-metrics --anonymized` over a metrics.jsonl corpus containing every DD-068 event asserts no raw command/path/prompt content survives anonymisation (writer-side guarantee; final closure folded into M10 `tests/security/v0.2-final-sweep.test.ts`).
- `scripts/release-alpha.mjs` — runs the v0.2 acceptance checklist (FG / PG / CG / SG / RG green); tags `v0.2-alpha` only on a green CI run.
- `docs/v0.2/CHANGELOG.md` — entry per BRD-4 §7.2: full DD coverage list (DD-065..DD-092), release sequence position step 3, links to DD-092 commitment.
- **Telemetry observation window plan** — `docs/v0.2/alpha-telemetry-plan.md` with: (a) acceptance criterion for closing the window: ≥ 50 opted-in sessions OR 2026-06-09 (whichever first); (b) explicit metrics to compute at close: per-detector precision (would_have_fired vs actually_accepted), per-detector recall proxy, signal-kind co-occurrence matrix (the DD-067 planner-branch decision input), per-session cost share distribution, statusline tier distribution; (c) close-out script `scripts/alpha-telemetry-close.mjs` that aggregates `metrics.jsonl` rolled-up summaries (NFR-OBS-2 inherited 90-day rolling retention) into `release-artifacts/v0.2-alpha-telemetry-<ts>.json`.
- **FR-OBS-N3** `prior_response_id` correlation uses peek-not-consume semantics — verified at this milestone in the close-out artifact.
- **FR-OBS-N4** complete v0.2 metrics catalogue emitted: `proposal_proposed`, `proposal_surfaced`, `proposal_accepted`, `proposal_rejected`, `proposal_expired`, `proposal_state_transition`, `proposal_validation_failed`, `proposal_acceptance_blocked`, `proposal_signal_observed`, `proposal_listed`, `proposal_shown`, `proposal_reverted`, `annotation_proposed`, `annotate_invocation`, `annotate_blocked`, `statusline_install`, `trickle_scan_pass`, `signal_cache_pruned`, `migration_completed`, `cost_ceiling_hit`.
- **FR-OBS-N5** privacy-safe-by-construction assertion across the full v0.2 event surface — no raw command/file/prompt content; only hashed signatures and bucketed metadata. Verified by FG-16 fixture wired into the v0.2 SG sweep.

**Test artifacts:** Full v0.2 cassette suite + perf baselines + alpha telemetry close-out script.

**Risks mitigated:** **R-v0.2-11** (v0.2-alpha consolidation feedback contradicts the no-planner choice — DD-067 staged adoption keeps the planner stage available without spec churn). Without a real telemetry observation window between v0.2-alpha and v0.2.0 GA, both the planner-branch decision and the DD-092 calibration patch lose their evidence base.

**Parallelizable tracks within milestone:** Perf harness, cost cassette suite, security sweep, and CHANGELOG / release artifacts are all independent.

**Done when:**
- [ ] `v0.2-alpha` tag created on a green CI run on every matrix cell.
- [ ] All FG / PG / CG / SG / RG gates green.
- [ ] Telemetry observation window started; close-out script ready and tested against synthetic telemetry.
- [ ] CHANGELOG entry includes DD-068..DD-092 verbatim coverage list.
- [ ] DD-092 calibration commitment document (`docs/v0.2/dd-092-calibration-plan.md`) signed off.

**Dependencies:** M7.

---

### M9 — DD-067 Planner-Branch Decision (alpha-gated; conditional milestone)

**Goal:** **Conditional milestone.** At the close of the M8 telemetry observation window, evaluate the DD-067 planner-branch trigger: *Concrete trigger: ≥ 25% of `propose-accept` / `propose-reject` actions during v0.2-alpha span ≥ 2 distinct signal kinds (`bash_repetition`, `file_creation`, `agent_correction`) within a 30-minute window of each other* (BRD-5 §3, DD-067 staged adoption). **If trigger met:** ship the Proposer planner / proposal-consolidation stage in v0.2 final. **If trigger not met:** keep the no-planner shape in v0.2 final and reconsider the planner stage no earlier than v0.3.

**TS sections implemented:** *if planner ships:* TS-5 §2.x (Proposer planner contract — separate prompt, separate output schema, separate cost-ledger sub-stage `author_planner`).

**BRD-4 gates closed:** *if planner ships:* **FR-AUTHOR-2** (planner stage). *if planner deferred:* BRD-4 §7.1 release-sequence step 4 v0.2.0 GA condition: "Decision on Proposer planner stage (DD-067) made on v0.2-alpha telemetry."

**Key deliverables (planner-ships branch):**
- `prompts/v2/author/planner.md` — Proposer planner prompt: input is N signal candidates spanning ≥2 kinds within a 30-min window; output is a consolidated proposal plan (1 proposal covering multiple signals) or `NO_CONSOLIDATION` literal. Reuses v0.1 Stage 1 discipline (canonical-singularity, declared-role honour) but does not import v0.1 Stage 1 code.
- `src/llm/authorPlanner.ts` — separate from `authorPipeline.ts`; invoked **before** the per-signal Author pipeline when the planner-branch trigger fires.
- `src/proposals/consolidate.ts` — applies the planner output: merges N enqueued signals into 1 proposal slot; rest are deferred to next session (FR-AUTHOR-3 cap respected).
- `tests/cassettes/author/planner/*.json` + `tests/integration/author-planner-consolidation.test.ts`.

**Key deliverables (planner-deferred branch):**
- Decision artifact `docs/v0.2/dd-067-decision-2026-XX-XX.md` recording telemetry summary (signal-kind co-occurrence rate observed, threshold of 25%, decision: defer to v0.3).
- BRD-5 §3 updated to upgrade the Author-pipeline planner deferral row from "conditional" to "deferred to v0.3".

**Test artifacts (planner-ships):** Author planner cassette corpus + planner-aware integration tests.

**Risks mitigated:** **R-v0.2-11** (v0.2-alpha consolidation feedback contradicts the no-planner choice). Two faces of the same risk: shipping the planner before telemetry justifies it would add LLM cost and prompt-regression surface for marginal value; conversely, refusing to ship it after the trigger fires would leave users with N redundant proposals where 1 consolidated proposal would suffice. DD-067 staged adoption resolves both directions without spec churn.

**Parallelizable tracks within milestone:** Decision artifact authoring runs alongside (in the planner-ships branch) prompt + planner glue + cassette work.

**Done when:**
- [ ] Telemetry observation window closed (acceptance criterion from M8 hit).
- [ ] DD-067 trigger evaluated against the M8 telemetry artifact; decision artefact published.
- [ ] **If planner ships:** all FR-AUTHOR-2 unit + cassette + integration tests green; planner cassette suite cost share folded into Author 60% partition (no new headroom — DD-085 partition is the same).
- [ ] **If planner deferred:** BRD-5 §3 row updated; v0.2.0 ships without the planner.

**Dependencies:** M8 (telemetry artifact + close-out script output).

---

### M10 — v0.2.0 GA + DD-092 v0.2.1 Calibration Patch Commitment

**Goal:** Cut the **v0.2.0 GA tag** (per BRD-4 §7 release sequence step 4), ship the documentation deliverables (CHANGELOG, BRD/TSD final draft to `Final` status, glossary v0.2 additions), close every remaining BRD-4 acceptance gate, sign off the BRD-5 §1 risk register, and register the **v0.2.1 calibration patch commitment** (DD-092) for the post-GA delivery.

**TS sections implemented:** TS-9 §2..§4 ownership tables for FG / PG / CG (final), TS-9 §1 harness inventory final, TS-9 §7 (`tests/fixtures/calibration/v0.2.1/`), TS-8 §6 (Rollback strategy).

**BRD-4 gates closed (all remaining):**
- **FG-1..FG-16** all functional gates green (v1→v2 migration, mode lifecycle, annotate ignored-path refusal, annotate roundtrip, three signal-detector fixtures, proposal lifecycle FSM, collision policy, revert-acceptance, DD-075 expiry, DD-068 events, install/uninstall-statusline, OSC 8 degradation, trickle scan, share-metrics anonymized).
- **PG-1..PG-5** all perf gates green on every matrix cell ≤ 1% flakiness across 10 reruns.
- **CG-1, CG-2, CG-3** all cost gates green; live-burn cost evidence recorded under `release-artifacts/cost-evidence-v0.2-<ts>.json` (inherits v0.1 PG-5 mechanism).
- **SG-1, SG-1a, SG-1b, SG-2, SG-3** privacy/security gates final — DD-065 boundary, signal hashing collision bound, signature determinism, `refers_to_prior` regression fixture, share-metrics anonymized, no-network-egress, no-API-key-persist.
- **RG-1, RG-2, RG-3, RG-4, RG-5** v0.2.0 GA release gate: every v0.1 gate remains green + every v0.2 FG/PG/CG/SG green on every matrix cell + CHANGELOG enumerates DD-065..DD-092 + `docs/privacy.md` enumerates the v0.2 event redaction matrix + v0.2.1 calibration commitment release-note checklist item tracked.

**Key deliverables:**
- `scripts/release-ga.mjs` — runs the v0.2 acceptance checklist; tags `v0.2.0` only on green CI; refuses to tag if any gate is red on any matrix cell.
- `docs/v0.2/CHANGELOG.md` — final entry: full DD coverage list (DD-065..DD-092), gate inventory, calibration commitment summary, planner-branch decision outcome (from M9).
- `docs/v0.2/BRD.md` / `docs/v0.2/TSD.md` — final-draft import of the Notion BRD-1..BRD-5 / TS-1..TS-9 slices (status flipped from `Draft 1` to `Final`).
- `docs/v0.2/glossary.md` — v0.2 additions per BRD-5 §4: `quarantine` disambiguation (DD-072 vs v0.1's state-corruption recovery), `Annotate mode`, `Author mode`, `proposal lifecycle`, `signal kind`, `trickle deep-scan`, `mode-resolver scope precedence`, `state-snapshot`.
- `docs/v0.2/dd-092-calibration-commitment.md` — signed-off v0.2.1 patch commitment: re-tunes thresholds for DD-076 / DD-077 / DD-078 from `proposal_signal_observed { kind, would_have_fired }` events once the 30-day v0.1.1 observation window closes (already started 2026-05-09 via the v0.1.1 patch). Acceptance criteria: per-threshold projected precision ≥ 0.7 with confidence interval reported.
- `tests/security/v0.2-final-sweep.test.ts` — final SG-3 boundary, no-egress, no-secret-persist, no-raw-payload-leak, settings-backup-roundtrip.
- `tests/e2e/v0.2-acceptance-checklist.test.ts` — runs every BRD-4 acceptance row against a fresh v0.2 install + a v0.1→v0.2 upgrade install.
- BRD-5 §1 risk-register sign-off — every R-v0.2 row marked Mitigated or Accepted with link to closing milestone/test.
- DG documentation set (inherits v0.1 DG-1..DG-6 discipline; v0.2 deltas):
  - DG-1 README v0.2 install + Observe → Annotate → Author walkthrough.
  - DG-2 commands.md v0.2 surface (`/coherence:graduate`, `/coherence:annotate`, `/coherence:propose-list`, `/coherence:propose-show`, `/coherence:propose-accept`, `/coherence:propose-reject`, `/coherence:propose-revert-acceptance`, `/coherence:install-statusline`, `/coherence:uninstall-statusline`).
  - DG-3 state-files.md v0.2 schemas (graduation.json, proposal-cache.json, signal-cache.json, state-snapshot.json, scan-cache/state.json + widened drift-buffer / cost-ledger enums).
  - DG-4 rollback.md v0.2 procedures (uninstall-statusline + propose-revert-acceptance + manual `rm -rf .claude/coherence/proposals/`).
  - DG-5 CHANGELOG.md final.
  - DG-6 privacy.md v0.2 deltas — DD-065 quarantine, DD-068 signal hashing, file-write-only `share-metrics` (DD-086), legal review required.

**Test artifacts:** v0.2 acceptance checklist test, final security sweep, live-burn cost evidence artefact, DG document set.

**Risks mitigated:** GA release-process risk finalised via the acceptance checklist + signed-off risk register (no direct R-v0.2-NN counterpart — recorded as a process gate against BRD-4 §7.1). **R-v0.2-04** (DD-068 hash collisions leak content via signal aggregation — DG-6 privacy/legal review confirms 12-hex bound holds in production-grade fixture corpus). **R-v0.2-11** (calibration-drift face: v0.2.1 calibration commitment registered as a hard post-GA deliverable, not a wishlist item — RG-5 tracks the release-note checklist item).

**Parallelizable tracks within milestone:** DG-1..DG-6 authoring is independent; legal review for DG-6 runs in its own thread. Acceptance checklist + final security sweep run in parallel.

**Done when:**
- [ ] BRD-4 §7.1 release sequence step 4 conditions met: every acceptance gate green on every matrix cell, decision on Proposer planner stage from M9 incorporated.
- [ ] `v0.2.0` tag created on a green CI run.
- [ ] DG-1..DG-6 shipped; DG-6 legal review signed off.
- [ ] DD-092 calibration commitment artefact signed off; v0.2.1 patch entry placeholder added to CHANGELOG.
- [ ] BRD-5 §1 risk register all rows Mitigated or Accepted with closing reference.
- [ ] OQ-v2 sweep: every entry on the Open Questions page 🟢 Resolved or ⚫ Deferred (none 🔴 / 🟡); rationale linked to DD or v0.3 deferral.
- [ ] **FR-PRIVACY-N1** (`anonymizeRecord()` allowlist final), **FR-PRIVACY-N2** (`tests/unit/commands/shareMetrics.dd068.test.ts` fixture green), **FR-PRIVACY-N3** (user-confirmation gate at `shareMetrics.ts:41-52` unchanged; egress remains v0.3), **FR-PRIVACY-N4** (`docs/privacy.md` enumerates the v0.2 event redaction matrix — also closes RG-4) all green.

**Dependencies:** M9.

---

## Open Questions / Decisions Deferred to Implementation

These are TS-level open engineering choices below the BRD grain — resolve in the first PR that touches the relevant module. None gate a milestone closing.

1. **`signal-cache.json` ring-buffer eviction policy.** TS-3 §3.3 specifies `maxItems` per bucket; the eviction strategy (oldest-first vs least-frequently-signal-hash) is not pinned. Resolve in the first M4 PR. Default: oldest-first (FIFO) for v0.2.0, may revisit in v0.2.1 if calibration data shows a better strategy.
2. **Trickle scanner deterministic order.** FR-TRICKLE specifies a deterministic order across unedited tracked docs but does not pin the comparator. Resolve in the first M6 PR. Default: lexicographic path order over a stable list snapshotted at SessionStart.
3. **`proposal-cache.json` `state_history[]` retention bound.** TS-3 §3.2.1 FSM specifies append-only `state_history[]`; if a proposal cycles `queued → surfaced → ignored → queued` repeatedly the array grows unbounded. Resolve in the first M5 PR. Default: cap at 50 entries per proposal with oldest-pruned; emit `state_history_truncated` event.
4. **Statusline OSC 8 fallback when `host-capabilities.json` is missing fields.** DD-071 footnote specifies `FORCE_HYPERLINK=1` override; resolve in the first M3 PR whether absent fields default to `osc8` (optimistic) or `plain` (conservative). Default: `plain` (conservative) — terminals supporting OSC 8 are documented and easy to opt into via `FORCE_HYPERLINK=1`.
5. **`proposal-id` UUID strategy.** OQ-v2-21 hashing rigor closed in DD-072 vocabulary as "deterministic content-derived UUID"; resolve in the first M2 PR whether v4 (random) or v5 (namespace-derived). Default: v5 with namespace `coherence.v0.2.proposal` for deterministic re-generation when the same signal recurs.
6. **`graduation.json` scope conflict resolution when two equally-specific scopes match.** Default per DD-074: most-specific wins; if two scopes are equally specific (e.g. two glob patterns), lex-first scope wins. Resolve in the first M3 PR.
7. **DD-092 v0.2.1 calibration confidence interval method.** BRD-4 §7.2 commits to "sample size, per-threshold deltas, projected precision, and confidence interval." Resolve in the first v0.2.1 PR whether Wilson, Clopper-Pearson, or bootstrap. Default: Wilson 95% — well-suited to small sample sizes typical of telemetry windows.

## Suggested Execution Mode

**Recommendation: hybrid — sequential trunk on the critical path with three worktree-parallel side tracks.**

Rationale follows the milestone DAG:

- **Critical path (sequential, single trunk):** M0 → M1 → M2 → M3 → M5 → M8 → M9 → M10. Each unblocks the next and shares ownership of the storage / boundary / pipeline layer. Use `subagent-driven-development` with one subagent per milestone, two-stage review between milestones.

- **Side track A (worktree-parallel from M2 forward):** M4 (signal detectors against synthetic fixtures). Touches `src/signal/*`, `tests/fixtures/signal-corpora/*` — disjoint from the proposalStore + Author pipeline critical path. Merges cleanly before M5 starts.

- **Side track B (worktree-parallel from M3 forward):** M6 (Annotate proposer + Trickle scanner + SessionEnd Author entry point). Touches `src/proposers/annotateProposer.ts`, `src/scanner/trickleScanner.ts`, `src/hooks/sessionEnd.ts`, `prompts/v2/annotate/*` — disjoint from the M5 post-Stop Author work, except both share `proposalStore` (interface stable from M5). Merge before M7 starts.

- **Side track C (worktree-parallel from M5 forward):** M7 (commands + permission UX). Touches `src/commands/*`, `src/permissions/proposalUX.ts`, `src/observability/statusline.ts` extensions. Only depends on `proposalStore` interface from M5; merge before M8 starts.

- **DG documentation set** (DG-1..DG-6) drips from M2 onward in a fourth worktree; only DG-6 (privacy review) requires the full v0.2 surface to be authoritatively documented and runs against M10.

Concretely: launch `subagent-driven-development` on M0; once M2 completes, fork a worktree-parallel track for M4 (synthetic signal detectors) and a second worktree for fixture/corpus authoring + DG drafting while the trunk continues with M3 → M5; merge M4 before M5 starts; once M5 completes, fork M6 + M7 in parallel; converge for M8; M9 is conditional on the M8 telemetry artifact; M10 closes the release.

## Source Cross-Reference Summary

This plan cites the following IDs from the v0.2 corpus (all present in source):

**Design Decisions (DD-065..DD-092, 28 total):** DD-065 (Author proposal-only), DD-066 (Trickle scan-cache), DD-067 (Author separate pipeline + staged adoption), DD-068 (v0.1.1 telemetry shipped), DD-069 (Annotate anchor format + sidecar), DD-070 (Statusline integration: hybrid), DD-071 (OSC 8 click affordance), DD-072 (Quarantine directory), DD-073 (Annotate opt-in: hybrid), DD-074 (graduation.json scopes), DD-075 (Proposal expiry fences), DD-076 (Bash threshold), DD-077 (File-creation threshold), DD-078 (Agent-correction threshold), DD-079 (Reserved), DD-080 (v1→v2 migrator), DD-081 (Acceptance UX), DD-082 (Name-collision policy), DD-083 (Revert via git), DD-084 (Snapshot debounced writer), DD-085 (Cost ceiling = baseline × 1.30), DD-086 (file-write share-metrics), DD-087..090 (titles partial in source — see gap note), DD-091 (Author/Annotate LLM contract), DD-092 (v0.2.1 calibration commitment).

**Open Questions cited / closed:** OQ-v2-01 (PostToolUse buffer schema → DD-066), OQ-v2-02 (Stage 1 reuse → DD-067), OQ-v2-03 (telemetry events → DD-068 / v0.1.1 shipped), OQ-v2-04 (frontmatter round-trip → DD-069), OQ-v2-05 (statusline integration → DD-070), OQ-v2-06 (quarantine directory → DD-072), OQ-v2-07 (Annotate opt-in → DD-073), OQ-v2-08 (proposal expiry → DD-075), OQ-v2-09 (graduate scope → DD-074), OQ-v2-10 (statusline click → DD-071), OQ-v2-11/12/13 (thresholds → DD-076/077/078 + DD-092), OQ-v2-20 (snapshot hot-path → DD-084 amendment), OQ-v2-21 (hashing rigor closed → DD-072 vocabulary), OQ-v2-24 (subagent provenance → DD-078 amended), OQ-v2-30/31 (scan-cache shape → DD-066 amendment).

**FR / NFR / Gate IDs (from BRD-2 / BRD-3 / BRD-4):** FR-MODES-1..7, FR-ANNOTATE-1..N, FR-AUTHOR-1..14 (FR-AUTHOR-1..5 pipeline + cap + latency + isolation; FR-AUTHOR-6/-7 bash repetition + normalisation contract; FR-AUTHOR-8/-9 file-creation; FR-AUTHOR-10/-11/-12 agent-correction; FR-AUTHOR-13 signal-cache caps; FR-AUTHOR-14 SessionEnd prune), FR-PROPOSE-1..14 (including -10 collision policy + `proposal_acceptance_blocked`, -11 config keys, -13 schema validation, -14 TTL/ignore badges), FR-STATUSLINE-1..10 (including -7 debounced writer, -8 doctor probe drift, -9 FORCE_HYPERLINK override, -10 first-snapshot bootstrap exemption), FR-TRICKLE-1..N, FR-OBS-N1 (with sub-rows N1a..N1e — Bash normalisation, Edit/Write template, length-buckets, refers_to_prior, storage budget), FR-OBS-N2 (cross-session leak), FR-OBS-N3 (peek-not-consume), FR-OBS-N4 (metrics catalogue), FR-OBS-N5 (privacy-safe-by-construction), FR-COST-N1..N6 (including N6 cassette directories), FR-PERMISSION-N1..N4 (including N4 PathFilter as canonical gate for Annotate `coherence/ignore`), FR-FAILURE-N1..N3 (including N3 illegal proposal-state transition → `ProposalStateError`), FR-PRIVACY-N1..N4 (allowlist + fixture + user-confirmation + redaction matrix); BRD-2 §10 `FR-COMMANDS` slash-command surface; NFR-PERF (additive — NFR-PERF-N1..N6: Author p95, statusline 5 ms, trickle, snapshot, hashing, v0.1 hot-path inviolate), NFR-COST (amended ×1.30), NFR-PRIVACY (additive), NFR-RELIABILITY (additive), NFR-OBS (additive), NFR-COMPAT (additive), NFR-MAINT (additive); BRD-4 functional gates FG-1..FG-16, performance gates PG-1..PG-5, cost gates CG-1..CG-3, privacy/security gates SG-1, SG-1a, SG-1b, SG-2, SG-3, release gates RG-1..RG-5.

**Source-content gaps encountered:**

- **DD-074 title** appears truncated in the persisted DD register page (rendered as `DD-074 — `). The OQ-v2-09 row clearly maps DD-074 to graduation-scope semantics ("All three; persistent in `graduation.json`; most-specific-wins; never bypasses DD-065 quarantine"); the plan uses that mapping as authoritative.
- **DD-079** is explicitly "Reserved (intentional numbering gap). Not assigned. During v0.2 OQ resolution the slot was tentatively held for an OQ-v2-30 consolidation that was ultimately absorbed into DD-080 (state-schema bump). The slot is left unused rather than re-numbered to preserve `coherence-log.md` audit-log stability for any v0.2-alpha entry that already cited a DD index. Future v0.x DDs MUST NOT reuse DD-079 — allocate from DD-093 onward." Used in the plan only as a placeholder.
- **DD-083 title** appears truncated in source (`DD-083 — Proposal revert via `); the resolution path in OQ-v2 / `propose-revert-acceptance` command surface clearly maps to git-revert semantics; the plan cites DD-083 with that mapping.
- **DD-086..DD-090 titles** appear partial in the persisted DD register pagination. The plan cites them only by number in non-load-bearing positions (DD-086 surfaces in the v0.3 deferral list as the file-write-only `share-metrics`, which is unambiguous from BRD-5 §3).
- **OQ-v2-14..19, 22..23, 25..29** detail not pulled in full (the OQ tables paginate beyond what was needed for plan drafting); none gate a v0.2 milestone — the resolution-path column for each was already condensed into DD-065..DD-092 ratifications.
