<!-- url: https://www.notion.so/35b010d46a708147911ddfddfb5a2f80 -->
<!-- id: 35b010d4-6a70-8147-911d-dfddfb5a2f80 -->
<!-- title: 🧩 Design Decisions -->
> Continues v0.1's design-decision register. v0.1 ended at DD-064; v0.2 starts at **DD-065**. Format mirrors v0.1: each decision is a load-bearing statement plus rationale, alternatives considered, and source signal.
## Suggested grouping (fill as decisions land)
- **DD-065 — Trust model (Author mode quarantine)** — below — *user-ratified 2026-05-09*
- **DD-066–070 — Annotate mode**
- **DD-071–075 — ****`/coherence:graduate`**** lifecycle**
- **DD-076–080 — Author signal: bash repetition**
- **DD-081–085 — Author signal: file-creation patterns**
- **DD-086–090 — Author signal: agent-output corrections**
- **DD-091–095 — propose-skill / propose-agent commands**
- **DD-096–100 — Statusline badge**
- **DD-101+ — Trickle deep-scan**
*Numbering ranges are guidance; they don't reserve slots. If Annotate generates 7 decisions, the next group simply starts at DD-073.*
---
## DD-065 — Author mode is proposal-only; never writes new skills/agents automatically
**Status:** Ratified 2026-05-09
**Decision:** v0.2 Author mode (proposing new skills, slash commands, or agent definitions) **never** writes files into `.claude/skills/`, `.claude/agents/`, or any user-owned config directory automatically. All Author-mode output is materialised in a quarantined directory (working name `coherence/proposals/<kind>/<id>/`) and surfaces to the user only via the explicit slash commands `/coherence:propose-skill` and `/coherence:propose-agent`. Graduation from quarantine to a live file requires an explicit user accept action; there is no auto-promote flag in v0.2 (graduated auto-apply is a v1.0 candidate at the earliest).
**Rationale:**
1. v0.1's Observe-default earns trust by guaranteeing the plugin never writes user files without consent. Author mode must inherit that contract or the plugin loses the trust v0.1 built.
2. Net-new skill/agent files are higher-risk than v0.1's surgical patches: a fabricated skill becomes future agent context, multiplying any hallucination across every later session. The blast radius justifies the strictest possible default.
3. Quarantine + slash-command surfacing keeps the failure mode benign: a bad proposal sits in a directory the user can ignore or `rm -rf`. It never silently shapes future agent behaviour.
4. A pull-based UX (slash commands) means the user controls *when* they review proposals — proposals don't interrupt the chat transcript or block session end.
**Alternatives considered:**
- *Quarantine + opt-in flag to even propose.* Rejected for v0.2 — too friction-heavy for a feature whose value is exactly the proposal stream. Re-evaluate if Annotate-mode telemetry shows users disable it.
- *Graduated auto-apply after N accepted proposals of the same kind.* Rejected for v0.2 — the trust ladder is interesting but unproven; defer to v1.0 with explicit per-user opt-in.
- *Direct write to **`.claude/skills/`** with **`[coherence-proposal]`** git commit prefix.* Rejected — still pollutes user-owned config, even if reversible. Quarantine is cleaner.
**Source signal:** User decision during v0.2 kickoff brainstorming (2026-05-09); aligns with v0.1 DD-001 (Observe default), DD-005 (`[coherence]` commit prefix as audit signal), and BRD-3 NFR-SECURITY constraints on writes to skill/agent directories.
**Implications for downstream DDs:**
- Quarantine directory schema is a v0.2 storage decision (next DD).
- Proposal lifecycle states (queued / surfaced / accepted / rejected / expired) need explicit modelling.
- `/coherence:graduate` for Author mode is a no-op against `.claude/` files; it only changes whether *proposals are generated*, not whether they're auto-applied.
- Telemetry must distinguish proposal-generated, proposal-surfaced, proposal-accepted, proposal-rejected to support the success-metric targets in the Overview.
---
*Add new decisions below as they're made. Keep the format: title — Status — Decision — Rationale — Alternatives — Source signal — Implications.*
---
## DD-066 — Trickle deep-scan: source-enum extension + dedicated scan-cache
**Status:** Ratified 2026-05-09
**Decision:** Trickle deep-scan extends the v0.1 buffer-entry `source` enum (DD-026) with one new value `trickle_deep_scan` and persists its operational state (per-file last-scanned timestamp + content hash + last scan_id, pending file queue, per-session quota counter) in a new sibling state file `.claude/coherence/scan-cache.json` whose filename is already reserved by v0.1 DD-041's lock list. The buffer-entry schema is otherwise unchanged. Trickle entries default to `confidence: low`, inheriting v0.1 FR-STOP-21 handling at Stop. A hard cap `trickle_entries_per_session ≤ 20` applies.
**Rationale:**
1. v0.1 keeps operational state out of the drift contract; trickle should follow the same pattern.
2. Reserving the filename already happened in v0.1 (DD-041), signalling the design intent.
3. Source-enum extension is the smallest possible buffer change — type-safe, observable in metrics, and matches how v0.1 itself extended the enum twice (`assertion`, `subagent`).
4. Hard per-session cap prevents trickle from drowning out reactive entries; low-confidence default routes through existing FR-STOP-21 downgrade path so noise stays cheap.
**Alternatives:**
- *Reuse buffer verbatim, no scan-cache* — rejected; trickle would repeat work each session.
- *Add **`trickle_metadata`** field to buffer entries* — rejected; pollutes schema with nullable per-source fields.
- *Scan-cache only, no enum change* — rejected; loses the ability to partition Stop outcomes by trigger source in metrics.
**Source signal:** OQ-v2-01 resolution; v0.1 TS-3 §3.1 (filename reservation), TS-4 §4.3 (PostToolUse hot path), DD-041 (lock list).
**Implications:**
- New `scan-cache.json` schema needed (separate DD).
- New metric `trickle_scan_pass { duration_ms, files_scanned, entries_added }`.
- `coherence:status` surfaces trickle quota usage.
- Trickle pass is **idle-gated**: only runs when PostToolUse hot path is otherwise quiescent (no buffer write in last N ms; threshold in config). Resolves NFR-PERF-1 inheritance.
- ~~Open follow-up: idle-detection threshold value (placeholder; tune from telemetry).~~ **Resolved 2026-05-09 (audit pass):** the idle-detection threshold default ships as **`trickle.idle_threshold_ms = 30_000`** (30 s), overridable via `config.json`. Tuning of this value is folded into DD-092's v0.2.1 calibration patch with bounds `[5_000, 120_000]`. Acceptance gate: median trickle pass adds \< 5 ms to the SessionEnd budget (NFR-PERF-1 partition).
**Amendment 2026-05-09 (OQ-v2-30):** the original DD reserved `scan-cache.json` as a flat file, but v0.1 actually reserved `scan-cache/` as a **directory** (`src/state/init.ts:52-58`, `.gitkeep` placeholder). Operational state is therefore relocated to **`scan-cache/state.json`**. The directory reservation stays; per-file scan tombstones can live alongside as `scan-cache/<hash>.json` in v0.3 without further restructuring. Register `scan-cache/state.json` in `SCHEMA_NAMES` / `FILE_TO_SCHEMA` (`src/state/stateStore.ts:18-39`) via DD-080 migration. *Alternative rejected:* delete the v0.1 directory reservation and use a flat file — would force a directory→file migration step on every existing v0.1 install for zero design benefit.
---
## DD-067 — Author mode runs in a separate pipeline; does not reuse Stage 1
**Status:** Ratified 2026-05-09
**Decision:** v0.2 introduces a distinct **Author pipeline** that runs *after* the v0.1 Stop pipeline completes its full healing flow. The Author pipeline has its own input contract (Author signals from buffer + telemetry, not buffer drift entries), its own LLM prompt(s), its own output schema (`proposal.schema.json`), and its own validation pipeline (schema-validity + ignore-respect + name-collision check; no diff-apply since proposals create new files in quarantine). v0.1's Stage 1 planner is **not** invoked by the Author pipeline. Author pipeline output lands exclusively in `coherence/proposals/` per DD-065.
**Staged adoption:**
- **v0.2-alpha:** Author pipeline has *no* planner stage; each Author signal directly invokes the relevant `propose-skill` / `propose-agent` / `propose-command` prompt and emits one proposal per signal.
- **v0.2 final:** A "Proposer" planner stage is added **only if** v0.2-alpha telemetry shows users frequently accept/reject proposals as a consolidated set across signal types (i.e. consolidation has measurable value). Otherwise the no-planner shape ships.
**Rationale:**
1. Author signals (bash sequences, file-creation patterns, corrected agent output) have no counterpart to v0.1's `triggering_files` union-find. Forcing them through Stage 1 would either misgroup or no-op.
2. Stage 1's hallucination surface and prompt budget are tuned for healing; mixing proposal-generation into the same prompt risks regressions in v0.1's QG-3/QG-4 quality gates.
3. Running *after* Stop preserves v0.1 NFR-PERF-4 (10 s p95 ceiling). v0.2 absorbs Author cost into its own latency budget (≤5 s p95 added when proposals exist).
4. Failure isolation: Author crash cannot corrupt the healing UX the user just saw.
5. Staged adoption avoids speculative complexity; the planner is added only when telemetry justifies it.
**Alternatives:**
- *Coerce signals into Stage 1 with empty **`triggering_files`* — union-find is meaningless on empty arrays; canonical selection collapses.
- *Extend Stage 1 prompt with a proposal-mode branch* — contract pollution, harder validation, prompt-version coupling.
- *Direct signal→proposal with no consolidation, ever* — viable for v0.2 but forecloses on a real consolidation need surfaced by telemetry.
**Source signal:** OQ-v2-02 resolution; v0.1 TS-5 (LLM pipeline), TS-4 §4.6 (Stop sequence), DD-008/DD-025 (planner contract), DD-065 (trust model).
**Implications:**
- New `proposal.schema.json` (separate DD).
- New `proposal-cache.json` for queue/lifecycle state (separate DD).
- New cost ledger fields: superseded — see DD-091 (the canonical mechanism is widening `CostEntry.stage` to add `'author' | 'annotate'` and `CostEntry.prompt_version` to add `author?` / `annotate?` keys; no separate `author_pipeline_calls` field needed). Folded into DD-080 schema bump.
- New metrics: `proposal_generated`, `proposal_surfaced`, `proposal_accepted`, `proposal_rejected`, `proposal_expired`.
- Cost-cap: Author pipeline hard-capped at `proposals_per_session ≤ 3` in v0.2-alpha to bound NFR-COST regression. Empirically tuned thereafter.
- New v0.2 NFR sub-budget: `author_pipeline_p95_latency ≤ 5 s` added to Stop wall-time.
**Amendment 2026-05-10 (planner ship decision — supersedes the original "v0.2 final" gate above):** the original DD framed Stage 1 planner as a binary ship-now-vs-defer choice gated on alpha telemetry. Resolved 2026-05-10 as **ship gated, calibrate post-alpha**:
- The Stage 1 planner ships in v0.2.0 **behind a default-off env flag** `COHERENCE_AUTHOR_PLANNER` (read in `src/hooks/stop.ts`, planner branch).
- All other values fall through to the direct-author path (zero default user impact).
- Telemetry events `proposal_planner_invoked` / `proposal_planner_skipped` are emitted from day one to enable the v0.2.1 promotion decision.
**Promotion criteria for v0.2.1 default-on flip** (all must pass after `scripts/alpha-telemetry-close.mjs` reports `closeout_gates_pass=true`):
1. `detector_precision.wilson_95.lower ≥ 0.7` per kind (DD-092 floor).
2. Bundled-section MAE between planner and direct paths ≤ 1 (`mean(|planner.count − direct.count|)`).
3. Cassette cost ratio `mean(planner.cost / direct.cost) ≤ 1.4`.
If any gate fails the planner stays opt-in for v0.2.1 and a calibration patch is issued. Default-flip removes the env-flag branch in `src/hooks/stop.ts` and documents the rollback path in `docs/v0.2/rollback.md`. *Alternatives rejected:* (a) hard ship default-on in v0.2.0 — premature without alpha calibration; (b) hold the planner for v0.2.1 entirely — denies the comparison data DD-092 commits to anyway; (c) runtime config knob in `config.json` instead of env flag — env flag is simpler, faster to disable in degraded mode, and matches existing `COHERENCE_*` toggles.
---
## DD-068 — v0.1 telemetry amendment: three privacy-safe Author-signal events
**Status:** Ratified 2026-05-09 · **Implemented as v0.1.1 patch 2026-05-09** · ships in v0.1.1 (post-v0.1.0)
**Implementation note (2026-05-09):** v0.1.0 shipped without these events; v0.1.1 patch landed with the three events plus the resolved hashing scheme below. Implementation files: `src/util/signatureHash.ts`, `src/state/responseCorrelation.ts`, `src/state/metrics.ts`, `src/hooks/{postToolUse,userPromptSubmit,stop,subagentStop,sessionStart,sessionEnd}.ts`, `src/commands/shareMetrics.ts`. Tests: `tests/unit/util/signatureHash.test.ts`, `tests/unit/observability/dd068-events.test.ts` (37 tests, all passing).
**Post-implementation audit corrections (2026-05-09):** A self-audit identified four issues, all resolved before release:
- **Read excluded from ****`tool_invocation_signature`****.** Spec scope is Bash/Edit/Write only; Read was emitted in error and would have produced high-volume / low-signal records. PostToolUse now early-returns on Read; the `tool` field type is closed to `'Bash' | 'Edit' | 'Write'`.
- **Cross-session response-id leak fixed.** `responseCorrelation`'s module-level `lastResponseId` is now explicitly cleared in both `sessionStartHook` (after kill-switch check) and `sessionEndHook`. Regression test asserts the first `user_prompt_signature` after `SessionStart` carries `prior_response_id: null` even when a prior session published one.
- **Peek-not-consume semantics for ****`prior_response_id`****.** Renamed `consumePriorResponseId` → `peekPriorResponseId`. Peek (rather than consume) is intentional: two consecutive corrective prompts about the same response (`fix it` → `actually fix it`) share a `prior_response_id` so downstream signal-clustering sees them as one correction event.
- **Realistic collision corpus.** Replaced the synthetic-uniform-input collision test with a 10 k-entry corpus drawn from a small verb/flag/path pool that all collapse through `normaliseBashCommand` first, exercising the post-normalisation hash space.
**Decision:** v0.2 Author mode requires three new event types in v0.1's `metrics.jsonl` to provide the signal stream for proposal generation. These events are privacy-safe by construction (hashed/structural metadata only — no raw command, file, or prompt content).
**New event types (additions to TS-3 §3.10 / BRD-2 FR-OBS):**
```json
// Emitted from PostToolUse for every Bash/Edit/Write invocation
// (Read intentionally excluded — high-frequency, low-signal)
{ "type": "tool_invocation_signature",
  "payload": { "tool": "Bash|Edit|Write", "signature_hash": "<12-hex>", "ts": "..." } }

// Emitted from UserPromptSubmit
{ "type": "user_prompt_signature",
  "payload": { "length_bucket": "sm|md|lg|xl",
                "refers_to_prior": true|false,
                "prior_response_id": "<id>|null",
                "ts": "..." } }

// Emitted from Stop / SubagentStop when an assistant response completes
{ "type": "agent_response_id",
  "payload": { "response_id": "<id>", "length_bucket": "sm|md|lg|xl", "ts": "..." } }
```
**Hashing scheme (resolved 2026-05-09 against OQ-v2-21; implemented in ****`src/util/signatureHash.ts`****):**
- **SHA-256, first 12 hex chars (48 bits)** — NOT 8 hex / 32 bits as originally drafted. Birthday-bound collision probability on 10 000 entries ≈ 1.8 × 10⁻⁷ (verified by a 10 k-entry collision-rate fixture in `signatureHash.test.ts`). The original 8-hex / 32-bit claim implied ≈ 1.2 % expected collisions on 10 k entries and was incorrect.
- **Bash tokenisation:** split on whitespace honouring single/double quotes (no shell interpretation). Replace each token matching a volatile pattern with a placeholder: `<PATH>` (POSIX `/...` or Windows `C:\\...`), `<UUID>`, `<TS>` (ISO-8601), `<NUM>` (integer ≥4 digits, preserving short flag values), `<HEX>` (hex string ≥8 chars). Pipes, sub-shells, and heredocs are NOT parsed; they hash with their literal content (acceptable for a repetition signal because exact repetition still hashes identically).
- **Edit/Write path template:** `<DIR:n>/<basename|*.ext>`. Basename preserved verbatim when ≤16 chars (covers `README.md`, `package.json`, `tsconfig.json`); otherwise globbed to `*.<ext>`.
- **`length_bucket`****:** sm \<512, md \<2048, lg \<8192, xl ≥8192 (literal char counts).
- **`refers_to_prior`**** heuristic:** case-insensitive regex on first 64 chars of the prompt: `\b(actually|wait|no|fix|that'?s wrong|hold on|instead|undo|revert)\b`.
- **`prior_response_id`**** correlation:** in-process pub/sub (`responseCorrelation.ts`); Stop / SubagentStop publish, UserPromptSubmit **peeks** (does not consume) when the heuristic matches. The cache is explicitly cleared at SessionStart and SessionEnd to prevent cross-session leakage.
**Hashing scheme — original draft (superseded):**
- Bash: `argv` tokenized by whitespace, normalized (env-vars stripped, paths bucketed to ancestor dir + glob), SHA-256, first 8 hex chars.
- Edit/Write: file path → `<ancestor>/<basename-glob>` template, then SHA-256, first 8 hex chars.
- `refers_to_prior` heuristic: prompt contains one of `{actually, wait, no, fix, that's wrong, hold on, instead}` (case-insensitive) within first 64 chars, OR explicit reference to prior assistant response.
- `length_bucket`: `sm` \<512 chars, `md` \<2048, `lg` \<8192, `xl` ≥8192. Bucketed to prevent length-based content reconstruction.
**Rationale:**
1. v0.1 currently captures Bash/Edit/Write only when matched by a `watches:` glob (FR-DETECT-1). Unwatched invocations — the dominant case for Author signals — are invisible.
2. v0.1 does not capture UserPromptSubmit content metadata at all, leaving signal (c) (agent-output corrections) with no data source.
3. Hashed signatures are sufficient for n-gram repetition detection (Bash), template clustering (Edit/Write), and correction detection (UserPromptSubmit + temporal correlation with `agent_response_id`).
4. NFR-PRIVACY-4 is preserved because no raw content reaches disk; only collision-resistant hashes and bucketed metadata.
5. Spec amendment \> v0.1.1 patch: v0.1 hasn't shipped, M3–M4 telemetry work is the natural insertion point, avoids cutting an interim release just for v0.2 dependencies.
**Alternatives:**
- *Capture raw content* — violates NFR-PRIVACY-4. Hard no.
- *Defer all capture to v0.2* — cold-start; OQ-v2-11..13 thresholds stay ungrounded; first v0.2 release ships with no real-data tuning.
- *Scope reduction (Bash signal only)* — reneges on G-4 and G-5.
- *v0.1.1 patch instead of amendment* — acceptable fallback if v0.1 owners reject amendment; documented below.
**Source signal:** OQ-v2-03 resolution; v0.1 TS-3 §3.10 (metrics.jsonl event types), TS-4 §4.3/4.4 (PostToolUse / UserPromptSubmit), NFR-PRIVACY-4 (no raw content).
**Implications:**
- v0.1 spec amendment proposal must be raised against [BRD-2](https://www.notion.so/35b010d46a7081b0b4afec8eb33fcba5) (3 new FR-OBS rows) and [TS-3 §3.10](https://www.notion.so/35b010d46a7081d9b307fd6a27a4deb8) (3 new event-type rows). Mark as "added 2026-05-09 for v0.2 dependency".
- v0.1 implementation team owns the \~100 LoC in PostToolUse + UserPromptSubmit + Stop hooks.
- v0.2 thresholds (OQ-v2-11..13) move from `🟡 awaiting v0.1 telemetry` to `🟡 tuning from real data` only after v0.1 ships with these events.
- Storage budget unchanged (\~13 MB additional within 90-day rolling retention).
- New v0.1 unit tests required: signature determinism, collision rate \<0.1% on a 10k-command corpus, prompt-signature heuristic precision/recall fixtures.
- **Fallback:** If v0.1 team rejects the amendment, ship as v0.1.1 patch released before v0.2 alpha. v0.2 config gates `proposals_per_session = 0` until v0.1.1 is detected via `host-capabilities.json`.
---
## DD-069 — Annotate-mode anchor format: identical to user-authored, plus `auto-annotated: true` flag
**Status:** Ratified 2026-05-09
**Decision:** Annotate-mode-generated anchors use the v0.1 anchor format byte-for-byte, with one additional optional frontmatter field `auto-annotated: true` for rollback discoverability. No new scanner, validator, or sidecar logic is introduced. Annotation passes through the same DD-065 quarantine + user-accept gate before any file is modified.
**Format details:**
- **Prose docs:** standard `<!-- coherence:section id=auto-<heading-slug> ... -->` paired blocks. Auto-disambiguated with `-N` suffix when slugs collide. Ids satisfy v0.1 FR-DETECT-15 character class `[a-z0-9_-]+`.
- **Skills/agents:** `coherence:` block inserted into existing YAML frontmatter. When `host-capabilities.json.frontmatter_preserves_unknown_keys` is `false`, write to `.claude/coherence/sidecars/<name>.yaml` per DD-050 / FR-COMMANDS-7.
- **`auto-annotated: true`** field added to all Annotate-generated frontmatter blocks. Treated as an unknown-but-preserved key by v0.1; enables future `/coherence:de-annotate` (v0.3) and per-session metrics partitioning.
**Rationale:**
1. Identical format means zero new validation surface in v0.1 — the scanner, integrity sweep, and sidecar fallback all work unchanged.
2. Heading-slug ids suppress v0.1's heading-fallback warning by construction: anchors are *generated from* the heading they wrap.
3. The `auto-annotated` flag is the minimal disambiguation needed for rollback / observability without forking the format.
4. DD-065 trust boundary preserved: Annotate output enters the proposal queue first; no file is mutated without explicit user accept.
**Alternatives:**
- *Marked variant (separate scanner branch)* — unnecessary; the flag suffices.
- *Sidecar-only annotation* — too conservative; defeats the in-doc visibility benefit of Annotate mode.
- *Skip the flag* — loses rollback discoverability and the partition-by-source telemetry.
**Source signal:** OQ-v2-04 resolution; v0.1 TS-3 §3.4 (frontmatter format), DD-050 (sidecar fallback), FR-DETECT-12/15, FR-LAYERS-2 (`coherence-key`), DD-065 (trust boundary).
**Implications:**
- New metric `annotation_proposed { kind: prose|skill|agent, uses_sidecar: bool }`.
- LLM cost per annotation: \~1000 tokens (doc summary + watches: synthesis + description). Capped via new config `annotate_calls_per_session` (placeholder default: 5).
- Annotate-suggested `watches:` globs are inherently fallible; the proposal queue + user-accept step is the safety net.
- v0.1 spec impact: **zero.** No schema changes, no scanner changes.
---
## DD-070 — Statusline integration: hybrid (script + opt-in install command + plugin-shipped subagentStatusLine)
**Status:** Ratified 2026-05-09
**Decision:** Coherence ships statusline integration as a **hybrid** of two complementary paths:
1. **Optional ****`statusLine`** — plugin ships `bin/coherence-statusline.sh` (Unix) and `bin/coherence-statusline.ps1` (Windows). User opts in via `/coherence:install-statusline`, which writes the `statusLine` field to `~/.claude/settings.json` (or the project equivalent) after explicit confirmation, with automatic backup. `/coherence:uninstall-statusline` reverses the change. The script reads `.claude/coherence/state-snapshot.json` (new v0.2 file, \~200 bytes, atomically rewritten by every Coherence hook) and emits one line: `🧭 <mode>  N⚠  [M proposals]`.
2. **Mandatory ****`subagentStatusLine`** — Coherence ships its own `subagentStatusLine` config in plugin `settings.json` (one of two plugin-shippable keys per Claude Code docs), rendering branded rows for any Coherence-spawned subagent. Free win; no user action required.
**Constraint discovered:** Per Claude Code v2.x docs, plugins **cannot** ship a `statusLine` field directly — only `agent` and `subagentStatusLine` are honoured in plugin `settings.json`. Statusline integration *must* go through user settings, which forces the opt-in install pattern.
**Rationale:**
1. Plugin-shippable `statusLine` doesn't exist in Claude Code's plugin contract; the install-command path is the only honest way to deliver an ambient badge.
2. Explicit `/coherence:install-statusline` step preserves the DD-065 trust philosophy: never modify user-owned config without consent.
3. `subagentStatusLine` is free and shippable; no reason not to use it.
4. Snapshot-file architecture decouples render from live-state queries, hitting the sub-100ms budget required by Claude Code's 300ms debounce.
5. Background monitors (`monitors/monitors.json`) considered as an alternative push channel — but they fire as Claude notifications mid-session, which violates v0.1's hot-path-non-disruption principle.
**Alternatives:**
- *Background monitors only* — violates hot-path non-disruption (notifications interrupt Claude's reasoning).
- *`subagentStatusLine`** only* — misses the ambient drift-backlog view that's the point of G-7.
- *Always-installed **`statusLine`* — not possible per Claude Code plugin contract.
- *Print to chat transcript* — explicitly rejected; pollutes conversation flow.
**Source signal:** OQ-v2-05 resolution; Claude Code v2.x statusline + plugin docs (verified 2026-05-09).
**Implications:**
- New v0.2 state file: `state-snapshot.json` (\~200B, atomic temp+rename, written by every hook that mutates buffer / proposal queue / mode).
- New slash commands: `/coherence:install-statusline`, `/coherence:uninstall-statusline`.
- New entries in `bin/`: `coherence-statusline.sh`, `coherence-statusline.ps1`. Plugin's `bin/` is auto-added to Bash PATH per Claude Code docs.
- Plugin `settings.json` declares `subagentStatusLine` pointing at `bin/coherence-subagent-statusline.sh` (Unix) and `bin/coherence-subagent-statusline.ps1` (Windows). The script reads the same `state-snapshot.json` and emits a one-line branded badge for Coherence-spawned subagents (kind, accept/reject counts, current invocation id when available). Implementation parity with `coherence-statusline.sh`; cancellation-safe under Claude Code's debounce.
- New metric `statusline_install { action: install|uninstall, target: user|project }`.
- Workspace-trust prompt is inherited from Claude Code; no Coherence-side handling needed.
- Script must be cancellation-safe (Claude Code cancels in-flight runs on new updates) — use file-existence + atomic-read pattern, not multi-step computation.
**Amendment 2026-05-09 (OQ-v2-20):** snapshot writes are removed from the PostToolUse hot path. PostToolUse only sets an in-process **dirty bit** (no FS I/O); `state-snapshot.json` is flushed (a) on `Stop` / `SubagentStop` / `SessionEnd` (already off the hot path) and (b) opportunistically by a debounced writer with a ≥5 s minimum interval, guarded by `lockManager` (`src/state/locks.ts`). The debounced writer is specified separately in **DD-084**. NFR-PERF-1 budget allocation: **5 ms p95 isolated** for the snapshot write itself, **0 ms attributed to PostToolUse**. New regression-gate cell `state-snapshot write` added to `tests/perf/regression-gate.test.ts`. *Alternative rejected:* synchronous write per hook with a 1 ms budget — even 1 ms × 100 PostToolUse invocations/min compounds into NFR-PERF-1 tail-latency regression risk; the existing hot path (`src/hooks/postToolUse.ts:1-78`) is already 5 tight steps including a `readFileSync`.
---
## DD-071 — Statusline click affordance via OSC 8 with graceful degradation
**Status:** Ratified 2026-05-09
**Decision:** The proposal-count segment of the statusline output is wrapped in an **OSC 8 hyperlink escape sequence** so terminals that support clickable links (iTerm2, Kitty, WezTerm) can deep-link the user into the proposal review flow. Terminals without OSC 8 support (notably macOS [Terminal.app](http://Terminal.app)) see the segment as plain text and use the slash command directly.
**Click target chain (graceful degradation):**
1. **Preferred:** `claude://run/coherence:propose-skill` URI scheme — contingent on Claude Code exposing such a scheme. v0.2-alpha probes via `host-capabilities.json.claude_url_scheme_supported` and stores the result.
2. **Fallback A (if no URI scheme):** OSC 8 hyperlink wrapping the slash command — click-to-run on terminals that support OSC 8 (iTerm2, Kitty, WezTerm). Detected via `host-capabilities.json.terminal_hyperlink`.
3. **Fallback B (if no OSC 8):** OSC 52 copy-to-clipboard — click copies the literal command `/coherence:propose-skill` to the user's clipboard.
4. **Fallback C (if no OSC 52):** plain text — segment appears as `[2 proposals → /coherence:propose-skill]` with no escape codes.
**Terminal-detection behaviour:**
- Use Claude Code's built-in OSC 8 detection; when terminal type is unknown (e.g., Windows Terminal, headless CI), instruct users via `/coherence:doctor` to set `FORCE_HYPERLINK=1` if they want click affordance.
- Document explicitly in install docs that [Terminal.app](http://Terminal.app) users see a non-clickable badge.
**Rationale:**
1. OSC 8 is the standard mechanism Claude Code already documents; reusing it inherits all terminal compatibility work upstream.
2. Graceful degradation chain ensures every terminal sees *something* useful: either a clickable link, a copyable command, or readable text.
3. URI scheme dependency is explicitly probed rather than assumed — avoids breaking on hosts that don't expose it.
4. Single-segment OSC 8 wrapping (just the proposal count) keeps the rest of the badge readable even if escape codes are stripped (e.g., over SSH or in tmux without passthrough).
**Alternatives:**
- *No click affordance, plain text only* — misses the obvious UX win on supported terminals.
- *Wrap entire badge in OSC 8* — if escape codes are stripped, badge becomes garbled; single-segment wrap is safer.
- *Force OSC 8 always* — produces literal `\e]8;;` text on unsupported terminals, ugly.
**Source signal:** OQ-v2-10 resolution; Claude Code v2.x statusline OSC 8 documentation + clickable-links example.
**Implications:**
- New `host-capabilities.json` fields: `claude_url_scheme_supported: boolean` (probed at install via `/coherence:doctor`) **and** `terminal_hyperlink: 'osc8' | 'osc52' | 'plain'` (probed from `$TERM` / Claude Code's terminal classification at install). The two are orthogonal — the URI scheme is a host capability, the hyperlink tier is a terminal capability.
- Statusline script implements the 3-tier degradation chain.
- New metric `statusline_click_target_used { tier: uri|copy|plain }` — emitted client-side is impossible (script can't know if user clicked); instead measured indirectly via correlated `proposal_surfaced` events triggered shortly after a render.
- Documentation lists supported terminals and the `FORCE_HYPERLINK` override.
- v0.1 spec impact: **zero.** Click-affordance behaviour is local rendering only.
---
## DD-072 — Quarantine directory: `.claude/coherence/proposals/<kind>/<id>/`
**Status:** Ratified 2026-05-09
**Decision:** All Author-mode and Annotate-mode proposals are materialised under `.claude/coherence/proposals/<kind>/<id>/`, where `<kind>` ∈ `{skills, agents, commands, annotations}` and `<id>` is a deterministic content-derived UUID. Each proposal directory contains the candidate artifact(s) plus a `manifest.json` with origin signal hash, generated_at timestamp, expiry timestamp, and lifecycle state. Queue/lifecycle state aggregated in `.claude/coherence/proposal-cache.json`.
**Rationale:**
1. v0.1 keeps all plugin state under `.claude/coherence/`; consistency reduces user cognitive load.
2. Inherits v0.1's atomic-write, lock-manager, and ignore semantics for free.
3. Hidden under `.claude/` doesn't impede discovery because `/coherence:propose-*` is the canonical surface (push, not browse).
4. Word collision with v0.1's `.claude/coherence/quarantine/` (state-file `.bak` retention) is benign — different depths, different `manifest`/`.bak` artefacts. "Quarantine" in DD-065 vocabulary refers to *trust isolation*; v0.1's `quarantine/` refers to *state corruption recovery*. Documented in glossary.
**Alternatives:**
- *Sibling **`coherence-proposals/`** at workspace root* — more visible but breaks v0.1's everything-under-.claude/coherence/ invariant; complicates ignore handling.
- *`.claude/proposals/`** (no coherence prefix)* — risks future Claude Code feature collision.
- *Symlink for visibility* — cross-platform footgun on Windows.
**Source signal:** OQ-v2-06 resolution; v0.1 TS-3 §3.1 (on-disk layout invariant); DD-065 (trust quarantine vocabulary).
**Implications:**
- Default `coherence/ignore` template additions: `proposals/`, `proposal-cache.json` (so users don't accidentally commit local proposals).
- New `proposal-cache.json` schema: `{ schema_version, entries: [{ id, kind, signal_hash, generated_at, expires_at, state, ignored_count }] }`.
- `proposal-cache.json` participates in v0.1 stateStore (atomic writes, schema validation, quarantine on corruption).
- `/coherence:propose-*` reads the cache; no other surface mutates it.
**Amendment 2026-05-09 (audit pass):** the canonical `proposal-cache.json` schema is specified in DD-088 — top-level key is **`entries`** (NOT `items`); each entry carries the full lifecycle envelope `{ proposal_id, kind, state, state_history, surfaced_count, consecutive_ignored, last_signal_at, expires_at }`. The sketch above is retained as a contract preview only; DD-088 is authoritative.
---
## DD-076 — Bash-repetition threshold: 3 in 30 min, normalised, telemetry-tunable
**Status:** Ratified 2026-05-09 (defaults); numerical tuning gated on v0.1.x telemetry per protocol below.
**Decision:** Author-mode bash-repetition signal fires when the same *normalised* command appears ≥ 3 times within a 30-minute rolling window in the same session. Normalisation: strip arguments matching path / UUID / timestamp / numeric-id patterns; keep verb + flags + first positional shape (e.g. `git log --oneline -<N>` collapses to `git log --oneline -N`). Match key is the **DD-068 12-hex ****`signature_hash`** of the normalised string (single source of truth: `src/util/signatureHash.ts`).
**Defaults overridable** via `config.json` keys `author.bash_repetition.window_minutes` (default 30) and `author.bash_repetition.count` (default 3).
**Rationale:**
1. Conservative defaults bias toward false negatives — aligns with DD-065 trust model (better to under-propose than nag).
2. Normalisation prevents trivial argument variation from suppressing real patterns.
3. Hash-only storage preserves NFR-PRIVACY-4 (no raw command content).
4. 30-min window captures task-scoped repetition without crossing context boundaries.
**Alternatives:**
- *Rate-based (N/hour)* — noisier; doesn't match how users batch work.
- *Adaptive per-user percentile* — needs per-user history before any proposal can fire; cold-start unfriendly.
- *Telemetry-only (no defaults)* — leaves v0.2 with no working signal until 30+ days post-ship.
**Source signal:** OQ-v2-11 resolution; DD-068 telemetry events.
**Implications:**
- New per-session ring buffer in `.claude/coherence/signal-cache.json` (≤ 64 B/entry, capped at 500 entries/session, oldest-pruned).
- New metric `proposal_signal_observed { kind: bash_repetition, normalized_hash, would_have_fired, count, window_seconds }` — emitted regardless of whether threshold reached, for tuning.
- Hot-path cost: O(1) hash + O(log n) ring-buffer lookup at PostToolUse — within the v0.1 50ms p95 budget.
- Tuning protocol shared with DD-077/DD-078 (see below).
---
## DD-077 — File-creation pattern threshold: 3 files + structural similarity
**Status:** Ratified 2026-05-09 (defaults); numerical tuning gated on v0.1.x telemetry.
**Decision:** Author-mode file-creation signal fires when ≥ 3 files are created in the same session that satisfy ALL of:
1. **Locality:** same parent directory, or siblings under a common parent at the same depth.
2. **Structural similarity:** at least one of — (a) first-5-non-blank-lines SHA-256 match, (b) import-set Jaccard ≥ 0.8 (for source code with imports), (c) heading-hierarchy match for `.md` files (top-2 levels identical).
**Defaults overridable** via `config.json` keys `author.file_pattern.count` (default 3), `author.file_pattern.jaccard_min` (default 0.8).
**Rationale:**
1. Stricter than bash-repetition because file-creation proposals have higher friction (proposing a generator/template/skill).
2. Structural similarity prevents false positives on unrelated files in the same directory (e.g. unrelated test files).
3. Three independent similarity signals (lines / imports / headings) covers TS, Python, Markdown content classes without language-specific work.
4. Skeleton hash computed once per file at Write — cached for the session.
**Alternatives:**
- *Count-only* — too noisy; users create unrelated files in the same directory routinely.
- *Embedding-based clustering* — heavy compute; out-of-scope for v0.2 hot path; revisit v0.3 if precision insufficient.
- *Filename-pattern only* — misses semantic similarity; users name files inconsistently.
**Source signal:** OQ-v2-12 resolution.
**Implications:**
- New `signal-cache.json` schema entry under `file_creation` per DD-089: `{ path_template_hash, count, first_seen, last_seen, jaccard_buckets: [{ evidence: "lines"|"imports"|"headings", value }] }` (\~200 B/file, capped at 200 entries/session).
- New metric `proposal_signal_observed { kind: file_creation, parent_hash, similarity_evidence: ["lines"|"imports"|"headings"], count, would_have_fired }`.
- Hot-path cost: \~5 ms/Write to compute hashes — within v0.1 PostToolUse 50ms p95 budget.
- Privacy: only hashes stored; no raw file content ever in `signal-cache.json` (NFR-PRIVACY-4).
**Amendment 2026-05-09 (audit pass):** kind name standardised to **`file_creation`** (was `file_pattern` in earlier drafts) — single canonical token used by DD-089 schema, the metric event payload, and the proposal-payload `kind` enum in DD-087. Field shape per DD-089: `{ path_template_hash, count, first_seen, last_seen, jaccard_buckets: [...] }` — the originally sketched `{ kind, parent, skeleton_hash, imports_set_hash, heading_hash, created_at }` is superseded; the three similarity hashes collapse into the `jaccard_buckets` discriminator.
**Amendment 2026-05-10 (similarity implementation — supersedes the three-evidence sketch above):** the three structural-similarity variants are now implemented as **independent Jaccard scores in matching token spaces**, with the detector taking `MAX(jStruct, jImport, jHead)` per pair. Implementation in `src/signal/fileCreation.ts`:
1. **Structural tokens** — first 5 non-blank lines whitespace-tokenised + lowercased.
2. **Import set** — extension-aware module-path extraction (TS/JS/MJS/CJS/JSX/TSX, Python, Rust, Go, C/C++/ObjC, Java/Kotlin/Scala, Ruby). Caps content scan at 8 KB.
3. **Heading hierarchy** — slash-joined ATX heading-path slugs for `.md`/`.markdown`/`.mdx`/`.rst` (slug = lowercase + non-alphanum collapse + 48-char cap). RST setext-underline (`=====`/`-----`) supported. Caps content scan at 16 KB.
Earlier draft `(a) first-5-non-blank-lines SHA-256 match` is superseded by Jaccard over the token set (SHA equality was too brittle for whitespace churn). Each variant runs in its own token space — comparing self-imports against other-file structural tokens (the disjoint-space bug from the original audit) is structurally impossible. Locality cache (`src/signal/fileLocalityCache.ts`) carries three parallel `Map<filePath, Set<string>>` for the detector to consume; cache is bounded at 256 entries FIFO and resets on `SessionStart`/`SessionEnd` per NFR-PRIVACY-by-construction. Variant winner is recorded as `jaccard_variant: 'structural' | 'import_set' | 'heading_hierarchy'` for v0.2.1 calibration telemetry. *Alternative rejected:* boolean OR over per-variant SHA-equality matches — produces no continuous score for the DD-092 calibration loop and cannot tune Jaccard cut-offs.
---
## DD-078 — Agent-output correction threshold: 5-min / 20% line-diff / 3 in 7d per-agent
**Status:** Ratified 2026-05-09 (defaults); numerical tuning gated on v0.1.x telemetry.
**Decision:** A *correction* is recorded when the user performs an Edit or Write that:
1. Targets a file/section produced or modified by an identifiable subagent (via v0.1 `SubagentAttribution` records, `src/subagent/tracker.ts:8-18`, written through `subagent-stats.json` and `subagent.window` in-memory window).
2. Occurs within **5 minutes** of the agent's last touch on that section.
3. Modifies **≥ 20%** of the agent's contributed lines (line-diff ratio over the agent's `lines_added` set, per the OQ-v2-24 amendment below — invocation-aggregate, not per-section).
Author-mode correction signal fires when **≥ 3 corrections target outputs from the same agent name within a 7-day rolling window**.
**Defaults overridable** via `config.json` keys `author.correction.window_minutes` (default 5), `author.correction.line_ratio_min` (default 0.2), `author.correction.rolling_window_days` (default 7), `author.correction.count` (default 3).
**Rationale:**
1. Reuses v0.1 subagent provenance — no new tracking infrastructure.
2. 5-minute window distinguishes reactive correction from later unrelated edit.
3. 20% line ratio threshold filters trivial typo fixes from substantive corrections.
4. 7-day rolling window matches DD-075's signal-recurrence horizon — same telemetry cadence.
5. Per-agent grouping enables targeted refinement proposals ("refine `refactor-bot` agent system prompt") rather than vague "agents are bad" signals.
**Alternatives:**
- *Any edit-after-agent-output* — absurdly noisy; users always polish.
- *Time-window only* — catches typo fixes; signal-to-noise too low.
- *Per-section corrections instead of per-agent* — doesn't aggregate to actionable proposals.
**Source signal:** OQ-v2-13 resolution; v0.1 DD-022/DD-023 subagent provenance.
**Implications:**
- Computation deferred to SessionEnd (off PostToolUse hot path; aligns with v0.1 SessionEnd persistence).
- Per-agent rolling counter persisted in **`signal-cache.json`**** under ****`agent_correction`** (DD-089's unified schema), NOT in `subagent-stats.json`. `subagent-stats.json` retains its v0.1 acceptance/rejection counts unchanged. Earlier drafts that placed the counter inside `subagent-stats.json` are superseded — splitting prevents the v0.1 `subagent-stats.schema.json` enum from needing to widen for a v0.2-only field.
- New metric `proposal_signal_observed { kind: agent_correction, agent_name, agent_response_id_hash, line_ratio, would_have_fired }`.
- Privacy: agent name (already in v0.1 frontmatter), correction count, `agent_response_id` hash (DD-068). No diff content stored.
**Amendment 2026-05-09 (OQ-v2-24):** the original DD assumed line-level subagent provenance ("≥ 20% of the agent's contributed lines in a section"). v0.1 `src/subagent/tracker.ts:8-18` only records **invocation-aggregate** `lines_added` / `lines_removed` (whole-invocation totals across all `tool_calls`) plus `files_touched` — no per-file or per-section line ranges. Threshold reformulated against the shipped provenance shape: trigger on `(corrective_edit.lines_added + corrective_edit.lines_removed) ≥ 0.20 × (invocation.lines_added + invocation.lines_removed)` **AND** the corrective edit touches a path in `invocation.files_touched`, within the existing 5-min window, accumulated to 3 occurrences per agent in the 7-day rolling window. *Alternative rejected:* request a v0.1.x amendment to record per-file `tool_calls[].lines_added` ranges — the host-capability dependency (`subagent_attribution=true` + `invocation_id`) is fragile and the line-range data is not always emitted by Claude Code; reformulating against invocation-aggregate counts removes the dependency entirely.
**Amendment 2026-05-09 (audit pass 2) — invocation_id dependency clarification:** the OQ-v2-24 wording "removes the dependency entirely" was overclaim. The reformulation eliminates only the *line-range data* dependency, not the `invocation_id` *correlation* dependency — DD-089's `agent_correction` entry remains keyed by `invocation_id` and DD-090 retains `subagent_invocation_id_emitted: boolean` as the host-capability gate. **Degraded mode when ****`subagent_invocation_id_emitted = false`****:** the `agent_correction` signal kind is disabled for the session; `proposal_signal_observed { kind: agent_correction, ... }` is not emitted; `/coherence:doctor` flags this as a soft-degradation. The `bash_repetition` and `file_creation` signals are unaffected. *Alternative rejected:* fall back to `agent_name + first_corrective_edit_at` as a synthetic key — collides on multi-invocation sessions with the same agent (extremely common), producing false-positive thresholds.
**Amendment 2026-05-10 (burst window promoted from calibration-only to hard gate):** the original DD-078 (and the v0.2-alpha implementation per audit M9-A) computed `burst_count` only as a telemetry field; the 5-min window was advertised but did not gate firing. Three corrections spread over a 7-day cardinality window with no two within 5 min still fired the signal — the canonical "stale corrections weeks apart" false positive. Resolved 2026-05-10 by promoting the burst window to a **hard gate** (`requireBurst`, default `true`) in `src/signal/agentCorrection.ts`:
- Firing requires **AT LEAST ****`occurrenceCount`**** qualifying samples to fall inside the 5-min sliding burst window**, not just inside the 7-day cardinality window.
- Sliding-window scan is `O(n)` over per-agent qualifying samples; cost negligible at SessionEnd.
- Escape hatch `requireBurst: false` (config key `agent_correction_require_burst`, default `true`) restores pre-amendment behaviour for cassette replay / DD-092 calibration backtesting.
- Wired through `src/hooks/sessionEnd.ts` which now reads `CoherenceConfig.agent_correction_*` overrides and forwards them to the detector. The synth `CorrectionSample[]` built from the v0.1 `subagent-stats.json` aggregate still has all samples at `i.last_seen` (single instant), so legitimate bursty corrections continue to fire while cardinality-only patterns are suppressed.
*Alternative rejected:* keep burst as telemetry-only and let DD-092 calibration tighten the 7-day window instead — would require an order-of-magnitude lower threshold (effectively a 1-day window) to suppress stale-spread corrections, which then under-counts genuine bursty corrections that span a workday boundary. The burst-window gate is structurally cheaper.
---
## Common tuning protocol for DD-076 / DD-077 / DD-078
All three Author-mode detection thresholds share the same v0.1.x → v0.2.0 calibration loop:
1. **v0.1.x ships** with the DD-068 telemetry events plus `proposal_signal_observed { kind, would_have_fired }` for each of the three kinds. Initial defaults from DD-076/077/078 are encoded in code paths but no proposals are surfaced (v0.1 has no Author mode).
2. **30-day observation window** post-v0.1.x release: aggregate `proposal_signal_observed` events from opt-in telemetry (`/coherence:share-metrics --anonymized`). For each kind, compute would-have-fired count distribution.
3. **v0.2.0 calibration:** for each kind, choose threshold where projected precision (estimated user-accept rate from v0.2-alpha cohort) ≥ 0.7. If insufficient data, ship with conservative defaults from this DD and tighten in v0.2.1.
4. **Documented in CHANGELOG** with sample size, threshold deltas, and confidence interval.
This decouples *shipping v0.2* from *tuning v0.2* — design lands now; numbers refine without spec churn.
---
## DD-073 — Annotate-mode opt-in: hybrid (global mode + denylist + per-doc command)
**Status:** Ratified 2026-05-09
**Decision:** Annotate-mode opt-in is layered:
1. **Global mode** flipped via `/coherence:graduate annotate` (DD-074) — enables annotation proposals across the project, respecting `coherence/ignore`.
2. **Denylist refinement** via `coherence/ignore` — inherited from v0.1; no new config surface.
3. **Per-doc one-off** via `/coherence:annotate <path>` — produces a single annotation proposal for the specified doc, regardless of global mode.
Every annotation still passes through the proposal queue (DD-065) and is bounded by `annotate_calls_per_session` (DD-069). No file is mutated without explicit user-accept.
**Rationale:**
1. Three layered opt-ins match the three mental models users actually use ("turn it on", "except for this dir", "just this one file now").
2. Reuses v0.1's existing ignore engine — no new config parser.
3. Per-doc command supports the discovery flow: user types it on a specific file they want anchored, sees a proposal in the queue.
4. Global default remains `observe` (v0.1 carry-forward).
**Alternatives:**
- *Global flag only* — too blunt; users invariably want per-dir exceptions.
- *Per-directory allowlist file* — doubles config surface vs. reusing `coherence/ignore`.
- *Per-doc only* — high friction; users opt out of annotating altogether.
**Source signal:** OQ-v2-07 resolution; v0.1 NFR-PRIVACY-5 / `coherence/ignore` semantics.
**Implications:**
- New slash command `/coherence:annotate <path>`.
- `/coherence:graduate annotate` (DD-074) maps to mode flip persisted in `graduation.json`.
- New metric `annotate_invocation { source: global|per_doc, path }`.
- v0.1 spec impact: zero.
**Amendment 2026-05-09 (OQ-v2-19):** per-doc `/coherence:annotate <path>` **respects** `coherence/ignore`. If the target path matches an `ignore` entry, the command refuses with explicit error `path is in coherence/ignore — remove the entry to annotate` and emits `annotate_blocked { reason: 'ignored' }`. **Rationale:** `PathFilter` (`src/detection/pathFilter.ts:28`) is the single privacy boundary (NFR-PRIVACY-5) protecting `.env`, secrets, `node_modules/**`, etc. Per-doc opt-in overrides *global mode*, not *privacy filters*. *Alternative rejected:* silent bypass — would let a user accidentally LLM-process a secret by typing its path. The user can edit `coherence/ignore` if the file truly should be processed.
---
## DD-074 — `/coherence:graduate` scope: global / per-directory / per-doc with persistent mapping
**Status:** Ratified 2026-05-09
**Decision:** `/coherence:graduate <mode> [<path>]` accepts an optional scope argument:
- No path → global mode flip (requires confirmation prompt).
- Path = directory → mode applies to all docs under that directory.
- Path = file → mode applies to that specific doc.
- `/coherence:graduate --status` → prints current per-scope mode mapping.
Mapping persisted in new `.claude/coherence/graduation.json`. Lookup is O(log n) via path-prefix match, cached per session. Most-specific scope wins (per-doc \> per-dir \> global).
**Hard invariant:** Graduation only changes whether *proposals are generated for a scope*, never whether they're auto-applied. DD-065's quarantine boundary is preserved at every mode level (Observe / Annotate / Author).
**Rationale:**
1. Three scope levels match user mental models without overwhelming.
2. Per-doc/per-dir grants let users dogfood Annotate or Author mode in a sandbox before committing project-wide.
3. Persistent mapping means SessionStart respects prior graduations; no re-prompt fatigue.
4. The hard invariant prevents graduation from being weaponised to silently turn on auto-apply.
**Alternatives:**
- *Global only* — forecloses sandbox dogfooding.
- *No persistence (per-session)* — forces users to re-graduate every session, friction city.
- *Implicit auto-apply at higher modes* — violates DD-065. Hard no.
**Source signal:** OQ-v2-09 resolution; DD-065 trust invariant.
**Implications:**
- New `graduation.json` schema: `{ schema_version, global_mode, scopes: [{ path, mode }] }`.
- New mode enum: `observe` (default), `annotate`, `author`.
- `host-capabilities.json` unchanged; mode lookup is plugin-local.
- `/coherence:status` surfaces effective mode for the current cwd.
- Confirmation prompt template lives in slash-command implementation, not stored.
---
## DD-075 — Proposal expiry: 14-day fence + 7-day signal-recurrence + consecutive-ignored counter
**Status:** Ratified 2026-05-09
**Decision:** A proposal is dropped from the queue when ANY of these conditions is true:
1. **Time fence:** `now - generated_at ≥ 14 days` (matches v0.1 `pending.md` staleness fence FR-BUFFER-7).
2. **Signal-recurrence fence:** the originating signal entry's `last_seen` in `signal-cache.json` is older than 7 days (i.e. the pattern that produced the proposal seems to have been a one-off). The signal-cache lookup is keyed via the proposal's `signal_refs` field (DD-087); `metrics.jsonl` is not scanned by this fence — only the per-kind signal-cache section (`bash_repetition` / `file_creation` / `agent_correction`) is consulted.
3. **Consecutive-ignored counter:** the proposal has survived `≥ N` consecutive Stops at which the user neither accepted nor rejected it via `/coherence:propose-*`. `N` is configurable, default `5`. Counter resets to 0 on user view via the slash command (analogous to v0.1 DD-051 consecutive-defer reset on content change).
Dropped proposals are logged to `coherence-log.md` with reason; `/coherence:status` surfaces a per-session drop count.
**Rationale:**
1. Time fence prevents indefinite queue growth.
2. Signal-recurrence fence prevents one-off accidents from polluting the queue.
3. Consecutive-ignored counter handles the user who actively dismisses the queue without engaging — plugin learns to back off.
4. All three fences mirror v0.1 invariants users already understand (FR-BUFFER-7, DD-051), keeping the mental model consistent.
**Alternatives:**
- *Never expire* — queue becomes noise; success metric "time-to-decision" becomes meaningless.
- *Time-only* — misses the one-off-pattern case.
- *Git-branch-change-based* — surprising; users review across branches.
**Source signal:** OQ-v2-08 resolution; v0.1 FR-BUFFER-7, DD-051.
**Implications:**
- Expiry sweep at SessionStart, after migration step, before re-validation. One scan over `proposal-cache.json`.
- New metric `proposal_expired { reason: time|signal|ignored, kind }`.
- New config keys: `proposal_expiry_days = 14`, `proposal_signal_recurrence_days = 7`, `proposal_consecutive_ignore_threshold = 5`.
- `/coherence:propose-*` UX shows per-item time-to-expire and ignore-count badges.
**Amendment 2026-05-09 (OQ-v2-22):** the consecutive-ignored counter is **independent of signal recurrence** — recurrence does NOT reset the counter. Reset triggers (counter → 0) are limited to: explicit user view via `/coherence:propose-list` or `/coherence:propose-show <id>`, and terminal actions `/coherence:propose-accept` / `/coherence:propose-reject`. **Rationale:** signal recurrence on an already-surfaced proposal is *evidence the user is choosing to live with the pattern*, not evidence the proposal has new value; resetting on recurrence creates an unkillable nag loop on monorepos with hot bash patterns (e.g. `package.json` script loops). The existing 7-day signal-recurrence fence (separate mechanism above) already protects bursty-then-quiet patterns from premature drop. *Alternative rejected:* reset-on-recurrence — degrades to a notification-spam vector on noisy projects.
---
## DD-079 — Reserved (intentional numbering gap)
**Status:** Reserved 2026-05-09 (audit pass 2). **Not assigned.** During v0.2 OQ resolution the slot was tentatively held for an OQ-v2-30 consolidation that was ultimately absorbed into DD-080 (state-schema bump). The slot is left unused rather than re-numbered to preserve `coherence-log.md` audit-log stability for any v0.2-alpha entry that already cited a DD index. Future v0.x DDs MUST NOT reuse DD-079 — allocate from DD-093 onward.
---
## DD-080 — v1 → v2 state-schema bump: single coordinated migrator
**Status:** Ratified 2026-05-09
**Decision:** A single `src/state/migrate/v1_to_v2.ts` migrator slotted into the existing chain at `src/state/migrate/index.ts:46` (the `// Future: if (schemaVersion < 2)` placeholder) performs the entire v1 → v2 bump atomically. Steps:
1. Bump `version.json.schema_version` → 2 with a `prior_versions` entry recording v1.
2. Widen `BufferEntry.source` enum (`drift-buffer.schema.json`) to add `'trickle_deep_scan' | 'annotate' | 'author'` — pure additive enum widening, no data rewrite.
3. Widen `CostEntry.stage` enum (`cost-ledger.schema.json`) to add `'author' | 'annotate'` — pure additive enum widening, no data rewrite.
4. Create empty state files with `schema_version: 2`: `graduation.json`, `proposal-cache.json`, `signal-cache.json`, `scan-cache/state.json`, `state-snapshot.json`.
5. Extend `SCHEMA_NAMES` and `FILE_TO_SCHEMA` arrays in `src/state/stateStore.ts:18-39` to register the five new schemas.
Failure mode reuses the v0.1 quarantine policy from `src/state/migrate/v0_to_v1.ts` (quarantine corrupt/old file, write fresh default, log, continue per FR-FAILURE-2).
**Rationale:**
1. Linear chain matches the pattern v0.1 explicitly designed for.
2. Atomic bump keeps post-crash recovery reasoning to a single state.
3. Additive enum widening + empty-file creation are both safe under partial failure.
**Alternatives:**
- *Per-file migrators chained per state file* — 5 independent failure-recovery surfaces, 5 quarantine paths, no isolation benefit.
- *Lazy / on-first-write migration* — interacts badly with `/coherence:doctor` invariant checks.
**Source signal:** OQ-v2-31 resolution (and absorbs OQ-v2-18); v0.1 `src/state/migrate/v0_to_v1.ts` precedent.
**Implications:**
- One new file: `src/state/migrate/v1_to_v2.ts`.
- Edits: `src/state/migrate/index.ts` (chain entry), `src/state/stateStore.ts` (registration), three schema files (enum widening).
- Tests: extend `tests/unit/state/migrate.test.ts` with v1→v2 fixtures (corrupt, missing, well-formed cases).
- `CURRENT_VERSION` constant in `src/state/migrate/index.ts` bumps to 2.
- New metric `migration_completed { from: 1, to: 2, duration_ms }`.
---
## DD-081 — Proposal acceptance UX: dedicated slash-command set
**Status:** Ratified 2026-05-09
**Decision:** Per-kind, kind-agnostic slash commands form the explicit-accept surface promised by DD-065:
- `/coherence:propose-list [--kind <k>]` — read-only browser, lists `state ∈ {queued, surfaced}` entries from `proposal-cache.json` with id, kind, age, ignore-count. **Triggers the ****`queued → surfaced`**** state transition (DD-088) for any entry not yet surfaced, and increments ****`surfaced_count`**** for entries already in ****`surfaced`****.** Resets `consecutive_ignored → 0` per DD-075 amendment.
- `/coherence:propose-show <id>` — diff preview (the `body` field of the proposal); does not transition state. **Resets ****`consecutive_ignored → 0`**** (per DD-075 amendment) but does NOT increment ****`surfaced_count`**** — surface counting is owned exclusively by ****`propose-list`**** to keep the metric meaningful (“how many list views did this entry survive”).**
- `/coherence:propose-accept <id> [--rename <new>] [--overwrite]` — applies the proposal (writes the file, transitions state to `accepted`, emits `[coherence] accept proposal <id>` git commit). Collision behaviour per DD-082.
- `/coherence:propose-reject <id> [--reason <text>]` — terminal rejection; logs reason to `state_history` (DD-088).
Mirrors v0.1 slash-command precedent (`src/commands/enableSidecars.ts`, `src/commands/recover.ts`).
**Rationale:**
1. Slash commands are the only stable, non-interactive UX surface in Claude Code.
2. Splitting list/show/accept/reject keeps each command minimal and testable.
3. Composes cleanly with DD-082 (collision flags) and DD-083 (revert) without UX redesign.
**Alternatives:**
- *Interactive picker* — Claude Code has no stable picker API.
- *Auto-accept on prompt confirmation* — violates DD-065 trust boundary.
- *Single **`/coherence:proposal <verb>`** umbrella command* — argument-parsing surface area worse than four small commands; harder to autocomplete.
**Source signal:** OQ-v2-14 resolution.
**Implications:**
- Four new files under `src/commands/proposeList.ts`, `proposeShow.ts`, `proposeAccept.ts`, `proposeReject.ts`.
- Wire into `plugin.json` slash-command registry.
- New metrics: `proposal_listed`, `proposal_shown`, `proposal_accepted`, `proposal_rejected` (each `{ kind }`).
- Composes with DD-088 state machine (transitions enforced inside `proposalStore`).
---
## DD-082 — Name-collision policy: refuse + `--rename` / `--overwrite` flags
**Status:** Ratified 2026-05-09
**Decision:** When `/coherence:propose-accept <id>` would write to a path that already exists (e.g. `.claude/skills/<name>/SKILL.md`, `.claude/agents/<name>.md`):
1. **Default behaviour:** refuse, emit `proposal_acceptance_blocked { reason: 'name_collision', existing_path }` to `metrics.jsonl`, return error message listing the collision and the two resolution flags.
2. **`--rename <new-name>`** (preferred): re-target the proposal write to the renamed path, validate the renamed path also doesn't collide, accept normally.
3. **`--overwrite`**: requires the user to retype the *exact target path* as a positional confirmation argument (`/coherence:propose-accept <id> --overwrite <retyped-path>`). Mirrors the user-confirmation pattern in `src/commands/enableSidecars.ts`. Backs up the existing file via a new `quarantineUserFile()` helper added to `src/state/quarantine.ts` (sister to the existing `quarantineFile()` which is reserved for state-file corruption recovery; see naming amendment below).
The plugin **never silently overwrites**. Plugin-managed sidecars (the `.claude/coherence/sidecars/<name>.yaml` outputs of DD-043 `enableSidecars`) are not exempt — same flag-driven flow.
**Rationale:**
1. Preserves the DD-065 trust boundary (user explicitly chooses every overwrite).
2. Flag-driven rather than prompt-driven because slash commands are non-interactive in Claude Code.
3. Re-typed-path confirmation for `--overwrite` makes accidents structurally unlikely.
**Alternatives:**
- *Prompt for choice* — slash commands cannot interactively prompt; would block the command.
- *Auto-rename with numeric suffix* — silently reshapes the user's namespace; surprising.
**Source signal:** OQ-v2-15 resolution; `src/commands/enableSidecars.ts` `skipped` semantics.
**Implications:**
- Collision check lives in `proposeAccept.ts` before any FS write.
- New metric event `proposal_acceptance_blocked { reason, existing_path_hash }` (path is hashed for privacy in `--anonymized`).
- Quarantine of overwritten files mirrors v0.1 `quarantineFile()` behaviour — always recoverable.
**Helper-naming amendment 2026-05-09 (audit pass 2):** to keep the v0.1 contract clean, a new sibling helper **`quarantineUserFile(path)`** is added to `src/state/quarantine.ts`. The existing `quarantineFile()` retains its v0.1 semantics (state-file corruption recovery, target dir `.claude/coherence/quarantine/`). `quarantineUserFile()` writes to `.claude/coherence/proposals/_overwrite-backups/<timestamp>-<basename>` so accept-overwrite backups don't co-mingle with state-corruption artefacts. Both helpers share the atomic temp+rename primitive but their target dirs and audit-log channels are distinct.
---
## DD-083 — Proposal revert via `git revert` + reuse of `revertDetect`
**Status:** Ratified 2026-05-09
**Decision:** `/coherence:propose-revert-acceptance <id>` performs `git revert` of the original `[coherence] accept proposal <id>` commit, producing a standard `[coherence-revert]` commit on the active branch. The proposal entry in `proposal-cache.json` transitions to terminal state `reverted` (DD-088); it does not re-surface in `propose-list`. v0.1 `revertDetect` (`src/detection/revertDetect.ts`, ≥80% line-removal heuristic over `[coherence]`-prefixed commits) picks up the revert automatically — **no new pipeline**.
**Rationale:**
1. `git revert` keeps the audit trail intact (NFR-OBS-1).
2. Reuses the v0.1 revert detector; no duplicate logic.
3. Terminal `reverted` state prevents the revert-then-re-propose loop a user might find surprising.
**Alternatives:**
- *In-place file deletion + cache rewrite* — bypasses git audit trail; conflicts with NFR-OBS-1.
- *Allow re-acceptance after revert* — invites infinite-loop accept/revert cycles; explicit user re-graduation is cleaner.
**Source signal:** OQ-v2-16 resolution.
**Implications:**
- One new file: `src/commands/proposeRevertAcceptance.ts`.
- New metric `proposal_reverted { kind, accept_age_minutes }`.
- DD-088 state machine adds `accepted → reverted` edge; `reverted` is terminal.
- No additive load on `revertDetect.ts`; only the v0.1 commit-message pattern matters.
---
## DD-084 — Snapshot debounced writer with regression-gate cell
**Status:** Ratified 2026-05-09
**Decision:** `state-snapshot.json` (introduced by DD-070 for the statusline badge) is written by a **debounced writer** instead of synchronously by every hook:
1. Each hook that mutates statusline-visible state sets an in-process dirty bit (no FS I/O).
2. The debounced writer flushes when ALL of: (a) dirty bit is set, (b) ≥5 s have elapsed since the last flush, (c) `lockManager` (`src/state/locks.ts`) lock named `state-snapshot` is acquired (non-blocking; skip on contention).
3. **Forced flush** at `Stop`, `SubagentStop`, `SessionEnd` (lifecycle moments where the badge must be current).
**Performance budget (regression gate):**
- Snapshot write: **≤5 ms p95 isolated** measured via new cell in `tests/perf/regression-gate.test.ts`.
- PostToolUse hot path: **0 ms attributed to snapshot work** (only the dirty-bit set; verified by harness).
- Inherits NFR-PERF-1 (50 ms p95 PostToolUse) — no regression permitted.
**Rationale:**
1. PostToolUse runs \~100/min on active sessions; even 1 ms synchronous write compounds tail latency.
2. ≥5 s debounce + lifecycle flushes give a worst-case staleness of 5 s, well under human-perceptible statusline lag.
3. Reusing existing `lockManager` keeps multi-process safety identical to other state files.
**Alternatives:**
- *Synchronous write per hook* — explicitly rejected in DD-070 amendment for NFR-PERF-1 risk.
- *Background thread / worker* — Node single-thread + no plugin-managed worker pool; debounced setImmediate is the idiomatic fit.
**Source signal:** OQ-v2-20 resolution; DD-070 amendment.
**Implications:**
- New module `src/observability/snapshotWriter.ts` (debounced flush + dirty-bit registry).
- New regression-gate test cell `state-snapshot write`.
- New baseline entry in `tests/perf/baseline.json`.
- Lock name `state-snapshot` added to `src/state/locks.ts` registry.
---
## DD-085 — NFR-COST-v0.2: unified per-session ceiling = v0.1 baseline × 1.30
**Status:** Ratified 2026-05-09
**Decision:** v0.2 introduces a single top-level cost ceiling enforced by `CostLedger` (`src/llm/costLedger.ts`):
- **Per-session cost ceiling** = `v0.1 NFR-COST-1 baseline × 1.30` — i.e. v0.2 features may add at most +30% over v0.1 cost.
- **Per-feature allocation of the +30% headroom:**
	- Author pipeline ≤ **60%** (3 calls × ≤10 k tokens each, per DD-067).
	- Annotate pipeline ≤ **30%** (5 calls × ≤2 k tokens, per DD-069).
	- Trickle deep-scan ≤ **10%** (no LLM in v0.2-alpha; reserved for v0.2-beta, per DD-066).
- **Enforcement:** before each Author/Annotate LLM call, `CostLedger.totalCostUsd()` is compared against the per-feature share of the ceiling. On overrun, the plugin transitions to **no-LLM mode for the remainder of the session** and emits `cost_ceiling_hit { feature, total_usd, ceiling_usd }`. Per-feature partition is computed from the new `CostEntry.stage` enum values introduced by DD-080.
**Rationale:**
1. Per-feature caps without a global cap let v0.1 cost silently regress when all features hit their per-feature ceilings simultaneously (worst case +220% over v0.1).
2. Single ceiling is auditable and CHANGELOG-friendly.
3. 60/30/10 split tracks observed v0.2-alpha cost mix; revisable in v0.2.1 without spec churn.
**Alternatives:**
- *Per-feature caps only* — silent regression risk above.
- *No global cap; rely on user vigilance* — abdicates NFR-COST inheritance.
- *Hard kill at ceiling instead of degrade-to-no-LLM* — kills useful in-flight non-LLM work; degraded mode (DD-061 precedent) is safer.
**Source signal:** OQ-v2-23 resolution; DD-067 / DD-069 / DD-076 / DD-077 cost partitions.
**Implications:**
- `CostLedger` gains `ceilingForFeature(stage)` and `wouldExceedCeiling(stage, projected)` methods.
- New config key `cost_ceiling_multiplier = 1.30` (overridable per project).
- New metric `cost_ceiling_hit { feature }`; degraded-mode entry is logged via existing `degraded_mode_entered` event.
- Composes with DD-091 (Author/Annotate prompt-version partition).
---
## DD-086 — `share-metrics` redaction extension; egress deferred to v0.3
**Status:** Ratified 2026-05-09
**Decision:** v0.2 extends the existing `anonymizeRecord()` allowlist in `src/commands/shareMetrics.ts:24-50` to cover the three DD-068 telemetry events end-to-end:
1. `tool_invocation_signature` — pass-through (`signature_hash`, `tool` already in allowlist).
2. `user_prompt_signature` — pass-through (`length_bucket`, `refers_to_prior` already covered); `prior_response_id` defensively hashed (already wired).
3. `agent_response_id` — `response_id` defensively hashed (already wired); pass-through `length_bucket`, `source`.
A fixture-driven test (`tests/unit/commands/shareMetrics.dd068.test.ts`) asserts no raw command, path, or prompt text appears in `--anonymized` output for each of the three event types. The user-confirmation gate (`requiresConfirmation: true` flow at `shareMetrics.ts:60-72`) is unchanged.
**Egress is deferred to v0.3** under a separate command (provisional `/coherence:upload-metrics`) — v0.2 retains the file-write-only surface; no v0.2 NFR-PRIVACY-4 amendment needed.
**Rationale:**
1. Local file-write surface already exists; redaction extension is additive and tiny.
2. Egress brings TLS pinning, retention, GDPR/erasure, and audit-log requirements with no v0.1 precedent — squarely a v0.3 concern.
3. Calibration loop (DD-076 / 077 / 078 tuning per common protocol) only requires that opt-in users can hand-deliver the anonymised file — egress is convenience, not capability.
**Alternatives:**
- *Ship opt-in HTTPS upload in v0.2* — blocks BRD on privacy/legal review.
- *Open-typed allowlist (regex-only redaction)* — drifts as new event types are added; closed allowlist forces every new event to consciously opt into redaction strategy.
**Source signal:** OQ-v2-17 resolution.
**Implications:**
- One file edit (`src/commands/shareMetrics.ts`); one new test file.
- Documentation update in `docs/privacy.md` enumerating the v0.2 event redaction matrix.
- Provisional v0.3 DD slot reserved for `/coherence:upload-metrics`.
---
## DD-087 — `proposal.schema.json` — Author pipeline output schema
**Status:** Ratified 2026-05-09
**Decision:** New `src/state/schemas/proposal.schema.json` (draft-07, `$id: "coherence/proposal"`, `additionalProperties: false`), mirroring the closed-schema pattern of `plan.schema.json`. **Required fields:**
- `proposal_id` — UUID v4.
- `kind` — enum `'skill' | 'agent' | 'command' | 'annotation'` (singular nouns; canonical token set used uniformly across DD-072 directory names, DD-067 prompt names, and DD-088 state-machine entries — see canonical naming amendment below).
- `created_at` — ISO-8601 UTC.
- `signal_refs` — array of `signal-cache.json` entry ids that triggered the proposal (backref for DD-075 expiry and DD-088 audit).
- `proposed_path` — string, project-relative.
- `body` — string, the [SKILL.md](http://SKILL.md) / [AGENT.md](http://AGENT.md) / slash-command-md / annotation diff content.
- `prompt_version` — `{ author?: string, annotate?: string }` (exactly one populated, matching the pipeline that produced the proposal; partition of DD-091).
- `cost_usd` — number ≥ 0.
- `validation` — `{ name_collision: boolean, hallucination_grep_passed: boolean }` (results of pre-write checks).
Schema is registered through DD-080 in `SCHEMA_NAMES` / `FILE_TO_SCHEMA`. Validation runs at the proposal-cache writer (mirrors `StateStore.write` pattern at `src/state/stateStore.ts`) and on `/coherence:propose-show` read.
**Rationale:**
1. Closed schema + AJV catches LLM-output drift at the boundary (the v0.1 lesson from `plan.schema.json` and `cost-ledger.schema.json`).
2. `signal_refs` backref makes expiry (DD-075) and revert audit (DD-083) trivially traceable.
3. `validation` block is captured at proposal-creation time so re-validation on accept can detect underlying-state drift.
**Alternatives:**
- *Open-typed proposal payload* — schema drifts with each prompt revision; blocks AJV.
- *Inline schema in **`proposal-cache.schema.json`* — couples lifecycle (DD-088) to payload (DD-087); harder to evolve independently.
**Source signal:** OQ-v2-25 resolution; DD-067 reference.
**Implications:**
- One new schema file; registered via DD-080.
- Author pipeline emits validated proposals; on validation failure, the proposal is dropped and `proposal_validation_failed { reason }` is logged.
- `tests/schema/proposal.schema.test.ts` fixture-tests valid + invalid proposals.
**Canonical kind naming amendment 2026-05-09 (audit pass 2):** v0.2 standardises **one** kind token set used uniformly across surfaces:
- **Canonical kind tokens (singular nouns):** `skill`, `agent`, `command`, `annotation`.
- **Directory layout (DD-072):** `proposals/<kind>/<id>/` — i.e. `proposals/skill/`, `proposals/agent/`, `proposals/command/`, `proposals/annotation/` (singular, matching kind verbatim). Earlier plural drafts (`skills/`, `agents/`, `commands/`, `annotations/`) are superseded.
- **Prompt names (DD-067 / DD-091):** `propose-skill`, `propose-agent`, `propose-command`, `propose-annotation`. Earlier drafts using `propose-skill / propose-agent / propose-command` plus a separately-named annotate prompt are unified.
- **Slash commands (DD-081):** the `--kind` flag accepts the same canonical token set.
- **`signal-cache`**** kinds (DD-089) are a separate vocabulary** (`bash_repetition`, `file_creation`, `agent_correction`) and intentionally do not overlap — signals are not 1:1 with proposal kinds.
Affected DDs (DD-067, DD-072, DD-081, DD-091) read through this canonicalisation.
---
## DD-088 — `proposal-cache.json` schema + lifecycle state machine
**Status:** Ratified 2026-05-09
**Decision:** New `src/state/schemas/proposal-cache.schema.json` (draft-07, `additionalProperties: false`). **Top-level shape:** `{ schema_version: 2, entries: [...] }`. **Each entry:**
```javascript
{ proposal_id, kind, state, state_history: [ { state, at, reason? } ],
  surfaced_count, consecutive_ignored, last_signal_at, expires_at }
```
**State machine** (terminal states marked `*`):
- `queued → surfaced` on first `/coherence:propose-list` view that includes the entry.
- `surfaced → accepted*` on `/coherence:propose-accept` (gated by DD-082 collision check).
- `surfaced → rejected*` on `/coherence:propose-reject`.
- `surfaced → expired*` on DD-075 fences (time, signal-recurrence, or consecutive-ignored).
- `accepted → reverted*` on DD-083 `/coherence:propose-revert-acceptance`.
**Illegal transitions** (e.g. `rejected → accepted`) raise `ProposalStateError` and quarantine the file via `src/state/quarantine.ts` (mirrors `StateStore.read` quarantine path).
`state_history` is **append-only** — every transition appends `{ state, at, reason? }`; no edits, no deletions. Mirrors `coherence-log.md` audit-trail policy (NFR-OBS-1).
**Rationale:**
1. Explicit state machine makes lifecycle bugs structural, not behavioural.
2. Append-only history is the project's standard audit pattern (`coherence-log.md`, `observations.md`).
3. Quarantine on illegal transition keeps a corrupt cache from cascading.
**Alternatives:**
- *Flat **`state`** field, no history* — impossible to debug expired proposals or audit revert chains.
- *Three separate caches by terminal-state* — multiplies lock surface for no win.
**Source signal:** OQ-v2-26 resolution; DD-072 sketch; v0.1 `coherence-log.md` precedent.
**Implications:**
- New schema file; registered via DD-080.
- New module `src/state/proposalStore.ts` enforcing the state machine.
- New metric `proposal_state_transition { from, to, reason? }`.
- DD-075 expiry sweep writes via this module — never raw-edits the cache.
---
## DD-089 — `signal-cache.json` unified discriminated-union schema
**Status:** Ratified 2026-05-09
**Decision:** New `src/state/schemas/signal-cache.schema.json` (draft-07, `additionalProperties: false`). **Unified shape** with discriminated-union per signal kind, mirroring the discriminated-union pattern in `src/state/metrics.ts:7-22`:
```javascript
{ schema_version: 2,
  bash_repetition:  { entries: [ { signature_hash, count, first_seen, last_seen, sessions: [...] } ], maxItems: 500 },
  file_creation:    { entries: [ { path_template_hash, count, first_seen, last_seen, jaccard_buckets: [...] } ], maxItems: 500 },
  agent_correction: { entries: [ { invocation_id, agent_name, corrective_edits: [ { at, lines_ratio, file_overlap } ], count } ], maxItems: 200 } }
```
**Retention:** 7-day rolling window (matches DD-078 longest window). Entries with `last_seen < now - 7d` are pruned by a sweep on `SessionEnd`.
**Lock policy:** all writes through `lockManager` (`src/state/locks.ts`) under a single lock named `signal-cache` — per-kind contention is negligible at the rates DD-076 / DD-077 / DD-078 specify.
**`maxItems`**** caps** are conservative bounds that protect Author-pipeline candidate-set explosion and feed the DD-085 cost ceiling.
**Rationale:**
1. One file, one lock, one migration entry — minimum surface for three logically-coupled signals.
2. Discriminated union keeps each kind's payload independent without splitting files.
3. Hard `maxItems` is a circuit-breaker, not a tuning knob.
**Alternatives:**
- *Three separate cache files* — triples lock surface, migration count, and quarantine paths for no isolation benefit.
- *Unbounded entries with TTL only* — memory blowup risk on monorepos.
**Source signal:** OQ-v2-27 resolution; DD-076 / DD-077 / DD-078 references.
**Implications:**
- New schema file; registered via DD-080.
- New module `src/signals/signalStore.ts` (writers for the three kinds, sweep on SessionEnd).
- Lock name `signal-cache` registered in `src/state/locks.ts`.
- Pruning sweep emits `signal_cache_pruned { kind, removed }`.
---
## DD-090 — `host-capabilities.json` v0.2 field enumeration
**Status:** Ratified 2026-05-09
**Decision:** Amend `src/state/schemas/host-capabilities.schema.json` to add three v0.2 fields. **All optional** (preserves v0.1 round-trip; existing v0.1 cached probes stay valid; `additionalProperties: false` is preserved):
- `claude_url_scheme_supported` — `boolean`. True if the host exposes a `claude://run/<command>` URI scheme handler (DD-071 tier 1). Probed at `/coherence:install-statusline` and refreshable via `/coherence:doctor`.
- `terminal_hyperlink` — enum `'osc8' | 'osc52' | 'plain'`. Terminal-capability probe result used by the DD-071 graceful-degradation chain (tier 2/3/4). Orthogonal to `claude_url_scheme_supported`: the URI scheme is a *host* capability, the hyperlink encoding is a *terminal* capability.
- `statusline_install_path` — `string`. Absolute path of the installed `statusLine` script if the DD-070 install command has run; absent otherwise. Lets `/coherence:doctor` detect drift between probe result and installed state.
- `subagent_invocation_id_emitted` — `boolean`. Narrower than the v0.1 `subagent_attribution`; specifically marks whether the host emits `invocation_id` (the field DD-078's reformulation depends on per OQ-v2-24). Defaults to the value of `subagent_attribution` when absent (back-compat).
`frontmatter_preserves_unknown_keys` (already at `src/types/index.ts:48-54`) is referenced by DD-069 unchanged — no schema change.
**Rationale:**
1. Optional fields = no migration step required for v0.1 cached probes.
2. Closed schema (`additionalProperties: false` retained) preserves the v0.1 doctor invariant.
3. Tri-state `url_scheme_handler` makes the statusline tier observable, not inferred.
**Alternatives:**
- *Open the schema (**`additionalProperties: true`**) for ad-hoc fields* — erodes the v0.1 closed-contract guarantee.
- *Encode **`url_scheme_handler`** as a boolean* — collapses three meaningfully-different terminals.
**Source signal:** OQ-v2-28 resolution; DD-069, DD-071 references.
**Implications:**
- One schema-file edit; corresponding type extension in `src/types/index.ts` (`HostCapabilities` interface, all three fields optional).
- Probe code (DD-070 `/coherence:install-statusline`, DD-071 url-scheme detection) writes the new fields after their respective probes.
- `/coherence:doctor` consults `statusline_install_path` to flag missing-script drift.
---
## DD-091 — Author/Annotate LLM contract: model, prompts, cost-ledger partition
**Status:** Ratified 2026-05-09
**Decision:** Mirror v0.1's stage1/stage2 prompt-version policy (`prompts/v1/manifest.json`, `src/llm/costLedger.ts`):
- **Model:** `claude-sonnet-4-5-20251022` with `temperature: 0` — same as v0.1 stage1/stage2 per `prompts/v1/manifest.json`. No new model-selection logic.
- **Prompts directory:** new `prompts/v2/` with `manifest.json` carrying inherited `stage1_version: "v1.0"`, `stage2_version: "v1.0"` plus new `author_version: "v2.0"`, `annotate_version: "v2.0"`. v0.1 stage1/stage2 prompts continue to live under `prompts/v1/`; v0.2 ships both directories.
- **Cost-ledger partition:** `CostEntry.stage` enum widened to `'stage1' | 'stage2' | 'author' | 'annotate'` (folded into DD-080). `CostEntry.prompt_version` widened to `{ stage1?, stage2?, author?, annotate?: string }`. `CostLedger.record()` API at `src/llm/costLedger.ts:23-29` is unchanged (already accepts arbitrary stage / prompt-version per `Omit<CostEntry, ...>`); no breaking change.
- **Cassette policy:** Author/Annotate cassettes live under `tests/cassettes/author/` and `tests/cassettes/annotate/` (mirrors existing `tests/cassettes/stage1/` and `tests/cassettes/stage2/`).
DD-085 enforces the per-stage 60/30/10 cost-ceiling allocation against this partition.
**Rationale:**
1. Reusing the v0.1 model + temperature avoids a parallel model-selection abstraction.
2. Per-stage cost-ledger partition is what makes DD-085 enforceable.
3. Side-by-side `prompts/v1/` + `prompts/v2/` lets v0.2 ship without rewriting v0.1 prompts.
**Alternatives:**
- *Unified single **`'v0.2'`** stage value with free-form sub-discriminator* — defeats DD-085 partition; breaks `cost-ledger.schema.json` AJV enforcement.
- *Inline prompts in source* — loses cassette tooling; v0.1 prompt-versioning gives reproducible regression tests.
**Source signal:** OQ-v2-29 resolution; DD-067 partition reference.
**Implications:**
- New directory `prompts/v2/` with `manifest.json` and the Author / Annotate prompt files.
- One enum-widening edit in `src/state/schemas/cost-ledger.schema.json` (folded into DD-080).
- Type extension in `src/types/index.ts` (`CostEntry.stage`, `CostEntry.prompt_version`).
- Two new cassette directories under `tests/cassettes/`.
- Composes with DD-085 enforcement and DD-087 `proposal.prompt_version.author` field.
---
## DD-092 — v0.2.1 calibration patch commitment for DD-076 / DD-077 / DD-078
**Status:** Ratified 2026-05-09
**Decision:** v0.2.0 ships with the conservative defaults from DD-076 / DD-077 / DD-078 (as amended). Numerical tuning of those thresholds is **not a v0.2.0 spec gate** — it is committed to a follow-up v0.2.1 calibration patch with the following acceptance criteria:
**Trigger condition (whichever comes first):**
- ≥ 50 opted-in sessions of `proposal_signal_observed` events accumulated via `/coherence:share-metrics --anonymized` (DD-086) from v0.1.1 onwards, OR
- 2026-06-09 (30 days post-v0.1.1).
**Tuning procedure (per kind):**
1. Aggregate `proposal_signal_observed { kind, would_have_fired, ... }` events.
2. For each kind, compute the would-have-fired count distribution and per-threshold projected precision (estimated user-accept rate from v0.2-alpha cohort once available; before alpha, use a synthetic precision floor of 0.5).
3. Choose the threshold that maximises projected precision subject to **precision ≥ 0.7**.
4. If precision ≥ 0.7 is unattainable in the search space, retain v0.2.0 defaults and reschedule to v0.2.2.
**Per-kind tunable parameters and bounds (hard limits prevent runaway tuning):**
- **DD-076 (bash repetition):** count threshold ∈ \[2, 6\], window ∈ \[10 min, 60 min\].
- **DD-077 (file creation):** count threshold ∈ \[2, 6\], Jaccard cut-off ∈ \[0.6, 0.95\], locality window unchanged.
- **DD-078 amended (agent correction):** lines-ratio threshold ∈ \[0.10, 0.40\], occurrences ∈ \[2, 5\], 7-day window unchanged.
**Documentation:** v0.2.1 CHANGELOG entry must record sample size, per-threshold deltas, projected precision, and confidence interval (mirrors v0.1 release-note discipline).
**Rationale:**
1. Decouples *shipping v0.2.0* from *tuning v0.2.0* — the design lands now; the numbers refine without spec churn.
2. Hard tuning bounds prevent a noisy month of telemetry from over-correcting the defaults.
3. Shipping conservative defaults first means false-positive cost is bounded by DD-085 (per-feature cost ceiling) regardless of tuning outcome.
4. The acceptance gate (precision ≥ 0.7) matches the bar already encoded in the common tuning protocol above.
**Alternatives:**
- *Block v0.2.0 on calibration data* — indefinitely delays Author/Annotate features for a marginal numerical refinement.
- *No upper bounds on tuning parameters* — invites a single noisy telemetry window to permanently distort the thresholds.
- *Auto-tuning loop in production* — violates the v0.1 principle of explicit, audit-friendly threshold changes (every change goes through CHANGELOG).
**Source signal:** OQ-v2-11 / OQ-v2-12 / OQ-v2-13 resolutions; common tuning protocol above.
**Implications:**
- v0.2.0 ships with DD-076 / DD-077 / DD-078 (amended) defaults locked in code as `THRESHOLD_DEFAULTS` constants.
- Constants are overridable via `coherence/config.json` keys (`bash_repetition_threshold`, `file_creation_threshold`, `agent_correction_lines_ratio`, etc.) so the v0.2.1 patch is a constants-only change — no schema bump.
- New script `scripts/calibrate-thresholds.mjs` runs the tuning procedure offline against an anonymised metrics export.
- New release-note checklist item: "v0.2.1 must include calibration outcome".
- If the v0.2.1 trigger fires but precision ≥ 0.7 is unattainable, the v0.2.2 reschedule is logged in `docs/CHANGELOG.md` with the failed tuning attempt's data.
**Amendment 2026-05-10 (closeout gate methodology — implementation specifics for ****`scripts/alpha-telemetry-close.mjs`****):** the trigger condition above ("≥ 50 opted-in sessions OR 30 days post-v0.1.1") is now enforced as a **hard precondition** of the calibration script, not a soft target:
**Inputs:** `.claude/coherence/metrics.jsonl` — only digest fields read (FR-OBS-N5 privacy by construction).
**Hard pre-conditions** (`--enforce-gates`, default on; `--allow-incomplete` to bypass for replay):
- `sessions_seen ≥ 50` (counted as `new Set(events.map(e => e.session_id))`).
- `observation_days ≥ 30` (computed from `min(events[].\_ts)` to `now`).
- Both must pass; otherwise the script exits non-zero and refuses to emit a calibration recommendation.
**Per-detector projection (per signal_kind):**
1. Trial set: events where `would_have_fired === true`.
2. Success set: subsequent `proposal_accepted` events with the same `signal_kind`.
3. Wilson 95% CI via `wilson95(successes, trials)` yields `{mean, lower, upper}`.
4. Pass criterion: `lower ≥ 0.7`. This is the FR-AUTHOR-N1 precision floor.
5. Fail action: tighten the detector's primary knob in `src/state/schemas/config.schema.json` until a synthetic replay (cassettes + `tests/fixtures/signal-corpora/`) projects `lower ≥ 0.7`. Record the replayed projection in `release-artifacts/<ts>-calibration.json`.
**Cross-detector co-occurrence:** `coOccurrenceMatrix` counts pairs of distinct signal kinds resolving within 30 min. Co-occurrence ≥ 5% of total decisions demotes the runner-up signal to observe-only in v0.2.1.
**Planner gate (when ****`proposal_planner_invoked`**** events exist):** bundled-section MAE ≤ 1 AND cost ratio ≤ 1.4× — promotion criterion fed back to DD-067's amendment. If both gates pass alongside detector gates, the planner default-flips in v0.2.1.
**Output artefact** `release-artifacts/v0.2-alpha-telemetry-<ts>.json` contains: `counts`, `detector_precision` (with `meets_calibration_floor`), `co_occurrence`, `sessions_seen`, `closeout_gates` (`{sessions_seen, sessions_floor, sessions_pass, observation_days, days_floor, days_pass}`), and a single boolean `closeout_gates_pass` for CI consumption.
**GA gate:** `scripts/release-ga.mjs` may not cut the v0.2.0 tag until the latest artefact reports `closeout_gates_pass === true` AND every detector's `meets_calibration_floor === true` — OR failing detectors are demoted/disabled in `config.schema.json` defaults.
