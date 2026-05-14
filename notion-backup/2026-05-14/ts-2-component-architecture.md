<!-- url: https://www.notion.so/35b010d46a708103b54ff2f187fc822b -->
<!-- id: 35b010d4-6a70-8103-b54f-f2f187fc822b -->
<!-- title: 🧩 TS-2 — Component Architecture -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-2](https://www.notion.so/35b010d46a708134843dc4fed567f896). All v0.1 module boundaries hold unchanged; this slice introduces the v0.2 modules and their dependency edges.
---
## 1. New modules
<table header-row="true">
<tr>
<td>Module</td>
<td>Path</td>
<td>Responsibility</td>
<td>DD</td>
</tr>
<tr>
<td>`mode-resolver`</td>
<td>`src/state/modeResolver.ts`</td>
<td>Path-prefix lookup over `graduation.json` with per-session cache; resolves the effective mode for a given `cwd` / file path. Most-specific scope wins.</td>
<td>DD-074</td>
</tr>
<tr>
<td>`signal-detector / bash-repetition`</td>
<td>`src/detection/signal/bashRepetition.ts`</td>
<td>Ring-buffer over normalised Bash invocations; fires when count ≥ 3 in a 30-min rolling window per `signature_hash`.</td>
<td>DD-076</td>
</tr>
<tr>
<td>`signal-detector / file-creation`</td>
<td>`src/detection/signal/fileCreation.ts`</td>
<td>Per-Write skeleton hashing (SHA-256 of first 5 non-blank lines + import-set + heading hierarchy); fires on count ≥ 3 with locality + similarity match.</td>
<td>DD-077</td>
</tr>
<tr>
<td>`signal-detector / agent-correction`</td>
<td>`src/detection/signal/agentCorrection.ts`</td>
<td>SessionEnd sweep over v0.1 `SubagentAttribution` and Edit/Write history; computes invocation-aggregate line ratio per OQ-v2-24.</td>
<td>DD-078</td>
</tr>
<tr>
<td>`trickle-scanner`</td>
<td>`src/detection/trickle.ts`</td>
<td>Idle-gated PostToolUse opportunistic scan; emits `BufferEntry { source: 'trickle_deep_scan', confidence: low }`.</td>
<td>DD-066</td>
</tr>
<tr>
<td>`annotate-proposer`</td>
<td>`src/pipeline/proposers/annotate.ts`</td>
<td>Detects anchor-less docs in Annotate-enabled scopes; produces `kind = 'annotate'` proposals with `auto-annotated: true` discriminator.</td>
<td>DD-069</td>
</tr>
<tr>
<td>`author-pipeline`</td>
<td>`src/pipeline/proposers/author/`</td>
<td>Post-Stop + SessionEnd pipeline; per-signal proposers for slash command / skill / agent; two-phase validation (generate-time + accept-time). Two entry points share one set of per-session budgets (TS-5 §1, TS-4 §4/§5).</td>
<td>DD-067, DD-082</td>
</tr>
<tr>
<td>`proposal-store`</td>
<td>`src/state/proposalStore.ts`</td>
<td>Manages `proposal-cache.json` FSM + per-proposal directory under `proposals/<kind>/<id>/`; enforces append-only `state_history`.</td>
<td>DD-072, DD-088</td>
</tr>
<tr>
<td>`signal-cache`</td>
<td>`src/state/signalCache.ts`</td>
<td>Discriminated-union store for the three signal kinds; circuit breakers on `entries.maxItems`; SessionEnd prune.</td>
<td>DD-089</td>
</tr>
<tr>
<td>`snapshot-writer`</td>
<td>`src/state/snapshotWriter.ts`</td>
<td>Debounced writer for `state-snapshot.json`; in-process dirty bit on hook calls; flush on (timer ≥ 5 s OR Stop / SubagentStop / SessionEnd) under `state-snapshot` lock.</td>
<td>DD-084</td>
</tr>
<tr>
<td>`statusline-scripts`</td>
<td>`bin/coherence-statusline.{sh,ps1}`, `bin/coherence-subagent-statusline.sh`</td>
<td>Cancellation-safe single-read renderers; OSC 8 / OSC 52 / plain tier selection from `host-capabilities.url_scheme_handler`.</td>
<td>DD-070, DD-071</td>
</tr>
<tr>
<td>`statusline-installer`</td>
<td>`src/commands/installStatusline.ts`</td>
<td>`/coherence:install-statusline` / `/coherence:uninstall-statusline` with explicit confirmation and automatic backup of `settings.json`.</td>
<td>DD-070</td>
</tr>
<tr>
<td>`propose-* commands`</td>
<td>`src/commands/propose{List,Show,Accept,Reject,RevertAcceptance}.ts`</td>
<td>Pull-based proposal browser + lifecycle ops; emits per-action metrics; collision policy enforced at `propose-accept`.</td>
<td>DD-081, DD-082, DD-083</td>
</tr>
<tr>
<td>`signature-hash` (canonical)</td>
<td>`src/util/signatureHash.ts`</td>
<td>Single source of truth: SHA-256, first 12 hex; bash + edit/write normalisation contracts (FR-OBS-N1a, N1b). **Status:** scheduled to land in v0.1.1 per BRD; v0.2 implementation PRs MUST verify it exists before extending callers, and create it if missing.</td>
<td>DD-068</td>
</tr>
<tr>
<td>`migrator v1→v2`</td>
<td>`src/state/migrate/v1_to_v2.ts`</td>
<td>Single coordinated atomic migrator slotted into the `// Future: if (schemaVersion < 2)` branch of `src/state/migrate/index.ts`.</td>
<td>DD-080</td>
</tr>
</table>
## 2. v0.1 surface reuse (no fork, no patch)
<table header-row="true">
<tr>
<td>v0.1 module</td>
<td>v0.2 reuse</td>
</tr>
<tr>
<td>`PathFilter` (`src/detection/pathFilter.ts`)</td>
<td>**The single privacy boundary.** Annotate (FR-ANNOTATE-8), Author signal capture, and trickle scanner all gate through it. (FR-PERMISSION-N4, NFR-PRIVACY-N2)</td>
</tr>
<tr>
<td>`StateStore` atomic-write / lock-manager / quarantine</td>
<td>All five new state files participate; registered in `SCHEMA_NAMES` / `FILE_TO_SCHEMA`. (NFR-RELIABILITY-N1)</td>
</tr>
<tr>
<td>`CostLedger`</td>
<td>Enum widening only (`'author' \| 'annotate'`); per-feature sub-totaling for the DD-085 partition (FR-COST-N1..N3).</td>
</tr>
<tr>
<td>`revertDetect` (`src/detection/revertDetect.ts`)</td>
<td>Picks up `[coherence-revert]` commits unchanged; closes the `propose-revert-acceptance` loop. (DD-083, FR-PROPOSE-8)</td>
</tr>
<tr>
<td>`SubagentAttribution`</td>
<td>Source of `files_touched` and per-invocation aggregates for DD-078 correction signal. (FR-AUTHOR-10)</td>
</tr>
<tr>
<td>Stage 1 / Stage 2 healing</td>
<td>Run unchanged; Author pipeline strictly follows Stop output commit (FR-AUTHOR-5).</td>
</tr>
<tr>
<td>`coherence/ignore`</td>
<td>Default template extended with `proposals/` and `proposal-cache.json` (DD-072).</td>
</tr>
<tr>
<td>`shareMetrics.anonymizeRecord`</td>
<td>Allowlist extended for the three DD-068 events plus `proposal_acceptance_blocked` (FR-PRIVACY-N1).</td>
</tr>
<tr>
<td>`hostCapabilitiesProbe`</td>
<td>Three new optional fields: `url_scheme_handler`, `statusline_install_path`, `subagent_invocation_id_emitted` (NFR-COMPAT-N2, DD-090).</td>
</tr>
</table>
## 3. Dependency graph (v0.2 additions)
```javascript
hooks/
 ├ PostToolUse ──▶ signatureHash ──▶ metrics.jsonl  (DD-068)
 │             └─▶ signalCache ──▶ bashRepetition / fileCreation
 │                                       └─▶ author-pipeline (queued for post-Stop)
 ├ PostToolUse (idle) ──▶ trickle ──▶ driftBuffer
 ├ UserPromptSubmit ──▶ signatureHash + responseCorrelation
 ├ Stop / SubagentStop ──▶ [v0.1 Stage 1/2] ──▶ author-pipeline (entry-point #1) ──▶ proposalStore
 │                       └─▶ snapshotWriter.flush()
 └ SessionEnd ──▶ agentCorrection sweep ──▶ author-pipeline (entry-point #2)
             └─▶ signalCache.prune()
             └─▶ snapshotWriter.flush()
# Both Author entry points share one set of budgets:
#   proposals_per_session ≤ 3 (FR-AUTHOR-3); Author cost share ≤ 60% of +30% headroom (DD-085)

SessionStart ──▶ migrate(v1→v2) ──▶ modeResolver.prime() ──▶ proposalStore.expirySweep()

commands/
 ├ graduate         ─▶ modeResolver ─▶ graduation.json
 ├ annotate         ─▶ PathFilter → annotate-proposer → proposalStore
 ├ propose-list     ─▶ proposalStore (read-only)
 ├ propose-show     ─▶ proposalStore + proposal.schema.json (re-validate on read)
 ├ propose-accept   ─▶ collision-policy → quarantineFile? → fs write → git commit
 ├ propose-reject   ─▶ proposalStore.transition(rejected)
 ├ propose-revert-acceptance ─▶ git revert → revertDetect picks up
 ├ install-statusline   ─▶ settings.json backup + write
 └ uninstall-statusline ─▶ restore from backup
```
## 4. Module boundaries
- **Detection layer never writes to disk** (other than via `signalCache` / `driftBuffer` which go through the StateStore atomic-write path). Hashing, normalisation, and similarity computation are pure functions.
- **Proposers never write under user-owned directories.** The only write target for any proposer is `.claude/coherence/proposals/<kind>/<id>/`.
- **`propose-accept`**** is the single “cross the boundary” operator.** It is the only place in the v0.2 codebase that may write under `.claude/skills/`, `.claude/agents/`, `.claude/commands/` or read from quarantine, and only when invoked via a typed slash command. (DD-065)
- **`statusLine`**** config writes are gated by ****`installStatusline`**** only.** No other module touches `~/.claude/settings.json`. (FR-PERMISSION-N2)
- **`signatureHash`**** is the single source of truth** for all hashing across signal detectors, telemetry, and proposal collision pre-checks (DD-068).
## 5. Three-layer healing extension
v0.1 healed three layers (referring docs / skills / subagents). v0.2 adds a **fourth, proposal-only** layer for *missing* artifacts:
<table header-row="true">
<tr>
<td>Layer</td>
<td>v0.1 healing</td>
<td>v0.2 proposal kind</td>
</tr>
<tr>
<td>Referring docs</td>
<td>Patch existing anchors (Stage 1/2)</td>
<td>Annotate proposal for anchor-less docs (FR-ANNOTATE-1)</td>
</tr>
<tr>
<td>Skills</td>
<td>Patch existing skills</td>
<td>`kind = skill` proposal from file-creation signal (FR-AUTHOR-8)</td>
</tr>
<tr>
<td>Subagents / agents</td>
<td>Patch existing agent definitions</td>
<td>`kind = agent` proposal from agent-correction signal (FR-AUTHOR-10)</td>
</tr>
<tr>
<td>Slash commands (new)</td>
<td>—</td>
<td>`kind = slash_command` proposal from bash-repetition signal (FR-AUTHOR-6)</td>
</tr>
</table>
## 6. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>FRs</td>
<td>NFRs</td>
<td>DDs</td>
</tr>
<tr>
<td>§1 New modules</td>
<td>FR-MODES-3, FR-AUTHOR-1..14, FR-ANNOTATE-1..7, FR-PROPOSE-1..14, FR-STATUSLINE-1..9, FR-TRICKLE-1..7</td>
<td>NFR-RELIABILITY-N1..N3</td>
<td>DD-066..091</td>
</tr>
<tr>
<td>§2 v0.1 reuse</td>
<td>FR-PERMISSION-N4, FR-COST-N1..N3, FR-PRIVACY-N1..N4</td>
<td>NFR-PRIVACY-N2, NFR-COMPAT-N1..N2</td>
<td>DD-068, DD-080, DD-083, DD-090, DD-091</td>
</tr>
<tr>
<td>§3 Dependency graph</td>
<td>FR-OBS-N1..N5, FR-AUTHOR-12, FR-TRICKLE-5</td>
<td>NFR-PERF-N5..N6</td>
<td>DD-066, DD-068, DD-078, DD-084</td>
</tr>
<tr>
<td>§4 Module boundaries</td>
<td>FR-PERMISSION-N1..N4</td>
<td>NFR-PRIVACY-N1..N3</td>
<td>DD-065, DD-072, DD-082</td>
</tr>
</table>
