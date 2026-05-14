<!-- url: https://www.notion.so/f81010d46a708290a7e3012cbed86513 -->
<!-- id: f81010d4-6a70-8290-a7e3-012cbed86513 -->
<!-- title: 🏗️ 2. Architecture -->
## Three-Layer Healing Model
Each layer decays differently and needs a different healing strategy.
<table header-row="true">
<tr>
<td>Layer</td>
<td>Role in agent reasoning</td>
<td>Decay rate</td>
<td>Failure mode</td>
</tr>
<tr>
<td>Referring docs</td>
<td>Standing context — always loaded</td>
<td>Slow (weeks)</td>
<td>Agent works from wrong mental model</td>
</tr>
<tr>
<td>Skills</td>
<td>Conditional capability — loads when description matches</td>
<td>Medium (days)</td>
<td>Never triggers (invisible) or triggers with wrong instructions</td>
</tr>
<tr>
<td>Subagents</td>
<td>Delegated specialist — isolated context</td>
<td>Per-invocation</td>
<td>Confidently wrong output with no correction signal</td>
</tr>
</table>
---
## Hook Mapping
<table header-row="true">
<tr>
<td>Hook</td>
<td>Layer served</td>
<td>What it does</td>
<td>Token cost</td>
</tr>
<tr>
<td>`SessionStart`</td>
<td>All three</td>
<td>Read pending buffer, re-validate; assertion checks; injects high-confidence nudges via `additionalContext`</td>
<td>0 — deterministic</td>
</tr>
<tr>
<td>`PostToolUse` (Write/Edit/Bash)</td>
<td>All three</td>
<td>Path pattern filter → drift-buffer; injects silent context refresh (DD-012 Mechanism 1) when buffer non-empty</td>
<td>\~50 per refresh</td>
</tr>
<tr>
<td>`UserPromptSubmit`</td>
<td>All three</td>
<td>Detects long-agent-turn boundary; conditionally fires DD-012 Mechanism 2</td>
<td>0 — deterministic</td>
</tr>
<tr>
<td>`SubagentStop`</td>
<td>Subagents</td>
<td>Output-use signal capture (DD-013 state machine + line provenance)</td>
<td>0 — deterministic</td>
</tr>
<tr>
<td>`Stop`</td>
<td>All three</td>
<td>Two-stage patch pipeline + consolidated review</td>
<td>\~600–4000 tokens depending on scope</td>
</tr>
<tr>
<td>`SessionEnd`</td>
<td>All three</td>
<td>Persist deferred buffer entries</td>
<td>0 — deterministic</td>
</tr>
</table>
---
## Detection Signals (per layer)
**Referring docs**
- Path watches in section frontmatter (`watches: src/middleware/**`)
- Assertion checks (`asserts: import_exists: 'from express'`)
- Token budget monitoring
**Skills**
- Path watches in [SKILL.md](http://SKILL.md) frontmatter
- Invocation tracking: skill should have fired but didn't
- Correction signal: skill fired, output was rewritten by user
- Frontmatter bloat: description exceeds 500 chars or body exceeds 2000 tokens
**Subagents**
- Path watches in agent frontmatter
- Output-use signal: deterministic state machine (DD-013) classifies each invocation as Accepted / Edited / Discarded based on line-level provenance, file modifications, and a regex-based user-message classifier
- Aggregate stats over rolling window (last 50 invocations) flag drifting agents at thresholds: discard rate \>25%, edit rate \>50%, or sudden shift \>20pp
- Cross-reference check: agent prompt contradicts [CLAUDE.md](http://CLAUDE.md)
- Tool-allowlist drift: agent's allowed-tools diverges from main session patterns
---
## Two-Stage Patch Pipeline (v0.1)
The Stop hook runs a two-stage pipeline that handles single-section and multi-file coherent patches.
### Trigger-source grouping (deterministic)
Buffer entries are grouped by **trigger source** — every section flagged by the same code change goes into one group. A session with two unrelated changes produces two groups, processed independently. No semantic concept inference.
### Stage 1: Coherence Planner
Triggered only when a group has 2+ sections. One LLM call. Produces JSON plan assigning each section a **role** and **change relation**.
**Roles:** canonical, reference, consumer, no-change
**Relations:** extends, supersedes, contradicts, omits
Plan validated deterministically: exactly one canonical, all sections accounted for, valid IDs, schema correct. Validation failure → fall back to independent patches with warning logged.
### Stage 2: Patch Writers
Parallel LLM calls, one per section needing a patch. Each receives the plan as context. Outputs unified diff or one of: `NO_PATCH_NEEDED`, `ESCALATE`, `PLAN_DISAGREES`.
### Deterministic validation (post-LLM)
Every patch passes through:
1. Format check
2. Apply check
3. Sanity check (change-class enforcement)
4. Line-count check (auto-ESCALATE if change \> 40% of section)
5. Hallucination grep (two-tier: strict for paths, loose for symbols)
Failures produce silent log entries; nothing reaches the user.
### File-level merge step
Patches targeting the same file go through deterministic merge before commit. Overlapping diffs reject all and surface for human review. **File is the atomic write unit.**
### Plan-derived bundles are atomic
Patches from a Stage 1 plan present to the user as one bundle (single accept/reject). User can expand to view individual diffs. Single-section patches without a plan remain individually selectable.
---
## Coherence Pass
When any single-layer patch is approved, the plugin checks cross-references:
- Did this referring-doc change affect any skill or agent that references the same concept?
- Does the updated content contradict anything in another doc?
If yes, the affected files are added to the same review batch. User sees all related changes together.
The Stage 1 planner makes this implicit — affected sections from different layers are reconciled before patches are written, not after.
---
## Buffer Lifecycle
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
<td>Stop, user rejects bundle / picks Skip</td>
<td>Mark entries deferred, keep</td>
</tr>
<tr>
<td>Subsequent PostToolUse same session</td>
<td>Deferred entries remain; new ones append</td>
</tr>
<tr>
<td>SessionEnd</td>
<td>Persist deferred to `coherence/pending.md`</td>
</tr>
<tr>
<td>Next SessionStart</td>
<td>Read pending; re-validate against current code; drop stale entries</td>
</tr>
</table>
---
## Velocity Limit
Per-section: 2 patch-and-revert cycles within 30 days → auto-ignore. One-line surface to user with opt-out path. Prevents pathological patch/revert loops.
---
## Mid-Session Mechanisms (DD-012)
Two separately-tunable mechanisms keep Claude informed and the user un-overwhelmed during long sessions.
**Mechanism 1 — Silent context refresh (always on by default)**
When buffer is non-empty, PostToolUse injects a brief `additionalContext` note listing potentially-stale sections. Cost \~50 tokens per refresh. User uninvolved. Claude's output quality improves immediately.
**Mechanism 2 — Mid-session review surfacing (rare, conditional)**
Fires only when ALL three conditions hold: 3+ distinct trigger groups, 15+ minutes since last Stop/review, and post-long-agent-turn (≥60s, or 5+ tool calls, or 5+ min user silence). Plugin injects `additionalContext` instructing Claude to conversationally mention drift; Claude decides whether to actually surface based on flow. When surfaced, Claude suggests `/coherence:review`.
**`/coherence:review`**** command** runs the Stop pipeline mid-session: Stage 1 + Stage 2 against current buffer, consolidated review now, session continues.
---
## Data Flow (v0.1)
```javascript
Code change happens
       ↓
PostToolUse fires → deterministic JS filter
       ↓
Path match? → append to .claude/coherence/drift-buffer.json (session-scoped)
       ↓
Stop hook fires → read buffer, group by trigger source
       ↓
Empty? → exit silently
       ↓
For each trigger group:
   2+ sections? → Stage 1: coherence planner LLM call
   1 section?   → skip Stage 1
       ↓
Stage 2: parallel patch LLM calls (with plan if Stage 1 ran)
       ↓
Validate each patch (format, apply, sanity, line-count, hallucination)
       ↓
Merge patches by file (atomic write unit)
       ↓
Group plan-derived bundles + standalone patches into consolidated review
       ↓
User reviews → bundles atomic, standalones individual → Accept / Skip
       ↓
Approved patches committed with [coherence] prefix
       ↓
Velocity counter updates per section
       ↓
Buffer entries clear (accepted) or defer (skipped)
```
