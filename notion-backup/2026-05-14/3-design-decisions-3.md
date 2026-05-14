<!-- url: https://www.notion.so/e3d010d46a70839f9e358122c2a8cd07 -->
<!-- id: e3d010d4-6a70-839f-9e35-8122c2a8cd07 -->
<!-- title: ⚖️ 3. Design Decisions -->
Decisions that have been made and are considered closed. Each entry includes rationale and alternatives considered.
---
## DD-001: Doc-declared watches over config-file watches
**Decision:** Watch declarations live inside the doc files themselves (as HTML comment frontmatter), not in a central `doc-map.json`.
**Rationale:** A central config file is itself a doc that drifts. When sections are moved, renamed, or split, the watch declarations travel with the content automatically. The filter script builds the map in memory at session start by scanning all docs for `watches:` declarations.
**Alternatives considered:** Central `doc-map.json` — rejected because it recreates the original drift problem one level up.
---
## DD-002: Change-class permission gating over sensitivity-based gating
**Decision:** Permission tier is determined by *what kind of change* is being proposed, not *which file* is being changed.
<table header-row="true">
<tr>
<td>Change class</td>
<td>Action</td>
</tr>
<tr>
<td>Additive</td>
<td>Auto-apply, log to [coherence-log.md](http://coherence-log.md)</td>
</tr>
<tr>
<td>Modifying</td>
<td>Show diff at session end, default Accept</td>
</tr>
<tr>
<td>Destructive</td>
<td>Show diff, require explicit confirm</td>
</tr>
<tr>
<td>Frontmatter (skills/agents)</td>
<td>Always confirm — changes triggering behavior</td>
</tr>
</table>
**Rationale:** Sensitivity-based gating ("always ask for [CLAUDE.md](http://CLAUDE.md)") causes too much friction because sensitive files also change most often. Change-class gating interrupts only when the risk justifies it.
**Alternatives considered:** Sensitivity tiers — rejected due to friction accumulation.
---
## DD-003: Single batched LLM call at Stop, never during session
**Decision:** No LLM calls fire during the session. All healing happens in batched calls at the Stop hook.
**Rationale:** Per-event LLM calls are expensive and interruptive. The Stop hook is a natural break where one consolidated review fits the user's mental state.
**Note:** v0.1 introduces a two-stage pipeline (Stage 1 coherence planner + Stage 2 patch writers). Both stages run only at Stop.
---
## DD-004: Observe-first cold start (no edits for first \~week)
**Decision:** Plugin installs in Observe mode. No edits to any file until user opts in via `/coherence:graduate`.
**Rationale:** Eliminates hostile-takeover risk on install. Builds trust before touching anything. Observation log becomes evidence for the user to evaluate signal quality before committing.
---
## DD-005: Every patch is a git commit with `[coherence]` prefix
**Decision:** All applied patches are committed immediately with a recognizable prefix.
**Rationale:** Makes every coherence action trivially revertable. Rejection of a commit teaches the plugin via the ignore list.
---
## DD-006: Greenfield is out of v1 scope
**Decision:** v1 requires at least minimal existing structure (a [CLAUDE.md](http://CLAUDE.md) or one session of history). Greenfield bootstrapping is a separate problem deferred to v2.
**Rationale:** Bootstrap and maintenance are structurally different problems. Solving both in v1 compromises both. The dominant use case is partial/mature-but-messy projects.
---
## DD-007: Section anchor format (resolves OQ-002)
**Decision:** Two anchor styles, used together.
**Block anchor** for prose docs ([CLAUDE.md](http://CLAUDE.md), [ARCHITECTURE.md](http://ARCHITECTURE.md)):
```javascript
<!-- coherence:section id="middleware"
     watches="src/middleware/**, src/server/middleware.ts"
     scope="packages/api/**"
     role="canonical"
     last-verified="2026-05-08" -->
## Middleware patterns
[content]
<!-- /coherence:section -->
```
**File-level anchor** for skills, subagents, slash commands — extends existing YAML frontmatter:
```javascript
---
description: API route handler patterns
coherence:
  watches: src/routes/**
  asserts:
    - import_exists: "from '@/lib/router'"
  role: consumer
  last-verified: 2026-05-08
---
```
**Why this format:**
- HTML comments invisible in rendered markdown
- `coherence:` namespace prevents collisions
- YAML `coherence:` key piggybacks on existing frontmatter Claude Code already parses
- Multi-line attribute values support long watch lists
- `/coherence:section` closing tag mirrors HTML for easy grep
**Integrity guards:**
- Stack-based scan at every Stop hook detects orphan opens, duplicate IDs, missing closes
- Corrupted anchors → plugin refuses to patch that file, surfaces `/coherence:repair` suggestion
- Heading-based fallback when no anchors present — patches still possible, less precise, warns user once per session
**Alternatives considered:** Markdown frontmatter only (rejected — doesn't work for sections within a single doc); separate sidecar `.coherence` files (rejected — separates metadata from content, recreates drift).
---
## DD-008: Two-stage patch pipeline (resolves OQ-001)
**Decision:** v0.1 ships with a two-stage patch pipeline that handles both single-section and multi-file coherent patches.
### Stage 1: Coherence Planner (one LLM call)
Triggered when 2+ sections share a trigger source. Produces a structured plan in JSON assigning each section a **role** and a **change relation**.
**Roles:**
- `canonical` — single source of truth for the concept
- `reference` — mentions and points to canonical
- `consumer` — uses the concept, doesn't redefine it
- `no-change` — flagged but doesn't actually need updating
**Change relations:**
- `extends` — patch normally
- `supersedes` — patch with destructive change-class
- `contradicts` — flag for human review, no patch
- `omits` — patch as additive, low confidence; suppressed if section has `complete: true`
**Role assignment rules:**
1. Section with most existing depth on the concept stays canonical
2. User-declared `role: canonical` in frontmatter overrides heuristics
3. Heuristics (architecture canonical, skills consumers, etc.) are tiebreakers only
### Stage 2: Patch Writers (parallel LLM calls)
Each affected section gets one patch call. Receives the coherence plan as context. Outputs unified diff, `NO_PATCH_NEEDED`, `ESCALATE`, or `PLAN_DISAGREES`.
**Escape hatches are first-class outputs**, not failures:
- `NO_PATCH_NEEDED` — section already correct
- `ESCALATE` — change too big to patch surgically
- `PLAN_DISAGREES` — assigned role incompatible with section reality (rare; degrades to independent patch + user notification)
### Validation pipeline (deterministic, post-LLM)
1. **Format check** — valid unified diff or one of the literal escape strings
2. **Apply check** — diff applies cleanly to current section
3. **Sanity check** — change-class respected (additive only adds, etc.)
4. **Line-count check** — `(added + removed) / original_lines > 0.4` auto-converts to ESCALATE
5. **Hallucination grep** — two-tier:
	- Strict tier: file paths, full import statements, multi-token identifiers grep'd against changed files; mismatch rejects patch
	- Loose tier: single-word identifiers, common method names grep'd project-wide; mismatch logs warning, patch proceeds
### Multi-section patches in one file
Patches targeting the same file go through a **merge step** before commit. Deterministic composition; overlapping diffs reject all and surface for human review. File is the atomic write unit.
### Plan-derived bundles are atomic
Patches from a Stage 1 plan present to the user as one bundle. Single accept/reject. User can expand to view individual diffs but cannot partial-accept. Single-section patches (no plan) remain individually selectable.
**Alternatives considered:** Single-stage independent patches (rejected — produces contradictions across files); LLM-based reconciliation pass after independent patches (rejected — two LLM passes when one upfront plan suffices).
---
## DD-009: Trigger-source grouping (not concept grouping)
**Decision:** Sections are grouped for Stage 1 by which code change triggered them, not by inferred semantic concept.
**Rationale:** Semantic concept inference is fuzzy and error-prone. Trigger source is deterministic — every section flagged by the same code change is by definition about the same change. A session with two unrelated changes produces two trigger groups, two coherence plans, two independent reconciliations.
**Alternatives considered:** Embedding-based concept clustering (rejected — too expensive, too fuzzy for v0.1).
---
## DD-010: Buffer lifecycle state machine
**Decision:** Explicit state machine governs the drift buffer across Stops and sessions.
<table header-row="true">
<tr>
<td>Trigger</td>
<td>Buffer action</td>
</tr>
<tr>
<td>PostToolUse with significant change</td>
<td>Append entry</td>
</tr>
<tr>
<td>Stop, no entries</td>
<td>No-op</td>
</tr>
<tr>
<td>Stop, user accepts</td>
<td>Clear accepted entries</td>
</tr>
<tr>
<td>Stop, user rejects bundle</td>
<td>Mark entries deferred, keep in buffer</td>
</tr>
<tr>
<td>Stop, user picks Skip</td>
<td>Mark all entries deferred, keep in buffer</td>
</tr>
<tr>
<td>Subsequent PostToolUse</td>
<td>Deferred entries remain; new ones append</td>
</tr>
<tr>
<td>SessionEnd</td>
<td>Persist deferred to `coherence/pending.md`</td>
</tr>
<tr>
<td>Next SessionStart</td>
<td>Read pending into buffer; re-validate against current code; drop entries no longer applicable</td>
</tr>
</table>
**Rationale:** Long sessions and rejections shouldn't lose drift signal. Re-validation at session start prevents stale deferred entries from re-presenting after manual fixes.
---
## DD-011: Velocity limit on per-section patches
**Decision:** If a section is patched and reverted 2 times within 30 days, the plugin auto-adds it to `.claude/coherence/ignore` and surfaces a one-line note with opt-out instructions.
**Rationale:** Prevents pathological patch/revert loops. Numerical trigger is more reliable than heuristic detection of user frustration.
---
## DD-012: Two mid-session mechanisms instead of a single nudge (resolves OQ-003)
**Decision:** Replace the original "mid-session nudge" idea with two distinct, separately-tunable mechanisms.
### Mechanism 1: Silent context refresh (default on, zero friction)
When the buffer is non-empty, the plugin injects a brief note via `additionalContext` on subsequent PostToolUse events:
> "Note: N doc sections have potential drift detected this session. Be skeptical of \[list\] when relying on them for decisions."
Cost: \~50 tokens per refresh. The user is uninvolved. Claude's output quality improves immediately because Claude knows which docs to distrust.
This is **not** a nudge — it is a context refresh that keeps Claude informed without involving the user at all.
### Mechanism 2: Mid-session review surfacing (rare, conditional)
The plugin injects a different `additionalContext` instructing Claude to *conversationally* mention drift to the user, only when ALL three conditions are met:
1. Buffer has **3+ distinct trigger groups** (multiple unrelated logical issues, not one concept)
2. **15+ minutes** of accumulated session time since last Stop or last `/coherence:review`
3. User just sent a message **after a long agent turn** (≥60s wall time, OR 5+ tool calls, OR 5+ min of user silence prior)
Claude decides whether and how to mention it based on conversational flow. Sometimes Claude weaves it in naturally; sometimes Claude judges the user is mid-flow and skips. The mediation is Claude's, not the plugin's.
When surfaced, Claude suggests `/coherence:review` to handle accumulated drift now rather than waiting for Stop.
### `/coherence:review` command
New explicit command that runs the Stop pipeline mid-session: Stage 1 + Stage 2 against current buffer, consolidated review presented now, accepted patches committed, deferred entries return to buffer, session continues.
### Configurable thresholds
Users can tune via plugin config:
```javascript
{
  "coherence": {
    "midsession_review": {
      "enabled": true,
      "min_trigger_groups": 3,
      "min_session_minutes": 15,
      "min_agent_turn_seconds": 60
    }
  }
}
```
Setting `enabled: false` disables Mechanism 2 entirely. Mechanism 1 is always on (toggle separately if needed).
**Rationale:** The original "8+ entries AND a natural break" proposal conflated two different problems: Claude operating from stale context during long sessions, and the user being overwhelmed by a 20-patch review at Stop. Mechanism 1 solves the first problem with zero friction. Mechanism 2 solves the second problem rarely and tastefully via Claude's conversational judgment, never via a hard interrupt.
**Alternatives considered:** Single deterministic nudge (rejected — couldn't separate the two underlying problems); popup or hard interrupt (rejected — violates the one-prompt-per-session principle).
---
## DD-013: Subagent output-use signal capture (resolves OQ-004)
**Decision:** A deterministic state machine captures output-use signals per subagent invocation, computes final state at SessionEnd, and aggregates over a rolling window to flag drifting subagents.
### The three states, defined
**Accepted** — output flowed downstream without modification:
- Files written by the subagent are not modified by main agent or user within the same session
- User's next message lacks reject signals
- No subsequent invocation of the same agent on overlapping scope
**Edited** — output was used as a starting point but materially changed:
- A file the subagent wrote is later modified within the same session
- 10–50% of subagent-owned lines changed, OR a structural element changed (function signature, import block, return type)
**Discarded** — output was effectively thrown away:
- File deleted, OR
- More than 50% of subagent-owned lines changed (effectively rewritten), OR
- User says reject-signal variant before any acceptance signal
### "Edited" sub-categories
<table header-row="true">
<tr>
<td>Edit kind</td>
<td>Definition</td>
<td>Classification</td>
</tr>
<tr>
<td>Trivial</td>
<td>Less than 10% of lines changed, no structural change</td>
<td>Accepted-with-tweaks</td>
</tr>
<tr>
<td>Material</td>
<td>10–50% lines changed OR structural change</td>
<td>Edited</td>
</tr>
<tr>
<td>Substantial</td>
<td>More than 50% lines changed</td>
<td>Discarded (effectively rewritten)</td>
</tr>
</table>
### Capture mechanism (state machine)
```javascript
SubagentStop fires
       ↓
Record: agent_id, invocation_id, timestamp, files_written, line_provenance
       ↓
Mark invocation as PENDING in .claude/coherence/subagent-trace.json
       ↓
Downstream events update the record:
  - File modification on subagent-owned lines → record diff %
  - User message → run keyword classifier
  - Same agent re-invoked on overlapping scope → flag as Discarded
  - Session ends with no modifications → flag as Accepted
       ↓
SessionEnd hook computes final state per invocation
       ↓
Append result to .claude/coherence/subagent-history.jsonl
```
Final state is computed at SessionEnd, not at SubagentStop — the signal needs time to materialize.
### Line-level provenance
At SubagentStop, the plugin parses the subagent's diff and records which lines the subagent wrote in which files. Subsequent edits to those specific lines count against that subagent. Edits to other lines in the same file are independent.
This solves the multiple-subagents-same-file ambiguity: each subagent owns its lines, attribution is unambiguous.
### User-message keyword classifier
Pure deterministic regex matching (no LLM):
- **Reject signals:** redo, scrap, no don't, that's wrong, instead, try again, not what I, ignore that
- **Accept signals:** thanks, perfect, looks good, lgtm, ship it, great
- **Neutral:** anything else
Reject within 2 messages of SubagentStop → strong Discarded weight.
Accept within 2 messages → strong Accepted weight.
Neutral → defer to file-modification signal.
Intentionally crude. Better to under-classify than mis-classify. Most messages are neutral and fall through to the file-based signal.
### Text-only subagents
Subagents that return analysis or summary without writing files have no file-modification signal. Detection relies entirely on user-message classifier + main-agent's subsequent actions. Detection is weaker but correct — text-only outputs are inherently harder to validate.
### Aggregation and drift detection
Per subagent, the plugin tracks rolling stats:
```javascript
agent_id          | invocations | accepted | edited | discarded
code-reviewer     | 47          | 38       | 6      | 3
test-writer       | 23          | 11       | 3      | 9        ← 39% discard, suspicious
api-documenter    | 12          | 12       | 0      | 0        ← 100% accept, healthy
```
**Healing trigger thresholds:**
- Discard rate over 25% across last 10+ invocations → flag for review
- Edit rate over 50% across last 10+ invocations → flag for review
- Sudden shift: rate change over 20 percentage points in last 5 vs prior 10 → flag immediately
Flagging surfaces the agent's definition file in the next Stop review with the rate that triggered it. User sees the flag once per session until the agent is updated or explicitly dismissed.
### Retroactive reclassification
A revert within 7 days of a SubagentStop on a file with that subagent's provenance reclassifies the trace from Accepted to Discarded. Extends the velocity-limit mechanism (DD-011) to subagent traces.
### Retention
- Per-invocation records: rolling window of last 50 per agent
- Aggregate counters: indefinite (numbers only, no content)
- PENDING traces older than 24 hours discarded at next SessionStart
Provides statistical power without hoarding session content.
### Observability
`.claude/coherence/subagent-stats.json` exposes per-agent stats, surfaced via `/coherence:status`:
```json
{
  "agents": {
    "test-writer": {
      "invocations_total": 47,
      "invocations_window": 10,
      "accept_rate": 0.55,
      "edit_rate": 0.20,
      "discard_rate": 0.25,
      "trend": "discard_rising",
      "last_flagged": "2026-05-08T11:32:00Z"
    }
  }
}
```
**Rationale:** Subagent isolation means no in-band correction signal exists. The output-use signal is the only post-hoc evidence of subagent quality decay. Deterministic state machine + line-level provenance + crude keyword classifier produces reliable signal without LLM cost.
**Alternatives considered:**
- LLM-based classification of user messages (rejected — too expensive for every user turn)
- Explicit user feedback button (rejected — friction; users won't use it consistently)
- File-level rather than line-level provenance (rejected — ambiguous attribution when multiple subagents touch same file)
---
## DD-014: Trickle scan throttling and priority (resolves OQ-005)
**Decision:** Trickle deep-scan during PostToolUse follows tiered rules evaluated in order.
1. **Throttle:** if any scan ran in the last 2 seconds, skip this fire entirely
2. **Priority:** if the written-to directory has never been scanned, scan it now
3. **Re-scan eligibility:** previously-scanned directories become eligible again only if filesystem mtime is newer than last-scan timestamp
4. **Fallback:** if written-to directory isn't eligible, pop the next unscanned directory from the queue
5. **Queue exhausted:** if everything's scanned and nothing has changed, exit silently
**Rationale:** The 2-second throttle makes burst-edit sessions cheap regardless of fire rate. The mtime check ensures re-scans are rare and meaningful. New territory always wins over the queue, so coverage grows naturally with the project rather than thrashing already-scanned areas.
**Alternatives considered:** Always scan written-to directory (rejected — thrashes during burst edits); always pop from queue (rejected — misses the most relevant directory).
---
## DD-015: Stage 1 planner prompt rigor (resolves OQ-008)
**Decision:** The Stage 1 coherence planner prompt is hardened with explicit negative examples, JSON Schema validation, business rules, and an adversarial test fixture suite.
### Negative examples added to prompt
- **Picking two canonicals** — wrong; tiebreak via hierarchy (architecture \> pattern \> skill \> consumer)
- **Defaulting to ****`no-change`**** to play safe** — wrong; if section is silent on something now relevant, use `omits` not `no-change`
- **Overriding user-declared role** — wrong; declared roles in frontmatter are absolute
- **Using ****`extends`**** when content is being replaced** — wrong; if any existing claim becomes false, the relation is `supersedes`
### JSON Schema validation
```javascript
{
  "type": "object",
  "required": ["canonical", "assignments"],
  "properties": {
    "canonical": { "type": "string" },
    "assignments": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["section", "role", "relation"],
        "properties": {
          "section": { "type": "string" },
          "role": { "enum": ["canonical", "reference", "consumer", "no-change"] },
          "relation": { "enum": ["extends", "supersedes", "contradicts", "omits"] },
          "instruction": { "type": "string" }
        }
      }
    }
  }
}
```
### Business rules (post-schema)
- Exactly one assignment with `role: canonical`, matching top-level `canonical` field
- All input section IDs appear exactly once in assignments
- Sections with `no-change` role default to `relation: extends` (or omitted)
### Adversarial test fixtures
A fixture suite runs as part of v0.1 test suite. Failures caught before shipping, not in production.
<table header-row="true">
<tr>
<td>Test</td>
<td>Input</td>
<td>Expected behavior</td>
</tr>
<tr>
<td>Two equal-depth sections</td>
<td>Similar token count, no declared canonical</td>
<td>Picks one via hierarchy heuristic</td>
</tr>
<tr>
<td>User-declared canonical</td>
<td>Frontmatter has `role: canonical`; another section has more depth</td>
<td>Honors declared role</td>
</tr>
<tr>
<td>Silent contradiction</td>
<td>Section states X; change implements not-X</td>
<td>Returns `contradicts`, not `extends`</td>
</tr>
<tr>
<td>Empty frontmatter</td>
<td>Section has no metadata</td>
<td>Treats as consumer by default</td>
</tr>
<tr>
<td>Trivial change</td>
<td>Code change too small to patch</td>
<td>All sections marked `no-change`</td>
</tr>
</table>
**Rationale:** The planner is upstream of all patch quality. Hardening it with negative examples, schema validation, and regression fixtures is the highest-leverage investment in output quality.
**Alternatives considered:** Validation-only without negative examples (rejected — LLM keeps producing the same failure modes); LLM-based plan grading (rejected — adds another LLM call to the critical path).
---
## DD-016: Section depth measurement formula (resolves OQ-009)
**Decision:** Section depth is computed deterministically as a weighted score, pre-computed by JS before the Stage 1 planner sees the input. The planner receives the score alongside section content but does not compute it itself.
### Formula
```javascript
depth_score = 
    0.4 * normalized_token_count
  + 0.3 * code_block_count
  + 0.2 * inbound_reference_count  
  + 0.1 * structural_element_count
```
Each component normalized to 0–1 across the input sections in a given trigger group. The section with the most tokens scores 1.0 on that component, etc.
### Example planner input
```javascript
{
  "section": "ARCHITECTURE.md#layers",
  "depth_score": 0.87,
  "depth_breakdown": { "tokens": 1200, "code_blocks": 5, "inbound_refs": 3, "structural": 4 },
  "content": "..."
}
```
### Recency excluded
Recency of last edit is deliberately not in the formula. Older sections may be the most authoritative; recency is a confounding signal, not a quality signal.
**Rationale:** Pre-computing depth deterministically means same input → same scores → same canonical pick (modulo LLM nondeterminism on tie-breaks). Auditable and reproducible. The planner uses depth as one input among many but doesn't have to compute it.
**Alternatives considered:** Have the planner compute depth itself (rejected — varies per call, not auditable); use only token count (rejected — a long but shallow section would beat a dense canonical one); include recency (rejected — confounds quality with novelty).
---
## DD-017: Change-class sanity check formal definition (resolves OQ-010)
**Decision:** Change-class enforcement uses precise rules counting only content changes (not whitespace), with deterministic reclassification override.
### Class definitions
**Additive:**
- Zero `-` lines in the hunk body that contain non-whitespace content
- Whitespace-only `-` lines are permitted
**Modifying:**
- Has `-` lines with content AND `+` lines with content
- Ratio of `-` to `+` content lines between 0.5x and 2x
**Destructive:**
- Has `-` lines with content
- Has fewer `+` lines than `-` lines (net removal), OR
- Removes an entire structural element (heading, list item, code block) without replacement
### Reclassification override
If the LLM declares a change-class that doesn't match the diff's actual character, the deterministic check overrides. The patch is reclassified, the user sees the corrected class in the review, and the override is logged for telemetry.
**Override doesn't block.** A patch declared additive that's actually modifying still applies — but as a modifying patch, which means it needs explicit user accept rather than auto-apply.
**Rationale:** The deterministic check is the source of truth for what kind of change a diff actually represents. The LLM's declaration is treated as a hint, not authority. Auto-apply gating works on the corrected class, preventing inadvertent escalation.
**Alternatives considered:** Trust LLM declaration (rejected — LLM gets it wrong predictably); reject mismatched patches (rejected — too aggressive; the patch may still be correct, just mis-labeled).
---
## DD-018: Monorepo scope precedence (resolves OQ-006)
**Decision:** When `CLAUDE.md` files exist at multiple levels in a monorepo, the nearest file (by directory distance to the changed code) wins for any section whose `scope:` glob matches. A section without an explicit `scope:` declaration inherits its containing file's directory as its scope.
### Rules
1. **File-level precedence:** for a given changed path, walk upward from the file's directory; the first `CLAUDE.md` whose section's `scope:` glob matches the path is the authoritative match. Higher-level files are not consulted for that path.
2. **Implicit scope inheritance:** a section in `packages/api/CLAUDE.md` with no `scope:` is treated as `scope: packages/api/**`. A section in the workspace-root `CLAUDE.md` with no `scope:` is treated as workspace-wide (`**`).
3. **No glob-specificity competition:** specificity of the glob does not override file location. A root-level `scope: packages/api/payments/**` does NOT beat a package-level `scope: src/**` that also matches — the package file is nearer, the package file wins.
4. **Independent watches:** path watches (`watches:`) are independent of `scope:`. A section can watch paths outside its scope; only its scope determines which package's drift it answers for.
**Rationale:** CSS-specificity-style nearest-wins resolution is predictable and matches how monorepo developers already reason about config (tsconfig, eslintrc). Glob-specificity competition would require global tie-breaking logic that is hard to reason about and easy to misconfigure.
**Alternatives considered:** Most-specific glob wins regardless of file location (rejected — cross-package action-at-a-distance, hard to debug); section without scope is project-wide (rejected — too easy for a package-local section to leak project-wide guidance unintentionally).
---
## DD-019: Statusline badge format (resolves OQ-007)
**Decision:** Statusline badge uses `[🧭 N]` format and is visible only when the drift buffer is non-empty. Zero state is invisible.
### Behavior
- Buffer empty: no badge rendered.
- Buffer non-empty: render `[🧭 N]` where N is the count of distinct sections in the buffer (not raw entries — multiple PostToolUse hits on the same section count once).
- Click target: opens `.claude/coherence/observations.md`.
**Rationale:** Compact glyph + count communicates state at a glance. Hiding the badge at zero avoids visual noise in the dominant case (no drift). Counting sections (not entries) keeps the number meaningful as fire rate varies.
**Alternatives considered:** Always-visible counter (rejected — clutter when zero); bare icon with no count (rejected — loses the at-a-glance magnitude signal).
---
## DD-020: Silent context refresh cadence (resolves OQ-011)
**Decision:** Mechanism 1 (silent `additionalContext` refresh, DD-012) fires on PostToolUse only when the buffer's section set has changed since the last refresh injection. No hard cap per session.
### Rules
1. Maintain a `last_refreshed_section_set` value (a sorted, hashed set of section IDs) in the session state.
2. On each PostToolUse, after buffer mutation, compute the current section set hash. If unchanged from `last_refreshed_section_set`, do NOT inject — Claude already knows.
3. If changed (any addition, removal, or replacement), inject the refresh and update `last_refreshed_section_set`.
4. SessionStart resets `last_refreshed_section_set` to empty so the first non-empty buffer always produces a refresh.
5. Compaction events (Claude Code automatic context compaction) reset `last_refreshed_section_set` to empty so the next non-empty buffer re-injects — prevents context-aging staleness.
**Cost profile:** in a typical session with N distinct sections affected, exactly N refreshes occur (one per new section appearance). Worst case is O(unique-section-changes), not O(PostToolUse-fires).
**Rationale:** Firing on every PostToolUse-with-non-empty-buffer is wasteful when the section set is stable. Firing on change-only is strictly cheaper and equivalent in informational content, with compaction-driven re-injection handling the only real staleness risk. Hard caps were rejected because they fail-silent rather than fail-cheap, and the change-detector already self-bounds cost.
**Alternatives considered:** Every PostToolUse with non-empty buffer (rejected — wasteful in stable-set sessions); threshold-based with N-section minimum (rejected — introduces staleness windows for no gain over change-detection); hard cap of 20/session (rejected — silent drop is worse than just not firing redundantly).
---
## DD-021: `/coherence:review` UX matches Stop UX (resolves OQ-012)
**Decision:** `/coherence:review` reuses the exact Stop review pipeline and UX with no filtering, no preview-only mode, and identical buffer consumption semantics. Filtering and preview modes deferred to v0.2.
### Behavior
- Same Stage 1 + Stage 2 pipeline against the current buffer.
- Same consolidated review presentation.
- Same buffer state machine (DD-010): accepted entries clear, skipped entries defer, no special handling.
- Same git commit policy (`[coherence]` prefix per approved patch).
- After completion, the next `Stop` finds an empty (or only newly-deferred) buffer and is a no-op or runs only on entries accumulated since the review.
**Rationale:** v0.1 simplicity. Two divergent UX surfaces would double the surface area for bugs without proven user need. Filter and preview modes are valuable but speculative — ship the basic primitive, add affordances when usage data justifies them.
**Alternatives considered:** Trigger-group filtering in v0.1 (deferred — nice-to-have, not blocking); preview-only mode (deferred — zero-token preview is appealing but adds a second pipeline path); preview-only with Stop-authoritative buffer (rejected — makes `/coherence:review` advisory-only, which doesn't solve the long-session pile-up problem).
---
## DD-022: Subagent rolling window defaults (resolves OQ-013)
**Decision:** Per-agent rolling window retains the last 50 invocations. The trailing 10 invocations are used for trend analysis. Both values are configurable per-project via `.claude/coherence/config.json`. Per-agent frontmatter override is deferred to v0.2.
### Defaults
```javascript
{
  "coherence": {
    "subagent_stats": {
      "window_total": 50,
      "window_trend": 10
    }
  }
}
```
### Rules
1. `window_trend` must be `<= window_total` (validated at config load; invalid config falls back to defaults with a warning).
2. Aggregate counters (lifetime totals) are unaffected by either window — they're indefinite numerical state.
3. Per-agent overrides via agent frontmatter are NOT supported in v0.1; only the project-wide config applies.
**Rationale:** 50/10 is a reasonable default for typical subagent invocation rates (a few per session, dozens per week). Project-wide configurability handles the high-volume / sparse-volume edge cases without forcing per-agent tuning, which is rarely necessary and increases cognitive load.
**Alternatives considered:** 30/5 default (rejected — too small for stable rate estimation); 100/20 default (rejected — too slow to react to recent decay); per-agent frontmatter override (deferred to v0.2 — wait for evidence that project-wide isn't enough); hardcoded values (rejected — zero-config inflexibility).
---
## DD-023: Insufficient-data subagent display (resolves OQ-014)
**Decision:** Subagents with fewer invocations than `window_trend` (DD-022, default 10) appear in `/coherence:status` with an `insufficient data` label and never trigger flagging. Threshold ties to `window_trend` exactly — not a separate hardcoded value.
### Behavior
- Status output includes the agent with `"trend": "insufficient_data"`, lifetime invocation count, and any aggregate counters available.
- No flag fires (no discard-rate, edit-rate, or sudden-shift evaluation runs).
- Once invocation count reaches `window_trend`, normal flagging logic applies on subsequent invocations.
**Status output example:**
```json
{
  "agents": {
    "new-test-writer": {
      "invocations_total": 4,
      "trend": "insufficient_data",
      "min_invocations_for_flagging": 10
    }
  }
}
```
**Rationale:** Showing the agent (rather than hiding it) gives users transparency into what the plugin is tracking and confidence that new agents aren't being silently ignored. Tying the threshold to `window_trend` keeps the configuration surface coherent: tuning the trend window automatically tunes the insufficient-data threshold.
**Alternatives considered:** Hide until threshold met (rejected — reduces transparency, hides tracking from user); hardcode threshold at 10 regardless of `window_trend` (rejected — inconsistent if user tunes `window_trend`).
---
## DD-024: Subagent flagging in silent context refresh (resolves OQ-015)
**Decision:** Mechanism 1 silent context refresh (DD-012) includes subagent decay information, but only for subagents currently flagged (past threshold per DD-013) — not all subagents with stats. Unflagged subagents add zero tokens to the refresh payload.
### Rules
1. When the refresh fires (per DD-020 cadence), iterate over flagged subagents. Each contributes one short line to the `additionalContext` payload, e.g.:
	> `Subagent agents/test-writer is showing decay (39% discard rate over last 10 invocations). Be cautious when delegating test-writing tasks.`
2. Unflagged subagents (healthy, or insufficient-data per DD-023) are excluded from the refresh.
3. Subagent decay lines append to the existing section-drift portion of the payload — same `additionalContext` injection, single hook fire.
4. Subagent inclusion does NOT change the cadence rule from DD-020. The refresh still only fires on section-set change OR on a transition from unflagged-to-flagged for any subagent (additional change trigger).
5. The refresh payload tracks both `last_refreshed_section_set` (DD-020) and `last_refreshed_flagged_agents` to dedup correctly across both signal types.
**Rationale:** Including flagged subagents directly addresses the original concern (Claude delegating to a known-degraded subagent without warning). Limiting to flagged-only keeps the payload small in the common case and pays cost only when there's signal worth conveying. Tracking flagged-agent transitions in the cadence rule prevents staleness if a subagent flips state mid-session without a section-set change.
**Alternatives considered:** Include all subagents with stats (rejected — token cost scales with project agent count, mostly noise); exclude from refresh entirely (rejected — surfacing only at Stop is too late for delegation decisions made mid-session); delegation-intent detection on UserPromptSubmit (rejected for v0.1 — detection is fuzzy, deferred to v0.2 if needed).
---
## DD-025: Trigger-source grouping by file overlap (resolves OQ-016)
**Decision:** Buffer entries are NOT tagged with a `trigger_id` at write time. Instead, Stage 1 trigger groups are materialized at Stop time by deterministic union-find over the `triggering_files` field of each buffer entry: two entries belong to the same group iff their `triggering_files` arrays share at least one path.
### Why no `trigger_id`
The original instinct was to tag PostToolUse fires with a UUID at write time. Stress-testing showed this fails:
- **PostToolUse fire = trigger source** under-clusters (a 10-file refactor produces 10 false groups).
- **30-second time window** both under-clusters slow refactors (deliberate edits over 90s) and over-clusters unrelated work (auth bug fix at t=0, payments edit at t=5s).
- **Host turn-ID** depends on a Claude Code capability we cannot guarantee.
- Any temporal proxy mistakes wall-clock proximity for semantic relatedness, and these diverge often.
File-overlap is **semantically correct by construction**: if two sections both watched `src/auth/login.ts` and both fired on a change to that file, they are by definition both responsible for documenting how `login.ts` should work — they share a concept. No timestamp inference needed.
### Algorithm at Stop
```javascript
// Pseudocode
groups = []
for entry in buffer:
  matched = [g for g in groups if g.files.intersects(entry.triggering_files)]
  if matched.length == 0:
    groups.append({sections: [entry.section_ref], files: set(entry.triggering_files)})
  else:
    merged = union(matched)
    merged.sections.add(entry.section_ref)
    merged.files.update(entry.triggering_files)
    groups = groups.without(matched).with(merged)
```
Classic union-find. O(N × G) where N is buffer size and G is group count, both small in practice.
### Acknowledged tradeoff
If one shared utility file is touched by two truly unrelated changes within one session (auth bug fix, then unrelated payments feature edits the same shared util), the resulting group is mixed. **This is acceptable** because:
- It's rare.
- The canonical for the shared util is canonical regardless of which feature touched it.
- Worst case: planner emits `no-change` for sections that don't actually need updating; Stage 2 emits `NO_PATCH_NEEDED`; no harm.
### Bash entries with empty triggering_files
A Bash entry that did not deterministically map to file paths (e.g. an assertion-only signal) gets `triggering_files: []`. Such entries form a singleton group. They never share a group with file-bearing entries.
### Rationale
Eliminates `trigger_id` field, time-window tunable, codemod heuristic, and host-ID dependency from the schema and runtime. The grouping is now a function of buffer content alone — reproducible, testable, no host coupling.
### Alternatives considered
- PostToolUse-fire-as-trigger-source (rejected — under-clusters refactors)
- 30-second time-window grouping (rejected — misclassifies in both directions)
- Host turn-ID (rejected — hard dependency on unverified host capability)
- Hybrid host-ID + time-window + codemod heuristic (rejected after stress testing — still fails on rapid unrelated edits and slow refactors)
---
## DD-026: Buffer entry schema (resolves OQ-017)
**Decision:** `.claude/coherence/drift-buffer.json` is a versioned envelope containing an array of entries matching the schema below. The schema is the cross-hook contract.
### File envelope
```json
{
  "schema_version": 1,
  "entries": [ /* entry objects */ ]
}
```
### Entry schema (v1)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["entry_id", "section_ref", "triggering_files", "tool",
               "timestamp", "change_class_hint", "confidence", "state",
               "matched_watch_glob", "source"],
  "properties": {
    "entry_id":           { "type": "string", "format": "uuid" },
    "section_ref":        { "type": "string" },
    "triggering_files":   { "type": "array", "items": { "type": "string" }, "minItems": 0 },
    "tool":               { "enum": ["Edit", "Write", "Bash"] },
    "timestamp":          { "type": "string", "format": "date-time" },
    "change_class_hint":  { "enum": ["additive", "modifying", "destructive", "unknown"] },
    "confidence":         { "enum": ["high", "low"] },
    "state":              { "enum": ["pending", "deferred"] },
    "matched_watch_glob": { "type": "string" },
    "source":             { "enum": ["post_tool_use", "session_start_revalidation"] },
    "subagent_invocation_id": { "type": ["string", "null"] }
  }
}
```
### Field semantics
- `entry_id` — UUID; never reused across deferral/reload.
- `section_ref` — qualified reference per DD-027.
- `triggering_files` — workspace-relative paths from PostToolUse. **`minItems: 0`** because Bash entries may have no file attribution.
- `tool` — source tool of the PostToolUse event.
- `change_class_hint` — best-effort guess; `unknown` permitted; deterministic re-classification at Stop (DD-017) overrides.
- `confidence` — high-confidence entries surface at Stop; low-confidence log to `observations.md` only (Permission page).
- `state` — `pending` until Stop processes; `deferred` if the user skips/rejects (DD-010).
- `matched_watch_glob` — the watch declaration that matched. Stored to make DD-029 re-validation cheap (no need to re-read the section's frontmatter).
- `source` — distinguishes fresh entries from re-validated ones reloaded across sessions.
- `subagent_invocation_id` — best-effort linkage to a DD-013 trace; null when host attribution unavailable. v0.1 ships with null always if Claude Code does not expose attribution; v0.2 promotes once verified.
### Migration policy
- **Reader:** unknown fields tolerated (forward-compat). If `schema_version` in file \> reader's version, the reader logs a warning and operates in read-only mode (refuses to write). If `schema_version` \< reader's version, an explicit `migrate_v{n}_to_v{n+1}` chain runs at read time.
- **Writer:** always emits the `schema_version` it was built against.
### What is NOT in the schema
- **`trigger_id`** — superseded by DD-025 (file-overlap grouping). No such field exists.
### Rationale
Locking the schema before any hook is implemented makes the buffer the contract between PostToolUse, SessionStart, Stop, `/coherence:review`, and SessionEnd. Including `matched_watch_glob` makes DD-029 deterministic without re-parsing frontmatter. `source` is debug-grade telemetry that costs nothing.
### Alternatives considered
- Bare array (rejected — no room for `schema_version`).
- Minimal schema without `matched_watch_glob` / `source` (rejected — forces re-parsing at re-validation, more expensive over the project lifetime than the schema cost).
- `minItems: 1` on `triggering_files` (rejected — invalidates Bash-only entries).
- Strict version-match migration (rejected — too rigid; forward-compat is safer).
---
## DD-027: Qualified section reference format (resolves OQ-018)
**Decision:** Section references use `<workspace-relative-path>#<id-or-heading-anchor>` everywhere in plugin state. Path is the host's canonical realpath, normalized to forward slashes. Headings without anchors fall back to GitHub-compatible slugs.
### Reference format
- **Block-anchored sections in prose docs:** `packages/api/CLAUDE.md#middleware`
- **Skill / agent files (file-level coherence frontmatter):** path only, no fragment. The file IS the section. Example: `.claude/skills/api-routes/SKILL.md`
- **Heading fallback (no anchor present):** `<path>#heading:<github-style-slug>`. The `heading:` prefix prevents collision with explicit IDs.
### Path normalization rules
- Paths are workspace-relative.
- The OS's canonical realpath is used (resolves symlinks; on case-insensitive filesystems, returns the on-disk casing). Result matches `git ls-files` output.
- Separators converted to forward slashes (Windows-safe).
- No `./` prefix.
- Computed once per file per session and cached in the section-integrity index.
### Block-anchor ID rules
- Permitted characters: `[a-z0-9_-]+`. Validation rejects others. Authors use lowercase ASCII for IDs.
- Within a file: duplicate `id` values → fatal for that file. Plugin refuses to plan/patch/auto-apply against any section in the file. `/coherence:repair` surfaces the conflict (DD-007 reaffirmed).
- Across files: same `id` is allowed (path qualifies it).
### Heading-fallback slug rules
GitHub-compatible algorithm so the plugin's slugs match what users see in rendered markdown:
1. Lowercase the heading text.
2. Strip ASCII punctuation that GitHub strips. The exact punctuation set:
```javascript
` ! " # $ % & ' ( ) * + , . / : ; < = > ? @ [ \ ] ^ { | } ~
```
1. Replace runs of whitespace with single hyphens.
2. Trim leading/trailing hyphens.
3. **Duplicate slug within a file → append ****`-1`****, ****`-2`****, ... in document order** (matches GitHub's anchor disambiguation).
The slug is computed once at scan time and cached. Plugin's slug must reproduce GitHub's exactly so cross-doc Markdown links and plugin refs agree.
### Heading-fallback warning
When a section is referenced via heading fallback, the plugin warns once per file per session (already specified in DD-007); patches still proceed but are less precise.
### Rationale
GitHub-compatible slugs eliminate the second-mental-model risk for users. Realpath approach handles case-insensitive filesystems and symlinks correctly without ad-hoc lowercasing rules. Explicit punctuation list prevents two implementations from diverging on edge characters. Path-and-fragment matches existing markdown linking and survives moves naturally (a moved section gets a new ref, which correctly invalidates pending entries via DD-029).
### Alternatives considered
- Stable UUIDs per anchor (rejected — author friction; UUIDs in prose markdown look like clutter).
- Composite object `{file, id}` in JSON (rejected — verbose, no expressiveness gain).
- Custom slug rule (rejected — diverges from user's existing GitHub mental model).
- Manual lowercasing for case-insensitive FS support (rejected — realpath is the canonical solution).
- File-local IDs allowed to duplicate (rejected — silent ambiguity).
---
## DD-028: Multiple pre-declared canonicals tiebreak (resolves OQ-019)
**Decision:** When more than one section in a Stage 1 trigger group has `role: canonical` declared, the canonical for THIS planning call is selected by the *at-or-above-then-nearest* algorithm against the deepest common ancestor of `triggering_files`. Other declared canonicals are temporarily downgraded to `role: reference` for this group; their declarations remain authoritative for their own scope on other planning calls.
### Algorithm
1. Compute `D` = deepest common ancestor directory of all `triggering_files` in the group.
2. **Filter**: keep only declared canonicals whose containing file is at-or-above `D` in the directory tree (i.e., the file's directory is `D` or an ancestor of `D`).
3. If 0 survive the filter: fall back to depth-score (DD-016) over all candidate sections regardless of declarations. Log a warning that no declared canonical was eligible for this group.
4. If 1 survives: it wins.
5. If ≥2 survive: pick the one whose containing file is closest to `D` (nearest-wins, consistent with DD-018). Tie-break by depth score (DD-016).
### Why the at-or-above filter
A cross-package change (e.g. user edits `packages/api/x.ts` and `packages/web/y.ts`) has `D` = workspace root. A package-level [CLAUDE.md](http://CLAUDE.md) is BELOW `D`, not above. Letting a package canonical win for a cross-package change picks one feature's documentation arbitrarily as the source of truth for the other feature — wrong. The at-or-above filter forces cross-package changes to use a workspace-level canonical (or fall back if none exists).
### Plan output
```json
{
  "canonical": "packages/api/CLAUDE.md#middleware",
  "demoted_canonicals": ["CLAUDE.md#middleware"],
  "assignments": [...]
}
```
`demoted_canonicals` is captured in `observations.md` and `/coherence:status` so the user can grep for pathological patterns (always demoting the same section — likely misconfiguration).
### User-facing review
The Stop review shows a one-line note when demotion occurred: *"N other declared-canonical section(s) in different scopes were treated as references for this change."*
### Rationale
The at-or-above filter is the semantically correct rule: the canonical's containing file must be a common ancestor of the work, not a sibling. Two [CLAUDE.md](http://CLAUDE.md) files in different packages legitimately declaring the same concept canonical-in-their-scope is a normal monorepo pattern; forcing the user to disambiguate every cross-package change would be high-friction. The demotion is for one planning call only — the further file's canonical declaration is unchanged on disk and remains authoritative for changes within its own scope.
### Alternatives considered
- Plugin refuses to plan and surfaces /coherence:repair (rejected — high friction on legitimate monorepos).
- Distance-only tiebreak without at-or-above filter (rejected — picks a sibling package's canonical for cross-package changes; fails Test B).
- Split into two trigger groups by scope (rejected — defeats the cross-scope coherence Stage 1 exists for).
- Recency tiebreaker (rejected per DD-016 — recency is a confounding signal).
---
## DD-029: SessionStart re-validation rules (resolves OQ-020)
**Decision:** At SessionStart, each pending entry from `coherence/pending.md` is loaded, re-validated deterministically against the current workspace, and either kept (with state=`pending`, source=`session_start_revalidation`), re-targeted (same-file only), or dropped. No LLM is invoked. `pending.md` is hard-capped at 200 entries (oldest pruned).
### Pre-validation pruning
If `pending.md` contains more than 200 entries, the 200 most recent (by `timestamp`) are kept; older entries are dropped before re-validation runs. Prevents pathological growth and bounds re-validation cost.
### Drop rules (entry dropped if ANY are true)
1. **Anchor missing.** The section's anchor (per DD-027) cannot be resolved in the current file. File deleted, anchor removed, anchor renamed.
2. **Triggering files all gone.** Every path in `triggering_files` is missing on disk. The originating change has been reverted.
3. **Watch no longer matches.** The `matched_watch_glob` from the entry no longer matches any of `triggering_files`, OR no longer exists in the section's frontmatter. Watches were narrowed; the user no longer cares about this section/path pairing.
4. **Staleness fence.** Entry timestamp is more than 14 days old. Drift signal is stale; user has moved on.
### Re-target rule (same-file rescue)
Before dropping under rule 1, attempt one rescue: if the file in the entry's `section_ref` exists and contains an anchor with the same `id` at a different position within that file, update the `section_ref` and keep the entry. The path is unchanged; only the position within the file moved.
**Cross-file rescue is NOT attempted in v0.1.** Section moved between files → entry dropped → next edit in the new location regenerates the entry naturally. Git-blame inference for cross-file moves is deferred to v0.2.
### Re-validation counter
Surviving entries get a `revalidated_count` field incremented by 1 per re-validation pass. When `revalidated_count >= 2`, the user-visible label at Stop changes from "drift detected" to "long-pending drift (N days)" so old entries are visually distinguishable from fresh ones.
### Persistence
- Surviving entries are written into the in-memory buffer with `state: pending`, `source: session_start_revalidation`, `revalidated_count` incremented. Original `entry_id` is preserved.
- Dropped entries are logged to `coherence/revalidation-log.md` (NOT `observations.md`, which serves a different purpose) with the drop reason for telemetry. Then removed from `pending.md`.
### Cost characteristics
All checks are filesystem stat / glob match / anchor lookup. O(N × O(1)) for N pending entries. With the 200-entry cap, worst case ≈ 200 stat calls + 200 anchor parses — sub-second on typical hardware. Aligns with DD-003's 0-token claim for SessionStart.
### Rationale
The four drop rules cover the realistic ways a pending entry becomes irrelevant. Same-file rescue handles the most common rename case (section reorganized within a doc). Cross-file rescue is deferred without loss because the next edit regenerates the entry. The 200-entry cap and revalidation counter together prevent both runaway growth and silent staleness on otherwise-surviving entries.
### Alternatives considered
- Full git-based move detection (rejected — cost and complexity disproportionate; v0.2 candidate).
- Include rule "additive already preserved verbatim" check (rejected — diff inspection logic is non-trivial; deferred until evidence shows it's needed).
- 30-day staleness fence (rejected — drift signal half-life is shorter than that; 14 days matches typical sprint cadence).
- No staleness fence (rejected — pending entries from months-old sessions clutter every SessionStart).
- Drop logs to `observations.md` (rejected — conflates re-validation telemetry with observation buffer).
- No size cap on [pending.md](http://pending.md) (rejected — unbounded growth on heavy users).
---
## DD-030: Observe-mode buffer is identical to graduated-mode buffer (resolves OQ-021)
**Decision:** In Observe mode, `drift-buffer.json` IS written — same schema, same hooks, same statusline, same silent context refresh. What Observe disables is exactly two things: (1) Stage 1 + Stage 2 LLM calls at Stop, and (2) any file write outside `.claude/coherence/`. `observations.md` is a human-readable derived log written from buffer entries; it is NOT the buffer.
**Rationale:** "Run normally but write nothing" means write nothing *to user docs*, not "skip the entire data layer." The whole value of Observe is that the user sees the badge tick and can read the log to evaluate signal quality before graduating. Disabling buffer writes would make Observe blind, defeating its evaluation purpose.
**Alternatives considered:** Skip silent refresh in Observe (rejected — defeats Observe's "watch it work for a week" purpose; Claude's outputs would be invisibly worse than post-graduation, biasing the evaluation). Make `observations.md` the source of truth (rejected — markdown isn't a parseable contract; DD-026 schema becomes impossible to enforce).
---
## DD-031: Same-section-across-groups handled by DD-008 file-merge (resolves OQ-022)
**Decision:** When the same section is flagged in two independent trigger groups (per DD-025 file-overlap grouping), groups stay separate. Each group gets its own Stage 1 plan and its own Stage 2 patch attempts. The file-level merge step from DD-008 detects overlapping diffs on the same section and rejects all of them, surfacing the conflict for human review.
**Stop review presentation:** When this case fires, the Stop review shows a single consolidated note: *"Section S has competing patches from N independent changes; review and apply manually."* Both plans' context is shown side-by-side so the user can decide which (or whether to merge manually).
**Why no group-level merge:** Merging trigger groups when they share a non-canonical section sounds appealing but cascade-merges through any shared utility section (e.g. `ARCHITECTURE.md#layers` referenced by every package's flagged work) into one giant group, defeating DD-025's purpose of preserving distinct trigger groups for unrelated work.
**Rationale:** This is DD-008's existing overlap-rejection behavior, made explicit for the cross-group case. No new merge logic, no new failure modes. Cost is one extra surfaced item in the rare case the same section legitimately needs two unrelated patches in one session.
**Alternatives considered:** Section-level union-find merge after file-overlap merge (rejected — cascade-merges through shared canonicals into one giant group). Re-plan only when conflict materializes at file-merge (rejected — wastes Stage 1 cost and surfaces conflict at the wrong stage). Auto-pick one plan via heuristic (rejected — silently discards potentially-correct work from the dropped plan).
---
## DD-032: Hallucination grep tier classification rules (resolves OQ-023)
**Decision:** Strict vs loose tier is determined per-token by deterministic regex classification of each candidate identifier in the LLM's diff output.
**Strict tier (mismatch rejects patch).** A token is strict if it matches ANY of:
1. Contains a path separator: `/`, `\`, or `::`
2. Contains a member-access chain: `.` between two identifier-like runs (e.g. `foo.bar`, `obj.method`)
3. Appears on a line beginning with `import`, `from`, `require(`, `use `, or `#include`
4. Length ≥ 16 AND contains at least one of `_`, `.`, `/`, `\`, `::`, OR is a camelCase chain of 3+ segments
5. Length ≥ 6 AND mixed case AND contains at least one digit (e.g. `getUserId2`)
**Loose tier (mismatch logs warning, patch proceeds).** Everything else: bare identifiers, English words, single-camelCase tokens shorter than 16 chars, short alphanumerics like `id1` or `v2`.
**Why these specific rules:** Path separators and member-access chains are unambiguous code structure; collisions with English are vanishingly rare. Length 16 alone over-fires on long English-y names like `customer_account_balance`; requiring a structural marker (separator or 3+ camel segments) keeps strict precision high. The length-6 floor on rule 5 prevents `id1`, `v2`, `e2e` from being promoted to strict.
**Rationale:** Strict tier captures tokens with enough specificity that hallucination is unambiguous and rejection is safe. Loose tier covers ambiguous English-word collisions where a project-wide grep produces too many false positives to be decisive. Pure regex, language-agnostic, runs in microseconds.
**Alternatives considered:** AST-based classification (rejected — language-specific, expensive, v0.1 supports many languages). Single tier (rejected — either too strict, blocking valid patches, or too loose, accepting hallucinations). Length-only heuristic (rejected — over-fires on long English names).
---
## DD-033: `PLAN_DISAGREES` is terminal for that section in this pass (resolves OQ-024)
**Decision:** When Stage 2 returns `PLAN_DISAGREES`, the section's patch is dropped from the bundle. No retry, no fallback LLM call. The Stop review surfaces a one-line note: *"Section S declined the plan; no patch generated. Review manually."* The section's buffer entry transitions to `state: deferred` per DD-010 so the next Stop pass gets a chance with fresh planner inputs.
**Rationale:** Disagreement is signal that the planner mis-roled this section relative to its actual content. Re-calling Stage 2 without plan context tends to produce the same disagreement (the section's content didn't change). A deferral lets the next session — when buffer state and planner inputs may differ — try again. Cheapest correct option.
**Alternatives considered:** Retry without plan (rejected — \~600 extra tokens per disagreement, low recovery rate, same content produces same disagreement). Cached fallback (rejected — no cache layer in v0.1). Silent skip (rejected — user blind to abandoned sections, no recovery path).
---
## DD-034: Reject/accept classifier window is exclusive 2 messages (resolves OQ-025)
**Decision:** The DD-013 keyword classifier only inspects user messages 1 and 2 after a SubagentStop. Messages 3 and beyond are ignored by the classifier. Final state at SessionEnd combines the (window-1-2 keyword signal) with the (file-modification signal across the entire session). A reject keyword 5 messages later contributes nothing to classification.
**Rationale:** Late rejections rarely refer back to a subagent's output cleanly — the file-modification signal already captures actual rejection (deletion, rewrite, ≥50% line change). Tightening the keyword window to 2 messages keeps the classifier deterministically interpretable. DD-013 already declares the classifier "intentionally crude"; this resolves the ambiguity in that direction.
**Alternatives considered:** Decay function over messages (rejected — adds tunable parameters with no evidence justifying them). Unbounded window (rejected — false positives from unrelated reject keywords appearing later in the conversation). Single-message window (rejected — too narrow; legitimate user reactions sometimes land on message 2).
---
## DD-035: Revert detection via diff-based undo signal (resolves OQ-026)
**Decision:** DD-011's revert counter increments when, at SessionStart, the diff comparison shows that a `[coherence]` commit has been substantially undone. Specifically: a `[coherence]` commit is "reverted" if some commit younger than it (and on the current branch) modifies any file the `[coherence]` commit changed AND the younger commit's hunks against that file remove ≥80% of the lines the `[coherence]` commit added.
**Detection algorithm at SessionStart:**
1. List `[coherence]` commits on the current branch since the previous SessionStart.
2. For each `[coherence]` commit C and each file F it modified, run `git log --since=<C.timestamp> -- F` to find subsequent commits touching F.
3. For each subsequent commit, compute the line-level intersection: did it remove lines that C added?
4. If any subsequent commit removed ≥80% of the lines C added to F, count F's section as reverted-once. Two such observations within 30 days trigger DD-011's auto-ignore mechanism.
**Why the broadened rule:** The narrower "git revert subject only" rule misses the equally-canonical case where a developer fixing a bad coherence patch uses `git reset --hard` followed by re-edit, or simply edits the file to undo the change manually. DD-011's whole point is catching pathological loops; missing common revert paths defeats it.
**Rationale:** The 80% threshold is high enough that healthy follow-up edits (which add to or refine the patch) don't trigger false positives, and low enough that imperfect manual undos still register. Detection cost is bounded — one `git log -- <file>` per recent `[coherence]` commit per session — and runs at SessionStart where DD-029 already establishes a workspace walk.
**Alternatives considered:** Match `git revert` subject line only (rejected — misses \~50% of real revert paths). Any subsequent edit on patched lines counts (rejected — every healthy edit looks like rejection). Net-zero diff comparison (rejected — too easy to spoof and significantly more expensive than line-removal counting).
---
## DD-036: Trickle scan runs as detached child process (resolves OQ-027)
**Decision:** The PostToolUse hook spawns a detached child process for the deep scan. The hook returns within \~50ms regardless of scan duration. The scanner writes results to `.claude/coherence/scan-cache.json`; subsequent PostToolUse fires read the cache and apply DD-014's mtime-eligibility logic.
**Spawn options:**
```javascript
const child = spawn(process.execPath, [scannerPath, ...args], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();
```
`windowsHide: true` is required to prevent a console window flash on Windows hosts.
**Concurrency:** Scanner processes acquire `.claude/coherence/.scanner.lock` per DD-041. Stale-fence for the scanner lock specifically is **5 seconds** (not 30s) — a full scan of a 10k-file repo completes well under that bound, so anything older is reliably crashed. The general 30s fence in DD-041 still applies to buffer mutation locks.
**Scan-cache invalidation:** Cache entries carry their directory's mtime at scan time. DD-014 rule 3 (mtime newer than last-scan) reads from the cache to decide eligibility, so the async/cache split is invisible to the rest of the pipeline.
**Rationale:** Synchronous scanning blocks PostToolUse, causing user-visible lag on multi-MB projects (filesystem walks of 10k+ files take 100s of ms). Queueing for Stop defeats trickle's progressive-coverage purpose. Detached child is the standard portable solution; scanner crash cannot harm the host process.
**Alternatives considered:** Synchronous scan (rejected — user-visible lag). Queue for Stop hook (rejected — defeats trickle, all scans clump at Stop). Long-running daemon (rejected — out of plugin scope; lifecycle management). Worker thread instead of child process (rejected — shares the host process; crash propagation risk and harder to bound).
---
## DD-037: Auto-apply means apply-at-Stop without user prompt (resolves OQ-028)
**Decision:** "Auto-apply" for additive change-class (DD-002) means: at the Stop hook, after deterministic validation passes, the patch is applied and committed with the `[coherence]` prefix without showing a diff or prompting the user. It is NOT applied mid-session. The user sees a single summary line in the Stop review: *"N additive patches auto-applied (see **`coherence-log.md`** for diffs)."*
**Reconciles three prior DDs:**
- **DD-002** ("auto-apply additive") — preserved; user is not prompted.
- **DD-003** ("no LLM during session") — preserved; the Stage 2 LLM call that produced the patch ran at Stop, not mid-session.
- **DD-005** ("every patch a commit") — preserved; auto-applied patches still produce `[coherence]` commits, just without a review step.
**Rationale:** Mid-session writes would violate the one-prompt-per-session principle and create surprise commits. Apply-at-Stop with summary preserves the audit trail and revertability via `git revert` of the `[coherence]` commit, while keeping the auto-apply path frictionless.
**Alternatives considered:** True mid-session auto-apply (rejected — violates DD-003 and breaks the audit trail clarity DD-005 establishes). Even additive requires explicit confirm (rejected — defeats auto-apply purpose; reintroduces the friction DD-002 was designed to eliminate). Apply at Stop but show diff (rejected — turns auto-apply into manual confirm).
---
## DD-038: Quarantine marker expiry runs at SessionStart (resolves OQ-029)
**Decision:** The SessionStart hook scans tracked docs for `<!-- coherence-pending: YYYY-MM-DD -->` markers. If `today - date >= 7 days`, the marker is removed and the section is "finalized" with a `[coherence] finalize` commit prefix. Pure deterministic logic — no LLM call. Logged to `coherence-log.md`.
**Scope of scan:** Scan is restricted to files present in `.claude/coherence/section-index.json` (the integrity index built by DD-007's stack-based scan). Files entering the index after their marker would be missed for one session — acceptable, the marker re-emerges next session and gets processed.
**Why SessionStart:** SessionStart is the only reliable trigger in a CLI plugin. Daily-precision is sufficient for a 7-day fence. `/coherence:scan` may also expire markers on demand; SessionStart is the safety net that guarantees no marker lives indefinitely.
**Rationale:** One filesystem walk per session, gated to docs that contain the literal marker substring (cheap pre-filter via the section-index). Aligns with DD-029's existing SessionStart workload (re-validation), so the cost is amortized into the same hook.
**Alternatives considered:** `/coherence:scan` only (rejected — user might not run it for weeks; markers accumulate indefinitely). Background daemon (rejected — out of scope for a CLI plugin). Per-PostToolUse check (rejected — runs hundreds of times for one daily decision; wasteful).
---
## DD-039: Compaction detection via PreCompact hook with time-based fallback (resolves OQ-030)
**Decision:** The plugin registers Claude Code's `PreCompact` hook to reset `last_refreshed_section_set` (DD-020) and `last_refreshed_flagged_agents` (DD-024). If `PreCompact` is unavailable on the running host, the fallback is **time-based**: reset both values after 30 minutes of session wall-time elapsed since the previous reset.
**Why not a token-bin heuristic:** A previous draft proposed tracking total prompt-tokens-injected per session and flagging compaction on a \>30% drop. This fails because the plugin can only count tokens it injects via `additionalContext` — the user's prompts and Claude's outputs (the actual context-eating components) are invisible to the plugin. A 30% drop in plugin-injected tokens is not a meaningful compaction proxy.
**Why 30 minutes:** Matches the practical compaction frequency for sustained Claude Code sessions. The false-positive cost is one extra \~50-token refresh per 30 minutes — trivial. Tighter values produce more false positives without freshness gain; looser values risk staleness.
**Install-time capability detection:** At first SessionStart after install, the plugin records the host's hook surface in `.claude/coherence/host-capabilities.json`. If `PreCompact` is missing, a one-time info note recommends upgrading Claude Code for tighter freshness; the plugin uses the time fallback either way.
**Rationale:** `PreCompact` is the correct primitive when present. Time-based fallback ensures DD-020's freshness guarantee survives hosts that lack it. Graceful degradation without hard host-version coupling.
**Alternatives considered:** Require `PreCompact` (rejected — gates plugin on a specific Claude Code version, hostile to early adopters). No detection (rejected — DD-020 staleness in long sessions; defeats the silent-refresh purpose). Token-bin heuristic (rejected — plugin lacks visibility into the tokens that actually drive compaction).
---
## DD-040: Hard-require canonical Claude Code paths in v0.1 (resolves OQ-031)
**Decision:** v0.1 discovers skills only at `.claude/skills/*/SKILL.md` and agents only at `.claude/agents/*.md`. Files outside these paths are ignored by Coherence even if structurally identical. Configurable path discovery is deferred to v0.2 if usage data shows demand.
**Behavior outside canonical paths:** A file with valid coherence frontmatter or block anchors that lives outside the canonical paths is silently ignored. The plugin does not warn (warning every session about every non-canonical `.md` would be noise); `/coherence:status` includes a single line *"Discovery: canonical paths only (see DD-040)"* to signal the limitation.
**Rationale:** Custom paths are a long tail. The plugin can't add value for files Claude Code itself doesn't read, and Claude Code's own discovery uses these paths canonically. Hard-requiring them for v0.1 keeps the implementation tight and matches user expectations.
**Alternatives considered:** Config override for non-standard layouts (rejected — surface area, low evidence of need; can be added in v0.2 without breaking changes). Auto-detect via heuristics on `.md` files (rejected — would mis-flag READMEs and other non-skill markdown). Warn on every non-canonical `.md` with frontmatter (rejected — noise; users intentionally have non-skill markdown with YAML frontmatter).
---
## DD-041: Advisory file locks for buffer mutations (resolves OQ-032)
**Decision:** All writes to plugin state files acquire an advisory `<file>.lock` sibling. Locks contain `{pid, started_at, hostname, namespace_hint}`. Acquisition follows a deterministic policy with cross-namespace safety.
**Lock contents:**
```json
{
  "pid": 12345,
  "started_at": "2026-05-08T14:23:01.234Z",
  "hostname": "dev-machine",
  "namespace_hint": "linux:Ubuntu"
}
```
`namespace_hint` is computed as `${process.platform}:${process.env.WSL_DISTRO_NAME || process.env.HOSTNAME || ''}`.
**Acquisition policy:**
1. Try create-exclusive on `<file>.lock`. If succeeds, hold for the write duration; release on completion or process exit.
2. If lock exists, read it. Determine staleness: if `hostname` differs OR `namespace_hint` differs, fall through to `started_at` age check only (do NOT probe the foreign `pid` — PID may collide across namespaces). If same host and namespace, run `process.kill(pid, 0)` alive-check; process not alive → stale. Either path: if `now - started_at > stale_fence` → stale.
3. Stale → delete and retry from step 1.
4. Otherwise wait with exponential backoff (10ms, 20ms, 40ms, ... capped at 500ms) up to 5s total.
5. After 5s timeout, write fails. Hook logs an error to `coherence-log.md` and skips the entry. Buffer remains uncorrupted.
**Stale fences:** General buffer mutations — 30 seconds (covers reasonable disk-stall variance). Scanner lock (DD-036) — 5 seconds (scanner runtime is bounded).
**Files covered:** `drift-buffer.json`, `pending.md`, `subagent-trace.json`, `subagent-history.jsonl`, `subagent-stats.json`, `revalidation-log.md`, `scan-cache.json`, `section-index.json`, `host-capabilities.json`.
**Rationale:** Two-session corruption is real on monorepos with multiple worktrees or developers running multiple Claude Code instances. Advisory `.lock` files are the standard portable solution. Hostname + namespace_hint correctly handles WSL/Windows/macOS/Linux mixed setups where bare PIDs can falsely appear "alive" across namespace boundaries. SQLite is overkill for \~10 small JSON files.
**Alternatives considered:** SQLite for state (rejected — adds a binary dependency, schema migrations, and operational complexity wildly disproportionate to the data volume). Last-writer-wins (rejected — silent corruption, the failure mode this DD exists to prevent). OS-level mandatory locks (rejected — Windows/POSIX semantics differ; portability nightmare). PID-only stale check (rejected — fails on cross-namespace setups).
---
## DD-042: Stage 2 skipped entirely for `role: no-change` (resolves OQ-033)
**Decision:** Sections assigned `role: no-change` by Stage 1 do NOT trigger a Stage 2 LLM call. The Stop pipeline records them as `NO_PATCH_NEEDED` automatically. They appear in the Stop review only when paired with `relation: omits` (a planner contradiction), which is treated as a planner-output validation error and surfaces for human review.
**Validation rule:** Stage 1 output is validated post-schema (DD-015): if any assignment has `role: no-change` AND `relation: omits`, the plan is rejected as contradictory. The trigger group falls back to per-section independent patches with a logged warning.
**Cost impact:** For a typical Stop with 5 sections in a trigger group where 3 are `no-change`, this saves 3 Stage 2 calls (\~1800 tokens). Aggregate savings scale with project doc breadth — sessions touching shared utility code commonly produce many `no-change` sections.
**Rationale:** A `no-change` role explicitly states "this section is correct as-is." Calling Stage 2 to confirm would consume \~600 tokens per section to reach the deterministic conclusion the planner already produced. Self-grading the plan adds no value over DD-015's adversarial fixtures, which already catch planner errors statically.
**Alternatives considered:** Always call Stage 2 as a verifier (rejected — token cost without signal; the planner is the authority per DD-015's hardening). Conditional verifier on every Nth `no-change` (rejected — non-deterministic spend pattern, no clear value).
---
## DD-043: File-level frontmatter coherence opt-in only in v0.1 (resolves OQ-034)
**Decision:** v0.1 ships with file-level frontmatter coherence (the YAML `coherence:` key in skills/agents per DD-007) **disabled by default**. Skills and agents that want coherence in v0.1 use HTML-comment block anchors inside their content body (the same syntax used in prose docs). Users can opt into file-level frontmatter via `experimental.file_level_frontmatter_coherence: true` in `.claude/coherence/config.json` after independently verifying the key survives their toolchain.
**`/coherence:doctor`**** self-test:** The plugin includes a `/coherence:doctor` command that probes whether unknown YAML frontmatter keys survive a round-trip through the host's parser. Doctor: (1) writes a sentinel skill at `.claude/coherence/.probe/SKILL.md` with a `coherence:` frontmatter key; (2) reads the file back and re-serializes via the same library the plugin uses internally; (3) compares the re-serialized output's `coherence:` key against the original; (4) records `frontmatter_preserves_unknown_keys: <bool>` in `host-capabilities.json`.
**Why doctor is necessary-but-not-sufficient:** The probe verifies generic YAML round-trip preservation. It does NOT exercise Claude Code's specific internal serialization path, which the plugin cannot trigger directly. A passing probe does not guarantee Claude Code will preserve the key in its own code paths; a failing probe does guarantee at least one parser drops it. Doctor is therefore informational, not authoritative.
**Default-off rationale:** Silent disappearance of the `coherence:` key would cause silent loss of coherence guarantees on skill/agent files — a hidden failure mode worse than the absence of the feature. Defaulting OFF eliminates the silent-failure class entirely; users who want file-level frontmatter opt in after their own verification.
**What v0.1 ships with:** HTML-comment block anchors inside skill/agent file content (✅ supported); YAML `coherence:` frontmatter key (🔒 disabled by default, opt-in via config); `/coherence:doctor` (✅ available for users to probe their host before opting in).
**Rationale:** Conservative-by-default closes a real silent-failure mode without losing functionality — the HTML-comment block anchor form is the same syntax as prose docs and works regardless of host frontmatter parsing. The opt-in path lets advanced users adopt the syntactic-sugar form once their toolchain is verified. v0.2 can promote this to enabled-by-default when Claude Code exposes a capability API the plugin can rely on.
**Alternatives considered:** Trust without verification (rejected — silent disappearance of unknown keys is a documented risk with many YAML libraries; users would not detect the regression). Always require HTML-comment anchors (rejected — duplicates frontmatter parsing the host already does in the case where it works correctly; loses syntactic sugar for users on capable hosts). Default-on with doctor probe gating (rejected — probe is necessary-but-not-sufficient; passing probe does not guarantee host code paths preserve the key).
---
## DD-044: Mid-session branch switch — documented limitation, no detection in v0.1 (resolves OQ-035)
**Decision:** v0.1 does NOT detect mid-session branch switches. The buffer continues to reference paths/section IDs as captured at PostToolUse time. If a switch makes entries invalid, they survive in-memory until Stop, where DD-029-style re-validation runs against the current working tree and drops invalid entries with the standard logging. Documented as a known limitation in `/coherence:status` output and in the README.
**Why no detection:** A reliable mid-session branch switch detector requires either polling `git symbolic-ref HEAD` on every PostToolUse (cost on the hot path) or a host-provided event (none exists). Both are disproportionate to the problem — branch switches mid-session are rare in real Claude Code workflows, and Stop-time re-validation already handles the consequences correctly.
**Stop-time behavior:** The existing DD-029 rules naturally cover the post-switch case: anchors missing → drop, triggering files gone → drop, watch no longer matches → drop. Same code path, no special branch-switch logic needed.
**Rationale:** Pure scope decision. DD-029 already provides correctness; this DD makes the absence of detection explicit so users can reason about what happens when they switch branches mid-session.
**Alternatives considered:** Per-PostToolUse `HEAD` poll (rejected — hot-path cost). Filesystem-watch on `.git/HEAD` (rejected — adds a watcher with OS-specific edge cases). Hard-block at Stop if branch differs from session-start (rejected — too aggressive; user may switch back).
---
## DD-045: Anchor ID collision detection and `/coherence:repair` surfacing (resolves OQ-036)
**Decision:** The DD-007 stack-based integrity scan, run at every Stop hook and at SessionStart, treats duplicate `id="x"` within a single file as **fatal for that file**. The plugin refuses to plan, patch, or auto-apply against ANY section in the affected file (not just the colliding ones). The collision is surfaced via `/coherence:status` and `/coherence:repair`.
**Surfacing:**
- `/coherence:status` includes a `"file_integrity_errors"` block listing each file with its specific failure (collision, orphan open, missing close).
- `/coherence:repair` outputs an actionable per-file report:
```javascript
packages/api/CLAUDE.md
  ✗ Duplicate id "middleware" at lines 42 and 117
  → Suggestion: rename one (e.g. "middleware-v2") or merge sections
```
- The Stop review surfaces a single one-liner: *"N file(s) have anchor errors blocking coherence; run **`/coherence:repair`**."*
**Why fatal-for-whole-file:** A file with ambiguous anchors cannot be safely patched anywhere — patches reference sections by `<path>#<id>` (DD-027), and `<path>#middleware` is ambiguous when two sections share that ID. Partial enforcement (only the colliding sections) would risk patches landing in the wrong section.
**Rationale:** Conservative-by-default matches DD-043's stance on silent failure modes. Restates DD-007's existing rule with concrete UX so users know exactly what to do when a collision occurs.
**Alternatives considered:** Auto-rename second occurrence (rejected — silent mutation of user's docs). Skip only colliding sections, allow others (rejected — can't disambiguate cross-references between sections in the same file). Warn but allow patches (rejected — silent corruption risk).
---
## DD-046: `/coherence:review` cumulative cost telemetry (resolves OQ-037)
**Decision:** `/coherence:status` includes a `coherence_session_cost` block tracking cumulative LLM token spend across all `/coherence:review` invocations and the next Stop in the current session. Counter resets at SessionEnd. No threshold, no warning — purely informational.
**Output shape:**
```json
{
  "coherence_session_cost": {
    "stage_1_calls": 3,
    "stage_2_calls": 11,
    "tokens_in": 14820,
    "tokens_out": 3210,
    "estimated_cost_usd": 0.067,
    "review_invocations": 3
  }
}
```
**Cost estimate source:** Token count × the model's published per-token rates from `~/.claude/coherence-models.json` (a small lookup file shipped with the plugin and updated alongside model releases). Estimate, not authoritative — actual billing depends on Claude Code's own metering.
**Why no warning threshold:** Token spend tolerance is wildly user-dependent. A team using Claude Code for production work may consider \$5/session normal; a hobbyist may consider \$0.10 high. Imposing a threshold would either nag or under-warn for most users. Telemetry without judgment is the right v0.1 stance.
**Rationale:** Pure observability addition that composes with existing `/coherence:status`. Surfacing cost makes `/coherence:review` repeated invocations visible to the user without the plugin imposing opinions about acceptable spend.
**Alternatives considered:** Hard cap with confirm at threshold (rejected — paternalistic, threshold arbitrary). Warning toast at \$X (rejected — same arbitrariness). No telemetry (rejected — leaves users blind to a real cost vector).
---
## DD-047: Hallucination grep is language-aware via per-language import patterns (resolves OQ-038)
**Decision:** DD-032's strict-tier rule 3 (lines beginning with import-like keywords) extends to a per-language import-line regex registry. v0.1 ships with patterns for: TypeScript/JavaScript, Python, Go, Rust, Java, C#, Ruby, PHP. Other languages fall through to rules 1, 2, 4, 5 — losing only the import-line strict promotion, not all hallucination detection.
**Registry format:**
```json
{
  "ts": ["^import\\s", "^from\\s.+import\\s", "^const\\s.+=\\s*require\\("],
  "py": ["^import\\s", "^from\\s.+import\\s"],
  "go": ["^import\\s", "^\\s*\".+\"$"],
  "rs": ["^use\\s", "^extern\\s+crate\\s"],
  "java": ["^import\\s", "^package\\s"],
  "cs": ["^using\\s"],
  "rb": ["^require\\b", "^require_relative\\b"],
  "php": ["^use\\s", "^require(_once)?\\b", "^include(_once)?\\b"]
}
```
Language is detected by file extension; falls back to "unknown" for files without a registered extension.
**Behavior on unregistered language:** Token classification still works for path separators, member-access chains, length+structural rules, and the digit-mix rule. Only the import-line promotion is missed. Patches in unregistered languages have weaker (but non-zero) hallucination detection.
**Why ship a registry rather than scope to JS/TS:** Coherence is meant for documentation drift, which exists in every-language project. Restricting to JS/TS would defeat the use case for monorepos that mix languages (typical Python+TS or Go+TS shops). The registry is small, well-known, and contributors can extend it without code changes.
**Rationale:** Extension-based language detection is unambiguous. Registry is data, not logic — extensible without code changes. Other DD-032 rules degrade gracefully for unregistered languages so coherence still provides value, just with weaker import-line precision.
**Alternatives considered:** Scope v0.1 to JS/TS-only strict tier (rejected — under-serves polyglot teams; coherence has no language affinity). Auto-detect language by content (rejected — heuristic, fragile). Ship without import-line rule entirely (rejected — drops detection precision for common cases).
---
## DD-048: `/coherence:graduate` is a no-op flag flip in v0.1 (resolves OQ-039)
**Decision:** In v0.1, `/coherence:graduate` flips a single flag `mode: "graduated"` in `.claude/coherence/config.json` (default `mode: "observe"`). The flip enables the patch pipeline (Stage 1 + Stage 2 LLM calls and writes to user docs per DD-030). It does NOT enable Annotate or Author modes, which are v0.2.
**Behavior:**
- Pre-graduate (`mode: "observe"`): hooks fire, buffer fills, statusline shows badge, silent context refresh runs, but Stop's LLM pipeline is suppressed and no user-doc writes occur (per DD-030).
- Post-graduate (`mode: "graduated"`): full Stop pipeline runs; patches apply per DD-002 change-class gating; commits land per DD-005.
**`/coherence:graduate`**** output:**
```javascript
✓ Graduated to active mode. Coherence will now propose and apply patches at Stop.
  Mode: graduated (Annotate and Author modes ship in v0.2)
  Buffer entries from Observe period: 47
  First Stop will process the accumulated buffer.
```
**Reverting to Observe:** `/coherence:graduate --revert` flips back to Observe. Buffer is preserved. User can toggle freely.
**Why no v0.2 messaging beyond a one-line note:** Mentioning Annotate/Author in passing in the success message ("ship in v0.2") sets expectations honestly without implying they're available now. No separate command for v0.2 modes is reserved — the v0.2 plan can extend `/coherence:graduate` with a `--mode` flag without breaking the v0.1 surface.
**Rationale:** Minimal surface aligned with DD-030's mode definition. Revertibility makes opt-in low-risk — user can graduate, observe one Stop, revert if uncomfortable, with the buffer state preserved across the toggle.
**Alternatives considered:** Remove `/coherence:graduate` from v0.1 surface entirely (rejected — graduation is the explicit handoff from Observe to active; Cold-Start spec depends on it). Auto-graduate after N successful sessions (rejected — defeats Observe's "user opts in after evaluating" purpose). Multi-mode flag in v0.1 stub (rejected — feature creep into v0.2 territory).
---
## DD-049: Canonical selection algorithm — unified sequencing (resolves OQ-040)
**Decision:** The DD-018 nearest-wins rule and the DD-028 at-or-above filter are not independent — they are sequential stages of one unified **Canonical Selection Algorithm**. This algorithm is the single authoritative source for all canonical-picking decisions. Both DD-018 and DD-028 reference it by name; neither independently describes nearest-wins logic.
### Canonical Selection Algorithm
```javascript
1. Compute D = deepest common ancestor directory of all triggering_files in the group.

2. FILTER (DD-028 at-or-above gate):
   Keep only candidate sections whose containing file's directory
   is D or an ancestor of D.
   → If 0 survive: fall back to depth-score (DD-016) across all
     candidates regardless of declarations. Log warning.
   → If 1 survives: winner. Skip steps 3-4.
   → If 2+ survive: proceed to step 3.

3. NEAREST-WINS (DD-018):
   Among surviving candidates, pick the one whose containing file
   is closest (fewest directory hops) to D.
   → If 1 candidate is nearest: winner. Skip step 4.
   → If tied on distance: proceed to step 4.

4. DEPTH-SCORE TIEBREAK (DD-016):
   Among distance-tied candidates, pick the highest depth_score.
   → If still tied: pick deterministically by lexicographic path order.
     Log the tie for observability.
```
### Why this ordering is correct
- **Filter before nearest-wins:** DD-028's at-or-above filter is a hard correctness gate, not a preference. A package-level canonical is semantically ineligible for a cross-package change — it doesn't matter how near it is. Applying nearest-wins before the filter would let an ineligible nearer file win, which is wrong.
- **Nearest-wins before depth-score:** Proximity is a stronger signal than depth. A nearer, shallower doc is more likely the right canonical than a distant, deeper one. Depth breaks ties within the same distance tier only.
- **Lexicographic final tiebreak:** Makes the algorithm fully deterministic on identical inputs. No randomness, no per-call variance.
### Amendments to existing DDs
- **DD-018** is updated: the "nearest-wins" rule it describes is **step 3 of the Canonical Selection Algorithm**, not a standalone rule. DD-018 governs scope matching (which sections are candidates); it does not govern canonical selection independently.
- **DD-028** is updated: the at-or-above filter it describes is **step 2 of the Canonical Selection Algorithm**. The algorithm supersedes DD-028's inline sequencing description.
**Rationale:** Two DDs sharing "nearest-wins" as a mechanism but operating at different conceptual levels created implementer ambiguity. Unifying into one named algorithm eliminates the class of problem — an implementer reads one spec, implements one function, and both DDs become references to it.
**Alternatives considered:**
- Sequential-gates amendment only (rejected — still requires reading two DDs in order; doesn't eliminate the mental-model split).
- Explicit precedence declaration added to DD-028 (rejected — minimal patch that leaves the two-DD split intact; future DDs could re-introduce ambiguity).
- Argue rules are already orthogonal (rejected — true conceptually but undocumented; silent assumptions produce bugs at implementation time).
---
## DD-050: Skills and agents use YAML-only coherence declarations with install-time probe and optional sidecars (resolves OQ-041)
**Decision:** HTML-comment block anchors are **restricted to prose docs only** ([CLAUDE.md](http://CLAUDE.md), [ARCHITECTURE.md](http://ARCHITECTURE.md), [PATTERNS.md](http://PATTERNS.md), and similar files never loaded as agent instructions). Skills (`.claude/skills/*/SKILL.md`) and agents (`.claude/agents/*.md`) use the YAML `coherence:` frontmatter key exclusively. DD-043 is amended accordingly.
### Rationale for the restriction
HTML comments are invisible in markdown renderers — but [SKILL.md](http://SKILL.md) and agent files are consumed by an LLM, not a renderer. `<!-- coherence:section id="api-patterns" watches="src/routes/**" -->` appears verbatim in Claude's working context as instruction noise. At worst, it is a prompt-injection surface. The invisibility guarantee that justifies HTML comments in prose docs does not hold for files loaded into agent context.
### Primary path: YAML `coherence:` frontmatter key
Skills and agents declare coherence metadata in YAML frontmatter:
```yaml
---
description: API route handler patterns
coherence:
  watches: src/routes/**
  asserts:
    - import_exists: "from '@/lib/router'"
  role: consumer
  last-verified: 2026-05-08
---
```
### Install-time probe (not read-time)
`/coherence:doctor` runs once at install (not every session) and writes `frontmatter_preserves_unknown_keys: true/false` to `host-capabilities.json`. Result is cached for the project lifetime. The probe is the same sentinel-skill round-trip described in DD-043.
This is an improvement over DD-043's original design (read-time probe per session). Running once at install avoids per-session cost and produces a stable cached result.
### If probe passes
Full YAML coherence declarations work. Plugin reads `coherence:` key at SessionStart for all skills/agents. No further action needed.
### If probe fails
Plugin surfaces a one-time warning at next SessionStart:
> *"Your host may silently drop unknown YAML frontmatter keys. Skills and agents will use path-only watch matching (no **`asserts:`**, **`role:`**, or **`last-verified:`**) unless you enable sidecar files. Run **`/coherence:enable-sidecars`** to opt in."*
Path-only watch matching is a meaningful graceful degradation — the plugin still detects drift, just without the richer metadata. Users who need full coherence on a probe-failing host opt into sidecars explicitly.
### Sidecar fallback (opt-in via `/coherence:enable-sidecars`)
When enabled, the plugin creates `.claude/coherence/sidecars/<name>.yaml` for each skill/agent — same schema as the YAML `coherence:` key, stored in a file the plugin owns rather than embedded in the skill file.
**Sidecar file example** (`.claude/coherence/sidecars/api-routes.yaml`):
```yaml
target: .claude/skills/api-routes/SKILL.md
watches: src/routes/**
asserts:
  - import_exists: "from '@/lib/router'"
role: consumer
last-verified: 2026-05-08
```
The `target:` field links the sidecar to its skill/agent file. If the target is moved or deleted, the sidecar is orphaned — `/coherence:status` surfaces orphaned sidecars for cleanup.
### Drift risk of sidecars is bounded
DD-001 rejected sidecars as recreating the drift problem. That concern applies when sidecars are the *default* — users forget to update them when moving files. Here sidecars are an *opt-in fallback for a probe-failing edge case*, with explicit orphan detection. The drift risk is contained and surfaced.
### Summary of amendments to DD-043
<table header-row="true">
<tr>
<td>DD-043 original</td>
<td>DD-050 amendment</td>
</tr>
<tr>
<td>HTML anchors default for skills/agents</td>
<td>HTML anchors prohibited in skills/agents</td>
</tr>
<tr>
<td>YAML `coherence:` key opt-in via config</td>
<td>YAML `coherence:` key is the primary path</td>
</tr>
<tr>
<td>Read-time probe per session</td>
<td>Install-time probe, cached in `host-capabilities.json`</td>
</tr>
<tr>
<td>No sidecar option</td>
<td>Sidecar opt-in via `/coherence:enable-sidecars` when probe fails</td>
</tr>
<tr>
<td>`/coherence:doctor` informational</td>
<td>`/coherence:doctor` runs at install, result is actionable</td>
</tr>
</table>
**Alternatives considered:**
- HTML anchors stripped pre-context via `PreToolUse` hook (rejected — hook can't guarantee it intercepts every internal read path Claude Code uses).
- Separate sidecar files as the default for all skills/agents (rejected — recreates drift problem DD-001 rejected).
- Fenced `coherence-meta` code blocks in skill files (rejected — code blocks are more salient to LLMs than HTML comments; increases context noise).
- Read-time probe per session (rejected — wasteful; install-time caching is strictly better).
---
## DD-051: Consecutive-session defer count for velocity limiting (resolves OQ-042)
**Decision:** Extend DD-011 with a `consecutive_defer_sessions` counter per section alongside `revert_count`. When `consecutive_defer_sessions >= 3`, the section is auto-added to `.claude/coherence/ignore` with the same one-line surface and opt-out path as a revert-triggered ignore.
### Why consecutive sessions, not raw 30-day count
A raw `defer_count >= 3` within 30 days generates false positives for users who defer because they are busy, not because the patch is wrong. Consecutive sessions eliminate this: a user who defers in 3 consecutive sessions has encountered the same wrong patch across three distinct coding contexts — that is a clear, persistent signal the section's watch or patch logic is miscalibrated.
### Counter rules
- **Increments:** when a section's patch is presented at Stop (or `/coherence:review`) and the user defers (skips or rejects the bundle containing it).
- **Resets to zero** when any of the following occur:
	- User accepts a patch for that section.
	- At SessionStart re-validation, the section's content has changed since the last entry (detected by comparing the section's content hash against the stored hash in the buffer entry). Change indicates the user manually fixed it — the patch was implicitly addressed.
	- The section's buffer entry is dropped by DD-029 (staleness or anchor missing) — the signal is gone, the counter is no longer meaningful.
- **Does not increment** if the section's entry was not presented (low-confidence entries that go to observations only).
### State storage
Per-section velocity state is stored in `.claude/coherence/velocity.json`:
```json
{
  "sections": {
    "CLAUDE.md#middleware": {
      "revert_count": 1,
      "revert_timestamps": ["2026-05-01T..."],
      "consecutive_defer_sessions": 2,
      "last_defer_session_id": "sess-abc123"
    }
  }
}
```
`last_defer_session_id` prevents double-counting within the same session (e.g. a section deferred at `/coherence:review` and again at Stop in the same session counts as one deferral, not two).
### Interaction with DD-011 revert detection
Revert-triggered ignore (DD-011) and defer-triggered ignore (DD-051) are independent counters. Either can trigger the auto-ignore independently. Both are visible in `/coherence:status` velocity block.
**Rationale:** Consecutive-session defer count catches the "consistently wrong patch" failure mode that revert detection misses (entries never applied = never reverted). False-positive rate is low because it requires persistence across sessions. Three consecutive deferrals is a minimal but sufficient threshold.
**Alternatives considered:**
- Raw `defer_count >= 3` within 30 days (rejected — false positives for timing-based defers).
- Weighted `friction_score` combining reverts and defers (rejected — less intuitive, more tunable parameters).
- Repeat-defer requiring same patch regenerated twice (rejected — implementation complexity; may be too slow to trigger on gradual decay).
---
## DD-052: `coherence-log.md` entry schema (resolves OQ-043)
**Decision:** `coherence-log.md` uses structured markdown entries, one per patch, newest first. Entries reference git commits for full diff access rather than inlining diffs. The log is append-only and human-readable as the primary design goal.
### Entry format — auto-applied (additive)
```markdown
## 2026-05-09T11:32:00Z — additive — auto-applied

| Field   | Value |
|---------|-------|
| Section | `CLAUDE.md#middleware` |
| Trigger | `src/middleware/rateLimit.ts` (Write) |
| Lines   | +3 added |
| Commit  | `abc1234` |
| Diff    | `git show abc1234` |
| Revert  | `git revert abc1234` |

---
```
### Entry format — reviewed patch (modifying or destructive)
Identical to above, with one additional field:
```markdown
| Reviewed | yes — accepted at Stop 2026-05-09T11:34:00Z |
```
### Entry format — finalize commit (DD-038 quarantine expiry)
```markdown
## 2026-05-09T09:00:00Z — finalize — quarantine expired

| Field   | Value |
|---------|-------|
| Section | `ARCHITECTURE.md#layers` |
| Marker  | `coherence-pending: 2026-05-02` (7 days elapsed) |
| Commit  | `def5678` |
| Revert  | `git revert def5678` |

---
```
### What is NOT in the log
- Full diff content (available via `git show <commit>`; inlining bloats the file).
- Low-confidence entries sent to `observations.md` (different log, different purpose).
- Skipped/deferred patches (not applied — nothing to log).
### File management
- Entries prepended (newest first) so the user sees recent activity without scrolling.
- No rotation or truncation in v0.1 — log is append-prepend only. Size is bounded by the number of applied patches; in typical sessions this is small.
- v0.2 can add `--since` filtering if the file grows large.
**Rationale:** Human-readable markdown is the right format for a log the developer reads after a session. Git reference (`git show`) is the right way to expose the full diff — inlining duplicates data already in git and bloats the file. Newest-first ordering matches developer mental model ("what happened most recently?").
**Alternatives considered:**
- Full diff inline (rejected — bloats file; diff is already in git).
- JSONL format (rejected — not human-readable; primary consumer is a developer scanning manually).
- Minimal entry without table structure (rejected — inconsistent field presence leads to ad-hoc formatting in practice).
---
## DD-053: SessionStart finalize sequencing and Stage 2 reads current file state (resolves OQ-044)
**Decision:** Two explicit rules resolve the DD-038 ↔ DD-005 ordering conflict.
### Rule 1: SessionStart sequencing
SessionStart operations run in this strict order:
```javascript
1. Quarantine marker expiry scan (DD-038) — commits [coherence] finalize
2. DD-029 pending entry re-validation (reads post-finalize file state)
3. Buffer load from pending.md (post-finalize, post-revalidation)
4. Trickle scan queue initialization (DD-014)
5. Host capabilities check (DD-039)
```
Finalize commits land before any buffer state is computed. The buffer therefore always reflects the post-finalize workspace. No Stop patch can be stale relative to a finalize commit from the same session.
### Rule 2: Stage 2 patch writers read current file state at patch-generation time
Stage 2 patch writers do NOT use section content captured at PostToolUse time. They read the section from disk at the moment Stage 2 runs (at Stop or `/coherence:review`). This is the correct invariant regardless of finalize ordering — it makes Stage 2 naturally resilient to any SessionStart modifications (finalize commits, manual edits, `git pull`).
This rule is now explicit in the implementation contract: `read_section_for_patch(section_ref)` always calls `fs.readFileSync` at invocation time, never reads from a snapshot cache older than the current Stop invocation.
### Why Rule 2 is independent of Rule 1
Rule 1 resolves the specific finalize ↔ Stop overlap. Rule 2 resolves the general class of "any pre-Stop file modification makes buffer entry content stale." Documenting both independently means future changes (e.g. adding a new SessionStart operation) don't require re-auditing the finalize ↔ Stop interaction.
**Rationale:** SessionStart strict ordering is the minimal correct fix for the finalize ↔ Stop conflict. The Stage 2 current-read invariant is the right design choice independently — it eliminates an entire class of stale-content bugs, not just the finalize case.
**Alternatives considered:**
- Move quarantine expiry to Stop (rejected — user works all session with stale quarantine markers; finalization is conceptually a SessionStart operation).
- Track finalize commits in buffer as a special entry type (rejected — mixes concerns; buffer is for drift signal, not commit tracking).
- Stage 2 reads from PostToolUse snapshot (rejected — any pre-Stop file modification produces stale patches; the class of bugs is wider than just finalize commits).
---
## DD-054: Assertion-triggered entries are high-confidence and shown in a separate Stop review section (resolves OQ-045)
**Decision:** Assertion-triggered buffer entries (source: `session_start_revalidation`, `triggering_files: []`) are always classified as **high-confidence** and surface at Stop. They are presented in a dedicated **"Assertion failures"** section of the Stop review, separate from code-change-triggered patches, so the user understands the signal source and can evaluate its freshness.
### Why always high-confidence
The `asserts:` mechanism is opt-in. A user who wrote `asserts: import_exists: "from 'express'"` explicitly declared that this invariant matters to them. Any failure is a meaningful signal — either the codebase diverged from the assertion (genuine drift) or the assertion itself is stale (needs updating). Both cases warrant human attention. Low-confidence handling (silent observation) would hide signals the user explicitly asked for.
### Stop review structure with assertion section
```javascript
📄 Coherence — 3 items to review

[Section 1: code-change patches — shown when present]
━━ Code changes (2 patches)
  CLAUDE.md#middleware — additive (auto-applied)
  ARCHITECTURE.md#layers — modifying [diff]

[Section 2: assertion failures — shown when present]
━━ Assertion failures (1)
  CLAUDE.md#dependencies
  Assertion: import_exists "from 'express'" — not found in codebase
  This assertion may reflect a migration to a new library.
  [Patch] [Update assertion] [Dismiss]

[Section 3: subagent flags — shown when present]
━━ Subagent flags (1)
  agents/test-writer — 39% discard rate (last 10 inv)
```
### Assertion failure actions
Three options surfaced per assertion failure (not just Accept/Skip):
- **Patch** — run Stage 2 for this section with the failed assertion as context.
- **Update assertion** — opens the section's frontmatter for editing (removes or updates the failing `asserts:` entry).
- **Dismiss** — suppress this assertion failure for the current session only; it re-surfaces next session unless the assertion or code is updated.
### Staleness awareness without blocking
Assertion entries carry the section's `last-verified` date in their Stop review display: *"Assertion declared 2024-11-01 — 94 days ago."* This gives the user context to evaluate whether the assertion itself may be stale, without delaying the signal or adding a multi-session buffer period.
**Rationale:** Immediate surfacing (high-confidence, always at Stop) is correct because the user opted into the assertion. The separate review section provides the context needed to evaluate the signal ("this came from an explicit assertion, not a code change") without losing the signal's immediacy. The three-action UX (patch/update/dismiss) fits assertion failures better than the standard accept/skip binary.
**Alternatives considered:**
- High-confidence after N consecutive sessions (rejected — delays real signals by N sessions; transient states are rare and the 3-action UX handles them).
- Flat display with code-change patches (rejected — loses the signal-source context; user can't distinguish assertion failures from code-change triggers).
- `assertion_age` qualifier instead of separate section (rejected — age is useful context but insufficient UX; the 3-action set is not appropriate for code-change patches; a separate section is cleaner).
---
## DD-055: `/coherence:status` canonical output structure (resolves OQ-046)
**Decision:** `/coherence:status` output follows a fixed section ordering with conditional visibility. A `--json` flag is noted for v0.2 but not shipped in v0.1.
### Canonical output
```javascript
🧭 Coherence — status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode:       graduated
Buffer:     3 sections pending (1 deferred)
Last Stop:  2026-05-09T11:32:00Z (12 min ago)

[shown only if errors exist]
⚠️  File integrity errors (2)
  CLAUDE.md — duplicate anchor id "middleware"
  ARCHITECTURE.md — orphan open at line 84
  → Run /coherence:repair for details

[always shown]
📊 Subagent health
  code-reviewer   47 inv   ✅ healthy   8% discard
  test-writer     23 inv   ⚠️ flagged   39% discard
  api-documenter   4 inv   ℹ️ insufficient data (min 10)

[always shown]
💰 Session cost
  Calls:   Stage 1 ×3  |  Stage 2 ×11
  Tokens:  14,820 in  /  3,210 out
  Cost:    est. $0.067

[shown only if observations exist]
🔍 Observations
  47 unreviewed since 2026-04-28
  Run /coherence:scan to refresh discovery

[always shown, one line]
Discovery: canonical paths only · DD-040
```
### Section ordering rationale
<table header-row="true">
<tr>
<td>Order</td>
<td>Section</td>
<td>Visibility</td>
<td>Reason</td>
</tr>
<tr>
<td>1</td>
<td>Header block (mode, buffer, last Stop)</td>
<td>Always</td>
<td>Most frequently checked fields</td>
</tr>
<tr>
<td>2</td>
<td>File integrity errors</td>
<td>If errors exist</td>
<td>Errors block patching — urgent, surface first</td>
</tr>
<tr>
<td>3</td>
<td>Subagent health</td>
<td>Always</td>
<td>Core healing signal; users check this regularly</td>
</tr>
<tr>
<td>4</td>
<td>Session cost</td>
<td>Always</td>
<td>Resets each session; budget awareness</td>
</tr>
<tr>
<td>5</td>
<td>Observations</td>
<td>If non-empty</td>
<td>Context for Observe-mode users</td>
</tr>
<tr>
<td>6</td>
<td>Discovery note</td>
<td>Always</td>
<td>One-line scope reminder; low visual weight</td>
</tr>
</table>
### "Last Stop" formatting
- If Stop ran this session: show ISO timestamp + relative time in parentheses.
- If Stop has never run: `Last Stop: never`.
- If Stop ran in a previous session: `Last Stop: 2026-05-08T... (yesterday)` — relative time in calendar terms, not minutes.
### Velocity block (shown only if any section has non-zero velocity state)
Inserted between Subagent health and Session cost when present:
```javascript
🔁 Velocity limits
  CLAUDE.md#middleware — 2 consecutive defers (auto-ignore at 3)
  ARCHITECTURE.md#auth — 1 revert (auto-ignore at 2)
```
### What is NOT in the output
- Full subagent history (available in `subagent-history.jsonl`).
- Full [coherence-log.md](http://coherence-log.md) content (available in that file).
- Per-section buffer entry detail (available via future `/coherence:buffer` command).
**Rationale:** Fixed ordering with conditional visibility is the right v0.1 design. It is predictable (users know where each section will appear), compact (empty sections don't waste space), and complete (all DD-defined output is accounted for). The `--json` flag is deferred because there is no v0.1 use case that requires machine-readable output — all plugin state files (subagent-stats.json, velocity.json, etc.) are already JSON and directly readable.
**Alternatives considered:**
- Section-filtered output (`--only=agents`) (rejected — deferred to v0.2; adds CLI surface without proven need).
- Dashboard summary line first (rejected — duplicates detail below; terminal doesn't support collapsing).
- `--json` flag in v0.1 (deferred — all underlying state files are already JSON; no v0.1 consumer needs a unified JSON output).
---
## DD-056: Token budget enforcement and progressive degradation (resolves Critical Readiness Gap #1)
**Decision:** v0.1 enforces hard per-session token-budget limits at the Stop pipeline boundary. When limits are reached, the pipeline degrades progressively by prioritizing canonical and high-depth-score sections and deferring the remainder to `pending.md` via the standard DD-029 buffer lifecycle. Cost target restated as a two-tier figure: **\$0.07 p50, \$0.15 p95**.
### Hard limits (per Stop or `/coherence:review` invocation)
- `max_trigger_groups_per_pipeline = 3`
- `max_sections_per_group = 12`
- `max_stage2_calls_per_pipeline = 36`
- `max_input_tokens_per_pipeline = 30000`
- `max_output_tokens_per_pipeline = 8000`
All limits configurable via `coherence.budget.*` in `.claude/coherence/config.json`.
### Priority-defer overflow algorithm
1. **Canonical-first** within each trigger group — DD-049 winner always admitted.
2. **Reference-then-consumer** ordered by `depth_score` (DD-016) descending.
3. **Inter-group fairness** via round-robin so a single large group cannot starve smaller ones.
4. **Bash-only entries** (empty `triggering_files`) admitted only after file-bearing sections of the same group.
Overflow sections become `state: deferred` and are carried to the next Stop.
### User-visible degradation surface
Stop review header includes one line: *"3 sections deferred to next Stop (token budget cap reached). Run **`/coherence:review`** for the remainder."*
DD-046 cost block adds `degraded: true` and `deferred_count: N`.
### Dry-run estimate
`/coherence:review --estimate` runs Stage 1 only (or skips with heuristic) and prints projected token spend before invoking Stage 2.
### Rationale
Hard caps are deterministic and auditable. Priority-defer reuses the existing DD-029 buffer lifecycle and DD-049 canonical algorithm — no new state machinery. Two-tier targets are honest about real cost distribution. Beyond p95, degradation is visible (not silent) and recoverable.
### Alternatives considered
- **Adaptive tier classifier** (small/medium/large with different ceilings) — rejected: classification complexity with no clear win over fixed caps.
- **Pay-as-you-go with no cap** (rely solely on DD-046 telemetry) — rejected: silent \$0.50+ sessions on large monorepos defeat the affordability goal.
- **Hard-stop with no degradation** — rejected: drops drift signal; user must manually re-run.
---
## DD-057: Prompt versioning, caching, and regression-test gate (resolves Critical Readiness Gaps #2 and #3)
**Decision:** All LLM prompts ship as versioned files in plugin source, use Anthropic prompt caching for the stable prefix, and are gated by a regression-test fixture suite that must pass for any prompt change.
### File layout
```javascript
plugin/prompts/v1/
  stage1-planner.md
  stage2-additive.md
  stage2-modifying.md
  stage2-destructive.md
  silent-refresh.md
```
Each file has YAML frontmatter:
```yaml
prompt_id: stage1-planner
prompt_version: 1
min_plugin_version: 0.1.0
cached_prefix_lines: 1-120
```
### Anthropic prompt caching
Stable prefix (system + rules + negative examples + JSON schema) goes through Anthropic's prompt-caching API. Per-call inputs (sections + change summary) are non-cached. Empirical cache savings \~70% of input tokens for repeated calls within the 5-minute idle window. DD-056 budget assumes cache hits after the first call per session.
### Prompt versioning rules
1. **Append-only.** Prompt update creates a new versioned file; old version retained.
2. **`prompt_version`**** recorded** in `coherence-log.md` per patch and in `metrics.jsonl` per call.
3. **Any text change bumps version**; cosmetic-only changes are forbidden (silently invalidate caches).
4. **`min_plugin_version`** ensures plugin doesn't load a prompt newer than itself.
### Regression-test fixture suite
Fixtures in `tests/prompts/` per prompt; each is `{name}.input.json` + `{name}.expected.json`. Suite runs against live API or recorded-replay layer per release.
**Stage 1 planner:** 5 baseline (DD-015) + 10 multi-canonical + 5 monorepo scope + 5 edge cases + 5 negative cases.
**Stage 2 patch writers:** 15 additive + 10 modifying + 5 destructive + 10 NO_PATCH_NEEDED + 5 ESCALATE + 5 PLAN_DISAGREES.
### Release gates (any v0.x tag)
- Stage 1: ≥90% schema-valid output AND ≥80% correct canonical selection.
- Stage 2: ≥80% patch-apply rate (folds in Patch Apply Rate concern) AND ≤2% hallucination escape.
- ESCALATE rate within 5–15% on modifying/destructive combined.
Failure blocks release. Results committed to `tests/prompts/results/<plugin-version>.json`.
### Telemetry integration
`coherence_session_cost` (DD-046) adds `prompt_versions: {stage1: 1, stage2: 1}` so users can correlate quality changes with version bumps.
### Rationale
Prompts are the highest-leverage quality lever. Versioning + caching + a regression gate addresses three concerns at once: empirical validation (gate), cost stability (caching), rollback safety (versioned files + plugin-version pinning). Fixture corpus also serves as living edge-case documentation.
### Alternatives considered
- **Ship without versioning, iterate post-launch** — rejected: silent regressions degrade quality across all users; no rollback path.
- **LLM-judge of LLM-output** for fixture grading — rejected: introduces second LLM into test loop; labelled fixtures are deterministic and auditable.
- **No caching** — rejected: \$0.07 p50 target achievable only with cached prefixes per measured Anthropic savings.
---
## DD-058: Hallucination grep empirical validation and low-confidence demotion (resolves Critical Readiness Gap #4 and Patch Apply Rate concern)
**Decision:** DD-032 / DD-047 hallucination grep adds a labelled validation corpus and a runtime confidence-demotion rule converting patches with weak hallucination signal from auto-apply to user-confirm.
### Validation corpus
`tests/hallucination/`:
- 50 valid patches drawn from real-world `coherence-log.md` outputs (anonymized).
- 50 hallucinated patches generated by synthetic corruption: rename functions, inject fake imports, alter paths, invent classes.
- **Language coverage:** TS, Python, Go, Rust, Java, C#, Ruby, PHP (8 supported per DD-047) + Kotlin and Elixir (2 unregistered for graceful-degradation tests).
### Pass thresholds (release gate)
- **Strict tier:** ≥95% recall on hallucinations, ≤2% false-positive on valid patches.
- **Loose tier:** ≥70% recall, ≤10% false-positive.
- **Unregistered languages:** rules 1, 2, 4, 5 must achieve ≥80% recall on hallucinations (only the import-line rule is missing).
- Per-language precision/recall published in `tests/hallucination/results/<plugin-version>.md`.
### Confidence demotion at runtime
After a patch passes validation but before DD-002 change-class gating:
```javascript
looseOnlyTokens = identifiersInPatch.filter(t =>
  isLooseTier(t) && !appearsInProjectGrep(t)
)
if (looseOnlyTokens.length >= 3) {
  demoteOneClass(patch)  // additive→modifying, modifying→destructive
  log({ reason: 'low_confidence_loose_only', tokens: looseOnlyTokens })
}
```
Demotion changes the permission tier (DD-002): an additive patch that would auto-apply now requires explicit user accept; a modifying patch that would default-Accept now requires explicit confirm. **The patch is NOT rejected** — the user still sees it; the plugin just refuses to ship it silently.
### Rationale
The corpus closes the empirical-validation gap. The demotion rule closes the loose-tier blind spot the audit identified (e.g., `formatCurrency` in an `import` is loose-only; demotion forces a human gate). The conservative threshold (≥3 loose-only unfamiliar tokens) keeps false-positive demotions rare; in the common case the patch flows through unchanged.
### Alternatives considered
- **LLM-judge fallback** when grep is uncertain — rejected: adds an LLM call per patch validation, defeating cost goals.
- **Reject loose-only patches outright** — rejected: too aggressive; many valid additive patches mention bare identifiers.
- **Pure post-launch telemetry without corpus** — rejected: leaves the v0.1 release blind to per-language degradation.
---
## DD-059: Performance budgets, benchmark harness, and telemetry (resolves Critical Readiness Gap #5)
**Decision:** v0.1 ships with explicit per-hook performance budgets, a benchmark harness validating them across reference codebases, and opt-in runtime telemetry.
### Performance budgets (release gate)
<table header-row="true">
<tr>
<td>Hook / operation</td>
<td>p95</td>
<td>p99</td>
<td>Notes</td>
</tr>
<tr>
<td>PostToolUse hot path</td>
<td>\<50 ms</td>
<td>\<150 ms</td>
<td>Excludes lock-wait; trickle scan detached per DD-036</td>
</tr>
<tr>
<td>SessionStart (200 pending, 1k section index)</td>
<td>\<2 s</td>
<td>\<4 s</td>
<td>Includes DD-029 + DD-038 + integrity scan</td>
</tr>
<tr>
<td>Stop pipeline (≤12 sections)</td>
<td>\<10 s</td>
<td>\<15 s</td>
<td>Stage 1 + Stage 2 parallel, max 8 concurrent</td>
</tr>
<tr>
<td>Stop pipeline (cap-bound 36 sections)</td>
<td>\<25 s</td>
<td>\<40 s</td>
<td>DD-056 ceiling case</td>
</tr>
<tr>
<td>Resident memory</td>
<td>\<50 MB</td>
<td>\<80 MB</td>
<td>Plugin process only</td>
</tr>
<tr>
<td>Stage 2 max concurrency</td>
<td>8</td>
<td>—</td>
<td>Bounds API rate-limit risk and memory</td>
</tr>
</table>
### Benchmark harness
`tests/perf/` contains synthetic reference codebases:
- **small:** 50 files, 1 [CLAUDE.md](http://CLAUDE.md), 5 sections
- **medium:** 1,000 files, 3 docs, 30 sections
- **large:** 10,000 files, 10 docs, 150 sections
- **monorepo:** 50,000 files, 10 packages, 30 docs, 500 sections
Harness runs each hook 100 times per fixture and reports p50/p95/p99. CI runs small + medium per commit; large + monorepo nightly. Regression \>30% on any p95 metric blocks merge.
### Runtime telemetry (opt-in)
`coherence.telemetry.perf: true` enables per-hook duration logging to `.claude/coherence/perf.jsonl` (rolling 1000 entries). Surfaced via `/coherence:status --perf`. Local-only; nothing uploaded.
### Lock-contention escape valve
DD-041's 5s timeout is preserved. After 3 consecutive lock-wait timeouts in a session, plugin transitions to degraded mode (DD-061): hooks skip buffer writes and surface a one-time warning. Prevents the audit-identified 5.1s worst-case PostToolUse from becoming user-perceived lag.
### Rationale
Numeric budgets eliminate the "unknown latency" concern. Reference-codebase harness makes scaling characterized, not asserted. Opt-in telemetry gives users confidence without privacy compromise.
### Alternatives considered
- **Ship without budgets, measure post-launch** — rejected: regressions caught only after users hit them.
- **Synthetic micro-benchmarks only** — rejected: macro behavior on real codebase shapes is the actual user experience.
- **Always-on telemetry with cloud upload** — rejected: privacy and complexity not warranted in v0.1.
---
## DD-060: Operational quality metrics — deterministic definitions and local storage (resolves Critical Readiness Gap #6)
**Decision:** All v0.1 success metrics get deterministic numerator/denominator definitions, are stored locally in `.claude/coherence/metrics.jsonl`, and replace the audit-criticized "false-positive rate" with a deterministic composite **regret rate**. No automatic upload; an opt-in `/coherence:share-metrics --anonymized` writes a privacy-scrubbed export.
### Metric definitions (canonical)
<table header-row="true">
<tr>
<td>Metric</td>
<td>Numerator</td>
<td>Denominator</td>
<td>Target</td>
</tr>
<tr>
<td>Auto-apply rate</td>
<td>Additive patches successfully auto-applied (post-validation)</td>
<td>Additive patches proposed by Stage 2</td>
<td>≥60%</td>
</tr>
<tr>
<td>Patch acceptance rate</td>
<td>Patches accepted at Stop OR auto-applied</td>
<td>Patches presented OR auto-applied (excludes deferred and ESCALATE)</td>
<td>≥70%</td>
</tr>
<tr>
<td>Patch apply rate</td>
<td>Patches passing all DD-008 validation checks</td>
<td>Patches generated by Stage 2 (excludes NO_PATCH_NEEDED, ESCALATE, PLAN_DISAGREES)</td>
<td>≥80%</td>
</tr>
<tr>
<td>Regret rate (replaces false-positive)</td>
<td>Patches reverted ≤7 days (DD-035) OR consecutive-deferred ≥2 sessions (DD-051)</td>
<td>Total applied patches in 30-day window</td>
<td>\<15%</td>
</tr>
<tr>
<td>Hallucination escape rate</td>
<td>Hallucinated patches that passed grep AND were applied AND were later reverted</td>
<td>Total applied patches</td>
<td>\<1%</td>
</tr>
<tr>
<td>ESCALATE rate</td>
<td>Stage 2 calls returning ESCALATE</td>
<td>Stage 2 calls (excluding NO_PATCH_NEEDED)</td>
<td>5–15%</td>
</tr>
</table>
### Why regret rate replaces false-positive rate
The audit correctly flagged that "user skipped" conflates skill issues with timing issues. **Regret rate is observable and deterministic**: a user who reverts a `[coherence]` commit within 7 days OR who defers the same patch across 3 consecutive sessions has provided unambiguous signal the patch was wrong. Both are detected by existing DDs (DD-035 + DD-051). Subjective "intent" is removed from the metric entirely.
### Storage schema
`.claude/coherence/metrics.jsonl` (one event per line):
```json
{"ts":"2026-05-09T12:00:00Z","event":"patch_applied","section":"CLAUDE.md#middleware","class":"additive","auto":true,"prompt_version":1,"plugin_version":"0.1.0"}
{"ts":"2026-05-09T13:00:00Z","event":"patch_reverted","section":"CLAUDE.md#middleware","days_since_apply":1}
```
90-day rolling retention; aged-out entries summarized into `metrics-summary.json` (counts only, no content).
### Privacy-preserving share
`/coherence:share-metrics --anonymized` produces `coherence-metrics-export.json`:
- Removes section IDs, file paths, commit SHAs.
- Hashes prompt versions consistently (trends visible without leaking version numbers).
- Outputs aggregate counts and rates only.
User inspects manually and chooses whether to share. No automated upload.
### Degradation feedback loop
When any release-gate metric falls below target for 5 consecutive sessions, the next Stop review includes one line: *"Coherence quality has degraded recently. Run **`/coherence:status --diagnose`** for details."*
`/coherence:status --diagnose` shows recent metric trends, suggests likely causes (e.g., "hallucination escape rate up — check for new dependencies"), and points to relevant DDs.
### Rationale
Deterministic definitions eliminate the audit's "meaningless" concern. The composite regret rate replaces the unobservable false-positive metric with one fully derivable from existing DD-035 + DD-051 state. Local storage with manual share preserves user privacy without abandoning observability.
### Alternatives considered
- **Cloud telemetry with opt-out** — rejected: privacy and trust concerns; the developer user base most likely to install Coherence is most opposed to ambient upload.
- **Self-reported survey at Stop** — rejected: friction; user-reported metrics are notoriously biased.
- **Keep "false-positive rate" as user-skip count** — rejected: per audit, the metric conflates causes; replacing with regret rate is the correct fix.
---
## DD-061: Failure-mode recovery — atomic state, checkpointed Stop, degraded mode, `/coherence:recover` (resolves Critical Readiness Gap #7)
**Decision:** v0.1 ships with four interlocking failure-recovery mechanisms: atomic state-file writes with quarantine on corruption, checkpointed Stop pipelines that resume idempotently after crashes, a degraded-mode escape valve when buffer writes repeatedly fail, and a `/coherence:recover` command for manual repair.
### 1. Atomic state-file writes
All plugin state JSON files (drift-buffer.json, velocity.json, subagent-trace.json, subagent-history.jsonl, subagent-stats.json, scan-cache.json, section-index.json, host-capabilities.json, stop-progress.json, metrics.jsonl) are written via:
```javascript
write to <file>.tmp → fsync → rename(<file>.tmp, <file>)
```
On read, every file is JSON-parsed and schema-validated. A file that fails parsing or schema validation is moved to `.claude/coherence/quarantine/<filename>.<unix-ts>.bak` and a fresh empty/default file initialized in its place. The corruption event is logged to `coherence-log.md` with the quarantine path so the user can inspect.
Quarantine retention: last 10 corrupt copies per file, oldest deleted.
### 2. Stop pipeline checkpointing
The Stop pipeline writes `.claude/coherence/stop-progress.json` after each significant step:
```json
{
  "pipeline_id":      "sess-abc-stop-1",
  "started_at":       "2026-05-09T12:00:00Z",
  "stage1_complete":  true,
  "stage1_plan_path": ".claude/coherence/stop-progress-plan.json",
  "stage2_done":      ["CLAUDE.md#middleware", "ARCHITECTURE.md#layers"],
  "stage2_pending":   ["PATTERNS.md#auth"],
  "commits_made":     ["abc1234", "def5678"]
}
```
Resumption rules at SessionStart (or next Stop):
1. If `stop-progress.json` exists with `pipeline_id` from a prior session: this is crash recovery.
2. Skip Stage 1 if `stage1_complete: true` (reuse the persisted plan).
3. Skip any section in `stage2_done` (its commit is already in git).
4. Resume Stage 2 for `stage2_pending` only.
5. On clean completion, delete `stop-progress.json`.
Idempotency guarantees: each Stage 2 call writes its commit *before* updating `stage2_done`, so a crash between commit-write and progress-write is safe (re-running Stage 2 produces NO_PATCH_NEEDED because the file already reflects the change).
### 3. Degraded mode (lock-cascade escape valve)
When the same lock acquisition fails 3 consecutive times within a session (per DD-041's 5s timeout), the plugin transitions to **degraded mode**:
- Statusline shows `[🧭 ⚠]` instead of `[🧭 N]`.
- Hooks return immediately without buffer writes.
- A one-time `additionalContext` injection alerts the user: *"Coherence is in degraded mode (state writes blocked). Run **`/coherence:recover`** when convenient."*
- All in-session signal is lost; persisted state ([pending.md](http://pending.md) from prior sessions) is preserved.
- Mode persists until next SessionStart re-attempts initialization.
Prevents the audit-identified "plugin appears dead with no signal" failure mode.
### 4. Git pre-conditions and post-condition handling
Before any `[coherence]` commit:
1. Check `.git/MERGE_HEAD`, `.git/CHERRY_PICK_HEAD`, `.git/REBASE_HEAD`, `.git/rebase-apply/`, `.git/rebase-merge/` — if any present, **skip commit**, log to [coherence-log.md](http://coherence-log.md) as `git_state_busy`, defer to next Stop.
2. Check `git symbolic-ref -q HEAD` — if detached, **proceed with commit** but log a `[coherence] commit on detached HEAD — run \`git checkout -b \<branch\>\` to preserve\` warning to [coherence-log.md](http://coherence-log.md) and surface in next Stop review.
3. Stage only the doc files explicitly (`git add <doc-paths>`) — never `git add .`. Working-tree dirtiness on non-doc files is preserved.
4. If `git commit` exits non-zero (e.g. pre-commit hook failure), the patch is **rolled back** (`git reset HEAD`, `git checkout -- <docs>`), the coherence-log entry records `commit_failed: <stderr>`, and the buffer entry transitions to `deferred`.
### 5. `/coherence:recover` command
Manual recovery and diagnostic command:
```javascript
🛠 Coherence recovery
──────────────────────────
✓ State file integrity
  drift-buffer.json     OK (4 entries)
  velocity.json         RESTORED from quarantine (corrupt: invalid JSON line 47)
  subagent-stats.json   OK

⚠ Stale locks (cleared)
  drift-buffer.json.lock  age=42s  pid=12345 (not running)

⚠ Stop progress checkpoint detected
  pipeline_id: sess-abc-stop-1
  stage1_complete: true
  stage2_pending: ["PATTERNS.md#auth"]
  → Resuming on next Stop

✓ Section index rebuilt
  Files scanned: 47
  Anchors found: 89
  Errors: 0

Ready. Coherence is back to normal mode.
```
Flags: `--reset-buffer` (clears in-memory and [pending.md](http://pending.md) after confirmation), `--clear-checkpoints` (drops stop-progress.json), `--rebuild-index` (forces section-index regeneration).
### Rationale
Four orthogonal mechanisms cover the audit's four named failure scenarios (state corruption, mid-pipeline crash, lock cascade, git conflicts). Each is built on existing DD primitives (DD-026 schema, DD-041 locks, DD-005 commits) so the surface area is small. The degraded-mode visual signal is the missing piece that prevents the "plugin appears dead" UX failure.
### Alternatives considered
- **Catch-and-log without recovery** — rejected: leaves the user in a broken state with no path forward.
- **WAL/journaling for buffer** — rejected: SQLite-tier complexity for \~10 small JSON files; atomic temp-rename achieves equivalent durability.
- **Daemon process supervising plugin** — rejected: out of plugin scope; lifecycle management explosion.
- **Synchronous git pre-flight check on every PostToolUse** — rejected: hot-path cost; once-per-Stop is sufficient.
---
## DD-062: Subagent attribution — file-level fallback within window when host attribution absent (resolves Subagent Attribution Unavailable concern)
**Decision:** When Claude Code does not expose `subagent_invocation_id` in SubagentStop events, the plugin falls back to **file-level attribution within a 5-minute window OR the same agent turn** instead of leaving subagent healing degraded. Mode is decided at install-time by `/coherence:doctor` and recorded in `host-capabilities.json` as `subagent_attribution: line-level | file-level-fallback | absent`.
### Detection at install
`/coherence:doctor` (DD-043, DD-050) extends to probe SubagentStop event shape:
1. Spawn a stub subagent that writes a known sentinel file.
2. Inspect the SubagentStop event payload for `invocation_id` or equivalent.
3. Record:
	- `line-level` — full DD-013 line-provenance available.
	- `file-level-fallback` — `invocation_id` missing but `files_written` exposed; fall back to file-level.
	- `absent` — neither available; subagent healing disabled with explicit notice.
### File-level fallback rules
When mode = `file-level-fallback`:
- At SubagentStop, record `{agent_id, files_written, started_at, ended_at}`.
- Subsequent edits to those files within `min(5 min wall-time, same agent turn)` are attributed to the subagent.
- 10–50% of subagent-touched lines changed → Edited.
-
	> 50% → Discarded.
- Edits to files NOT in `files_written` are independent of the subagent.
### Loss of precision (acknowledged)
1. **Multiple subagents touching the same file:** file-level attributes the file to whichever subagent ran last. Trade-off accepted because it's rare and self-corrects across many invocations.
2. **Long-window edits:** edits 6+ minutes after SubagentStop are not counted. The 5-minute window is tuned to typical Claude Code review pace.
### Status surfacing
`/coherence:status` shows the active mode:
```javascript
📊 Subagent health (provenance: file-level fallback)
  test-writer  23 inv  ⚠ flagged (39% discard)
```
### Rationale
A functional approximation in v0.1 is strictly better than a disabled feature. The fallback uses primitives that any Claude Code version with SubagentStop has (file lists in events). Mode auto-detection means users get the best available behavior without configuration.
### Alternatives considered
- **Disable subagent feature when host attribution absent** (DD-013 / DD-026 original stance) — superseded: leaves a major v0.1 feature non-functional for hosts that lack `invocation_id`, even though file-level signal is sufficient.
- **User-configured agent IDs** — rejected: friction, error-prone.
- **Heuristic agent inference from message content** — rejected: brittle, no clean signal.
---
## DD-063: E2E integration test suite as v0.1 release gate (resolves No E2E Integration Tests concern)
**Decision:** v0.1 ships with a mandatory E2E integration test suite covering five end-to-end scenarios. The suite runs in CI on Linux, macOS, and Windows. 100% pass rate is required for any v0.1 release tag.
### Required scenarios
1. **Cold-start flow:** install plugin → Observe mode → simulate 3 PostToolUse events → graduate → first Stop produces a patch → user accepts → `[coherence]` commit lands → user runs `git revert` → DD-035 detection registers revert.
2. **Monorepo cross-package coherence:** create 3-package fixture (api, web, mobile) each with [CLAUDE.md](http://CLAUDE.md) → simulate cross-package shared-utility change → DD-049 canonical algorithm produces correct canonical → Stage 2 patches all packages coherently → file-merge step (DD-008) handles same-file overlaps cleanly.
3. **Subagent flow:** invoke subagent that writes a file → user edits 30% of subagent-owned lines → SessionEnd → DD-013 classification = Edited (not Accepted, not Discarded). Test variant runs same scenario in `file-level-fallback` mode (DD-062).
4. **Failure recovery:** start Stop pipeline → kill plugin process between Stage 2 calls 3 and 4 → restart → verify `stop-progress.json` resumption skips done sections, completes pending ones, and produces correct final state.
5. **Hallucination rejection:** prepare a synthetic Stage 2 patch containing a fabricated import (`from '@/lib/nonexistent'`) → run validation pipeline → strict-tier grep rejects → patch does not commit, logged to `revalidation-log.md`.
### Harness
`tests/e2e/` uses a Claude Code stub harness that simulates host events without spinning up the full host. Real LLM calls go through the Anthropic API in a recording mode (cassettes committed for replay); cassette refresh requires explicit CI flag.
### CI matrix
```yaml
os: [ubuntu-latest, macos-latest, windows-latest]
node_version: [20.x, 22.x]
claude_code_version: [stub-v2.0, stub-v2.1]
```
### Release-tag gate
The `release-v0.1.0` tag requires:
- All 5 E2E scenarios pass on all matrix combinations.
- Per-scenario flakiness ≤1% (measured by 10 reruns).
- Coverage of cold-start, multi-section coherence, subagent attribution, recovery, and hallucination rejection.
Failures block the release; flaky tests must be fixed or quarantined with explicit issue tracking before release.
### Rationale
The audit correctly noted that 55 unit-correct DDs do not guarantee correct emergent behavior. Five scenarios cover the most representative interaction patterns; 100% pass on a tri-OS matrix establishes baseline confidence.
### Alternatives considered
- **Manual QA only** — rejected: not reproducible, doesn't gate releases.
- **Component tests as proxy for E2E** — rejected: misses cross-component bugs by definition.
- **Production canary** — rejected: v0.1 user base is too small for statistical canary signal.
---
## DD-064: Plugin versioning, kill-switch, and rollback policy (resolves No Rollback Strategy concern)
**Decision:** v0.1 establishes SemVer plugin versioning, a manifest file recording schema and prompt versions, a manual kill-switch sentinel file, and an automatic crash-self-disable mechanism for catastrophic regressions.
### Plugin versioning
Semantic versioning: `MAJOR.MINOR.PATCH`.
- **MAJOR:** breaking changes to user-facing config or hook surface.
- **MINOR:** new features, backward-compatible changes.
- **PATCH:** bug fixes, prompt version bumps that pass DD-057 fixtures, no behavior changes.
### Manifest: `.claude/coherence/version.json`
Written on install/upgrade:
```json
{
  "plugin_version":     "0.1.0",
  "buffer_schema_version":  1,
  "velocity_schema_version": 1,
  "section_index_schema_version": 1,
  "prompt_versions": { "stage1": 1, "stage2": 1 },
  "installed_at":       "2026-05-09T12:00:00Z",
  "prior_versions":     ["0.0.9"]
}
```
DD-026 reader rules govern cross-version state-file compatibility:
- Older plugin reads newer state → read-only mode (refuses to write), surfaces upgrade prompt.
- Newer plugin reads older state → runs explicit `migrate_v{n}_to_v{n+1}` chain.
### Manual kill-switch
User creates `.claude/coherence/disabled` (any content) → next SessionStart loads the plugin in **no-op mode**: hooks register but return immediately. Statusline badge does not render. No buffer writes. No LLM calls. No git commits.
User deletes the file to re-enable. Reason: instant disable without uninstalling, preserving config and state for later reactivation.
### Crash self-disable
If any 3 hook fires within a single session throw uncaught exceptions, the plugin writes `.claude/coherence/disabled` automatically with content:
```javascript
Auto-disabled at 2026-05-09T12:34:56Z due to 3 hook crashes.
First exception: PostToolUse — TypeError: Cannot read property 'foo' of undefined
Last exception:  Stop — RangeError: Maximum call stack size exceeded

To re-enable, delete this file and run /coherence:recover.
Report: https://github.com/<...>/issues with the trace from coherence-log.md.
```
Prevents a buggy version from continuously breaking user sessions until manual intervention.
### Rollback procedure
Documented in README and surfaced via `/coherence:status --version-history`:
```bash
# Roll back to a previous version
claude plugin install coherence@0.0.9
# State files are forward-compatible per DD-026 reader rules.
# Older plugin will read current state in read-only mode if schema is newer;
# delete .claude/coherence/*.json to start fresh on the older version.
```
### Forward/backward compatibility matrix
- **State files:** versioned via `schema_version` field; reader+writer follow DD-026 rules.
- **Prompts:** append-only versioning per DD-057; older plugin pins to its own prompt versions.
- **Hooks:** plugin advertises `min_claude_code_version` in its manifest; Claude Code refuses to load if too old.
### Rationale
Four mechanisms (SemVer + manifest + kill-switch + crash-self-disable) cover manual rollback, accidental incompatibility, and runaway-bug scenarios. The kill-switch is a single sentinel file because users need an instant escape that survives plugin reinstall.
### Alternatives considered
- **GitHub release rollback only** — rejected: requires the user to know the bad version is bad; doesn't help mid-session.
- **Built-in A/B versioning** — rejected: complexity disproportionate to v0.1 needs.
- **Cloud-driven kill-switch** — rejected: privacy concerns, network dependency for what should be a fully local plugin.
