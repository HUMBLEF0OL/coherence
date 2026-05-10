# Coherence v0.2.0 — Changelog

## Process artifacts removed for solo-developer workflow

The following files specified in the v0.2 plan as multi-stakeholder
governance artifacts were removed as solo-developer overhead:
`PRECONDITION.md`, `alpha-telemetry-plan.md`,
`dd-092-calibration-commitment.md`, `risk-register-signoff.md`, and
the `v0.2-spec-freeze-2026-05-09.md` artifact under
`docs/superpowers/plans/`. The functional content lives in code and
shipped tests:

- M0 substrate verification → `tests/preconditions/v0.2-substrate.test.ts`.
- Alpha telemetry collection → `scripts/alpha-telemetry-close.mjs`.
- DD-092 calibration logic → `src/util/wilson.ts`
  (`meetsCalibrationFloor`).
- Risk-register sign-off → reflected in shipped fixes (every R-v0.2-NN
  is closed by tests + code, listed in the v0.2 plan itself).

Re-add any of them later if/when this becomes a multi-person project.

## v0.2.0 (target 2026-05-30, GA tag)

**Goal:** turn coherence from reactive (v0.1) to proactive: detect anchor-less
docs, recurring user behaviour patterns, idle-window drift; surface proposals
on demand; ambient statusline. Trust constraint: **DD-065** — Author proposals
land in quarantine, never directly under `.claude/skills/` / `.claude/agents/`
/ `.claude/commands/` / `~/.claude/settings.json`.

### Design decisions in this release

DD-065 (Author proposal-only quarantine boundary), DD-066 (Trickle
scan-cache reservation), DD-067 (Author separate pipeline + staged
adoption), DD-068 (telemetry events), DD-069 (Annotate anchor format +
sidecar fallback), DD-070 (Statusline integration: hybrid), DD-071 (OSC 8
click affordance + 3-tier graceful degradation), DD-072 (Quarantine
directory), DD-073 (Annotate opt-in: hybrid), DD-074 (graduation.json
scopes), DD-075 (Proposal expiry fences), DD-076 (Bash threshold), DD-077
(File-creation threshold), DD-078 (Agent-correction threshold), DD-079
(Reserved), DD-080 (v1→v2 migrator), DD-081 (Acceptance UX), DD-082
(Name-collision policy), DD-083 (Revert via git), DD-084 (Snapshot
debounced writer), DD-085 (Cost ceiling × 1.30), DD-086 (file-write
share-metrics), DD-087 (proposal.schema.json), DD-088 (Proposal lifecycle
FSM), DD-089 (signal-cache caps), DD-090 (host-capabilities v0.2 fields),
DD-091 (Author/Annotate LLM contract), DD-092 (v0.2.1 calibration commit).

### New modules

- `src/proposals/quarantine.ts` — DD-065 cross-the-boundary writer.
- `src/proposals/manifest.ts` — proposal manifest writer.
- `src/proposals/store.ts` — proposalStore FSM.
- `src/proposals/expirySweep.ts` — DD-075 fences.
- `src/state/graduation.ts` — graduation.json read/write.
- `src/state/proposalCache.ts` — proposal cache + FSM transitions.
- `src/state/snapshotWriter.ts` — DD-084 debounced writer.
- `src/state/migrate/v1_to_v2.ts` — DD-080 single coordinated migrator.
- `src/state/schemas/{graduation,proposal-cache,signal-cache,state-snapshot,scan-cache-state}.schema.json` — v0.2 schemas.
- `src/modes/resolver.ts` — DD-074 mode resolver.
- `src/signal/{signatureHash,normalize,signalCache,bashRepetition,fileCreation,agentCorrection}.ts` — DD-076/077/078 detectors.
- `src/scanner/trickleScanner.ts` — DD-066 trickle deep-scan.
- `src/proposers/annotateProposer.ts` — DD-069 annotate proposer.
- `src/llm/authorPipeline.ts` — DD-067/091 Author pipeline.
- `src/validation/proposalValidator.ts` — Author/Annotate validator.
- `src/permissions/proposeAccept.ts` — token-gated cross-the-boundary loader.
- `src/commands/{proposeList,proposeShow,proposeAccept,proposeReject,proposeRevertAcceptance,installStatusline,uninstallStatusline,annotate}.ts` — propose-* command surface.
- `src/observability/statusline.ts` (extended) — OSC 8 / 52 / plain click affordance.
- `bin/coherence-statusline.{sh,ps1}`, `bin/coherence-subagent-statusline.sh` — read-only snapshot consumers.

### Migrations

- `version.json#schema_version: 1 → 2` via `src/state/migrate/v1_to_v2.ts`.
- Five new state files added to `.claude/coherence/`:
  `graduation.json`, `proposal-cache.json`, `signal-cache.json`,
  `state-snapshot.json`, `scan-cache/state.json`.
- `drift-buffer.json` source enum widened
  (`proposer`, `annotate`, `trickle_deep_scan`, `signal_*`).
- `cost-ledger.json` stage enum widened (`author`, `annotate`,
  `author_planner`).

### Migration note for early-adopter installs (S4)

`scan-cache/state.json#last_pass_at` now requires `format: "date-time"`.
Installs that ran an earlier v0.2 dev build (which wrote `last_pass_at`
as the empty string) will fail schema validation on first read. The
file gets quarantined automatically and a fresh default replaces it.
The only practical consequence is that any non-zero
`entries_this_session` from prior dev sessions resets; trickle resumes
with a clean per-session counter.

### Author planner stage shipped behind env gate (M9, DD-067)

`prompts/v2/author/planner.md` + `src/llm/authorPlanner.ts` ship the
consolidation stage. Opt-in via `COHERENCE_AUTHOR_PLANNER=1`. Hard
trigger: candidate set spans ≥ 2 distinct signal kinds within a 30-min
window. When triggered, emits a single consolidated proposal covering
the union of signals; per-signal authoring is suppressed for covered
hashes. Default is OFF until v0.2-alpha telemetry justifies flipping
per BRD-5 §3 trigger (≥ 25% cross-kind co-occurrence).

### Cassette suite + cost partition gate (CG-1, CG-2)

`tests/cassettes/author/{bash,file,agent,planner}/*.json` carry
synthetic Author responses for the four prompt kinds.
`tests/cost/cg-author-share.test.ts` enforces DD-085 partition: per-
session worst-case cost ≤ 60% of v0.1-baseline × 1.30 headroom.
Live-burn cost evidence captured during v0.2-alpha telemetry.

### Wilson 95% calibration helper (DD-092)

`src/util/wilson.ts` ships the Wilson interval calculator + the
`meetsCalibrationFloor(successes, trials, floor=0.7)` helper. The
v0.2-alpha telemetry close-out script
(`scripts/alpha-telemetry-close.mjs`) now reports per-detector
precision with Wilson 95% bounds and a `meets_calibration_floor`
boolean per the DD-092 acceptance commitment.

### Metrics retention sweep wired (T4, NFR-OBS-2)

SessionStart invokes `runRetentionSweep` so `metrics.jsonl` is bounded
at 90 days. Aggregated counts land in `metrics-summary.json` per DD-060.

### Slash-command kind: documentation-only delivery (N5)

`/coherence:propose-accept` for `kind: 'slash_command'` writes the
proposed markdown to `.claude/commands/<name>.md` but does NOT modify
`plugin.json`. The markdown is a documentation skeleton; making the
command actually runnable requires the user to hand-write the JS handler
and add the `slashCommands[]` entry. The accept event carries
`delivery_mode: 'documentation_only'`. Auto-generated runnable handlers
deferred to v0.3.

### Slash commands (v0.2 surface)

`/coherence:graduate <mode> [<scope>]`, `/coherence:graduate --status`,
`/coherence:annotate <path>`, `/coherence:propose-list`,
`/coherence:propose-show <id>`, `/coherence:propose-accept <id>` (with
`--rename` and `--overwrite <retyped-path>`), `/coherence:propose-reject
<id>`, `/coherence:propose-revert-acceptance <id>`,
`/coherence:install-statusline`, `/coherence:uninstall-statusline`.

### v0.2.1 calibration commitment

Per DD-092: re-tunes DD-076/077/078 thresholds against
`proposal_signal_observed { kind, would_have_fired }` events from the v0.1.1
+ v0.2-alpha rolling 30-day window. Wilson 95% confidence intervals.
Acceptance: per-threshold projected precision ≥ 0.7. Tracked as a hard
post-GA deliverable in BRD-5 §1.
