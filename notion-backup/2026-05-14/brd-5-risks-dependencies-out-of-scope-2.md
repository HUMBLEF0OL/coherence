<!-- url: https://www.notion.so/35b010d46a70816d8562ca52c48a9b27 -->
<!-- id: 35b010d4-6a70-816d-8562-ca52c48a9b27 -->
<!-- title: ⚠️ BRD-5 — Risks, Dependencies, Out-of-Scope -->
**Parent:** [📘 10. BRD — Coherence v0.1](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea)
---
## 5.1 Risk Register
Risks are scored Likelihood (L) and Impact (I) on a 1–5 scale. Severity = L × I.
<table header-row="true">
<tr>
<td>ID</td>
<td>Risk</td>
<td>L</td>
<td>I</td>
<td>Sev</td>
<td>Mitigation</td>
<td>Owner / DD</td>
</tr>
<tr>
<td>R-1</td>
<td>Stage 2 hallucinations slip past grep on rare patterns and produce a bad commit</td>
<td>3</td>
<td>4</td>
<td>12</td>
<td>DD-058 corpus + runtime confidence demotion (≥3 unfamiliar loose-only tokens → demote one tier); QG-4 ≤2% escape gate; revalidation-log audit.</td>
<td>DD-058</td>
</tr>
<tr>
<td>R-2</td>
<td>Cost spikes on large refactors exceed the \$0.15 p95 ceiling</td>
<td>2</td>
<td>3</td>
<td>6</td>
<td>DD-056 hard caps (3 groups, 36 calls, 30k input tokens) + canonical-first priority defer; cost telemetry per Stop.</td>
<td>DD-056</td>
</tr>
<tr>
<td>R-3</td>
<td>Lock contention causes user-visible 5s+ lag in PostToolUse</td>
<td>2</td>
<td>3</td>
<td>6</td>
<td>DD-061 degraded-mode escape after 3 consecutive 5s timeouts; statusline `[🧭 ⚠]` indicator; perf gate PG-1.</td>
<td>DD-061</td>
</tr>
<tr>
<td>R-4</td>
<td>Stop pipeline crash mid-run leaves stale `stop-progress.json` and double-charges on resume</td>
<td>2</td>
<td>3</td>
<td>6</td>
<td>DD-061 idempotent Stage 2 with checkpoint per-section; resume skips done sections; E2E-4 covers this exact path.</td>
<td>DD-061</td>
</tr>
<tr>
<td>R-5</td>
<td>Subagent attribution unavailable on a host version</td>
<td>3</td>
<td>2</td>
<td>6</td>
<td>DD-062 install-time probe + file-level fallback within `min(5min, same turn)`. v0.1 ships functional regardless.</td>
<td>DD-062</td>
</tr>
<tr>
<td>R-6</td>
<td>Buggy release crashes user sessions repeatedly</td>
<td>1</td>
<td>5</td>
<td>5</td>
<td>DD-064 crash self-disable on 3 hook exceptions per session; manual kill-switch sentinel; documented rollback.</td>
<td>DD-064</td>
</tr>
<tr>
<td>R-7</td>
<td>Anchor ID collisions on imported / merged repos block patch writes</td>
<td>2</td>
<td>2</td>
<td>4</td>
<td>DD-045 detection at SessionStart; `/coherence:repair` resolves; refusal to write into colliding sections.</td>
<td>DD-045</td>
</tr>
<tr>
<td>R-8</td>
<td>Patch overwrites unrelated user changes (race with manual edits)</td>
<td>2</td>
<td>5</td>
<td>10</td>
<td>DD-061 git pre-flight (clean tree on coherence-targeted files, branch unchanged, HEAD unchanged); abort + rollback on violation.</td>
<td>DD-061</td>
</tr>
<tr>
<td>R-9</td>
<td>Velocity-limit auto-ignore hides a real, recurring drift signal from the user</td>
<td>3</td>
<td>2</td>
<td>6</td>
<td>DD-011 surfaces a one-line notice + opt-out path; DD-051 consecutive-defer counter exposes pattern in `/status`.</td>
<td>DD-011, DD-051</td>
</tr>
<tr>
<td>R-10</td>
<td>Privacy concern: code content sent to Anthropic API for Stage 2 patches</td>
<td>2</td>
<td>4</td>
<td>8</td>
<td>NFR-PRIVACY: only intentional Stop pipeline calls; ignore globs respected; in-flight content not persisted. Documented in README.</td>
<td>NFR-PRIVACY</td>
</tr>
<tr>
<td>R-11</td>
<td>Prompt regression on Stage 1 / Stage 2 between releases</td>
<td>2</td>
<td>4</td>
<td>8</td>
<td>DD-057 versioned prompt files + fixture release gate (≥90% / ≥80%). Bumping prompt version requires green fixture run.</td>
<td>DD-057</td>
</tr>
<tr>
<td>R-12</td>
<td>Cross-platform line-ending bugs corrupt patches on Windows</td>
<td>3</td>
<td>3</td>
<td>9</td>
<td>NFR-COMPAT-5 preserves file line-ending convention; CI matrix includes `windows-latest`.</td>
<td>NFR-COMPAT</td>
</tr>
<tr>
<td>R-13</td>
<td>Trickle scan or aggressive PostToolUse activity drains battery / IO on laptop sessions</td>
<td>2</td>
<td>2</td>
<td>4</td>
<td>Trickle deep-scan deferred to v0.2; PostToolUse keeps p95\<50ms (PG-1).</td>
<td>DD-014 (deferred)</td>
</tr>
<tr>
<td>R-14</td>
<td>Schema migration bug strands users on a version they cannot upgrade or downgrade</td>
<td>1</td>
<td>4</td>
<td>4</td>
<td>DD-026 documented migrate chain + read-only fallback; quarantine-on-fail; E2E install/upgrade test covers v0.0.x → v0.1 path before tag.</td>
<td>DD-026, DD-064</td>
</tr>
<tr>
<td>R-15</td>
<td>LLM provider outage breaks Stop pipeline</td>
<td>3</td>
<td>2</td>
<td>6</td>
<td>Pipeline degrades cleanly: buffer entries persist to [pending.md](http://pending.md) and re-process next session. User-visible notice.</td>
<td>DD-029</td>
</tr>
<tr>
<td>R-16</td>
<td>Prompt-injection via skill / agent body content (Stage 2 patch inserts coherence-shaped HTML comments or instruction fragments into a [SKILL.md](http://SKILL.md) / [agent.md](http://agent.md) body, which an LLM later treats as instructions)</td>
<td>3</td>
<td>4</td>
<td>12</td>
<td>DD-050 restricts HTML coherence anchors to prose docs only; NFR-SECURITY-7 patch validation rejects diffs introducing `<!-- coherence:* -->` markers or instruction-shaped HTML into skill / agent bodies; SG-3 covers regression tests.</td>
<td>DD-050, NFR-SECURITY-7</td>
</tr>
<tr>
<td>R-17</td>
<td>Case-insensitive filesystem (macOS default, Windows NTFS) or symlinked paths cause ambiguous section refs and double-counted buffer entries</td>
<td>3</td>
<td>2</td>
<td>6</td>
<td>DD-027 path normalisation uses OS canonical realpath (resolves symlinks, returns on-disk casing); CI matrix exercises macOS and Windows runners; section-index caches the normalised ref once per session.</td>
<td>DD-027</td>
</tr>
<tr>
<td>R-18</td>
<td>Anchor stack-based scan (DD-007) misclassifies legitimate HTML in fenced code blocks as orphan opens</td>
<td>2</td>
<td>2</td>
<td>4</td>
<td>Scanner skips content inside fenced code blocks (` ` ` and `\~\~\~`); regression fixture covers a doc with intentional `\<!-- ... --\>\` strings inside code samples.</td>
<td>DD-007</td>
</tr>
</table>
No `Sev ≥ 12` risk lacks a primary mitigation gated by a release criterion.
## 5.2 Dependencies
### 5.2.1 External
<table header-row="true">
<tr>
<td>ID</td>
<td>Dependency</td>
<td>Version / detail</td>
<td>Notes</td>
</tr>
<tr>
<td>D-1</td>
<td>Claude Code host</td>
<td>v2.0+</td>
<td>Hook surface stable from v2.0; `min_claude_code_version` declared in plugin manifest.</td>
</tr>
<tr>
<td>D-2</td>
<td>Anthropic API</td>
<td>Sonnet 4.5 (or successor) for Stage 1 + Stage 2</td>
<td>Prompt caching feature required (DD-057).</td>
</tr>
<tr>
<td>D-3</td>
<td>Node.js runtime</td>
<td>20.x or 22.x</td>
<td>LTS lines only.</td>
</tr>
<tr>
<td>D-4</td>
<td>Git</td>
<td>2.30+</td>
<td>For commit pre-conditions, revert detection (DD-035).</td>
</tr>
<tr>
<td>D-5</td>
<td>OS</td>
<td>Linux / macOS / Windows</td>
<td>All three first-class per CI matrix.</td>
</tr>
<tr>
<td>D-6</td>
<td>JSON Schema validator (e.g. `ajv`)</td>
<td>draft-07</td>
<td>Required by DD-026 buffer schema validation, DD-015 Stage 1 plan validation, DD-061 quarantine-on-corruption read path.</td>
</tr>
</table>
### 5.2.2 Internal (project-supplied)
<table header-row="true">
<tr>
<td>ID</td>
<td>Dependency</td>
<td>Required for</td>
</tr>
<tr>
<td>ID-1</td>
<td>Stage 1 + Stage 2 prompt files (`prompts/v1/*.md`)</td>
<td>DD-057, FR-STOP-13</td>
</tr>
<tr>
<td>ID-2</td>
<td>Stage 1 fixture corpus</td>
<td>QG-1, QG-2</td>
</tr>
<tr>
<td>ID-3</td>
<td>Stage 2 per-class fixture corpus</td>
<td>QG-3, QG-6</td>
</tr>
<tr>
<td>ID-4</td>
<td>Hallucination grep corpus (50 valid + 50 hallucinated, 8+2 langs)</td>
<td>QG-4, DD-058</td>
</tr>
<tr>
<td>ID-5</td>
<td>Performance harness reference codebases (small / medium / large / monorepo)</td>
<td>PG-1..PG-5, DD-059</td>
</tr>
<tr>
<td>ID-6</td>
<td>Claude Code stub harness for E2E</td>
<td>E2E-1..E2E-5, DD-063</td>
</tr>
</table>
## 5.3 Out of Scope (deferred)
Explicit list of capabilities **not** in v0.1, mapped to the version that picks them up.
<table header-row="true">
<tr>
<td>Capability</td>
<td>Deferred to</td>
<td>Reason</td>
</tr>
<tr>
<td>Author mode (proposing new skills / agents)</td>
<td>v0.2</td>
<td>Requires v0.1 healing loop as platform; signal-collection logic only meaningful once detection is mature.</td>
</tr>
<tr>
<td>Annotate mode (auto-injection of metadata into existing docs)</td>
<td>v0.2</td>
<td>Same as above.</td>
</tr>
<tr>
<td>`/coherence:graduate` Observe → Annotate → Author transitions</td>
<td>v0.2</td>
<td>Depends on Author / Annotate.</td>
</tr>
<tr>
<td>Trickle deep-scan during PostToolUse</td>
<td>v0.2</td>
<td>v0.1 keeps PostToolUse purely deterministic to hold p95\<50ms.</td>
</tr>
<tr>
<td>Author-mode signals (repeated bash sequences → slash commands; repeated file patterns → skill scaffolds; corrected agent output → [CLAUDE.md](http://CLAUDE.md) additions)</td>
<td>v0.2</td>
<td>Build on top of v0.1 healing pipeline.</td>
</tr>
<tr>
<td>Marketplace distribution (`plugin.json`, README, install docs polish)</td>
<td>v0.3</td>
<td>v0.1 ships via direct install only.</td>
</tr>
<tr>
<td>Team-shared `coherence-ignore` (committed to repo)</td>
<td>v0.3</td>
<td>v0.1 is per-user only.</td>
</tr>
<tr>
<td>Monorepo `scope:` declarations across nested [CLAUDE.md](http://CLAUDE.md)</td>
<td>v0.3</td>
<td>v0.1 supports DD-018 single-scope precedence; multi-team scope is v0.3.</td>
</tr>
<tr>
<td>Cross-team plan visibility (multi-developer sessions)</td>
<td>v0.3</td>
<td>Requires shared state model.</td>
</tr>
<tr>
<td>Active execution of complex `asserts:` predicates beyond `import_exists` (e.g. AST-level invariants, regex-on-output, custom matchers)</td>
<td>v1.0</td>
<td>v0.1 evaluates the **`import_exists`** predicate at SessionStart over indexed code files and surfaces failures via DD-054 at Stop; richer predicate matchers and language-specific AST checks land in v1.0.</td>
</tr>
<tr>
<td>Token budget monitoring + bloat warnings</td>
<td>v1.0</td>
<td>Cost telemetry exists in v0.1; UX surface is v1.0.</td>
</tr>
<tr>
<td>`/coherence:audit` deep audit command</td>
<td>v1.0</td>
<td>Requires accumulated metrics history.</td>
</tr>
<tr>
<td>Quality metrics dashboard</td>
<td>v1.0</td>
<td>Beyond local `metrics.jsonl`.</td>
</tr>
<tr>
<td>Cross-session pattern learning (with explicit opt-in)</td>
<td>v1.0</td>
<td>Privacy and design work outside v0.1 scope.</td>
</tr>
<tr>
<td>External integrations (GitHub / Jira / Linear)</td>
<td>v1.0+</td>
<td>Out of architectural scope until v1.0 stability.</td>
</tr>
<tr>
<td>Localization / non-English UI</td>
<td>TBD</td>
<td>English-only in v0.1.</td>
</tr>
<tr>
<td>Fuzzy / semantic pattern detection</td>
<td>TBD</td>
<td>v0.1 is deterministic-signals-only.</td>
</tr>
</table>
## 5.4 Assumptions
<table header-row="true">
<tr>
<td>ID</td>
<td>Assumption</td>
<td>If wrong</td>
</tr>
<tr>
<td>A-1</td>
<td>Claude Code v2.x hook surface remains stable through v0.1 lifetime.</td>
<td>`min_claude_code_version` bump + migrate chain.</td>
</tr>
<tr>
<td>A-2</td>
<td>Anthropic API pricing for Sonnet 4.5 stays within order-of-magnitude of current rates.</td>
<td>Cost targets (NFR-COST-1/2) revisited; caps in DD-056 still bound spend.</td>
</tr>
<tr>
<td>A-3</td>
<td>Users adopt at least minimal `.claude/` structure (some skills or [CLAUDE.md](http://CLAUDE.md) exist).</td>
<td>Plugin runs in safe Observe mode but produces no patches; user notice.</td>
</tr>
<tr>
<td>A-4</td>
<td>Per-section velocity threshold (2 cycles / 30 days) is appropriate.</td>
<td>DD-011 opt-out path; threshold tunable by user.</td>
</tr>
<tr>
<td>A-5</td>
<td>DD-058 corpus generalizes to languages outside the 8+2 sampled.</td>
<td>Document precision/recall per-language in release notes; users can disable per-language strict tier.</td>
</tr>
<tr>
<td>A-6</td>
<td>Skills and agents live at the canonical paths `.claude/skills/*/SKILL.md` and `.claude/agents/*.md` (DD-040), and section / anchor IDs use only `[a-z0-9_-]+` (DD-027).</td>
<td>Files outside canonical paths are silently ignored; illegal IDs surface a `/coherence:repair` notice and the affected file is treated fatal-for-file until renamed.</td>
</tr>
<tr>
<td>A-7</td>
<td>The user has outbound network access to the Anthropic API at Stop / `/coherence:review` time.</td>
<td>If offline, Stop pipeline gracefully degrades per R-15 / R-20: buffer entries persist to `pending.md`, user sees a one-line notice, no host crash; healing resumes next session when connectivity returns.</td>
</tr>
</table>
## 5.5 Open Questions
None. All 46 design open questions are resolved (see [4. Open Questions](https://www.notion.so/094010d46a7082dfafe9811e1b387a22)). All 11 audit gaps closed (see [✅ Critical Readiness Assessment - Resolved](https://www.notion.so/35b010d46a7081a8832fdce324014628)).
If new questions surface during implementation, they are tracked back to the Open Questions page with status 🟡 Important and resolved before the v0.1 tag.
## 5.6 Glossary
<table header-row="true">
<tr>
<td>Term</td>
<td>Meaning</td>
</tr>
<tr>
<td>**Anchor**</td>
<td>YAML frontmatter (or HTML, prose-only) marker giving a section a stable ID. (DD-007, DD-050)</td>
</tr>
<tr>
<td>**Buffer**</td>
<td>`.claude/coherence/drift-buffer.json` — in-session list of detected drift entries.</td>
</tr>
<tr>
<td>**Canonical (section)**</td>
<td>The single section a Stage 1 plan designates as the source of truth for a concept across a trigger group. (DD-049)</td>
</tr>
<tr>
<td>**Change-class**</td>
<td>Classification of a patch (additive / modifying / destructive / frontmatter) used by sanity validation and permission gating. (DD-017, DD-037)</td>
</tr>
<tr>
<td>**Coherence Pass**</td>
<td>Cross-layer reconciliation step; ensures patches across docs/skills/agents stay consistent. (Architecture)</td>
</tr>
<tr>
<td>**Degraded mode**</td>
<td>Plugin state after 3 consecutive lock timeouts; skips writes for the rest of the session. Indicated by `[🧭 ⚠]`. (DD-061)</td>
</tr>
<tr>
<td>**Drift**</td>
<td>Divergence between a guiding file and current code reality.</td>
</tr>
<tr>
<td>**DD**</td>
<td>Design Decision; numbered DD-001..DD-064.</td>
</tr>
<tr>
<td>**E2E**</td>
<td>End-to-end integration test scenario. (DD-063)</td>
</tr>
<tr>
<td>**File-level fallback**</td>
<td>Subagent attribution mode used when host does not expose `subagent_invocation_id`. Attributes file changes within a 5-minute / same-turn window. (DD-062)</td>
</tr>
<tr>
<td>**Hallucination grep**</td>
<td>Two-tier (strict / loose) literal-token check on Stage 2 output to reject fabricated paths and symbols. (DD-032, DD-047, DD-058)</td>
</tr>
<tr>
<td>**Kill-switch**</td>
<td>`.claude/coherence/disabled` sentinel file that loads plugin in no-op mode. (DD-064)</td>
</tr>
<tr>
<td>**Observe mode**</td>
<td>Default install state; plugin proposes patches but does not auto-write.</td>
</tr>
<tr>
<td>**`pending.md`**</td>
<td>`.claude/coherence/pending.md` — cross-session deferred drift entries. (DD-029)</td>
</tr>
<tr>
<td>**Plan-derived bundle**</td>
<td>Group of Stage 2 patches sharing one Stage 1 plan; presented atomically to the user. (DD-008)</td>
</tr>
<tr>
<td>**Regret rate**</td>
<td>Deterministic quality metric replacing fuzzy false-positive rate; (revert≤7d ∪ accept-then-defer≥2) / accepted. (DD-060, SM3)</td>
</tr>
<tr>
<td>**Stage 1 / Stage 2**</td>
<td>Coherence Planner LLM call (Stage 1) and parallel patch-writer LLM calls (Stage 2). (DD-008)</td>
</tr>
<tr>
<td>**Trigger group / source**</td>
<td>Set of buffer entries flagged by the same code change; deterministic grouping. (DD-009, DD-025)</td>
</tr>
<tr>
<td>**Velocity limit**</td>
<td>Per-section bound: 2 patch-and-revert cycles within 30 days → auto-ignore. (DD-011)</td>
</tr>
</table>
## 5.7 Change Log (this BRD)
<table header-row="true">
<tr>
<td>Date</td>
<td>Version</td>
<td>Change</td>
<td>Author</td>
</tr>
<tr>
<td>2026-05-09</td>
<td>0.1-draft1</td>
<td>Initial BRD authored after audit closure (11/11 ✅).</td>
<td>Coherence project</td>
</tr>
</table>
