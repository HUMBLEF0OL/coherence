<!-- url: https://www.notion.so/35b010d46a7081cf900ee676993165c6 -->
<!-- id: 35b010d4-6a70-81cf-900e-e676993165c6 -->
<!-- title: ⚙️ BRD-2 — Functional Requirements -->
**Parent:** [📘 BRD](https://www.notion.so/35b010d46a7081718781cd2cb908ac52) · **Status:** Draft 1 · 2026-05-09
> **Numbering convention:** continues v0.1's `FR-<DOMAIN>-N` namespace. New domains: `FR-MODES-*`, `FR-ANNOTATE-*`, `FR-AUTHOR-*`, `FR-PROPOSE-*`, `FR-STATUSLINE-*`, `FR-TRICKLE-*`. Inherited domains (`FR-OBS-*`, `FR-COST-*`, `FR-PERMISSION-*`, `FR-FAILURE-*`, `FR-COMMANDS-*`, `FR-PRIVACY-*`) gain additive rows tagged `-N1..` to distinguish from v0.1 numbering.
---
## 1. FR-MODES — Mode lifecycle
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-MODES-1</td>
<td>Three modes — `observe` (v0.1 default), `annotate`, `author`. `observe` remains the global default at first install.</td>
<td>DD-074</td>
</tr>
<tr>
<td>FR-MODES-2</td>
<td>Mode is a **per-scope** property. Scopes: global, per-directory (path prefix), per-doc (exact path). Most-specific scope wins (per-doc \> per-dir \> global).</td>
<td>DD-074</td>
</tr>
<tr>
<td>FR-MODES-3</td>
<td>Mapping persisted in `.claude/coherence/graduation.json` (schema v2; created empty at v1→v2 migration). Lookup is O(log n) via path-prefix match, cached per session.</td>
<td>DD-074, DD-080</td>
</tr>
<tr>
<td>FR-MODES-4</td>
<td>`/coherence:graduate <mode> [<path>]` performs the flip. No path → global flip behind a confirmation prompt; directory path → applies under that directory; file path → per-doc.</td>
<td>DD-074</td>
</tr>
<tr>
<td>FR-MODES-5</td>
<td>`/coherence:graduate --status` prints the current per-scope mapping and the effective mode for `cwd`.</td>
<td>DD-074</td>
</tr>
<tr>
<td>FR-MODES-6</td>
<td>**Hard invariant:** changing mode only changes whether *proposals are generated for a scope*; it never enables auto-apply. The DD-065 quarantine boundary is preserved at every mode level.</td>
<td>DD-065, DD-074</td>
</tr>
<tr>
<td>FR-MODES-7</td>
<td>`/coherence:status` surfaces the effective mode for the current `cwd` alongside v0.1 outputs.</td>
<td>DD-074</td>
</tr>
</table>
## 2. FR-ANNOTATE — Annotate mode
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-ANNOTATE-1</td>
<td>Annotate mode generates an **annotation proposal** per anchor-less doc detected within an Annotate-enabled scope. The proposal carries the candidate frontmatter / anchor set and the inferred `watches:` glob.</td>
<td>DD-069</td>
</tr>
<tr>
<td>FR-ANNOTATE-2</td>
<td>Generated anchors use the v0.1 anchor format **byte-for-byte** (prose: `<!-- coherence:section id=auto-<heading-slug> ... -->` paired blocks; skills/agents: `coherence:` block in YAML frontmatter; sidecar fallback per `host-capabilities.frontmatter_preserves_unknown_keys`).</td>
<td>DD-069</td>
</tr>
<tr>
<td>FR-ANNOTATE-3</td>
<td>All Annotate-generated frontmatter blocks include `auto-annotated: true` for rollback discoverability and partition-by-source telemetry.</td>
<td>DD-069</td>
</tr>
<tr>
<td>FR-ANNOTATE-4</td>
<td>Heading-slug ids satisfy v0.1 `[a-z0-9_-]+` (FR-DETECT-15) and are auto-disambiguated with `-N` suffix on collision.</td>
<td>DD-069</td>
</tr>
<tr>
<td>FR-ANNOTATE-5</td>
<td>Annotate output **never** mutates a file directly; lands as a proposal in `.claude/coherence/proposals/annotations/<id>/` (DD-072) and requires `/coherence:propose-accept <id>` to be applied.</td>
<td>DD-065, DD-069</td>
</tr>
<tr>
<td>FR-ANNOTATE-6</td>
<td>Per-session Annotate budget: `annotate_calls_per_session` (default 5, configurable via `coherence/config.json`).</td>
<td>DD-069</td>
</tr>
<tr>
<td>FR-ANNOTATE-7</td>
<td>`/coherence:annotate <path>` produces a single annotation proposal for the specified doc regardless of the global mode.</td>
<td>DD-073</td>
</tr>
<tr>
<td>FR-ANNOTATE-8</td>
<td>`/coherence:annotate <path>` **respects** `coherence/ignore`. If the target matches an ignore entry the command refuses with `path is in coherence/ignore — remove the entry to annotate` and emits `annotate_blocked { reason: 'ignored' }`. (OQ-v2-19)</td>
<td>DD-073</td>
</tr>
</table>
## 3. FR-AUTHOR — Author signals & pipeline
### 3.1 Pipeline (DD-067)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-AUTHOR-1</td>
<td>Author pipeline runs **after** the v0.1 Stop pipeline completes. Owns its own input contract, prompt(s), output schema (`proposal.schema.json`, DD-087), and **two-phase validation**: (1) **generate-time** — schema-validity + `coherence/ignore`-respect + name-collision pre-check; the pipeline rejects a candidate before it lands in `proposal-cache.json`. (2) **accept-time** — DD-082 collision re-check at `/coherence:propose-accept` to detect underlying-state drift between generation and acceptance.</td>
<td>DD-067, DD-082</td>
</tr>
<tr>
<td>FR-AUTHOR-2</td>
<td>Stage 1 (planner) is **not** invoked by the Author pipeline in v0.2-alpha; each Author signal directly invokes `propose-skill` / `propose-agent` / `propose-command` and emits one proposal per signal. A Proposer planner stage is added for v0.2 final **only if** telemetry shows consolidation has measurable value.</td>
<td>DD-067</td>
</tr>
<tr>
<td>FR-AUTHOR-3</td>
<td>Per-session cap: `proposals_per_session ≤ 3` (v0.2-alpha). Empirically tunable thereafter.</td>
<td>DD-067</td>
</tr>
<tr>
<td>FR-AUTHOR-4</td>
<td>Author-pipeline p95 latency budget: ≤ 5 s, accounted **separately** from v0.1 Stop budget (NFR-PERF-4).</td>
<td>DD-067</td>
</tr>
<tr>
<td>FR-AUTHOR-5</td>
<td>Author pipeline failure does **not** corrupt the v0.1 healing UX already presented (failure isolation — Author runs after Stop output is committed).</td>
<td>DD-067</td>
</tr>
</table>
### 3.2 Bash-repetition signal (DD-076)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-AUTHOR-6</td>
<td>Bash-repetition signal fires when the same **normalised** command appears `≥ 3` times within a `30-minute` rolling window in the same session. Defaults overridable via `author.bash_repetition.window_minutes` and `author.bash_repetition.count`.</td>
<td>DD-076</td>
</tr>
<tr>
<td>FR-AUTHOR-7</td>
<td>Normalisation strips arguments matching path / UUID / timestamp / numeric-id patterns; keeps verb + flags + first positional shape. Match key = the DD-068 12-hex `signature_hash` of the normalised string (single source of truth: `src/util/signatureHash.ts`).</td>
<td>DD-076</td>
</tr>
</table>
### 3.3 File-creation signal (DD-077)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-AUTHOR-8</td>
<td>File-creation signal (`kind = file_creation`) fires when ≥ 3 files are created in a session sharing (a) common parent / sibling locality AND (b) at least one of: first-5-non-blank-lines SHA-256 match, import-set Jaccard ≥ 0.8, or top-2-level heading-hierarchy match.</td>
<td>DD-077</td>
</tr>
<tr>
<td>FR-AUTHOR-9</td>
<td>Defaults overridable via `author.file_pattern.count` (default 3) and `author.file_pattern.jaccard_min` (default 0.8). Skeleton hashes computed once per file at Write and cached for the session.</td>
<td>DD-077</td>
</tr>
</table>
### 3.4 Agent-correction signal (DD-078, OQ-v2-24 reformulation)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-AUTHOR-10</td>
<td>A *correction* is recorded when the user performs an Edit/Write that (i) targets a file appearing in `invocation.files_touched` of an identifiable subagent (v0.1 `SubagentAttribution`), (ii) occurs within 5 minutes of the agent's last touch, and (iii) modifies a line set whose `(lines_added + lines_removed)` is ≥ 20% of the agent invocation's `(lines_added + lines_removed)`.</td>
<td>DD-078 (OQ-v2-24)</td>
</tr>
<tr>
<td>FR-AUTHOR-11</td>
<td>Author-mode correction signal fires when ≥ 3 corrections target outputs from the **same agent name** within a 7-day rolling window. Defaults overridable via `author.correction.window_minutes` (5), `author.correction.line_ratio_min` (0.2), `author.correction.rolling_window_days` (7), `author.correction.count` (3).</td>
<td>DD-078</td>
</tr>
<tr>
<td>FR-AUTHOR-12</td>
<td>Computation of agent-correction signals is deferred to **SessionEnd** (off the PostToolUse hot path).</td>
<td>DD-078</td>
</tr>
<tr>
<td>FR-AUTHOR-13</td>
<td>**Signal-cache circuit breakers** (`signal-cache.json`, DD-089): `bash_repetition.entries.maxItems = 500`, `file_creation.entries.maxItems = 500`, `agent_correction.entries.maxItems = 200`. Caps are bounds, not tuning knobs.</td>
<td>DD-089</td>
</tr>
<tr>
<td>FR-AUTHOR-14</td>
<td>**SessionEnd pruning sweep** over `signal-cache.json`: drops every entry with `last_seen < now - 7d` (matches DD-078's longest rolling window) and emits `signal_cache_pruned { kind, removed }`.</td>
<td>DD-089</td>
</tr>
</table>
## 4. FR-PROPOSE — Proposal queue & lifecycle commands
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-PROPOSE-1</td>
<td>Proposals persisted under `.claude/coherence/proposals/<kind>/<id>/` where `kind ∈ { skills, agents, commands, annotations }` and `<id>` is a deterministic content-derived UUID. Each directory contains the candidate artifact(s) plus a `manifest.json`.</td>
<td>DD-072</td>
</tr>
<tr>
<td>FR-PROPOSE-2</td>
<td>Queue / lifecycle state aggregated in `.claude/coherence/proposal-cache.json` (schema v2, top-level `entries`). Each entry: `{ proposal_id, kind, state, state_history, surfaced_count, consecutive_ignored, last_signal_at, expires_at }`. `state_history` is **append-only**.</td>
<td>DD-088</td>
</tr>
<tr>
<td>FR-PROPOSE-3</td>
<td>State machine: `queued → surfaced` (first `propose-list` view); `surfaced → accepted*` (on `propose-accept`); `surfaced → rejected*` (on `propose-reject`); `surfaced → expired*` (DD-075 fences); `accepted → reverted*` (on `propose-revert-acceptance`). Illegal transitions raise `ProposalStateError` and quarantine the cache.</td>
<td>DD-083, DD-088</td>
</tr>
<tr>
<td>FR-PROPOSE-4</td>
<td>`/coherence:propose-list [--kind <k>]` — read-only browser of `state ∈ {queued, surfaced}` entries with id, kind, age, ignore-count.</td>
<td>DD-081</td>
</tr>
<tr>
<td>FR-PROPOSE-5</td>
<td>`/coherence:propose-show <id>` — diff preview of `body` field; resets `consecutive_ignored` per FR-PROPOSE-9.</td>
<td>DD-081</td>
</tr>
<tr>
<td>FR-PROPOSE-6</td>
<td>`/coherence:propose-accept <id> [--rename <new>] [--overwrite <retyped-path>]` — applies proposal, transitions state to `accepted`, emits `[coherence] accept proposal <id>` git commit.</td>
<td>DD-081, DD-082</td>
</tr>
<tr>
<td>FR-PROPOSE-7</td>
<td>`/coherence:propose-reject <id> [--reason <text>]` — terminal rejection; appends reason to `state_history`.</td>
<td>DD-081</td>
</tr>
<tr>
<td>FR-PROPOSE-8</td>
<td>`/coherence:propose-revert-acceptance <id>` — `git revert` of the original commit, producing a `[coherence-revert]` commit; transitions state to `reverted` (terminal); v0.1 `revertDetect` picks it up automatically.</td>
<td>DD-083</td>
</tr>
<tr>
<td>FR-PROPOSE-9</td>
<td>A proposal is **dropped (state → ****`expired`****)** when ANY of: (a) `now - generated_at ≥ 14 days`, (b) originating signal hash absent from `metrics.jsonl` in last 7 days, (c) consecutive-ignored counter reaches `proposal_consecutive_ignore_threshold` (default 5). Counter resets to 0 only on view via `/coherence:propose-list / -show` or terminal action; **signal recurrence does NOT reset** (OQ-v2-22).</td>
<td>DD-075</td>
</tr>
<tr>
<td>FR-PROPOSE-10</td>
<td>**Name-collision policy:** default behaviour on `propose-accept` when target path exists is **refuse**, emit `proposal_acceptance_blocked { reason: 'name_collision', existing_path_hash }` (the path is hashed for privacy in `--anonymized` output per DD-082; raw path is logged locally only), return error listing `--rename` and `--overwrite` flags. `--overwrite` requires user to retype the exact target path as a positional argument and quarantines the existing file via `quarantineFile()` before writing. The plugin **never silently overwrites**, including against plugin-managed sidecars.</td>
<td>DD-082</td>
</tr>
<tr>
<td>FR-PROPOSE-11</td>
<td>New config keys: `proposal_expiry_days = 14`, `proposal_signal_recurrence_days = 7`, `proposal_consecutive_ignore_threshold = 5`.</td>
<td>DD-075</td>
</tr>
<tr>
<td>FR-PROPOSE-12</td>
<td>Expiry sweep at SessionStart, after migration, before re-validation. Drops logged to `coherence-log.md` with reason; `/coherence:status` surfaces a per-session drop count.</td>
<td>DD-075</td>
</tr>
<tr>
<td>FR-PROPOSE-13</td>
<td>Proposal payloads validated against `proposal.schema.json` (DD-087) at the cache writer **and** on `/coherence:propose-show` read. On failure the proposal is dropped and `proposal_validation_failed { reason }` is logged.</td>
<td>DD-087</td>
</tr>
<tr>
<td>FR-PROPOSE-14</td>
<td>`/coherence:propose-list` and `/coherence:propose-show` MUST render per-item **time-to-expire** badge (derived from `expires_at` and the three DD-075 fences) and **ignore-count** badge (`consecutive_ignored`).</td>
<td>DD-075</td>
</tr>
</table>
## 5. FR-STATUSLINE — Statusline integration
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-STATUSLINE-1</td>
<td>Two integrations: (a) optional user-installed `statusLine` script reads `.claude/coherence/state-snapshot.json` and emits `🧭 <mode>  N⚠  [M proposals]`; (b) mandatory plugin-shipped `subagentStatusLine` rendering branded rows for Coherence-spawned subagents.</td>
<td>DD-070</td>
</tr>
<tr>
<td>FR-STATUSLINE-2</td>
<td>Plugin ships `bin/coherence-statusline.sh`, `bin/coherence-statusline.ps1`, `bin/coherence-subagent-statusline.sh`. Plugin's `bin/` is auto-added to Bash `PATH` per Claude Code docs.</td>
<td>DD-070</td>
</tr>
<tr>
<td>FR-STATUSLINE-3</td>
<td>`/coherence:install-statusline` writes `statusLine` to `~/.claude/settings.json` (or project equivalent) **after explicit user confirmation** and creates an automatic backup.</td>
<td>DD-070</td>
</tr>
<tr>
<td>FR-STATUSLINE-4</td>
<td>`/coherence:uninstall-statusline` reverses the change, restoring the backup.</td>
<td>DD-070</td>
</tr>
<tr>
<td>FR-STATUSLINE-5</td>
<td>Proposal-count segment wrapped in OSC 8 with **3-tier graceful degradation**: (1) preferred `claude://run/coherence:propose-skill` URI scheme if `host-capabilities.url_scheme_handler == 'osc8'`; (2) fallback OSC 52 copy-to-clipboard of `/coherence:propose-skill`; (3) plain text `[2 proposals → /coherence:propose-skill]`.</td>
<td>DD-071</td>
</tr>
<tr>
<td>FR-STATUSLINE-6</td>
<td>Statusline script must be **cancellation-safe** (Claude Code cancels in-flight runs on new updates) — file-existence + atomic-read pattern, not multi-step computation.</td>
<td>DD-070</td>
</tr>
<tr>
<td>FR-STATUSLINE-7</td>
<td>`state-snapshot.json` written by a **debounced writer** (DD-084): hooks set in-process dirty bit (no FS I/O on PostToolUse); flush when (a) dirty bit set, (b) ≥ 5 s since last flush, (c) `lockManager` acquires `state-snapshot` non-blocking. Forced flush at `Stop`, `SubagentStop`, `SessionEnd`. Worst-case staleness: 5 s.</td>
<td>DD-070 amendment, DD-084</td>
</tr>
<tr>
<td>FR-STATUSLINE-8</td>
<td>`/coherence:doctor` consults `host-capabilities.statusline_install_path` to flag drift between probe result and installed state.</td>
<td>DD-090</td>
</tr>
<tr>
<td>FR-STATUSLINE-9</td>
<td>When `host-capabilities.url_scheme_handler == 'plain'` (terminal type unknown / OSC 8 unsupported — e.g. Windows Terminal, headless CI, macOS [Terminal.app](http://Terminal.app)), `/coherence:doctor` MUST instruct the user that setting `FORCE_HYPERLINK=1` in the environment forces tier-1 OSC 8 emission. Install docs MUST list supported terminals and the `FORCE_HYPERLINK` override.</td>
<td>DD-071</td>
</tr>
<tr>
<td>FR-STATUSLINE-10</td>
<td>**First-snapshot bootstrap.** SessionStart MUST write an initial `state-snapshot.json` (post-migration, post-mode-resolve) so cold-session `bin/coherence-statusline.*` invocations never read a missing file. Bootstrap reuses the same atomic-write / lock path as the debounced flush and is exempt from the 5 s debounce floor.</td>
<td>DD-070, DD-084</td>
</tr>
</table>
## 6. FR-TRICKLE — Trickle deep-scan
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-TRICKLE-1</td>
<td>Extends v0.1 `BufferEntry.source` enum (DD-026) with one new value `'trickle_deep_scan'`. Buffer-entry schema otherwise unchanged.</td>
<td>DD-066, DD-080</td>
</tr>
<tr>
<td>FR-TRICKLE-2</td>
<td>Operational state persisted in `.claude/coherence/scan-cache/state.json` (the v0.1 directory reservation per `src/state/init.ts:52-58` is preserved; original DD's flat-file shape superseded by OQ-v2-30).</td>
<td>DD-066 (OQ-v2-30)</td>
</tr>
<tr>
<td>FR-TRICKLE-3</td>
<td>Trickle entries default to `confidence: low`, inheriting v0.1 FR-STOP-21 handling at Stop.</td>
<td>DD-066</td>
</tr>
<tr>
<td>FR-TRICKLE-4</td>
<td>Hard cap: `trickle_entries_per_session ≤ 20`.</td>
<td>DD-066</td>
</tr>
<tr>
<td>FR-TRICKLE-5</td>
<td>Trickle pass is **idle-gated**: only runs when PostToolUse hot path is otherwise quiescent (no buffer write in last `trickle.idle_threshold_ms`; default **30 000 ms**, configurable, bounds `[5_000, 120_000]`).</td>
<td>DD-066</td>
</tr>
<tr>
<td>FR-TRICKLE-6</td>
<td>Acceptance gate: median trickle pass adds \< 5 ms to SessionEnd budget (NFR-PERF-1 partition).</td>
<td>DD-066</td>
</tr>
<tr>
<td>FR-TRICKLE-7</td>
<td>New metric `trickle_scan_pass { duration_ms, files_scanned, entries_added }`. `coherence:status` surfaces trickle quota usage.</td>
<td>DD-066</td>
</tr>
</table>
## 7. FR-OBS (additive) — v0.2 telemetry
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-OBS-N1</td>
<td>`metrics.jsonl` MUST emit three new event types from v0.1.1 onwards: `tool_invocation_signature` (PostToolUse, Bash/Edit/Write only — Read excluded), `user_prompt_signature` (UserPromptSubmit), `agent_response_id` (Stop/SubagentStop). Hashing scheme per DD-068: SHA-256, first **12 hex chars (48 bits)**, computed over the normalised input. Canonical implementation: `src/util/signatureHash.ts`.</td>
<td>DD-068</td>
</tr>
<tr>
<td>FR-OBS-N1a</td>
<td>**Bash normalisation contract** (DD-068): split on whitespace honouring single/double quotes (no shell interpretation); replace volatile tokens with placeholders — `<PATH>` (POSIX `/...` or Windows `C:\\...`), `<UUID>`, `<TS>` (ISO-8601), `<NUM>` (integer ≥ 4 digits, preserving short flag values), `<HEX>` (hex string ≥ 8 chars). Pipes, sub-shells, and heredocs are NOT parsed — they hash with their literal content (acceptable because exact repetition still hashes identically).</td>
<td>DD-068</td>
</tr>
<tr>
<td>FR-OBS-N1b</td>
<td>**Edit/Write path template** (DD-068): `<DIR:n>/<basename|*.ext>`. Basename preserved verbatim when ≤ 16 chars (covers `README.md`, `package.json`, `tsconfig.json`); otherwise globbed to `*.<ext>`.</td>
<td>DD-068</td>
</tr>
<tr>
<td>FR-OBS-N1c</td>
<td>**`length_bucket`**** boundaries** (literal char counts): `sm` \< 512, `md` \< 2048, `lg` \< 8192, `xl` ≥ 8192.</td>
<td>DD-068</td>
</tr>
<tr>
<td>FR-OBS-N1d</td>
<td>**`refers_to_prior`**** heuristic**: case-insensitive regex `\b(actually|wait|no|fix|that'?s wrong|hold on|instead|undo|revert)\b` over the first 64 chars of the prompt.</td>
<td>DD-068</td>
</tr>
<tr>
<td>FR-OBS-N1e</td>
<td>**Storage budget**: the three DD-068 events together MUST stay within `~13 MB` additional disk under v0.1's 90-day rolling retention.</td>
<td>DD-068</td>
</tr>
<tr>
<td>FR-OBS-N2</td>
<td>`lastResponseId` cross-session leak prevented: `responseCorrelation` cache explicitly cleared in both `sessionStartHook` and `sessionEndHook`. First `user_prompt_signature` after `SessionStart` MUST carry `prior_response_id: null` even when a prior session published one.</td>
<td>DD-068 audit</td>
</tr>
<tr>
<td>FR-OBS-N3</td>
<td>`prior_response_id` correlation uses **peek**, not consume — two consecutive corrective prompts about the same response share a `prior_response_id` so signal-clustering sees them as one correction event.</td>
<td>DD-068 audit</td>
</tr>
<tr>
<td>FR-OBS-N4</td>
<td>v0.2 metrics MUST be emitted: `proposal_generated`, `proposal_surfaced`, `proposal_accepted`, `proposal_rejected`, `proposal_expired`, `proposal_state_transition { from, to, reason? }`, `proposal_validation_failed`, `proposal_acceptance_blocked`, `proposal_signal_observed { kind, would_have_fired, ... }`, `proposal_listed`, `proposal_shown`, `proposal_reverted`, `annotation_proposed { kind, uses_sidecar }`, `annotate_invocation { source, path }`, `annotate_blocked { reason }`, `statusline_install`, `trickle_scan_pass`, `signal_cache_pruned`, `migration_completed { from, to, duration_ms }`, `cost_ceiling_hit { feature, total_usd, ceiling_usd }`.</td>
<td>DD-066..091</td>
</tr>
<tr>
<td>FR-OBS-N5</td>
<td>All v0.2 events MUST be privacy-safe by construction: no raw command, file, or prompt content; only hashed signatures and bucketed metadata.</td>
<td>DD-068, NFR-PRIVACY-4</td>
</tr>
</table>
## 8. FR-COST (additive) — Cost-ledger & ceilings
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-COST-N1</td>
<td>`CostEntry.stage` enum widened to `'stage1' \| 'stage2' \| 'author' \| 'annotate'`. `CostEntry.prompt_version` widened to `{ stage1?, stage2?, author?, annotate?: string }`. (Additive enum widening folded into DD-080.)</td>
<td>DD-091</td>
</tr>
<tr>
<td>FR-COST-N2</td>
<td>Per-session cost ceiling = `v0.1 NFR-COST-1 baseline × 1.30`. Per-feature partition of the +30% headroom: Author ≤ 60%, Annotate ≤ 30%, Trickle ≤ 10%.</td>
<td>DD-085</td>
</tr>
<tr>
<td>FR-COST-N3</td>
<td>Before each Author/Annotate LLM call, `CostLedger.totalCostUsd()` compared against per-feature share; on overrun → **no-LLM mode** for remainder of session, emit `cost_ceiling_hit { feature, total_usd, ceiling_usd }`. Existing `degraded_mode_entered` event logged (DD-061 precedent).</td>
<td>DD-085</td>
</tr>
<tr>
<td>FR-COST-N4</td>
<td>New config key `cost_ceiling_multiplier = 1.30` (overridable per project).</td>
<td>DD-085</td>
</tr>
<tr>
<td>FR-COST-N5</td>
<td>Author/Annotate share v0.1 model `claude-sonnet-4-5-20251022` with `temperature: 0`. Prompts under `prompts/v2/` with `manifest.json` carrying inherited `stage1_version: "v1.0"`, `stage2_version: "v1.0"` plus `author_version: "v2.0"`, `annotate_version: "v2.0"`. v0.1 `prompts/v1/` continues to ship side-by-side.</td>
<td>DD-091</td>
</tr>
<tr>
<td>FR-COST-N6</td>
<td>Cassettes under `tests/cassettes/author/` and `tests/cassettes/annotate/`.</td>
<td>DD-091</td>
</tr>
</table>
## 9. FR-PERMISSION (additive) — Trust & writes
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-PERMISSION-N1</td>
<td>The plugin MUST NOT write any file under `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, or any user-owned config directory unless triggered by an explicit user-typed `/coherence:propose-accept <id>` (or, for statusline only, `/coherence:install-statusline` / `/coherence:uninstall-statusline`).</td>
<td>DD-065</td>
</tr>
<tr>
<td>FR-PERMISSION-N2</td>
<td>The plugin MUST NOT modify `~/.claude/settings.json` (or project equivalent) except via `/coherence:install-statusline` and `/coherence:uninstall-statusline`, both of which require explicit confirmation and create automatic backups.</td>
<td>DD-070</td>
</tr>
<tr>
<td>FR-PERMISSION-N3</td>
<td>Every accept commit MUST be prefixed `[coherence] accept proposal <id>`; every revert commit MUST be prefixed `[coherence-revert]`. (Inherits v0.1 DD-005, FR-PERMISSION-4.)</td>
<td>DD-081, DD-083</td>
</tr>
<tr>
<td>FR-PERMISSION-N4</td>
<td>`coherence/ignore` semantics extend to per-doc Annotate (FR-ANNOTATE-8). The single privacy boundary `PathFilter` (`src/detection/pathFilter.ts`) is the canonical gate.</td>
<td>DD-073</td>
</tr>
</table>
## 10. FR-COMMANDS (additive) — Slash-command set
<table header-row="true">
<tr>
<td>Command</td>
<td>Purpose</td>
</tr>
<tr>
<td>`/coherence:graduate <mode> [<path>]`</td>
<td>Mode flip per FR-MODES-4</td>
</tr>
<tr>
<td>`/coherence:graduate --status`</td>
<td>Per-scope mode mapping report</td>
</tr>
<tr>
<td>`/coherence:annotate <path>`</td>
<td>Per-doc Annotate proposal</td>
</tr>
<tr>
<td>`/coherence:propose-list [--kind <k>]`</td>
<td>Read-only proposal browser</td>
</tr>
<tr>
<td>`/coherence:propose-show <id>`</td>
<td>Diff preview</td>
</tr>
<tr>
<td>`/coherence:propose-accept <id> [--rename <new>] [--overwrite <retyped-path>]`</td>
<td>Apply proposal</td>
</tr>
<tr>
<td>`/coherence:propose-reject <id> [--reason <text>]`</td>
<td>Terminal rejection</td>
</tr>
<tr>
<td>`/coherence:propose-revert-acceptance <id>`</td>
<td>`git revert` accepted proposal</td>
</tr>
<tr>
<td>`/coherence:install-statusline`</td>
<td>Opt-in `statusLine` writer with backup</td>
</tr>
<tr>
<td>`/coherence:uninstall-statusline`</td>
<td>Reverses install</td>
</tr>
</table>
All commands wired in `plugin.json`, non-interactive (slash-command constraint), and emit metrics on every action.
## 11. FR-FAILURE (additive) — Migration & state safety
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-FAILURE-N1</td>
<td>Single migrator `src/state/migrate/v1_to_v2.ts` slotted at `src/state/migrate/index.ts:46` performs the entire v1 → v2 bump atomically: bumps `version.json.schema_version → 2`; widens `BufferEntry.source` (`  • 'trickle_deep_scan' \| 'annotate' \| 'author'`); widens `CostEntry.stage` (`  • 'author' \| 'annotate'`); creates empty `graduation.json`, `proposal-cache.json`, `signal-cache.json`, `scan-cache/state.json`, `state-snapshot.json` with `schema_version: 2`; extends `SCHEMA_NAMES` and `FILE_TO_SCHEMA`.</td>
<td>DD-080</td>
</tr>
<tr>
<td>FR-FAILURE-N2</td>
<td>Migration failure mode reuses v0.1 quarantine policy from `migrate/v0_to_v1.ts`: quarantine corrupt/old file, write fresh default, log, continue (FR-FAILURE-2).</td>
<td>DD-080</td>
</tr>
<tr>
<td>FR-FAILURE-N3</td>
<td>Illegal proposal-state transitions raise `ProposalStateError` and quarantine the cache file (mirrors `StateStore.read` quarantine path).</td>
<td>DD-088</td>
</tr>
</table>
## 12. FR-PRIVACY (additive) — `share-metrics` redaction
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-PRIVACY-N1</td>
<td>`anonymizeRecord()` allowlist in `src/commands/shareMetrics.ts:24-50` extended to cover the three DD-068 events end-to-end. `tool_invocation_signature` and `user_prompt_signature` pass through (`prior_response_id` defensively hashed); `agent_response_id` defensively hashes `response_id`. `proposal_acceptance_blocked` MUST emit `existing_path_hash` (never the raw path) in `--anonymized` output.</td>
<td>DD-086, DD-082</td>
</tr>
<tr>
<td>FR-PRIVACY-N2</td>
<td>Fixture-driven test (`tests/unit/commands/shareMetrics.dd068.test.ts`) MUST assert no raw command, path, or prompt text appears in `--anonymized` output for each event type.</td>
<td>DD-086</td>
</tr>
<tr>
<td>FR-PRIVACY-N3</td>
<td>User-confirmation gate (`requiresConfirmation: true`) at `shareMetrics.ts:60-72` unchanged. Egress remains a v0.3 concern.</td>
<td>DD-086</td>
</tr>
<tr>
<td>FR-PRIVACY-N4</td>
<td>`docs/privacy.md` MUST enumerate the v0.2 event redaction matrix.</td>
<td>DD-086</td>
</tr>
</table>
