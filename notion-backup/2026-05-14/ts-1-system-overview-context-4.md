<!-- url: https://www.notion.so/35b010d46a708125a059f71afef0d07e -->
<!-- id: 35b010d4-6a70-8125-a059-f71afef0d07e -->
<!-- title: TS-1 — System Overview & Context -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 1.1 What Coherence Is, Technically
Coherence v0.1 is a **single-process Node.js plugin** loaded into the Claude Code v2.x host. It contributes:
- A set of **hook handlers** (SessionStart, PostToolUse, UserPromptSubmit, SubagentStop, Stop, SessionEnd, optional PreCompact) registered via the standard plugin manifest.
- A small set of **slash commands** under the `/coherence:` namespace.
- A bounded local state directory `.claude/coherence/` containing buffers, logs, telemetry, and host-capability cache.
- An **on-demand LLM client** that calls the Anthropic API only at Stop / `/coherence:review` time.
It does **not** ship: a daemon, a server, a UI, a database, or any external integration. (BRD-1 §1.5, NFR-PRIVACY-3)
## 1.2 Deployment Model
<table header-row="true">
<tr>
<td>Aspect</td>
<td>Choice</td>
<td>Source</td>
</tr>
<tr>
<td>Distribution</td>
<td>Direct install: `claude plugin install coherence`</td>
<td>FR-INSTALL-1</td>
</tr>
<tr>
<td>Runtime</td>
<td>Node.js 20.x or 22.x, in-process inside the Claude Code host</td>
<td>NFR-COMPAT-2, D-3</td>
</tr>
<tr>
<td>Platforms</td>
<td>Linux, macOS, Windows (CI matrix all three)</td>
<td>NFR-COMPAT-1</td>
</tr>
<tr>
<td>Install size</td>
<td>\< 10 MB on disk</td>
<td>NFR-PERF-8</td>
</tr>
<tr>
<td>Network</td>
<td>Outbound HTTPS to `api.anthropic.com` only, only at Stop / review</td>
<td>NFR-PRIVACY-3</td>
</tr>
<tr>
<td>Persistence</td>
<td>`.claude/coherence/` inside the project root</td>
<td>DD-029</td>
</tr>
<tr>
<td>Marketplace packaging</td>
<td>Deferred to v0.3</td>
<td>BRD-5 §5.3</td>
</tr>
</table>
## 1.3 Top-Level Component Map
```javascript
+---------------------------------------------------------------+
|                Claude Code host (v2.x)                        |
|  +-----------------------------------------------------------+|
|  |                  Coherence plugin                          ||
|  |                                                            ||
|  |  +----------------+   +-----------------+                  ||
|  |  | Hook adapters  |→  | Detection core  |                  ||
|  |  | (SessionStart, |   | (path filter,   |                  ||
|  |  |  PostToolUse,  |   |  anchor scan,   |                  ||
|  |  |  UserPromptSub,|   |  assertion eval,|                  ||
|  |  |  SubagentStop, |   |  subagent state)|                  ||
|  |  |  Stop,         |   +-----------------+                  ||
|  |  |  SessionEnd,   |          |                              ||
|  |  |  PreCompact)   |          v                              ||
|  |  +----------------+   +-----------------+                  ||
|  |          |            | Buffer & state  |← .claude/        ||
|  |          |            | manager (atomic |   coherence/     ||
|  |          |            | writes, locks,  |                  ||
|  |          |            | schema valid.)  |                  ||
|  |          |            +-----------------+                  ||
|  |          v                    |                            ||
|  |  +----------------+    +-----------------+                 ||
|  |  | Slash commands |    | Stop pipeline   |                 ||
|  |  | (status,review,|    | (group, plan,   |                 ||
|  |  |  repair, recov,|    |  patch, validate|                 ||
|  |  |  doctor, grad. |    |  merge, commit) |                 ||
|  |  |  enable-side.) |    +-----------------+                 ||
|  |  +----------------+            |                            ||
|  |                                v                            ||
|  |                       +-----------------+                   ||
|  |                       | LLM client      |→ Anthropic API   ||
|  |                       | (Stage 1 / 2,   |  (Sonnet 4.5,    ||
|  |                       |  prompt cache,  |   prompt caching)||
|  |                       |  cassette mode) |                  ||
|  |                       +-----------------+                   ||
|  |                                |                            ||
|  |                                v                            ||
|  |                       +-----------------+                   ||
|  |                       | Validation +    |→ Git (commit,    ||
|  |                       | merge + git     |   pre-flight,    ||
|  |                       | adapter         |   revert detect) ||
|  |                       +-----------------+                   ||
|  +-----------------------------------------------------------+|
+---------------------------------------------------------------+
```
Detail is given in TS-2.
## 1.4 In Scope (v0.1)
Matches BRD-1 §1.4 and the v0.1 row of [9. Roadmap](https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b):
- Detect drift across all three layers (referring docs, skills, subagents).
- Stop-time two-stage LLM pipeline producing surgical patches.
- Deterministic validation (format, apply, sanity, line-count, hallucination grep).
- File-level merge + atomic git commit per approved bundle / patch.
- Buffer lifecycle + cross-session `pending.md` re-validation.
- Velocity limit (DD-011) + change-class gating (DD-017, DD-037).
- Mid-session silent context refresh + conditional conversational mention (DD-012).
- `/coherence:status`, `/review`, `/repair`, `/recover`, `/doctor`, `/graduate`, `/enable-sidecars`.
- Observe-mode default; auto-apply opt-in only for additive class.
- Anchor format with frontmatter IDs + heading-based fallback.
- Schema-versioned state files + documented migration chain.
- Crash self-disable + manual kill-switch sentinel.
## 1.5 Out of Scope (v0.1)
Matches BRD-1 §1.5 and BRD-5 §5.3:
- Author / Annotate modes → v0.2.
- Trickle deep-scan during PostToolUse → v0.2.
- Marketplace packaging, team-shared `coherence-ignore`, monorepo `scope:` declarations → v0.3.
- Active complex `asserts:` predicates beyond `import_exists` → v1.0.
- Token-budget bloat warnings, `/coherence:audit`, metrics dashboard, cross-session pattern learning → v1.0.
- External integrations, localization, fuzzy / semantic detection → deferred / TBD.
## 1.6 Runtime Context (what the plugin sees)
<table header-row="true">
<tr>
<td>Source</td>
<td>Provided by</td>
<td>Used by</td>
</tr>
<tr>
<td>Tool event payloads (Write/Edit/Bash with paths)</td>
<td>Claude Code host → PostToolUse</td>
<td>Path filter (TS-4)</td>
</tr>
<tr>
<td>Subagent invocation + output + line provenance</td>
<td>Host → SubagentStop (line-level when available, file-level fallback otherwise)</td>
<td>Subagent state machine (TS-2 §2.4, TS-4)</td>
</tr>
<tr>
<td>`additionalContext` return channel</td>
<td>Host hook return value</td>
<td>Mid-session refresh (TS-4 §4.5)</td>
</tr>
<tr>
<td>Session lifecycle</td>
<td>Host → SessionStart / Stop / SessionEnd</td>
<td>Pipeline + persistence (TS-4)</td>
</tr>
<tr>
<td>Token-count delta per tool call</td>
<td>Host (when surfaced)</td>
<td>Compaction detection (FR-MIDSESSION-1c)</td>
</tr>
<tr>
<td>Anthropic API key</td>
<td>Environment / host credential store</td>
<td>LLM client (TS-2 §2.6)</td>
</tr>
<tr>
<td>Project working tree + git state</td>
<td>Local filesystem + `git` CLI</td>
<td>Pre-flight checks (TS-6, FR-FAILURE-5)</td>
</tr>
</table>
The plugin **never** scans the full file tree at runtime. Phase 0 discovery (cold-start) and PostToolUse path-filter use bounded surfaces only (DD-007, BRD-1 personas).
## 1.7 Personas ↔ Capability Coverage
<table header-row="true">
<tr>
<td>Persona (BRD-1 §1.3)</td>
<td>Primary capabilities relied on</td>
<td>Notes</td>
</tr>
<tr>
<td>P1 Solo dev</td>
<td>Detection (FR-DETECT-*), Stop pipeline (FR-STOP-*), Permission UX (FR-PERMISSION-\*)</td>
<td>Full v0.1 surface</td>
</tr>
<tr>
<td>P2 Small-team lead</td>
<td>Same as P1 per session; shared `coherence-ignore` deferred to v0.3</td>
<td>v0.1 supports per-developer sessions only</td>
</tr>
<tr>
<td>P3 Plugin author</td>
<td>Same plus skill/agent-aware healing (FR-LAYERS-\*)</td>
<td>NFR-SECURITY-7 prompt-injection defense matters most</td>
</tr>
</table>
## 1.8 Success Criteria for v0.1 (technical view)
See BRD-1 §1.6 for business metrics. The technical gates are owned by TS-9 and listed verbatim in BRD-4 (E2E, QG, PG, RG, SG, RB). v0.1 ships when **all** are green on every CI matrix cell.
## 1.9 Cross-References
- TS-2 expands the component map.
- TS-4 details the per-hook flow surface labeled "Hook adapters".
- TS-5 details the LLM client + Stop pipeline.
- TS-3 defines every file inside `.claude/coherence/`.
- TS-8 defines install / `doctor` / migration / rollback.
