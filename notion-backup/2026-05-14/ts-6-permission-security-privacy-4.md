<!-- url: https://www.notion.so/35b010d46a7081a2813fdbf8138c8fb2 -->
<!-- id: 35b010d4-6a70-81a2-813f-dbf8138c8fb2 -->
<!-- title: TS-6 — Permission, Security & Privacy -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 6.1 Permission Model
The permission model gates on **change-class** of the proposed patch, not on file type — with one overlay rule for skill/agent frontmatter (FR-PERMISSION-3).
### Change classes (DD-017)
<table header-row="true">
<tr>
<td>Class</td>
<td>Definition</td>
<td>Default action</td>
<td>Auto-apply allowed?</td>
</tr>
<tr>
<td>`additive`</td>
<td>Only `+` lines (whitespace-only `-` ignored in count)</td>
<td>Auto-apply when opted in</td>
<td>YES (FR-PERMISSION-2)</td>
</tr>
<tr>
<td>`modifying`</td>
<td>Mixed `+`/`-` not destructive</td>
<td>Show diff at Stop, default Accept</td>
<td>NO</td>
</tr>
<tr>
<td>`destructive`</td>
<td>Removes rules / narrows scope</td>
<td>Show diff, require explicit confirm</td>
<td>NO</td>
</tr>
<tr>
<td>`frontmatter`</td>
<td>Touches frontmatter of skill / agent (description, allowed-tools, model, coherence-key, etc.)</td>
<td>Always confirm (FR-PERMISSION-3)</td>
<td>NO</td>
</tr>
</table>
Deterministic recount at Stop wins over LLM-claimed class (FR-STOP-6b). An LLM-claimed-additive that is actually `modifying` loses its auto-apply privilege.
### Modes
- **Observe** — default install state. No auto-writes (FR-PERMISSION-1, BRD-1 G3).
- **Graduated** — user opted in via `/coherence:graduate`. Additive-class patches auto-apply at commit time; everything else still requires user approval.
Annotate / Author transitions are deferred to v0.2 (BRD-5 §5.3).
### Reversibility & quarantine
- Every applied patch → single `[coherence]`-prefixed git commit listing each section ID modified, one per line, in the format `section: <workspace-relative-path>#<id-or-heading-anchor>` (FR-PERMISSION-4).
- Auto-applied additive patches carry `<!-- coherence-pending: YYYY-MM-DD -->` markers for 7 days; finalize sweep at next SessionStart removes them (DD-038, FR-DETECT-11).
- `git revert` of any `[coherence]` commit feeds the velocity counter (DD-011, DD-035, FR-DETECT-14).
### Velocity limit (DD-011)
2 patch-and-revert cycles within 30 days on the same section → auto-add to `coherence/ignore` with a one-line user notice and opt-out path (FR-BUFFER-5). The auto-ignore is surfaced in `/coherence:status` velocity block alongside `consecutive_defer_sessions` (FR-OBS-7, DD-051).
### Plan-derived bundles (FR-STOP-9)
- Atomic accept / reject. User can expand to view individual diffs but cannot accept partially.
- Single-section patches without a plan remain individually selectable.
- Same-section competing patches across independent groups: never merged; consolidated review note shows both plans side-by-side (FR-STOP-18).
### Assertion-failure UX (FR-PERMISSION-8)
Separate Stop-review section. 3-action UX: **Patch** (treat as drift), **Update assertion** (write a new `last-verified` or refine the predicate), **Dismiss**. Always carries high confidence. Each row shows `last-verified` date and age (FR-PERMISSION-10).
### Demoted-canonical UX (FR-STOP-20, FR-PERMISSION-9)
When Stage 1 demotes a user-declared canonical, the Stop review shows: “N other declared-canonical section(s) were treated as references for this change.” Demotions are recorded in `observations.md` and `/coherence:status`. Demotions never auto-apply.
## 6.2 Privacy Surfaces (NFR-PRIVACY)
<table header-row="true">
<tr>
<td>Surface</td>
<td>Rule</td>
<td>NFR</td>
</tr>
<tr>
<td>Metrics</td>
<td>Stored locally only in `metrics.jsonl`; **no auto-upload**.</td>
<td>NFR-PRIVACY-1</td>
</tr>
<tr>
<td>Anonymized share</td>
<td>Opt-in per session, explicit slash command (`/coherence:share-metrics --anonymized`).</td>
<td>NFR-PRIVACY-2</td>
</tr>
<tr>
<td>Code transmission</td>
<td>Only as part of intentional Stop pipeline LLM calls (Anthropic API only).</td>
<td>NFR-PRIVACY-3</td>
</tr>
<tr>
<td>Buffer payload</td>
<td>Path + section ID + content **hash** — never raw content beyond the in-flight LLM call.</td>
<td>NFR-PRIVACY-4</td>
</tr>
<tr>
<td>Always-ignored paths</td>
<td>`.env`, `.envrc`, `.git/`, `.gitignore` matches, anything in `coherence/ignore`.</td>
<td>NFR-PRIVACY-5</td>
</tr>
</table>
Ignore semantics evaluated **before** any read or path-filter match. Plugin must never open a file matching an ignore rule (DD-007 anchor scan included).
## 6.3 Security Surfaces (NFR-SECURITY)
<table header-row="true">
<tr>
<td>Vector</td>
<td>Defense</td>
<td>NFR</td>
</tr>
<tr>
<td>Arbitrary shell from LLM output</td>
<td>Stage 2 outputs are constrained to unified diffs / literal escape strings; validation rejects anything else.</td>
<td>NFR-SECURITY-1</td>
</tr>
<tr>
<td>Path traversal (`..`)</td>
<td>All paths sanitised before any FS op; resolved against project root and `.claude/`.</td>
<td>NFR-SECURITY-2</td>
</tr>
<tr>
<td>Secret exfiltration</td>
<td>API key read from env / host credential store; never persisted by plugin.</td>
<td>NFR-SECURITY-3</td>
</tr>
<tr>
<td>Out-of-root writes</td>
<td>All writes scoped to project root and `.claude/`; refused otherwise.</td>
<td>NFR-SECURITY-4</td>
</tr>
<tr>
<td>Vulnerable deps</td>
<td>CI enforces `npm audit --audit-level=high` zero findings (SG-1).</td>
<td>NFR-SECURITY-5</td>
</tr>
<tr>
<td>Shell-execution constructs in skill/agent frontmatter</td>
<td>Validation rejects diffs that introduce them.</td>
<td>NFR-SECURITY-6</td>
</tr>
<tr>
<td>Prompt injection via skill / agent body (R-16)</td>
<td>DD-050 restricts HTML coherence anchors to prose docs; validation rejects diffs introducing `<!-- coherence:* -->` or instruction-shaped HTML into `.claude/skills/*/SKILL.md` or `.claude/agents/*.md` body content. SG-3 covers regression.</td>
<td>NFR-SECURITY-7</td>
</tr>
<tr>
<td>Schema poisoning via corrupted state</td>
<td>All reads validated; failure quarantines + fresh defaults.</td>
<td>NFR-RELIABILITY-1</td>
</tr>
</table>
### Prompt-injection hardening details
Validation runs against every Stage 2 patch targeting a skill or agent file:
1. Reject if patch introduces any new `<!--` ... `-->` HTML comment in body (frontmatter region excluded).
2. Reject if patch introduces tokens matching the instruction-shape blacklist regex (`(?i)(coherence:|role:|you are|ignore (the |all )?(previous|prior) instructions)` and similar).
3. The `coherence:` frontmatter key is preserved verbatim; patches altering it are rejected (FR-LAYERS-2, DD-043).
## 6.4 Git Adapter & Pre-Flight (FR-FAILURE-5, NFR-RELIABILITY-6)
Before any `[coherence]` commit:
<table header-row="true">
<tr>
<td>Check</td>
<td>Action on fail</td>
</tr>
<tr>
<td>`MERGE_HEAD` / `CHERRY_PICK_HEAD` / `REBASE_HEAD` / `rebase-apply/` / `rebase-merge/` present</td>
<td>Skip + defer; log as `git_state_busy`</td>
</tr>
<tr>
<td>Detached HEAD</td>
<td>Warn but proceed</td>
</tr>
<tr>
<td>Targeted doc paths have unrelated working-tree changes</td>
<td>Skip + defer</td>
</tr>
<tr>
<td>`git add` only the explicit doc paths</td>
<td>(never `git add .`)</td>
</tr>
<tr>
<td>Non-zero `git commit` exit</td>
<td>`git reset HEAD`  • `git checkout -- <docs>`; defer the buffer entry</td>
</tr>
</table>
Git interface: shell-out to `git` CLI for portability across all CI matrix cells (NFR-COMPAT-1..2). No Node-native git library in v0.1.
## 6.5 Kill-Switches (DD-019, DD-064)
<table header-row="true">
<tr>
<td>Sentinel</td>
<td>Trigger</td>
<td>Behaviour</td>
</tr>
<tr>
<td>`.claude/coherence/DISABLED`</td>
<td>Manual user creation</td>
<td>Plugin loads in no-op mode; every hook returns success without I/O / LLM / `additionalContext`. Surfaced once per session in `/coherence:status`. (FR-INSTALL-7, FR-FAILURE-8)</td>
</tr>
<tr>
<td>`.claude/coherence/disabled`</td>
<td>Auto-created after 3 hook exceptions in one session</td>
<td>Same no-op mode + diagnostic message in the file (FR-FAILURE-6). User runs `/coherence:recover` to clear (FR-FAILURE-7).</td>
</tr>
<tr>
<td>Degraded mode flag</td>
<td>3 consecutive lock-acquisition timeouts</td>
<td>Skips writes for the rest of the session; statusline `[🧭 ⚠]` (FR-FAILURE-4, FR-PERMISSION-7).</td>
</tr>
</table>
Both sentinels are intentionally distinct on case-sensitive filesystems; either acts as a kill-switch on case-insensitive filesystems.
## 6.6 Locking & Concurrency Safety (FR-FAILURE-3, FR-FAILURE-3b, DD-041)
Advisory `<file>.lock` siblings recording `{pid, started_at, hostname, namespace_hint}`:
<table header-row="true">
<tr>
<td>Concern</td>
<td>Rule</td>
</tr>
<tr>
<td>Same hostname + namespace</td>
<td>`process.kill(pid, 0)` alive-check</td>
</tr>
<tr>
<td>Cross-hostname / cross-namespace</td>
<td>Age-only (never probe foreign PID)</td>
</tr>
<tr>
<td>Stale fence — buffer mutations</td>
<td>30 s</td>
</tr>
<tr>
<td>Stale fence — trickle scanner lock</td>
<td>5 s</td>
</tr>
<tr>
<td>Backoff</td>
<td>Exponential 10/20/40… ms, capped 500 ms, total ≤5 s</td>
</tr>
<tr>
<td>Failure path</td>
<td>After 3 consecutive timeouts in a single session → degraded mode (FR-FAILURE-4)</td>
</tr>
</table>
## 6.7 Quarantine & Recovery (NFR-RELIABILITY-7)
- Corrupt state files → `.claude/coherence/quarantine/<filename>.<unix-ts>.bak`. Last 10 per file retained; older deleted.
- Event logged to `coherence-log.md` with the quarantine path.
- `/coherence:repair` resolves anchor collisions, schema drift, buffer corruption, and `pending.md` mismatches (FR-PERMISSION-6).
- `/coherence:recover` clears quarantine, resets locks, drops corrupted progress files, removes `disabled` sentinel (FR-FAILURE-7).
## 6.8 Threat Model Summary
In-scope:
- Malicious or stale documentation that could mislead the agent (the whole point).
- LLM hallucinations producing fabricated paths/symbols (hallucination grep).
- Prompt injection via inserted HTML comments or instruction text in skill/agent bodies (NFR-SECURITY-7).
- Path traversal / out-of-root writes from buggy or adversarial diffs (NFR-SECURITY-2/4).
- Corrupted local state files (quarantine + fresh defaults).
- Crash storms (3-exception self-disable).
- Concurrent sessions trampling shared state (advisory locks + degraded mode).
Explicitly out of scope (v0.1):
- Authenticating the LLM provider beyond standard TLS / API key.
- Multi-tenant or shared-state scenarios beyond single-user single-machine.
- Sandboxing the LLM patch output execution — v0.1 never executes LLM output, only applies validated diffs.
