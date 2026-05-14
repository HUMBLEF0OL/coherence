<!-- url: https://www.notion.so/35b010d46a7081fcaff1fce4c0dcbec0 -->
<!-- id: 35b010d4-6a70-81fc-aff1-fce4c0dcbec0 -->
<!-- title: ❔ Open Questions -->
> Tracks every assumption v0.2 planning makes that depends on v0.1 internals or unresolved trade-offs. **Spec freeze for v0.2 is gated on every entry below being resolved or explicitly deferred.** Mirrors v0.1's open-questions discipline.
## Status legend
- 🔴 **Open** — unresolved, blocks affected DD/spec section
- 🟡 **In progress** — investigation underway / awaiting v0.1 telemetry
- 🟢 **Resolved** — decision recorded; link to DD-NNN or note
- ⚫ **Deferred** — punted to v0.3+ with rationale
---
## v0.1→v0.2 dependency questions (parallel-planning risk)
These must be validated against shipped v0.1 before v0.2 spec freeze.
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v2-01</td>
<td>🟢 Resolved → DD-066</td>
<td>Does v0.1's PostToolUse buffer schema expose enough event detail to drive trickle deep-scan, or does it need additive fields?</td>
<td>G-8 (trickle), DD-101+</td>
<td>Source enum extended with `trickle_deep_scan`; operational state in new `scan-cache.json` (DD-066)</td>
</tr>
<tr>
<td>OQ-v2-02</td>
<td>🟢 Resolved → DD-067</td>
<td>Can Author-mode proposal grouping reuse v0.1 Stage 1 planner output, or does it need its own pipeline stage?</td>
<td>G-3, G-4, G-5; DD-076–090</td>
<td>Separate Author pipeline; runs after Stop. Stage 1 not reused. Staged adoption: no planner in v0.2-alpha (DD-067)</td>
</tr>
<tr>
<td>OQ-v2-03</td>
<td>🟢 Resolved → DD-068 · **Implemented in v0.1.1 patch 2026-05-09**</td>
<td>Does v0.1 emit telemetry events for: (a) repeated bash sequences, (b) file-creation patterns, (c) user corrections to agent output? If not, which require a v0.1.x instrumentation patch \<em\>before\</em\> v0.1 ships?</td>
<td>G-3, G-4, G-5; success metrics</td>
<td>Three new privacy-safe events (`tool_invocation_signature`, `user_prompt_signature`, `agent_response_id`) shipped in v0.1.1 patch (not amendment — v0.1.0 had already shipped). 35 tests passing.</td>
</tr>
<tr>
<td>OQ-v2-04</td>
<td>🟢 Resolved → DD-069</td>
<td>Does v0.1's frontmatter contract round-trip through Annotate-mode auto-injection without triggering `coherence:doctor` warnings or quarantine?</td>
<td>G-1; DD-066+</td>
<td>Annotate uses v0.1 anchor format byte-for-byte + `auto-annotated: true` flag; sidecar fallback honoured (DD-069)</td>
</tr>
<tr>
<td>OQ-v2-05</td>
<td>🟢 Resolved → DD-070</td>
<td>How does the statusline badge integrate with Claude Code v2.x — is there a stable hook, or does it require unsupported APIs?</td>
<td>G-7; DD-096+</td>
<td>Hybrid: opt-in `statusLine` install command (plugin can't ship statusLine directly) + plugin-shipped `subagentStatusLine`. Snapshot-file architecture (DD-070)</td>
</tr>
<tr>
<td>OQ-v2-06</td>
<td>🟢 Resolved → DD-072</td>
<td>Where do quarantined proposals live on disk — inside `.claude/coherence/proposals/` or a sibling `coherence-proposals/`? Affects ignore semantics and team-share story (v0.3).</td>
<td>DD-065 follow-up</td>
<td>`.claude/coherence/proposals/<kind>/<id>/`; new `proposal-cache.json`; default ignore template adds `proposals/` (DD-072)</td>
</tr>
</table>
---
## Trust-model & UX questions
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td></td>
</tr>
<tr>
<td>OQ-v2-07</td>
<td>🟢 Resolved → DD-073</td>
<td>Does Annotate mode require per-doc opt-in, per-directory opt-in, or a single global flag?</td>
<td>G-1, G-2; DD-066+</td>
<td>Hybrid: global mode (`/coherence:graduate annotate`) + `coherence/ignore` denylist + per-doc `/coherence:annotate` (DD-073)</td>
</tr>
<tr>
<td>OQ-v2-08</td>
<td>🟢 Resolved → DD-075</td>
<td>What's the proposal-expiry policy? Stale proposals dropped after N days, on git branch change, or never?</td>
<td>G-6; success metric "time-to-decision"</td>
<td>14-day time fence (matches v0.1 FR-BUFFER-7) + 7-day signal-recurrence fence + consecutive-ignored counter (DD-075)</td>
</tr>
<tr>
<td>OQ-v2-09</td>
<td>🟢 Resolved → DD-074</td>
<td>Should `/coherence:graduate` operate per-doc, per-directory, or globally?</td>
<td>G-2; DD-071+</td>
<td>All three; persistent in `graduation.json`; most-specific-wins; never bypasses DD-065 quarantine (DD-074)</td>
</tr>
<tr>
<td>OQ-v2-10</td>
<td>🟢 Resolved → DD-071</td>
<td>Does the statusline badge include click-to-review affordance, or is it read-only?</td>
<td>G-7; DD-096+</td>
<td>OSC 8 hyperlink on proposal count; 3-tier graceful degradation (URI → OSC 52 copy → plain text). DD-071</td>
</tr>
</table>
---
## Detection-threshold questions (tune from v0.1 telemetry)
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v2-11</td>
<td>🟢 Resolved → DD-076 (default locked) + DD-092 (calibration commitment)</td>
<td>Bash-repetition threshold: how many occurrences in what window triggers a slash-command proposal?</td>
<td>**v0.2.0 ships with DD-076 default** (3 normalised matches in 30-min rolling window). **Numerical tuning is no longer a v0.2 spec gate** — DD-092 commits to a v0.2.1 patch that re-tunes the threshold from `proposal_signal_observed { kind: bash_repetition, would_have_fired }` events once the 30-day v0.1.1 observation window closes (≥ 50 opted-in sessions or 2026-06-09, whichever comes first). All three calibration dependencies are now satisfied: (a) DD-068 events shipped in v0.1.1 (2026-05-09); (b) DD-086 extended `share-metrics` redaction (no fresh privacy DD needed); (c) observation window has started.</td>
</tr>
<tr>
<td>OQ-v2-12</td>
<td>🟢 Resolved → DD-077 (default locked) + DD-092 (calibration commitment)</td>
<td>File-creation pattern threshold: how similar must files be to count as a pattern?</td>
<td>**v0.2.0 ships with DD-077 default** (3 files + locality + structural similarity, Jaccard ≥ 0.8). Tuning is delegated to **DD-092** under the same v0.2.1 calibration commitment as OQ-v2-11; tunable parameters are file-count threshold, Jaccard cut-off, and locality window. Acceptance criterion: Jaccard cut-off ∈ \[0.6, 0.95\] tuned for projected precision ≥ 0.7 against the v0.1.1 telemetry corpus.</td>
</tr>
<tr>
<td>OQ-v2-13</td>
<td>🟢 Resolved → DD-078 amended (default locked) + DD-092 (calibration commitment)</td>
<td>Agent-output correction threshold: what counts as a "repeated correction"?</td>
<td>**Provenance question closed by OQ-v2-24 → DD-078 amendment**: threshold reformulated against shipped invocation-aggregate provenance (`SubagentAttribution` at `src/subagent/tracker.ts:8-18`). **v0.2.0 ships with DD-078 amended default** (5-min window, ≥ 20% lines_added+lines_removed ratio, 3 occurrences per agent in 7-day window). Numerical tuning delegated to **DD-092**; acceptance criterion: line-ratio ∈ \[0.10, 0.40\] tuned for projected precision ≥ 0.7.</td>
</tr>
</table>
---
---
## Schema, UX & lifecycle gaps surfaced by audit (2026-05-09)
Follow-ups uncovered while critically auditing DD-065..DD-078 against v0.1 BRD/TSD. Each blocks a section of the v0.2 BRD until resolved. Most are mechanical (specify a referenced-but-undefined artifact); a few are real design questions.
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v2-14</td>
<td>🟢 Resolved → DD-081 (recommended)</td>
<td>What's the proposal acceptance UX surface? Picker, `/coherence:accept <id>`, interactive prompt? DD-065 promises an "explicit user accept action" but no DD specifies it.</td>
<td>DD-065, DD-072, G-6</td>
<td>**Recommended (DD-081):** dedicated slash-command set per kind: `/coherence:propose-list` (read-only browser), `/coherence:propose-show <id>` (diff preview), `/coherence:propose-accept <id>`, `/coherence:propose-reject <id>`. Mirrors existing slash-command precedent (`enableSidecars.ts`, `recover.ts`). **Alternatives rejected:** (a) interactive picker — Claude Code has no stable picker API surface; (b) auto-accept on prompt — violates DD-065 trust boundary. See OQ-v2-15 (name-collision) and OQ-v2-16 (revert) DDs which compose with DD-081.</td>
</tr>
<tr>
<td>OQ-v2-15</td>
<td>🟢 Resolved → DD-082 (recommended)</td>
<td>Name-collision policy: what happens when accepting a proposal would overwrite an existing `.claude/skills/<name>/SKILL.md` or `.claude/agents/<name>.md`? DD-067 mentions "name-collision check" but not the resolution.</td>
<td>DD-065, DD-067, G-6</td>
<td>**Recommended (DD-082):** `/coherence:propose-accept <id>` refuses on collision; emits `proposal_acceptance_blocked { reason: 'name_collision' }` to `metrics.jsonl`; surfaces resolution flags `--rename <new-name>` (preferred) or `--overwrite` (requires the user to retype the target path as confirmation, mirroring `enableSidecars.ts` `skipped` semantics). **Never** silently overwrites — preserves DD-065 trust boundary. **Alternative rejected:** prompt the user for choice — slash commands are non-interactive in Claude Code, so flag-driven resolution is the only reliable surface.</td>
</tr>
<tr>
<td>OQ-v2-16</td>
<td>🟢 Resolved → DD-083 (recommended)</td>
<td>Rollback for accepted-then-regretted proposals. Is there `/coherence:revert-acceptance`? How does it interact with v0.1 `revertDetect`?</td>
<td>DD-065 trust contract</td>
<td>**Recommended (DD-083):** `/coherence:propose-revert-acceptance <id>` performs a `git revert` of the original `[coherence] accept proposal <id>` commit, producing a standard `[coherence-revert]` commit. v0.1 `revertDetect` (`src/detection/revertDetect.ts`, ≥80% line-removal heuristic) picks it up automatically — no new pipeline. Proposal re-enters `proposal-cache.json` with state `reverted` (terminal) so it won't re-surface. **Alternative rejected:** in-place file deletion + cache rewrite — bypasses git audit trail, conflicts with NFR-OBS-1.</td>
</tr>
<tr>
<td>OQ-v2-17</td>
<td>🟢 Resolved → DD-086 (recommended) · egress ⚫ deferred to v0.3</td>
<td>Privacy/legal review of `/coherence:share-metrics --anonymized`. Referenced in DD-076/077/078 calibration protocol; no DD; touches NFR-PRIVACY-4 (egress).</td>
<td>DD-076/077/078 tuning loop; OQ-v2-11/12/13 closure</td>
<td>**Recommended (DD-086, v0.2 surface only):** extend the existing `anonymizeRecord()` allowlist in `src/commands/shareMetrics.ts:24-50` so the three DD-068 events round-trip without leakage. Concretely: (1) `tool_invocation_signature` — pass-through (already covered: `signature_hash`, `tool`); (2) `user_prompt_signature` — pass-through (`length_bucket`, `refers_to_prior` already in allowlist); hash `prior_response_id` defensively (already wired); (3) `agent_response_id` — hash `response_id` defensively (already wired); pass-through `length_bucket`, `source`. Add a fixture-driven test (`tests/unit/commands/shareMetrics.dd068.test.ts`) asserting no raw command/path/prompt-text appears in output for each event type. Confirmation gate (`requiresConfirmation: true` flow at `shareMetrics.ts:60-72`) stays. **Egress is deferred to v0.3** under a separate `/coherence:upload-metrics` command — no v0.2 NFR-PRIVACY-4 amendment needed because v0.2 retains the file-write-only surface. **Alternative rejected:** ship opt-in HTTPS upload in v0.2 — pulls in TLS-pinning, retention, GDPR/erasure, and audit-log requirements that have no v0.1 precedent and would block the BRD.</td>
</tr>
<tr>
<td>OQ-v2-18</td>
<td>🟢 Resolved → folded into DD-080 (no separate DD needed)</td>
<td>Migration strategy for the 5 new state files (`graduation.json`, `proposal-cache.json`, `signal-cache.json`, `scan-cache.json`, `state-snapshot.json`). Does each get a `v{n}_to_v{n+1}` migrator chain like v0.1?</td>
<td>All v0.2 state files; v0.1 migration framework reuse</td>
<td>**Resolved by DD-080 (OQ-v2-31).** No separate migration DD needed: DD-080's single `v1_to_v2.ts` migrator (slotted into `src/state/migrate/index.ts:46`) handles all five new state files atomically — empty-file creation with `schema_version: 2`, registered through the existing `SCHEMA_NAMES` / `FILE_TO_SCHEMA` arrays at `src/state/stateStore.ts:18-39`. Future v2→v3 follows the same chained pattern (one migrator per version bump, never per file). **Alternative rejected (per-file migrator chain):** would need 5 independent failure-recovery surfaces and 5 quarantine paths instead of one — strictly more code with no upside, given enum widening and empty-file creation are both additive operations.</td>
</tr>
<tr>
<td>OQ-v2-19</td>
<td>🟢 Resolved → DD-073 amendment (recommended)</td>
<td>Does per-doc `/coherence:annotate <path>` (DD-073) bypass `coherence/ignore`? "Regardless of global mode" is specified; ignore-list interaction is not.</td>
<td>DD-073 trust boundary</td>
<td>**Recommended (amend DD-073):** per-doc `/coherence:annotate <path>` **respects** `coherence/ignore`. Returns explicit error `path is in coherence/ignore — remove the entry to annotate` and emits `annotate_blocked { reason: 'ignored' }`. Rationale: `PathFilter` (`src/detection/pathFilter.ts:28`) is the single privacy boundary (NFR-PRIVACY-5) and is the same surface that protects `.env`, secrets, etc. Per-doc opt-in overrides *global mode*, not *privacy filters*. **Alternative rejected:** silent bypass — would create a footgun where a user types a path and accidentally LLM-processes secrets. The user can edit `coherence/ignore` if they truly want the file processed.</td>
</tr>
<tr>
<td>OQ-v2-20</td>
<td>🟢 Resolved → DD-070 amendment + DD-084 (recommended)</td>
<td>DD-070 statusline write amplification: `state-snapshot.json` rewritten by every hook (incl. PostToolUse) — what's the budget vs. v0.1 NFR-PERF-1 (50 ms p95)? No measurement defined.</td>
<td>DD-070; NFR-PERF inheritance</td>
<td>**Recommended (split snapshot writes off the hot path; DD-084):** PostToolUse only sets an in-process dirty bit (no FS I/O). Snapshot is flushed (a) on `Stop` / `SubagentStop` / `SessionEnd` (already off-the-hot-path), and (b) opportunistically by a debounced writer with a ≥5s minimum interval guarded by `lockManager`. Add a regression cell in `tests/perf/regression-gate.test.ts` for `state-snapshot write` with a hard budget of **5 ms p95 isolated** and **0 ms attributed to PostToolUse**. **Alternative rejected:** synchronous write per hook with a budget — PostToolUse is the highest-frequency hook (`src/hooks/postToolUse.ts:1-78` shows 5 already-tight steps including a `readFileSync`); even a 1 ms write × 100/min compounds tail latency and risks NFR-PERF-1 regression.</td>
</tr>
<tr>
<td>OQ-v2-21</td>
<td>🟢 Resolved 2026-05-09 (in v0.1.1 patch)</td>
<td>DD-068 hashing scheme is under-specified: shell quoting / pipes / subshells / heredocs / PowerShell vs POSIX argv tokenisation; collision rate claim ("\<0.1% on 10k corpus") is unverified — first-8-hex SHA-256 = 32-bit space, birthday-bound expected \~1.2% on 10k.</td>
<td>DD-068; v0.1 spec amendment</td>
<td>**Resolved**: hash widened to **first 12 hex chars (48 bits)**, collision-rate fixture in `tests/unit/util/signatureHash.test.ts`. Tokenisation rules formalised in `src/util/signatureHash.ts` (PATH/UUID/TS/NUM/HEX placeholders; pipes/heredocs hash literally). See updated DD-068 entry.</td>
</tr>
<tr>
<td>OQ-v2-22</td>
<td>🟢 Resolved → DD-075 amendment (recommended)</td>
<td>DD-075 consecutive-ignored counter resets on user view via slash command, but does **not** reset on signal recurrence. Could expire a still-relevant proposal whose pattern keeps recurring. Intentional?</td>
<td>DD-075 expiry semantics</td>
<td>**Recommended (intentional; codify in DD-075):** keep the consecutive-ignored counter **independent** of signal recurrence. Reset only on explicit user view (`propose-list` / `propose-show`) or `propose-accept` / `propose-reject`. **Rationale:** signal recurrence means the user hasn't acted on a still-firing pattern — that is *evidence the proposal is noise to them*, not evidence of new value. Resetting on recurrence creates an unkillable nag loop on patterns the user has implicitly chosen to live with. The existing 7-day signal-recurrence fence (separate from the consecutive-ignored counter) already protects bursty-then-quiet patterns from premature drop. **Alternative rejected:** reset-on-recurrence — degrades to a notification-spam vector on noisy projects (e.g. monorepos with hot bash loops in `package.json` scripts).</td>
</tr>
<tr>
<td>OQ-v2-23</td>
<td>🟢 Resolved → DD-085 (recommended)</td>
<td>Unified v0.2 NFR-COST envelope. Per-feature caps (DD-067 `proposals_per_session ≤ 3`, DD-069 `annotate_calls_per_session = 5`, DD-076/077 ring buffers) sum without a global ceiling. v0.1 NFR-COST could regress without tripping any single threshold.</td>
<td>All Author + Annotate + Trickle DDs</td>
<td>**Recommended (DD-085):** top-level `NFR-COST-v0.2` DD with a single **per-session ceiling = v0.1 NFR-COST-1 baseline × 1.30** (i.e. v0.2 features may add at most +30% over v0.1 cost). Allocation budget: Author ≤ 60% of the +30% (3 calls × ≤10k tokens), Annotate ≤ 30% (5 calls × ≤2k tokens), Trickle ≤ 10% (no LLM in v0.2-alpha; reserved for v0.2-beta). Enforced by `CostLedger` (`src/llm/costLedger.ts`); `stage` enum extended with `'author'` and `'annotate'` (folded into OQ-v2-31 schema bump). On overrun, switch to no-LLM mode for the remainder of the session and emit `cost_ceiling_hit { feature }`. **Alternative rejected:** per-feature caps without global cap — v0.1 NFR-COST could silently regress when all features simultaneously hit their per-feature ceilings (worst case +220% over v0.1).</td>
</tr>
<tr>
<td>OQ-v2-24</td>
<td>🟢 Resolved → DD-078 amendment (recommended)</td>
<td>DD-078 assumes line-level subagent provenance ("≥ 20% of the agent's contributed lines"). v0.1 DD-022/DD-023 tracks at section/file granularity. Either v0.1 needs amendment or DD-078 needs reformulation.</td>
<td>DD-078; v0.1 subagent provenance</td>
<td>**Recommended (reformulate DD-078 against shipped provenance shape):** trigger on `(corrective_edit.lines_added + lines_removed) ≥ 0.20 × (invocation.lines_added + invocation.lines_removed)` **AND** the edit touches a path in `invocation.files_touched` within the 5-min window, accumulated to 3 occurrences per agent in a 7-day rolling window. Computable today from `SubagentAttribution` (`src/subagent/tracker.ts:8-18`: `invocation_id`, `files_touched`, `lines_added`, `lines_removed`). **Alternative rejected:** request a v0.1.x amendment to record per-file `tool_calls[].lines_added` ranges — the host-capability dependency (`subagent_attribution=true`  • `invocation_id`) is fragile, and the line-range data is not always emitted by Claude Code; reformulating against invocation-aggregate counts removes the dependency entirely.</td>
</tr>
<tr>
<td>OQ-v2-25</td>
<td>🟢 Resolved → DD-087 (recommended)</td>
<td>`proposal.schema.json` referenced by DD-067 — never specified. Required for Author pipeline validation.</td>
<td>DD-067; G-3/4/5/6</td>
<td>**Recommended (DD-087):** new `src/state/schemas/proposal.schema.json`, mirroring the `plan.schema.json` shape (`additionalProperties: false`, draft-07, `$id: "coherence/proposal"`). **Required fields** (intersection of DD-065 / DD-067 / DD-072 obligations): `proposal_id` (UUID v4), `kind` (enum: `'slash_command' \| 'skill' \| 'agent' \| 'annotate'` — matches DD-077/067 surfaces), `created_at` (ISO-8601 UTC), `signal_refs` (array of `signal-cache.json` row ids that triggered it — backref for OQ-v2-22 expiry), `proposed_path` (string, project-relative), `body` (string — the actual [SKILL.md](http://SKILL.md) / [AGENT.md](http://AGENT.md) / etc. content), `prompt_version` (`{ author: string }`, partition of DD-067), `cost_usd` (number ≥ 0), `validation` (`{ name_collision: boolean, hallucination_grep_passed: boolean }`). Register in `SCHEMA_NAMES` (DD-080). Validate at write-time in `proposal-cache.json` writer (mirrors `stateStore.write` pattern). **Alternative rejected:** open-typed proposal payload — would let Author pipeline drift the schema with each prompt revision; v0.1 already proved closed-schema + AJV catches LLM-output drift before it reaches disk.</td>
</tr>
<tr>
<td>OQ-v2-26</td>
<td>🟢 Resolved → DD-088 (recommended)</td>
<td>`proposal-cache.json` schema sketched in DD-072 implications but not formalised as a DD. Lifecycle state machine (queued / surfaced / accepted / rejected / expired) likewise unspecified.</td>
<td>DD-072; expiry sweep DD-075</td>
<td>**Recommended (DD-088):** new `src/state/schemas/proposal-cache.schema.json`. **Shape:** `{ schema_version: 2, entries: [...] }` where each entry is `{ proposal_id, kind, state, state_history: [{ state, at, reason? }], surfaced_count, consecutive_ignored, last_signal_at, expires_at }`. **State machine** (terminal states underlined): `queued → surfaced → (accepted_ → rejected_ → expired_ → reverted_)`. Transitions: `queued→surfaced` on first `propose-list` view; `surfaced→accepted` on `propose-accept`; `surfaced→rejected` on `propose-reject`; `surfaced→expired` on DD-075 14-day fence OR `consecutive_ignored ≥ 3`; `accepted→reverted` on DD-083 `propose-revert-acceptance`. Illegal transitions (e.g. `rejected→accepted`) raise `ProposalStateError` and quarantine the file (mirrors `stateStore.read` quarantine pattern at `src/state/stateStore.ts`). `state_history` is append-only audit trail (mirrors `coherence-log.md` per NFR-OBS-1). **Alternative rejected:** flat `state` field with no history — impossible to debug expired proposals or audit revert chains; v0.1 `coherence-log.md` precedent shows append-only audit trails are the project's standard.</td>
</tr>
<tr>
<td>OQ-v2-27</td>
<td>🟢 Resolved → DD-089 (recommended)</td>
<td>`signal-cache.json` schema mentioned in DD-076/077/078 — never specified as a single artifact. Each signal kind defines partial entries; need unified schema, retention, lock policy.</td>
<td>DD-076/077/078</td>
<td>**Recommended (DD-089):** new `src/state/schemas/signal-cache.schema.json`. **Unified shape** with discriminated-union per signal kind (mirrors `metrics.ts:7-22` discriminated-union pattern):<br>`<br>{ schema_version: 2,<br>  bash_repetition:    { entries: [ { signature_hash, count, first_seen, last_seen, sessions: [...] } ], maxItems: 500 },<br>  file_creation:      { entries: [ { path_template_hash, count, first_seen, last_seen, jaccard_buckets: [...] } ], maxItems: 500 },<br>  agent_correction:   { entries: [ { invocation_id, agent_name, corrective_edits: [ { at, lines_ratio, file_overlap } ], count } ], maxItems: 200 } }<br>`<br>**Retention:** 7-day rolling window (matches DD-078 longest window) — entries with `last_seen < now - 7d` pruned by sweep on `SessionEnd`. **Lock policy:** all writes go through `lockManager` (`src/state/locks.ts`) using lock name `signal-cache` (single mutex; per-kind contention is negligible at the rates DD-076/077/078 specify). **`maxItems`**** caps** are conservative — feeds OQ-v2-23 cost ceiling by bounding worst-case Author-pipeline candidate set. **Alternative rejected:** three separate cache files (`bash-repetition.json` / `file-creation.json` / `agent-correction.json`) — triples lock surface and migration count for no isolation benefit since all three feed the same Author pipeline.</td>
</tr>
<tr>
<td>OQ-v2-28</td>
<td>🟢 Resolved → DD-090 (recommended)</td>
<td>`host-capabilities.json` v0.2 field additions (`url_scheme_handler` from DD-071, implicit `frontmatter_preserves_unknown_keys` reuse from DD-069) — need explicit field-enumeration DD so the v0.1 contract isn't extended ad-hoc.</td>
<td>DD-069, DD-071</td>
<td>**Recommended (DD-090):** amend `src/state/schemas/host-capabilities.schema.json` to add three v0.2 fields, **all optional** (preserves v0.1 round-trip; existing v0.1 cached probes stay valid):<br>  • `url_scheme_handler: 'osc8' \| 'osc52' \| 'plain'` — concrete probe result for DD-071 statusline tier (replaces the implicit string sniff; tri-state matches the 3-tier graceful degradation already specified).<br>  • `statusline_install_path: string` — absolute path of installed `statusLine` script if DD-070 install command has run; absent otherwise. Lets `/coherence:doctor` detect drift between probe and installed state.<br>  • `subagent_invocation_id_emitted: boolean` — narrower than v0.1 `subagent_attribution`; specifically marks whether the host emits `invocation_id` (the field DD-078 reformulation depends on per OQ-v2-24). Defaults to `subagent_attribution` value if absent (back-compat).<br>**Reuse confirmation:** `frontmatter_preserves_unknown_keys` (already at `src/types/index.ts:48-54`) is referenced by DD-069 unchanged — no schema change. Update `additionalProperties: false` to **stay false** (v0.1 contract); add the three new fields explicitly. **Alternative rejected:** open the schema (`additionalProperties: true`) for v0.2 ad-hoc fields — would erode the v0.1 closed-contract guarantee that lets `/coherence:doctor` detect host capability drift.</td>
</tr>
<tr>
<td>OQ-v2-29</td>
<td>🟢 Resolved → DD-091 (recommended)</td>
<td>Author pipeline LLM contract: model selection, prompt versioning, cost-ledger partition. DD-067 mentions "partitioned `prompt_versions`" with no schema.</td>
<td>DD-067; v0.1 cost ledger</td>
<td>**Recommended (DD-091):** mirror v0.1's stage1/stage2 prompt-version policy (`prompts/v1/manifest.json`, `src/llm/costLedger.ts`).<br>  • **Model:** same model as v0.1 stage1/stage2 (`claude-sonnet-4-5-20251022` per `prompts/v1/manifest.json`), `temperature: 0`. No new model selection logic.<br>  • **Prompts directory:** `prompts/v2/` with new manifest fields `author_version: "v2.0"`, `annotate_version: "v2.0"` alongside inherited `stage1_version` / `stage2_version`. v0.1 stage1/stage2 prompts continue to live under `prompts/v1/`; v0.2 ships both directories.<br>  • **Cost-ledger partition:** extend `CostEntry.stage` enum to `'stage1' \| 'stage2' \| 'author' \| 'annotate'` (folded into DD-080 schema bump) and `CostEntry.prompt_version` to `{ stage1?, stage2?, author?, annotate?: string }`. Update `src/state/schemas/cost-ledger.schema.json` enum + `prompt_version` properties. `CostLedger.record()` API at `src/llm/costLedger.ts:23-29` is unchanged (already accepts arbitrary stage/prompt_version per `Omit<CostEntry, ...>`). DD-085 enforces the per-stage 60/30/10 allocation against this partition.<br>  • **Cassette policy:** Author-pipeline cassettes live under `tests/cassettes/author/` (mirrors existing `tests/cassettes/stage1/`, `stage2/`).<br>**Alternative rejected:** unified single `'v0.2'` stage value with a free-form sub-discriminator — defeats the whole point of OQ-v2-23's per-feature cost partition (DD-085) and breaks `cost-ledger.schema.json` AJV enforcement.</td>
</tr>
</table>
---
## v0.1 codebase verification pass — 2026-05-09 (post-implementation)
v0.1 implementation is **complete**. The audit OQs above were re-evaluated against the actual code. Each finding below cites concrete `src/` evidence.
### Confirmed assumptions (no change needed)
- **`HostCapabilities.frontmatter_preserves_unknown_keys`** is present (`src/types/index.ts:48-54`). → DD-069 `auto-annotated: true` round-trips cleanly. **OQ-v2-04 stays 🟢.**
- **`/coherence:share-metrics`** is implemented today as a **file-write-only** command with `--anonymized` mode (sectionRef + session_id hashed; path-like strings redacted) per DD-060 (`src/commands/shareMetrics.ts:1-80`). No network egress. → **OQ-v2-17** drops from 🔴 to 🟢 *for v0.1 surface*; v0.2 only needs to extend the redaction scheme to cover the three new DD-068 event types and (optionally) layer on opt-in egress — no fresh privacy DD required for the local surface.
- **`enableSidecars.ts`** is the live precedent for settings-mutating commands. → `/coherence:install-statusline` (DD-070) follows the same pattern. **No new DD needed for the command shape.**
- **PostToolUse hot path** is 5 small steps (kill-switch → path filter → `.md` filter → readFile → scanAnchors → hash-only buffer append; `src/hooks/postToolUse.ts:1-78`). Adding O(1) signal-cache append is feasible inside the 50ms p95 budget gated by `tests/perf/regression-gate.test.ts`. → DD-076/077 hot-path claims hold.
- **Migration framework** is a single linear chain (`src/state/migrate/index.ts`, `v0_to_v1.ts`). Adding 5 v0.2 state files is mechanical: extend `SCHEMA_NAMES` + `FILE_TO_SCHEMA` in `stateStore.ts:18-39` and add `v1_to_v2.ts`. **OQ-v2-18 drops from 🔴 to 🟡 mechanical** — design pattern is fixed, only the new file list remains to be enumerated.
### Revised assumptions (DDs need amendment)
- **DD-066 ****`scan-cache.json`**** filename reservation** is **wrong**. v0.1 reserved `scan-cache/` as a **directory** with a `.gitkeep` placeholder (`src/state/init.ts:52-58`, comment: "Placeholder for v0.2 trickle-scan"). → **Action:** Amend DD-066 to use `scan-cache/state.json` (or rename the file). Add as **OQ-v2-30** below.
- **`BufferEntry.source`**** enum is closed** at `'posttooluse' | 'assertion' | 'revert' | 'manual'` (`src/types/index.ts:21-27`) plus a JSON-Schema enum in `drift-buffer.schema.json`. Adding `'trickle_deep_scan'` (DD-066) requires a schema-version bump. **OQ-v2-31** below tracks the formal schema-bump checklist; the bump itself is a v1 → v2 migration.
- **`CostEntry.stage`**** enum is closed** at `'stage1' | 'stage2'` (`src/types/index.ts:92-99`). DD-067 implication "new cost-ledger fields: `author_pipeline_calls`, partitioned `prompt_versions`" requires the same schema bump as above. → Folded into **OQ-v2-31**.
- **DD-078 line-level subagent provenance is partially supported** (`src/subagent/tracker.ts:1-120`): when `host_capabilities.subagent_attribution=true` AND `invocation_id` is present, the tracker records **invocation-aggregate** `lines_added` / `lines_removed` (whole-invocation totals across `tool_calls`). It does **NOT** record per-file or per-section line ranges. So DD-078's "≥ 20% of the **agent's contributed lines** in a section" is not directly computable from current provenance — only "≥ 20% of the agent's invocation-total lines, summed across all files". → **OQ-v2-24 stays 🔴** but the resolution shape changes: either (a) reformulate threshold against invocation-aggregate counts, or (b) request v0.1.x amendment to record `tool_calls[].lines_added` per-file rather than summing.
- **UserPromptSubmit hook captures nothing about prompt content today** (`src/hooks/userPromptSubmit.ts:1-120`); it tracks long-turn boundaries via in-process counters only. → DD-068's `user_prompt_signature` event is a clean additive change at the existing emit site. **No upstream blocker** for DD-068 — the hook is wired.
- **`metrics.jsonl`**** event types are open-typed in code** (`src/state/metrics.ts:7-17`, discriminated union with `appendJsonl`); no AJV schema enforces the union. → DD-068's three new events are pure additions: extend the union, add emit calls, extend `shareMetrics.ts` redaction. **No AJV schema bump.** **OQ-v2-21 stays 🔴** for the *hashing rigor* concern, but the *event-shape mechanism* is unblocked.
### Newly-resolvable OQs
<table header-row="true">
<tr>
<td>OQ</td>
<td>New status</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v2-04</td>
<td>🟢 (was already)</td>
<td>Verified — `frontmatter_preserves_unknown_keys` present.</td>
</tr>
<tr>
<td>OQ-v2-15 (name collision)</td>
<td>🟡 mechanical</td>
<td>Pattern: refuse on collision, emit `proposal_acceptance_blocked { reason: 'name_collision' }`, surface via `/coherence:propose-*` with explicit "overwrite \| rename \| cancel" prompt. Mirrors `enableSidecars.ts` confirmation pattern. Spec as new DD.</td>
</tr>
<tr>
<td>OQ-v2-17 (share-metrics)</td>
<td>🟢 partial</td>
<td>Local file-write surface exists (DD-060). v0.2 only adds redaction rules for three new event types. Egress / opt-in upload is **deferred to v0.3** — not on the v0.2 critical path.</td>
</tr>
<tr>
<td>OQ-v2-18 (migration)</td>
<td>🟡 mechanical</td>
<td>Single `v1_to_v2.ts` migrator + entries in SCHEMA_NAMES/FILE_TO_SCHEMA. No fresh design.</td>
</tr>
<tr>
<td>OQ-v2-25/26/27 (schemas)</td>
<td>🟡 mechanical</td>
<td>Author one DD per schema; pattern set by existing `src/state/schemas/*.schema.json`.</td>
</tr>
<tr>
<td>OQ-v2-28 (host-capabilities)</td>
<td>🟡 mechanical</td>
<td>Enumerate v0.2 additions (`url_scheme_handler`); extend `host-capabilities.schema.json`.</td>
</tr>
<tr>
<td>OQ-v2-29 (Author LLM)</td>
<td>🟡 mechanical</td>
<td>Extend `CostEntry.stage` enum; add Author prompts under `prompts/v1/` or `prompts/v2/`. Pattern set by `src/llm/costLedger.ts`.</td>
</tr>
</table>
### OQs that remain 🔴 design-open
*(All items in this list have since been resolved — see the per-OQ status badges above and the DD allocation table below. Retained for traceability.)*
- ✅ **OQ-v2-14** — DD-081 (`/coherence:propose-{list,show,accept,reject}` UX).
- ✅ **OQ-v2-19** — DD-073 amendment (per-doc `annotate` respects `coherence/ignore`).
- ✅ **OQ-v2-20** — DD-070 amendment + DD-084 (snapshot off hot path, debounced writer + regression-gate cell).
- ✅ **OQ-v2-21** — Closed by v0.1.1 patch (12-hex hash + tokenisation spec + collision-rate fixture).
- ✅ **OQ-v2-22** — DD-075 amendment (counter independent of signal recurrence).
- ✅ **OQ-v2-23** — DD-085 (NFR-COST-v0.2 unified ceiling = v0.1 × 1.30).
- ✅ **OQ-v2-24** — DD-078 amendment (reformulated against invocation-aggregate provenance).
- ✅ **OQ-v2-30** — DD-066 amendment (`scan-cache/state.json`).
- ✅ **OQ-v2-31** — DD-080 (single coordinated `v1_to_v2.ts` migrator).
<table header-row="true">
<tr>
<td>ID</td>
<td>Status</td>
<td>Question</td>
<td>Affects</td>
<td>Resolution path</td>
</tr>
<tr>
<td>OQ-v2-30</td>
<td>🟢 Resolved → DD-066 amendment (recommended)</td>
<td>DD-066 reserves `scan-cache.json` but v0.1 actually reserved `scan-cache/` as a directory (`src/state/init.ts:52-58`). Which wins?</td>
<td>DD-066</td>
<td>**Recommended (amend DD-066):** relocate operational state to `scan-cache/state.json` and register it in `stateStore.ts` `SCHEMA_NAMES` / `FILE_TO_SCHEMA` (`src/state/stateStore.ts:18-39`). The existing `.gitkeep` (`src/state/init.ts:52-58`) stays. Per-file scan tombstones can live alongside as `scan-cache/<hash>.json` in v0.3 without further restructuring. **Alternative rejected:** delete the v0.1 directory reservation and use `scan-cache.json` as a flat file — would force a directory→file migration on every v0.1 install (creates a cleanup step in `v1_to_v2.ts` for zero design benefit).</td>
</tr>
<tr>
<td>OQ-v2-31</td>
<td>🟢 Resolved → DD-080 (recommended)</td>
<td>v1 → v2 state-schema bump: how is the bump coordinated across `BufferEntry.source` enum, `CostEntry.stage` enum, and 5 new state files? One migrator or staged?</td>
<td>DD-066, DD-067, DD-072, all v0.2 state files</td>
<td>**Recommended (DD-080):** single `src/state/migrate/v1_to_v2.ts` migrator slotted into the existing chain at `src/state/migrate/index.ts:46` (next to the `// Future: if (schemaVersion < 2)` comment). Steps: (1) bump `version.json.schema_version` → 2 with prior-version entry; (2) extend `BufferEntry.source` enum to add `'trickle_deep_scan' \| 'annotate' \| 'author'` and `CostEntry.stage` enum to add `'author' \| 'annotate'` — both are additive in JSON Schema (`enum` widening, no data rewrite); (3) create empty state files for `graduation.json`, `proposal-cache.json`, `signal-cache.json`, `scan-cache/state.json`, `state-snapshot.json` with `schema_version: 2`; (4) extend `SCHEMA_NAMES`  • `FILE_TO_SCHEMA` in `stateStore.ts:18-39`. Failure mode reuses v0.1 quarantine policy (`v0_to_v1.ts` precedent). **Alternative rejected:** staged per-file migrators — partial-state on crash is harder to reason about than one atomic version-bump; the v0.1 chain is explicitly linear by design.</td>
</tr>
</table>
---
## v0.1 → v0.2 sequencing gate — ✅ ALL CLEAR (final state, 2026-05-09)
All v0.2 BRD prerequisites are satisfied. The gate is open.
1. **~~DD-068 disposition~~** ✅ Shipped as v0.1.1 patch (2026-05-09). Three telemetry events live; **OQ-v2-21 hashing rigor closed** (12-hex / 48-bit + collision-rate fixture).
2. **~~OQ-v2-30 + OQ-v2-31~~** ✅ Resolved → DD-066 amendment + DD-080.
3. **~~OQ-v2-14, 19, 20, 22, 23, 24~~** ✅ Resolved → DD-081, DD-073 amendment, DD-070 amendment + DD-084, DD-075 amendment, DD-085, DD-078 amendment.
4. **~~OQ-v2-11/12/13~~** ✅ Resolved → DD-076 / DD-077 / DD-078 amended defaults locked + DD-092 calibration commitment for v0.2.1. **No longer a v0.2 spec gate.**
5. **v0.1 shipped** (v0.1.0 ✅) **and v0.1.1 patch live** (2026-05-09 ✅).
6. **~~Mechanical OQs (15, 17, 18, 25, 26, 27, 28, 29)~~** ✅ All resolved → DD-082, DD-086, DD-080 (absorbs 18), DD-087, DD-088, DD-089, DD-090, DD-091.
**v0.2 BRD authoring is unblocked.** Final DD allocation: **18** (5 amendments to v0.1 DDs + 13 new DDs, numbered DD-080..DD-092).
---
## 📋 v0.2 DD allocation (from this resolution pass — 2026-05-09)
New DDs queued for the v0.2 BRD authoring pass. All recommendations follow v0.1 codebase precedent; alternatives considered are recorded inline above.
<table header-row="true">
<tr>
<td>DD</td>
<td>Source OQ</td>
<td>Subject</td>
<td>Type</td>
</tr>
<tr>
<td>DD-066 amend</td>
<td>OQ-v2-30</td>
<td>scan-cache directory — relocate state to `scan-cache/state.json`</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-070 amend</td>
<td>OQ-v2-20</td>
<td>Snapshot writes off PostToolUse hot path</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-073 amend</td>
<td>OQ-v2-19</td>
<td>Per-doc `/coherence:annotate` respects `coherence/ignore`</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-075 amend</td>
<td>OQ-v2-22</td>
<td>Consecutive-ignored counter independent of signal recurrence</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-078 amend</td>
<td>OQ-v2-24</td>
<td>Reformulate against invocation-aggregate provenance</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-080</td>
<td>OQ-v2-31</td>
<td>`v1_to_v2.ts` single coordinated migrator</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-081</td>
<td>OQ-v2-14</td>
<td>`/coherence:propose-{list,show,accept,reject}` UX</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-082</td>
<td>OQ-v2-15</td>
<td>Name-collision policy: refuse + `--rename` / `--overwrite` flags</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-083</td>
<td>OQ-v2-16</td>
<td>`/coherence:propose-revert-acceptance` via `git revert`</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-084</td>
<td>OQ-v2-20</td>
<td>Snapshot debounced writer with regression-gate cell</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-085</td>
<td>OQ-v2-23</td>
<td>NFR-COST-v0.2 unified per-session ceiling (v0.1 × 1.30)</td>
<td>New DD</td>
</tr>
</table>
### Mechanical OQs — resolution pass 2 (2026-05-09)
All mechanical OQs now have recommended DDs. Updated allocation table:
<table header-row="true">
<tr>
<td>DD</td>
<td>Source OQ</td>
<td>Subject</td>
<td>Type</td>
</tr>
<tr>
<td>DD-086</td>
<td>OQ-v2-17</td>
<td>`share-metrics` redaction extension for DD-068 events; egress deferred to v0.3</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-087</td>
<td>OQ-v2-25</td>
<td>`proposal.schema.json` (Author pipeline validation)</td>
<td>New schema DD</td>
</tr>
<tr>
<td>DD-088</td>
<td>OQ-v2-26</td>
<td>`proposal-cache.json` schema + lifecycle state machine</td>
<td>New schema + state-machine DD</td>
</tr>
<tr>
<td>DD-089</td>
<td>OQ-v2-27</td>
<td>`signal-cache.json` unified discriminated-union schema</td>
<td>New schema DD</td>
</tr>
<tr>
<td>DD-090</td>
<td>OQ-v2-28</td>
<td>`host-capabilities.json` v0.2 field enumeration (3 new optional fields)</td>
<td>Schema amendment</td>
</tr>
<tr>
<td>DD-091</td>
<td>OQ-v2-29</td>
<td>Author/Annotate LLM contract — `prompts/v2/`, cost-ledger partition</td>
<td>New DD</td>
</tr>
</table>
**OQ-v2-18** is fully absorbed by DD-080 (no separate DD).
### v0.2 BRD readiness — ✅ FINAL STATE (2026-05-09)
**All 31 v0.2 open questions are now 🟢 Resolved.** No 🔴 or 🟡 items remain.
- **🟢 Resolved (31):** OQ-v2-01..31 — every question has a recommended DD (or amendment) with v0.1 codebase grounding and rejected alternative recorded. OQ-v2-11/12/13 closed by locking conservative defaults and committing to v0.2.1 tuning under DD-092 (no longer a v0.2 spec gate).
- **⚫ Deferred to v0.3+ (1 sub-item only):** `share-metrics` HTTPS egress (OQ-v2-17 sub-question, captured in DD-086).
**v0.2 BRD authoring is unblocked.** Total v0.2 DD allocation: **18** (5 amendments to v0.1-shipped DDs + 13 new DDs, numbered DD-080..DD-092).
### Updated DD allocation table
<table header-row="true">
<tr>
<td>DD</td>
<td>Source OQ</td>
<td>Subject</td>
<td>Type</td>
</tr>
<tr>
<td>DD-066 amend</td>
<td>OQ-v2-30</td>
<td>`scan-cache/state.json` relocation</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-070 amend</td>
<td>OQ-v2-20</td>
<td>Snapshot writes off PostToolUse hot path</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-073 amend</td>
<td>OQ-v2-19</td>
<td>Per-doc `/coherence:annotate` respects `coherence/ignore`</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-075 amend</td>
<td>OQ-v2-22</td>
<td>Consecutive-ignored counter independent of signal recurrence</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-078 amend</td>
<td>OQ-v2-24</td>
<td>Reformulated against invocation-aggregate provenance</td>
<td>Amendment</td>
</tr>
<tr>
<td>DD-080</td>
<td>OQ-v2-31 (+ absorbs 18)</td>
<td>Single `v1_to_v2.ts` coordinated migrator</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-081</td>
<td>OQ-v2-14</td>
<td>`/coherence:propose-{list,show,accept,reject}` UX</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-082</td>
<td>OQ-v2-15</td>
<td>Name-collision policy: refuse + `--rename` / `--overwrite`</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-083</td>
<td>OQ-v2-16</td>
<td>`/coherence:propose-revert-acceptance` via `git revert`</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-084</td>
<td>OQ-v2-20</td>
<td>Snapshot debounced writer + regression-gate cell</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-085</td>
<td>OQ-v2-23</td>
<td>NFR-COST-v0.2 unified per-session ceiling (v0.1 × 1.30)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-086</td>
<td>OQ-v2-17</td>
<td>`share-metrics` redaction extension; egress → v0.3</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-087</td>
<td>OQ-v2-25</td>
<td>`proposal.schema.json` (Author pipeline output)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-088</td>
<td>OQ-v2-26</td>
<td>`proposal-cache.schema.json`  • lifecycle state machine</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-089</td>
<td>OQ-v2-27</td>
<td>`signal-cache.schema.json` unified discriminated union</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-090</td>
<td>OQ-v2-28</td>
<td>`host-capabilities.schema.json` v0.2 fields (3 optional)</td>
<td>New DD</td>
</tr>
<tr>
<td>DD-091</td>
<td>OQ-v2-29</td>
<td>Author/Annotate LLM contract (`prompts/v2/`, cost partition)</td>
<td>New DD</td>
</tr>
<tr>
<td>**DD-092**</td>
<td>**OQ-v2-11/12/13**</td>
<td>**v0.2.1 calibration patch commitment**</td>
<td>**New DD**</td>
</tr>
</table>
---
*Add new questions as they surface during planning. When resolved, set status 🟢 and link to the DD or note that closes it. Deferred items move to a separate "Deferred to v0.3+" section.*
