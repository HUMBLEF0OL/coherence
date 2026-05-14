<!-- url: https://www.notion.so/35b010d46a7081b0b4afec8eb33fcba5 -->
<!-- id: 35b010d4-6a70-81b0-b4af-ec8eb33fcba5 -->
<!-- title: ⚙️ BRD-2 — Functional Requirements -->
**Parent:** [📘 10. BRD — Coherence v0.1](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea)
---
Each functional requirement is traced to source design decisions in [3. Design Decisions](https://www.notion.so/e3d010d46a70839f9e358122c2a8cd07). Requirement IDs use the form `FR-<area>-<n>`. "Must / Should / May" follow RFC 2119 conventions.
## 2.1 Installation & Bootstrap (FR-INSTALL)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-INSTALL-1</td>
<td>Plugin **must** install via a single command (`claude plugin install coherence`) and require no manual configuration to run in Observe mode.</td>
<td>—</td>
</tr>
<tr>
<td>FR-INSTALL-2</td>
<td>On first SessionStart in a project, plugin **must** detect whether `.claude/coherence/` exists; if not, create it with default state files.</td>
<td>DD-029</td>
</tr>
<tr>
<td>FR-INSTALL-3</td>
<td>Plugin **must** run a `/coherence:doctor` self-check at install that probes host capabilities (subagent attribution mode, hook event shapes) and writes results to `.claude/coherence/host-capabilities.json`.</td>
<td>DD-043, DD-050, DD-062</td>
</tr>
<tr>
<td>FR-INSTALL-4</td>
<td>Plugin **must** record its own version, schema versions, and prompt versions in `.claude/coherence/version.json` on every install or upgrade.</td>
<td>DD-064</td>
</tr>
<tr>
<td>FR-INSTALL-5</td>
<td>If plugin schema is newer than installed plugin, plugin **must** enter read-only mode and surface an upgrade prompt rather than crash.</td>
<td>DD-026, DD-064</td>
</tr>
<tr>
<td>FR-INSTALL-6</td>
<td>`/coherence:doctor` **must** run at install (not every session) and cache its results (`subagent_attribution: line-level | file-level-fallback | absent`, `frontmatter_preserves_unknown_keys: true | false`, hook-event shapes) in `.claude/coherence/host-capabilities.json`. Subsequent sessions read the cache; users may re-run `/coherence:doctor` manually to refresh.</td>
<td>DD-043, DD-050, DD-062</td>
</tr>
<tr>
<td>FR-INSTALL-7</td>
<td>Every hook entry point (SessionStart, PostToolUse, SubagentStop, Stop, UserPromptSubmit) **must** check for `.claude/coherence/DISABLED` (kill-switch sentinel) before doing any work; when present, the hook returns success immediately with no I/O, no LLM calls, and no `additionalContext`. The presence of the sentinel **must** be surfaced once per session in `/coherence:status` output (“Plugin disabled via kill-switch sentinel”).</td>
<td>DD-019</td>
</tr>
</table>
## 2.2 Drift Detection (FR-DETECT)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-DETECT-1</td>
<td>PostToolUse hook **must** fire on Write, Edit, and Bash tool events and run a deterministic JS path-pattern filter against doc-declared `watches:` globs.</td>
<td>DD-007, Architecture §Hook Mapping</td>
</tr>
<tr>
<td>FR-DETECT-2</td>
<td>When a watched path matches, plugin **must** append a structured entry to `.claude/coherence/drift-buffer.json`.</td>
<td>DD-026</td>
</tr>
<tr>
<td>FR-DETECT-3</td>
<td>Buffer entries **must** conform to the DD-026 schema (entry_id, section_ref, triggering_files, tool, timestamp, change_class_hint, confidence, state, matched_watch_glob, source). Trigger grouping is materialised at Stop by file-overlap union-find over `triggering_files` (DD-025); no `trigger_id` field exists.</td>
<td>DD-025, DD-026</td>
</tr>
<tr>
<td>FR-DETECT-4</td>
<td>Plugin **must** support YAML-frontmatter section anchors with stable IDs and a heading-based fallback when anchors are absent.</td>
<td>DD-007, DD-050</td>
</tr>
<tr>
<td>FR-DETECT-5</td>
<td>Plugin **must** detect anchor ID collisions across files at SessionStart and refuse to write patches into colliding sections until resolved.</td>
<td>DD-045</td>
</tr>
<tr>
<td>FR-DETECT-6</td>
<td>SessionStart **must** re-validate every entry in `pending.md` against the current code state and drop entries whose triggering condition no longer holds.</td>
<td>DD-029</td>
</tr>
<tr>
<td>FR-DETECT-7</td>
<td>SubagentStop **must** capture output-use signal via the deterministic state machine (Accepted / Edited / Discarded) using line-level provenance when host attribution is available.</td>
<td>DD-013, DD-022</td>
</tr>
<tr>
<td>FR-DETECT-8</td>
<td>When host attribution is absent, plugin **must** fall back to file-level attribution within `min(5 minutes, same agent turn)` and surface this in `/coherence:status` as `provenance: file-level fallback`.</td>
<td>DD-062</td>
</tr>
<tr>
<td>FR-DETECT-9</td>
<td>Plugin **must not** attempt to detect mid-session branch switches in v0.1; this is a documented limitation. Stop-time DD-029 re-validation drops entries whose paths/anchors no longer resolve, which naturally covers the post-switch case.</td>
<td>DD-044, DD-029</td>
</tr>
<tr>
<td>FR-DETECT-10</td>
<td>Plugin **must** detect Claude Code context compaction (PreCompact hook when present, 30-minute wall-time fallback otherwise) and reset `last_refreshed_section_set` and `last_refreshed_flagged_agents` so the next non-empty buffer re-injects silent context.</td>
<td>DD-039, DD-020, DD-024</td>
</tr>
<tr>
<td>FR-DETECT-11</td>
<td>SessionStart **must** run a deterministic sweep for `<!-- coherence-pending: YYYY-MM-DD -->` markers in indexed docs, finalise any whose date is ≥7 days old via a `[coherence] finalize` commit, and log to `coherence-log.md`. Sweep runs before DD-029 re-validation per DD-053 sequencing.</td>
<td>DD-038, DD-053</td>
</tr>
<tr>
<td>FR-DETECT-12</td>
<td>SessionStart and Stop **must** run a stack-based anchor-integrity scan over indexed docs that detects orphan opens, missing closes, and duplicate `id=` values within a file. A file with any such error is treated as **fatal-for-file**: plugin refuses to plan, patch, or auto-apply against any of its sections until `/coherence:repair` resolves it.</td>
<td>DD-007, DD-045</td>
</tr>
<tr>
<td>FR-DETECT-13</td>
<td>Skill and agent discovery **must** be restricted to canonical paths `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`. Files outside these paths are silently ignored by Coherence even if structurally valid; `/coherence:status` surfaces a one-line discovery scope reminder.</td>
<td>DD-040</td>
</tr>
<tr>
<td>FR-DETECT-14</td>
<td>SessionStart **must** scan `[coherence]` commits since the previous SessionStart; for each, if any subsequent commit on the current branch removes ≥80% of the lines that commit added to a file, the section is counted as reverted-once and feeds the DD-011 velocity counter (auto-ignore at 2 reverts within 30 days).</td>
<td>DD-035, DD-011</td>
</tr>
<tr>
<td>FR-DETECT-15</td>
<td>Section references in all plugin state and logs **must** be normalised to `<workspace-relative-path>#<id-or-heading-anchor>`: paths use OS canonical realpath with forward-slash separators (no `./` prefix); when a heading fallback is used, the slug **must** be GitHub-compatible (lowercase, GitHub punctuation strip, hyphenate whitespace, `-1`/`-2`/… disambiguation in document order); IDs are restricted to `[a-z0-9_-]+`; heading-fallback usage warns once per file per session.</td>
<td>DD-027, DD-007</td>
</tr>
<tr>
<td>FR-DETECT-16</td>
<td>The DD-013 user-message keyword classifier **must** inspect only the first two user messages following each SubagentStop (exclusive 2-message window); messages 3+ are ignored; final state is computed at SessionEnd by combining the windowed keyword signal with the file-modification signal across the entire session.</td>
<td>DD-013, DD-034</td>
</tr>
<tr>
<td>FR-DETECT-17</td>
<td>At each SubagentStop the plugin **must** record line-level provenance for every file the subagent modified to `.claude/coherence/subagent-history.jsonl` (one JSON line per file: `{ts, subagent_id, file, lines_added: [start,end][], lines_removed: [start,end][], net_delta, classified: pending}`). Aggregate counts are appended to `subagent-stats.json`. When a `[coherence]` revert commit removes ≥80% of a subagent's added lines within 7 days, the matching history entries **must** be retroactively reclassified to `classified: rejected` and the subagent's stats updated. Text-only subagents (no file tools invoked) get a single zero-delta entry. Both files use 90-day rolling retention (NFR-OBS-2).</td>
<td>DD-013, DD-035, DD-011</td>
</tr>
</table>
## 2.3 Mid-Session Behavior (FR-MIDSESSION)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-MIDSESSION-1</td>
<td>When buffer is non-empty, PostToolUse **must** inject a brief silent context refresh via `additionalContext` listing potentially-stale sections, costing approximately 50 tokens per refresh.</td>
<td>DD-012 (Mechanism 1), DD-020</td>
</tr>
<tr>
<td>FR-MIDSESSION-1b</td>
<td>The silent refresh **must** fire only when the buffer's section-set hash changes since the last injection (additions, removals, or replacements), OR when an unflagged subagent transitions to flagged. SessionStart and detected compaction events reset the cached section-set so the next non-empty buffer re-injects.</td>
<td>DD-020, DD-024, DD-039</td>
</tr>
<tr>
<td>FR-MIDSESSION-1c</td>
<td>Compaction **must** be detected by tracking the running token-count delta reported on each PostToolUse: a sudden drop ≥50% from the previous invocation (and absolute drop ≥5 000 tokens) is treated as compaction. On detection: cached section-set hash is cleared, the next non-empty buffer re-injects (FR-MIDSESSION-1b), and the compaction event is appended to `coherence-log.md`. If the host does not surface token counts, the plugin falls back to time-based heuristic (no PostToolUse for ≥10 minutes followed by a new one) and records the degraded mode in `host-capabilities.json`.</td>
<td>DD-020, DD-039</td>
</tr>
<tr>
<td>FR-MIDSESSION-2</td>
<td>UserPromptSubmit **must** detect long-agent-turn boundaries (≥60s OR 5+ tool calls OR 5+ min user silence).</td>
<td>DD-012 (Mechanism 2)</td>
</tr>
<tr>
<td>FR-MIDSESSION-3</td>
<td>Mid-session review surfacing **must** fire only when ALL three conditions hold: 3+ distinct trigger groups, 15+ minutes since last Stop/review, and post-long-agent-turn.</td>
<td>DD-012</td>
</tr>
<tr>
<td>FR-MIDSESSION-4</td>
<td>Plugin **must** never block the agent's hot path; mid-session mechanisms inject context but do not pause execution.</td>
<td>DD-012, DD-061</td>
</tr>
<tr>
<td>FR-MIDSESSION-5</td>
<td>`/coherence:review` slash command **must** run the Stop pipeline against the current buffer mid-session without ending the session.</td>
<td>DD-021, DD-046</td>
</tr>
<tr>
<td>FR-MIDSESSION-6</td>
<td>`/coherence:review --estimate` **must** project token spend and dollar cost without invoking Stage 2 (Stage 1 only or pure heuristic) and surface the estimate to the user before any chargeable call runs.</td>
<td>DD-046</td>
</tr>
</table>
## 2.4 Stop Pipeline (FR-STOP)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-STOP-1</td>
<td>Stop hook **must** group buffer entries by trigger source deterministically; no semantic grouping.</td>
<td>DD-009, DD-025</td>
</tr>
<tr>
<td>FR-STOP-2</td>
<td>For groups containing 2+ sections, plugin **must** invoke the Stage 1 Coherence Planner LLM call producing JSON with role (canonical/reference/consumer/no-change) and relation (extends/supersedes/contradicts/omits).</td>
<td>DD-008, DD-015</td>
</tr>
<tr>
<td>FR-STOP-3</td>
<td>Stage 1 plan **must** be deterministically validated: exactly one canonical, all sections accounted for, valid IDs, schema correct. Validation failure falls back to independent patches with warning logged.</td>
<td>DD-015, DD-049</td>
</tr>
<tr>
<td>FR-STOP-4</td>
<td>Stage 2 patch writers **must** run in parallel, one LLM call per section needing a patch, each receiving the plan as context.</td>
<td>DD-008</td>
</tr>
<tr>
<td>FR-STOP-5</td>
<td>Stage 2 outputs **must** be one of: unified diff, `NO_PATCH_NEEDED`, `ESCALATE`, or `PLAN_DISAGREES`.</td>
<td>DD-008, DD-033, DD-042</td>
</tr>
<tr>
<td>FR-STOP-6</td>
<td>Every patch **must** pass deterministic validation: format → apply → sanity (change-class) → line-count (auto-ESCALATE if \>40% of section) → hallucination grep (two-tier: strict for paths, loose for symbols).</td>
<td>DD-008, DD-017, DD-032, DD-047</td>
</tr>
<tr>
<td>FR-STOP-6b</td>
<td>Sanity validation **must** treat the deterministic change-class check (additive vs modifying vs destructive, per DD-017 line-counting rules ignoring whitespace-only `-` lines) as the source of truth; an LLM-declared change-class that disagrees **must** be re-classified to the deterministic value, the corrected class **must** drive permission gating (e.g. an LLM-claimed-additive that is actually modifying loses its auto-apply privilege), and the override **must** be logged for telemetry. The patch is **not** rejected for class mismatch alone.</td>
<td>DD-017</td>
</tr>
<tr>
<td>FR-STOP-6c</td>
<td>Hallucination-grep tier classification **must** be per-token deterministic regex per DD-032: strict tier matches paths (`/`, `\`, `::`), member-access chains (`foo.bar`), import-line tokens (per the DD-047 per-language registry), length-≥16 with structural marker, and length-≥6 mixed-case-with-digit; loose tier covers everything else. Language is detected by file extension; v0.1 ships registries for TypeScript/JavaScript, Python, Go, Rust, Java, C#, Ruby, and PHP. Files with unregistered extensions still receive rules 1, 2, 4, 5 (only the import-line rule degrades).</td>
<td>DD-032, DD-047</td>
</tr>
<tr>
<td>FR-STOP-7</td>
<td>When loose-tier hallucination grep detects ≥3 unfamiliar tokens AND the strict tier would otherwise pass, the patch's change-class **must** be demoted one tier.</td>
<td>DD-058</td>
</tr>
<tr>
<td>FR-STOP-8</td>
<td>Patches targeting the same file **must** go through deterministic merge before commit; overlapping diffs reject all and surface for human review. File is the atomic write unit.</td>
<td>DD-008</td>
</tr>
<tr>
<td>FR-STOP-9</td>
<td>Plan-derived bundles **must** present to the user as one atomic accept/reject; user can expand individual diffs but cannot accept partially. Single-section patches without a plan remain individually selectable.</td>
<td>DD-008</td>
</tr>
<tr>
<td>FR-STOP-10</td>
<td>Pipeline **must** enforce hard caps: ≤3 trigger groups per Stop, ≤12 sections per group, ≤36 total Stage 2 calls, ≤30,000 total input tokens, ≤8,000 total output tokens.</td>
<td>DD-056</td>
</tr>
<tr>
<td>FR-STOP-11</td>
<td>When caps are reached, plugin **must** select sections by canonical-first priority order and defer overflow to `pending.md`, surfacing a user-visible "N sections deferred to next Stop" notice.</td>
<td>DD-056</td>
</tr>
<tr>
<td>FR-STOP-12</td>
<td>Stop pipeline **must** checkpoint progress to `.claude/coherence/stop-progress.json` between Stage 2 calls so a crashed pipeline resumes without re-running completed Stage 2 calls on restart.</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-STOP-13</td>
<td>Stage 1 and Stage 2 prompts **must** be loaded from versioned files in `prompts/v{n}/` and **must** use Anthropic prompt caching on the stable prefix.</td>
<td>DD-057</td>
</tr>
<tr>
<td>FR-STOP-14</td>
<td>Canonical selection across a trigger group **must** follow the unified Canonical Selection Algorithm: (1) compute deepest common ancestor `D` of triggering files; (2) FILTER candidates whose containing file is at-or-above `D` (DD-028); (3) NEAREST-WINS by directory distance to `D` (DD-018); (4) DEPTH-SCORE tiebreak (DD-016); (5) lexicographic path order as final deterministic tiebreak.</td>
<td>DD-049, DD-018, DD-028, DD-016</td>
</tr>
<tr>
<td>FR-STOP-15</td>
<td>Stage 2 patch writers **must** read each section's content from disk at patch-generation time (never from a PostToolUse snapshot), so finalize commits, manual edits, and `git pull` between PostToolUse and Stop never produce stale patches.</td>
<td>DD-053 (Rule 2)</td>
</tr>
<tr>
<td>FR-STOP-16</td>
<td>Sections assigned `role: no-change` by Stage 1 **must not** trigger a Stage 2 LLM call; the pipeline records them as `NO_PATCH_NEEDED` automatically. A planner output combining `role: no-change` with `relation: omits` is rejected as contradictory and the trigger group falls back to per-section independent patches with a logged warning.</td>
<td>DD-042, DD-015</td>
</tr>
<tr>
<td>FR-STOP-17</td>
<td>When Stage 2 returns `PLAN_DISAGREES` for a section, the patch **must** be dropped from the bundle (no retry, no fallback LLM call), the Stop review **must** show a one-line note (“Section S declined the plan; no patch generated. Review manually.”), and the section's buffer entry **must** transition to `state: deferred` so the next Stop pass gets a chance with fresh planner inputs.</td>
<td>DD-033, DD-010</td>
</tr>
<tr>
<td>FR-STOP-18</td>
<td>When the same section is flagged in two independent trigger groups, the groups **must** stay separate (no group-level merge); the file-level merge step rejects overlapping diffs and the Stop review surfaces a single consolidated note (“Section S has competing patches from N independent changes; review and apply manually”) showing both plans' context side-by-side.</td>
<td>DD-031, DD-008</td>
</tr>
<tr>
<td>FR-STOP-19</td>
<td>Sections whose `asserts:` predicates **fail** at SessionStart evaluation (per FR-DETECT and DD-054) **must** be appended to the Stop pipeline as a synthetic trigger group (planner role: `assertion-failed`, relation: `contradicts`) so the patch writer is forced to reconcile the doc with current code; the Stop review **must** label these entries `[assert]` distinctly from PostToolUse-buffered entries and the buffer entry's `source` field is `assertion`.</td>
<td>DD-054, DD-007</td>
</tr>
<tr>
<td>FR-STOP-20</td>
<td>Stage 1 planner output **must** include a `demoted_canonicals: [section_id]` array listing any sections it decided to demote from canonical to peripheral; demoted sections **must** receive a one-line user notice in the Stop review (“Section S demoted from canonical → peripheral; consider archiving”) and the demotion **must** be recorded in `coherence-log.md` for telemetry. Demotions never auto-apply; they always require explicit user approval via `/coherence:apply` regardless of change-class.</td>
<td>DD-028</td>
</tr>
<tr>
<td>FR-STOP-21</td>
<td>Buffer entries with `confidence: low` (per FR-BUFFER-8) **must not** be sent to Stage 2; instead they are appended to `observations.md` as one Markdown bullet per entry (`  • <ISO-ts> [low-conf] section <id>: <one-line reason>`) and dropped from the buffer. `confidence: high` entries follow the normal Stage 1 → Stage 2 path. Re-promotion from low→high requires explicit `/coherence:review` or two further PostToolUse hits on the same section within 24h (per DD-026).</td>
<td>DD-026</td>
</tr>
</table>
## 2.5 Buffer Lifecycle (FR-BUFFER)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-BUFFER-1</td>
<td>PostToolUse with significant change → append entry. Stop with no entries → no-op.</td>
<td>DD-010</td>
</tr>
<tr>
<td>FR-BUFFER-2</td>
<td>On user accept of a bundle, plugin **must** clear those entries from the buffer.</td>
<td>DD-010</td>
</tr>
<tr>
<td>FR-BUFFER-3</td>
<td>On user reject / Skip, plugin **must** mark entries deferred but keep them in-session.</td>
<td>DD-010</td>
</tr>
<tr>
<td>FR-BUFFER-4</td>
<td>SessionEnd **must** persist all deferred entries to `.claude/coherence/pending.md` atomically.</td>
<td>DD-010, DD-029</td>
</tr>
<tr>
<td>FR-BUFFER-5</td>
<td>Per-section velocity limit **must** be enforced: 2 patch-and-revert cycles within 30 days → auto-ignore with a one-line user notice and opt-out path.</td>
<td>DD-011</td>
</tr>
<tr>
<td>FR-BUFFER-6</td>
<td>Consecutive-session defer counter **must** increment when a section is deferred without intervening acceptance and reset on accept.</td>
<td>DD-051</td>
</tr>
<tr>
<td>FR-BUFFER-7</td>
<td>`pending.md` **must** be hard-capped at 200 entries (oldest pruned by timestamp before re-validation runs); SessionStart re-validation **must** drop any entry older than 14 days as the staleness fence, and **must not** invoke any LLM call.</td>
<td>DD-029</td>
</tr>
</table>
## 2.6 Permission & Review UX (FR-PERMISSION)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-1</td>
<td>Default install state **must** be Observe mode — no auto-writes.</td>
<td>Roadmap, DD-030</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-2</td>
<td>Auto-apply at commit time **must** be opt-in only and **must** be limited to additive change-class.</td>
<td>DD-037</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-3</td>
<td>Patches that touch the YAML frontmatter of a skill or subagent file (description, allowed-tools, model, coherence-key, etc.) **must** always require explicit user confirmation regardless of size, because frontmatter changes alter triggering behaviour. Body-only patches follow the normal change-class gating in DD-002.</td>
<td>DD-002, DD-050</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-4</td>
<td>Every successful `/coherence:apply` (and auto-applied additive patches) **must** create a single git commit prefixed `[coherence]` whose body lists each section ID modified, one per line, in the deterministic format `section: <workspace-relative-path>#<id-or-heading-anchor>` so FR-DETECT-14 revert detection can parse them mechanically. Commits **must** never include unrelated working-tree changes (FR-FAILURE-5 / NFR-RELIABILITY-6 pre-flight enforces this).</td>
<td>DD-035, DD-051, DD-061</td>
<td>Approved patches **must** be committed individually with `[coherence]` prefix and the section ID(s) in the commit body.</td>
<td>DD-008, DD-052</td>
</tr>
<tr>
<td>FR-PERMISSION-5</td>
<td>`/coherence:status` **must** produce a canonical fixed-order output with conditional sections (provenance mode, pending count, deferred count, recent activity).</td>
<td>DD-055</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-6</td>
<td>`/coherence:repair` **must** support recovering from buffer corruption, anchor collisions, and [pending.md](http://pending.md) schema mismatches.</td>
<td>DD-038, DD-045</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-7</td>
<td>Statusline badge **must** be hidden when the buffer is empty, render `[🧭 N]` (N = distinct sections in buffer) when non-empty, and render `[🧭 ⚠]` while plugin is in degraded mode.</td>
<td>DD-019, DD-061</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-8</td>
<td>Assertion-triggered entries **must** present in a separate Stop review section with a 3-action UX (accept / edit assertion / dismiss) and **must** always carry high confidence.</td>
<td>DD-054</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-9</td>
<td>When the Canonical Selection Algorithm demotes any user-declared canonicals for a planning call, the Stop review **must** show a one-line notice (“N other declared-canonical section(s) were treated as references for this change”) and the demotions **must** be captured in `observations.md` and `/coherence:status`.</td>
<td>DD-028, DD-049</td>
<td></td>
<td></td>
</tr>
<tr>
<td>FR-PERMISSION-10</td>
<td>Each assertion-failure row in the Stop review **must** display the section's `last-verified` date and age (e.g. “Assertion declared 2024-11-01 — 94 days ago”) so the user can judge whether the assertion itself is stale before patching.</td>
<td>DD-054</td>
<td></td>
<td></td>
</tr>
</table>
## 2.7 Failure Handling (FR-FAILURE)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-FAILURE-1</td>
<td>All state file writes **must** be atomic via temp-file + rename.</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-2</td>
<td>All state file reads **must** revalidate against the schema; on validation failure, plugin **must** quarantine the file under `.claude/coherence/quarantine/` and proceed with a fresh state.</td>
<td>DD-026, DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-3</td>
<td>Concurrent-session writes to shared state files **must** use file-level locking with timeout.</td>
<td>DD-041</td>
</tr>
<tr>
<td>FR-FAILURE-3b</td>
<td>Advisory `<file>.lock` siblings **must** record `{pid, started_at, hostname, namespace_hint}`. Stale-detection rules: same hostname + namespace → `process.kill(pid, 0)` alive-check; cross-hostname or cross-namespace → fall through to `started_at` age only (never probe a foreign PID). Stale fences: 30 s for buffer mutations, 5 s for the trickle scanner lock. Acquisition uses exponential backoff (10/20/40… ms, capped 500 ms) up to 5 s total before the hook logs the failure and skips.</td>
<td>DD-041</td>
</tr>
<tr>
<td>FR-FAILURE-4</td>
<td>After 3 consecutive lock-acquisition timeouts on a single hook, plugin **must** enter degraded mode and skip writes for the remainder of the session, surfacing `[🧭 ⚠]` in the statusline.</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-5</td>
<td>Before any `[coherence]` commit plugin **must** (a) skip and defer if `MERGE_HEAD`/`CHERRY_PICK_HEAD`/`REBASE_HEAD`/`rebase-apply/`/`rebase-merge/` are present (logged as `git_state_busy`), (b) warn but proceed on detached HEAD, (c) stage only the explicit doc paths (never `git add .`), and (d) on non-zero `git commit` exit, roll back via `git reset HEAD` plus `git checkout -- <docs>` and defer the buffer entry.</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-6</td>
<td>If any 3 hook fires within a single session throw uncaught exceptions, plugin **must** auto-disable by writing `.claude/coherence/disabled` with a diagnostic message.</td>
<td>DD-064</td>
</tr>
<tr>
<td>FR-FAILURE-7</td>
<td>`/coherence:recover` slash command **must** repair common failure states (clear quarantine, reset locks, drop corrupted progress files).</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-FAILURE-8</td>
<td>Manual kill-switch: when `.claude/coherence/disabled` exists, plugin **must** load in no-op mode — hooks register and return immediately, no buffer writes, no LLM calls, no commits.</td>
<td>DD-064</td>
</tr>
</table>
## 2.8 Observability (FR-OBS)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-OBS-1</td>
<td>Plugin **must** maintain `.claude/coherence/coherence-log.md` with structured, newest-first entries referencing git-refs (no inline diffs).</td>
<td>DD-052</td>
</tr>
<tr>
<td>FR-OBS-2</td>
<td>Plugin **must** maintain `.claude/coherence/metrics.jsonl` recording deterministic events: patch proposed, patch applied, patch reverted, defer, hallucination grep result, cost per Stop.</td>
<td>DD-060</td>
</tr>
<tr>
<td>FR-OBS-3</td>
<td>Plugin **must not** auto-upload metrics. Sharing **must** be explicit per session via a documented command.</td>
<td>DD-060</td>
</tr>
<tr>
<td>FR-OBS-4</td>
<td>Stage 2 validation failures **must** log to `.claude/coherence/revalidation-log.md` with the patch payload and the specific check that failed.</td>
<td>DD-008</td>
</tr>
<tr>
<td>FR-OBS-5</td>
<td>`/coherence:status` **must** display per-subagent rolling-window stats (last 50 invocations) with discard-rate / edit-rate flags.</td>
<td>DD-022, DD-024</td>
</tr>
<tr>
<td>FR-OBS-6</td>
<td>`/coherence:status` **must** include a `coherence_session_cost` block aggregating cumulative spend across `/coherence:review` invocations and the next Stop in the current session (Stage 1 calls, Stage 2 calls, tokens in/out, estimated USD, review invocation count). Counter resets at SessionEnd.</td>
<td>DD-046</td>
</tr>
<tr>
<td>FR-OBS-7</td>
<td>`/coherence:status` **must** include a velocity block listing any section with non-zero `revert_count` or `consecutive_defer_sessions`, alongside the auto-ignore threshold for each, so the user can see imminent auto-ignores before they fire.</td>
<td>DD-051, DD-055</td>
</tr>
</table>
## 2.9 Layer-Specific Requirements (FR-LAYERS)
<table header-row="true">
<tr>
<td>ID</td>
<td>Requirement</td>
<td>DD</td>
</tr>
<tr>
<td>FR-LAYERS-1</td>
<td>Skills and subagents **must** use YAML-only frontmatter for coherence metadata; HTML anchors **must** be restricted to prose docs to avoid polluting agent context.</td>
<td>DD-050</td>
</tr>
<tr>
<td>FR-LAYERS-2</td>
<td>The `coherence:` frontmatter key **must** be preserved verbatim across patch operations; patches that would alter it are rejected.</td>
<td>DD-043</td>
</tr>
<tr>
<td>FR-LAYERS-3</td>
<td>Subagent rolling window **must** be the last 50 invocations (configurable via `window_total`); subagents below the trend threshold (`window_trend`, default 10) appear in `/coherence:status` with `trend: insufficient_data` and **must not** trigger flagging.</td>
<td>DD-022, DD-023</td>
</tr>
<tr>
<td>FR-LAYERS-4</td>
<td>Subagent flag thresholds (per DD-013): discard rate \>25% across last 10+ invocations, edit rate \>50% across last 10+ invocations, OR a sudden shift \>20pp comparing the last 5 vs the prior 10 invocations.</td>
<td>DD-013, DD-022</td>
</tr>
<tr>
<td>FR-LAYERS-5</td>
<td>Cross-reference check at Coherence Pass: when a single-layer patch is approved, plugin **must** scan the other two layers for sections that reference the same canonical concept and add affected files to the same review batch.</td>
<td>Architecture §Coherence Pass</td>
</tr>
</table>
## 2.10 Slash Commands (FR-COMMANDS)
<table header-row="true">
<tr>
<td>ID</td>
<td>Command</td>
<td>Purpose</td>
<td>DD</td>
</tr>
<tr>
<td>FR-COMMANDS-1</td>
<td>`/coherence:status`</td>
<td>Canonical status output</td>
<td>DD-055</td>
</tr>
<tr>
<td>FR-COMMANDS-2</td>
<td>`/coherence:review`</td>
<td>Run Stop pipeline mid-session</td>
<td>DD-021</td>
</tr>
<tr>
<td>FR-COMMANDS-3</td>
<td>`/coherence:repair`</td>
<td>Recover from buffer / anchor / schema problems</td>
<td>DD-038, DD-045</td>
</tr>
<tr>
<td>FR-COMMANDS-4</td>
<td>`/coherence:recover`</td>
<td>Manual recovery from degraded / disabled / corrupted state</td>
<td>DD-061</td>
</tr>
<tr>
<td>FR-COMMANDS-5</td>
<td>`/coherence:doctor`</td>
<td>Re-run host-capability probe</td>
<td>DD-043, DD-062</td>
</tr>
<tr>
<td>FR-COMMANDS-6</td>
<td>`/coherence:graduate` (and `--revert`)</td>
<td>Flip `mode: observe` ↔ `mode: graduated` flag in config; enables/disables Stop's LLM patch pipeline. Annotate/Author transitions are deferred to v0.2.</td>
<td>DD-048</td>
</tr>
<tr>
<td>FR-COMMANDS-7</td>
<td>`/coherence:enable-sidecars`</td>
<td>Opt into `.claude/coherence/sidecars/<name>.yaml` fallback when `/coherence:doctor` reports `frontmatter_preserves_unknown_keys: false` so skills/agents can still carry coherence metadata.</td>
<td>DD-050</td>
</tr>
</table>
