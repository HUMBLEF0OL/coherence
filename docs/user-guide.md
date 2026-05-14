# Coherence user guide

This is the practical walkthrough — start here if you've installed
Coherence and want to actually use it. For exhaustive references see
[`commands.md`](commands.md) and [`state-files.md`](state-files.md).

## Contents

1. [What Coherence does](#what-coherence-does)
2. [Quick start](#quick-start)
3. [How a session feels](#how-a-session-feels)
4. [Core concepts](#core-concepts)
5. [Adding anchors to your docs](#adding-anchors-to-your-docs)
6. [Picking a mode](#picking-a-mode)
7. [Trust building over time](#trust-building-over-time)
8. [Using `asserts:` to keep docs honest](#using-asserts-to-keep-docs-honest)
9. [Reviewing and accepting proposals](#reviewing-and-accepting-proposals)
10. [Common scenarios](#common-scenarios)
11. [Team workflows](#team-workflows)
12. [Audits and metrics](#audits-and-metrics)
13. [Troubleshooting](#troubleshooting)
14. [Privacy at a glance](#privacy-at-a-glance)
15. [Where to go next](#where-to-go-next)

---

## What Coherence does

Coherence is a Claude Code plugin that keeps your documentation
honest when code changes. Specifically:

- It watches your Claude Code session for edits to source files and
  to anchored Markdown documentation.
- When you stop a session, it asks an LLM to plan and write surgical
  patches to the docs that have drifted out of sync with the code.
- It validates every proposed patch through a 7-stage chain
  (format → apply → sanity → line ratio → prompt-injection →
  hallucination → asserts) before showing it to you.
- It learns over time which sections you trust: patches that you
  consistently accept eventually auto-apply silently. Patches that
  you revert lose that trust quickly.

You stay in control: by default Coherence proposes, you decide.
Auto-apply is opt-in and gated per-section by your own accept/revert
history.

## Quick start

After install (`claude plugin install coherence`), the next time you
open a project under Claude Code:

1. **First SessionStart initialises state.** Coherence creates
   `.claude/coherence/` and writes a per-developer `.gitignore` patch
   so this directory never lands in your repo (NFR-PRIVACY-N5). You
   may be asked once for telemetry consent — answer it, your choice is
   remembered.

2. **Add at least one anchor to your docs.** Coherence only watches
   sections wrapped in anchor markers:

   ```markdown
   <!-- coherence:section id="install" -->
   ## Install

   Run `npm install coherence` ...

   <!-- /coherence:section -->
   ```

   Without anchors, Coherence has no idea where one logical "doc
   section" ends and another begins. The anchor pair is what gives it
   the unit of repair.

3. **Edit code as normal.** When you save a `.ts` / `.py` / `.md`
   file (via Claude Code's Edit/Write tool), `PostToolUse` fires and
   the affected section enters the drift buffer.

4. **Run `/coherence:status` to see what's pending:**

   ```
   /coherence:status

   Coherence v1.0.1  ·  mode: observe
   Buffer: 3 entries (2 sections + 1 trickle deep-scan)
   Last activity: 2026-05-13T20:14:33Z — applied 0, escalated 1
   ...
   ```

5. **Run `/coherence:review` to process the buffer.** Stage 1 plans
   the work (canonical-selection across related sections), Stage 2
   writes diffs, the validation chain filters them, and you get a
   bundle of proposed patches.

6. **Accept what looks right.** Coherence records each accept into
   the trust ledger, which gates future auto-apply.

That's the loop. Everything else is refinement.

## How a session feels

Here's what actually happens behind the scenes during a typical
session:

| Event | What Coherence does |
|---|---|
| **SessionStart** | Initialise state, run the trickle deep-scan over a small chunk of docs (DD-066), refuse-and-quarantine any incompatible older state (DD-118). |
| **PostToolUse** on a doc file you edit | Anchor-scan the file; for each touched anchored section, hash the new content and append a buffer entry. Deduplicates on `sectionRef`. |
| **PostToolUse** on a source file | If the file is referenced by a `file_exists:`/`symbol_exists:` assertion in any nearby SKILL/agent/doc, that section is added to the buffer as `source: 'assertion'`. |
| **Stop** (you close the chat) | If the buffer has entries, run the Stop orchestrator: group → cap → Stage 1 → Stage 2 → validate → bundle. In Graduated mode, additive patches and high-trust modifying patches apply automatically; everything else queues as a proposal. |
| **SessionEnd** | Persist the buffer if non-empty (deferred state — survives across restarts). Finalize the trickle pass. |
| **PreCompact** | Save a `state-snapshot.json` so a compacted summary can be rehydrated next session. |

Most of this is invisible. The visible surface is `/coherence:status`
to see what's queued, and `/coherence:review` to process it on
demand.

## Core concepts

### Anchored sections

A *section* is a span of Markdown wrapped in matched anchor markers:

```markdown
<!-- coherence:section id="overview" -->
## Overview

Some prose with `inline code` and:

```ts
const example = () => {};
```

<!-- /coherence:section -->
```

The `id="..."` is optional — Coherence falls back to a GitHub-slug
of the first heading. Each section gets its own
`sectionRef = <path>#<id>`, e.g.
`.claude/skills/calc-helper/SKILL.md#overview`. The `sectionRef` is
the unit of: drift detection, trust scoring, assertion attachment,
patch routing, and bundle assembly.

Fenced code blocks inside a section are scanned correctly (the
opening fence is retained — v1.0.1 Fix 7 caught a bug where it was
being dropped, which broke `has_example` assertions on every doc
with a code block).

### The drift buffer

`.claude/coherence/drift-buffer.json` holds queued section-ref entries
captured by `PostToolUse` and friends. Schema:

```json
{
  "state": "pending",
  "entries": [
    {
      "path": ".claude/skills/calc-helper/SKILL.md",
      "sectionRef": ".claude/skills/calc-helper/SKILL.md#basics",
      "contentHash": "f77622d5...",
      "triggeredAt": "2026-05-13T20:14:33Z",
      "source": "posttooluse"
    }
  ]
}
```

The buffer is capped at 200 entries (LRU; oldest pruned first) and
entries fall off after 14 days. `/coherence:review` reads from it;
the empty case prints "Buffer is empty — nothing to review."

### Two-stage pipeline

The repair loop is intentionally split into two LLM calls:

1. **Stage 1 — Planner.** Groups related sections, picks a canonical
   section, and assigns roles/relations (canonical / reference /
   no-change with relations like `mirrors`, `summarises`, `expands`).
   Single-section groups short-circuit without an LLM call.
2. **Stage 2 — Patch writer.** For each non-canonical section,
   produces a unified diff or a sentinel
   (`NO_PATCH_NEEDED` / `ESCALATE` / `PLAN_DISAGREES`). Every diff
   then runs the 7-stage validation chain.

The split keeps each call's prompt short, makes failure modes
attributable, and lets the validation chain reject hallucinations
without re-running the planner.

### The 7-stage validation chain

After Stage 2 emits a diff, it runs:

| Stage | What it checks |
|---|---|
| **format** | Is this actually a parseable unified diff? |
| **apply** | Does `git apply --check` succeed against the working tree? |
| **sanity** | Change class (additive / modifying / destructive / frontmatter); add/remove counts. |
| **line-ratio** | Does the patch rewrite > 40 % of the section? If so, ESCALATE — the LLM is probably overreaching. |
| **prompt-injection** | Does the patch contain prompt-injection patterns (e.g., "ignore previous instructions")? |
| **hallucination** | Are all code symbols referenced in the patch actually present in the project corpus? |
| **assertions** | Run the file's `asserts:` frontmatter contracts. `policy: block` violations escalate; `warn` attaches to the review UX. |

The first failure short-circuits with `validationPassed = false`.

### Trust ladder

Per-developer, per-section accept/edit/revert event log at
`.claude/coherence/trust-ledger.json` drives the auto-apply gate for
modifying patches. The score is a decayed weighted accept rate
(30-day half-life):

```
score = Σ event_weight * decay  /  Σ event_denWeight * decay
```

with `accept = +1`, `revert = -1`, `edit = 0` (numerator) and
`accept/revert = 1`, `edit = 0.5` (denominator). Scores live in
`[-1, 1]`; the auto-apply threshold is `>= 0.85`.

Fresh sections start at 0.000 (technically undefined → 0). Each
accept nudges them upward; each revert pulls them down. Five-ish
consecutive accepts is enough to cross 0.85 in practice.

**Frontmatter and destructive patches NEVER auto-apply, no matter
how high the score** (DD-131). That gate is unconditional and
non-negotiable.

### Modes (per-directory)

Coherence has four modes. They're per-directory so you can graduate
`docs/` while keeping `src/` under observation:

| Mode | What changes |
|---|---|
| **Observe** (default) | Watch, propose, never auto-apply. |
| **Annotate** | Also propose anchor placement for anchor-less Markdown (DD-069). |
| **Author** | Add three signal detectors (bash-command repetition, file-creation patterns, agent corrections) that seed Author LLM proposals into the quarantine. |
| **Graduated** | Additive patches auto-apply; modifying patches auto-apply at score ≥ 0.85; destructive/frontmatter always defer to you. |

Switch with `/coherence:graduate <mode>` (or `<mode> <scope>` for
per-directory). `/coherence:graduate --status` prints the effective
mode for the current working directory.

## Adding anchors to your docs

Wrap a Markdown heading + its content with matched markers:

```markdown
<!-- coherence:section id="install" -->
## Install

Run `npm install coherence`.

```bash
claude plugin install coherence
```

<!-- /coherence:section -->
```

Tips:

- **The `id=` is optional** but recommended for sections whose
  heading text might change. Without it, the section's ref changes
  when you rename the heading, breaking trust-ledger continuity.
- **One section per logical doc unit.** "Installation" is a section;
  "Installation steps" + "Installation troubleshooting" is two.
- **Don't anchor inside code blocks** — Coherence's scanner skips
  fenced code, so anchor markers inside ``` would be ignored anyway.
- **Anchors stack naturally with headings.** A section that contains
  a `## Subheading` is still one section; the subheading is just
  content.

Bulk-annotate an anchor-less doc with:

```bash
/coherence:annotate docs/intro.md
```

This produces a *proposal* under quarantine — you review and accept
it via `/coherence:propose-accept` before any markers land on disk
(DD-065).

## Picking a mode

| If you're … | Use |
|---|---|
| New to Coherence and want to see what it would do | **Observe** — never auto-applies; everything goes to review |
| Maintaining docs without anchors and want help adding them | **Annotate** for the directory in question |
| Actively writing new skills/agents and want auto-suggestions | **Author** for the relevant directory |
| Confident in Coherence on a mature doc set and want quiet repairs | **Graduated** — trust gate decides per-section |

```bash
/coherence:graduate                      # global → Graduated
/coherence:graduate annotate docs/       # only docs/ in Annotate
/coherence:graduate author src/          # signal detectors on src/
/coherence:graduate --revert             # back to Observe
/coherence:graduate --status             # what mode is `pwd` in?
```

Modes are persisted under `.claude/coherence/graduation.json` with
LIFO ancestor walk (deepest match wins).

## Trust building over time

The score lives in `[-1, 1]`. It's the weighted accept rate — the
fraction of your events on that section that are accepts vs reverts,
weighted by a 30-day half-life decay. There's no built-in prior:

- A section with **no events** scores 0.000 (the denominator is too
  small, so the formula returns 0 by definition).
- A section with **one or more accepts and no reverts** scores 1.000 —
  one accept saturates immediately, more accepts keep it pinned.
- **Reverts are expensive.** Each revert contributes -1 to the
  numerator; an accept contributes +1. So `(accepts - reverts) /
  (accepts + reverts)` is roughly the score (with edits weighing
  half on the denominator only).

The 0.85 auto-apply threshold matters mainly *after* you've reverted
something. Practical examples:

| Event sequence | Score | Will modifying patches auto-apply? |
|---|---|---|
| (no events) | 0.000 | No (DEFER) |
| 1 accept | 1.000 | **Yes** |
| 1 accept, 1 revert | 0.000 | No |
| 3 accepts, 1 revert | 0.500 | No |
| 6 accepts, 1 revert | ≈ 0.714 | No |
| 12 accepts, 1 revert | ≈ 0.846 | No (just under) |
| 13 accepts, 1 revert | ≈ 0.857 | **Yes** (just over) |

(Decay is negligible for events less than a day apart; older events
contribute less per ALPHA^ageDays with ALPHA=0.977.)

The practical takeaway: one accept lets future patches on that
section start auto-applying. One revert at any point sends the
section back to manual review until you've out-accepted the revert
by a wide margin. That asymmetry is intentional — Coherence treats
your revert as a strong "no" signal.

To inspect:

```bash
/coherence:trust                                   # top 5 + bottom 5
/coherence:trust sync                              # share to team aggregate
/coherence:trust --promote --auto-land annotate,skill
/coherence:trust --prune-stale --yes               # drop refs to deleted sections
```

The `--promote` flow is gated: you need (a) at least one section at
≥ 0.85, (b) ≥ 5 distinct sections at score > 0, and (c) a ledger
spanning ≥ 30 days from earliest event (FR-TRUST-4). Once promoted,
SessionStart auto-accepts surfaced proposals whose `kind` is in
`auto_land_kinds`.

## Using `asserts:` to keep docs honest

The `asserts:` block in a doc's YAML frontmatter declares
machine-verifiable claims about the doc. Coherence runs them on
every Stage 2 patch and on demand.

Seven engines:

| Engine | Param | Purpose |
|---|---|---|
| `has_example` | — | Section contains at least one fenced code block. |
| `no_placeholder_links` | — | No `[text](FILLME)` style placeholders. |
| `max_words` | `<N>` | Section body has at most N words. |
| `min_words` | `<N>` | Section body has at least N words. |
| `no_todo_comments` | — | No `TODO`/`FIXME`/`XXX` markers. |
| `symbol_exists` | `<name>[:<lang>]` | Symbol appears anywhere in the project corpus (text grep). |
| `file_exists` | `<relpath>` | File exists relative to the project root. |
| `symbol_exported` | `<name>[:<lang>]` | Symbol appears in an actual `export ...` declaration (stricter than `symbol_exists`; closes LIM-1 — v1.0.1 Fix 8). |

Each entry takes a `policy`:

- `block` — failure escalates the patch to manual review (ESCALATE).
- `warn` (default) — failure surfaces in the review UX but doesn't
  block.

### Example: a skill that references symbols and files

```yaml
---
name: calc-helper
description: How to use the calc module.
asserts:
  - { type: has_example,         policy: warn  }
  - { type: file_exists,
      param: src/calc.ts,        policy: block }
  - { type: symbol_exported,
      param: add:typescript,     policy: block }
  - { type: symbol_exported,
      param: multiply:typescript, policy: block }
---
```

After a `multiply → times` rename, the last assertion fails — and
**any LLM patch on this section is forced to manual review** until
you (or a `/coherence:repair` pass) update the assertion to
`param: times:typescript` along with the body. That's the whole
point: the assertion is the *machine-readable claim* the doc makes
about the code, and Coherence won't let the doc drift past it.

### Choosing between `symbol_exists` and `symbol_exported`

| Use … | When … |
|---|---|
| `symbol_exists` | The symbol just needs to be *mentioned* somewhere in the corpus (e.g., a tutorial that walks through an example). Loosest check, fastest. |
| `symbol_exported` | The symbol is part of your public API and the doc *commits* to that interface (e.g., a SKILL.md that says "we export X"). Strictest check, catches stale callers. |

A common pattern: use `symbol_exported` for surface-area claims and
`has_example` for hands-on docs.

### Cap and warnings

- Max 10 assertions per section (cap). Anything beyond is silently
  passed with `ignored: 'cap_exceeded'`.
- One combined stderr warning per (section, session) when assertions
  are skipped (cap, unknown type, unsupported language).

## Reviewing and accepting proposals

Net-new artifacts (skills, agents, slash commands, annotations) land
in `.claude/coherence/proposals/<kind>/<id>/` — never directly in
`.claude/skills/` or `.claude/agents/`. That boundary is enforced by
DD-065 / SG-3 and is statically asserted by a ship gate.

Lifecycle:

```bash
/coherence:propose-list                          # what's queued
/coherence:propose-show <id>                     # full diff + metadata
/coherence:propose-accept <id>                   # materialise under .claude/
/coherence:propose-accept <id> --rename          # add a suffix on collision
/coherence:propose-reject <id>                   # mark rejected (DD-088)
/coherence:propose-revert-acceptance <id>        # undo a recent accept (DD-083)
```

Each accept feeds the trust ledger as an `accept` event. Reverts
record a `revert` event with negative weight — multiple reverts on
the same section pull its score below zero and stop further
auto-apply.

## Common scenarios

### "I renamed a function and forgot to update the docs"

This is the canonical rename drift. After your edit, the next
session's stop pipeline will:

1. Detect that source files referencing the renamed symbol changed
   (PostToolUse on the source files).
2. Trickle-scan picks up the corresponding SKILL/agent/doc sections
   in `coherence/scan-cache/`.
3. Stage 1 groups them; Stage 2 proposes diffs that swap the old
   name for the new one.
4. If any section has a `symbol_exported:<old>:typescript` block
   assertion, *that section* escalates to manual review because the
   assertion itself needs updating.
5. Sections with no asserts (or only `has_example`-style asserts)
   produce valid diffs that DEFER until you've built trust, then
   auto-apply silently.

You did not have to do anything beyond noticing the proposal.

### "I added a new module — how do I create a SKILL for it?"

In **Author mode** for `src/`, Coherence's signal detectors notice
the new module via file-creation patterns and seed an author
proposal into the quarantine. Surface it with
`/coherence:propose-list`, inspect with `/coherence:propose-show
<id>`, and accept with `/coherence:propose-accept <id>` to
materialise the SKILL under `.claude/skills/`.

You can also create the skill by hand and add `asserts:` referencing
the new module's exports — Coherence will then maintain the doc
through future renames.

### "I made a big destructive change"

Destructive patches (large deletions, file removals, etc.) **always**
defer to confirmation regardless of trust score (DD-131). You'll see
them in the review bundle even with `/coherence:graduate` in
Graduated mode. This is non-overridable.

### "Frontmatter changes auto-applied? I don't want that"

They didn't. Frontmatter patches *also* always defer to confirmation
(DD-131). If a patch with a frontmatter-only diff appears to have
landed silently, that's a bug — file an issue. The classifier is
exercised by `tests/unit/validation/sanity.test.ts` and the v1.0.1
Fix 5 covers the unified-diff-header false-positive case.

### "The buffer is empty but I know I edited files"

Three possible reasons:

1. **You edited files outside Claude Code.** PostToolUse only fires
   on Claude Code's Edit/Write tool calls. A direct file edit in
   another editor doesn't enter the buffer.
2. **The files you edited have no anchored sections.** Coherence
   only tracks anchored Markdown.
3. **You're in a different project root than Claude Code is.** Check
   `pwd` — buffer reads are scoped to `.claude/coherence/` of the
   current working directory.

`/coherence:status` shows the buffer count; `/coherence:doctor`
shows host probes including whether your terminal supports the
features Coherence relies on.

## Team workflows

Coherence is **file-only** (DD-117) — no server, no database. Team
state is git-committed under `coherence/`.

### Sharing trust scores

```bash
/coherence:trust sync
```

Writes `coherence/trust/<author-hash>.json` (the 12-hex SHA-256 of
`git config user.email` — your real email is never persisted).
Commit and push. The team aggregate is the arithmetic mean across
active contributors, with a 180-day staleness filter and a
"contested" flag when ≥ 2 contributors disagree and `|aggregate| <
0.2`.

### Cross-team plans

`/coherence:plan-create <kind> <title> [--body <md>]` creates a
committed JSON file under `coherence/plans/<branch-sha>/<plan-id>.json`.
Reviewers use `plan-accept` / `plan-reject`. IDs are deterministic
(branch SHA + author hash + title + timestamp) so collisions are
extremely unlikely.

### Statusline

Install a one-line plugin status badge into your shell prompt:

```bash
/coherence:install-statusline
# Restores from a backup if you change your mind:
/coherence:uninstall-statusline
```

Three render flavours: OSC 8 (clickable hyperlink), OSC 52 (plain
text + clipboard support), or a non-OSC fallback for terminals that
can't render the escape sequences.

## Audits and metrics

### `/coherence:metrics`

A 5-section quality report: event counts (all-time + 30-day window),
top drifting sections (with the team-aggregate contested flag),
trust-score winners and losers, a 30-day cost-trend sparkline, and
revert hotspots.

```bash
/coherence:metrics
/coherence:metrics --since 2026-04-01 --revert-threshold 15
/coherence:metrics --out report.md
```

Runs in < 200 ms p95 on a 1000-section index.

### `/coherence:audit`

Free tier — token-budget classifier per section
(`< 2000` Normal, `2000-5000` ⚠ Large, `> 5000` ❌ Bloated). Useful
for spotting sections that have grown beyond a single sensible patch
unit.

```bash
/coherence:audit
```

Deep tier — LLM cross-section consistency pass with an opt-in
two-step cost gate:

```bash
/coherence:audit --deep                          # prints candidates + 12-char sig
/coherence:audit --deep --confirm-deep <sig>     # actually runs the LLM
```

The signature protects against accidentally invoking the LLM on the
wrong section set. CI can use `--no-confirm` only when `CI=true` is
set.

## Troubleshooting

### "Coherence stopped working mid-session"

Coherence auto-disables itself after 3 hook exceptions in a session
(FR-FAILURE-6 — degraded mode). Recover with:

```bash
/coherence:recover
```

This clears the auto-disable sentinel, resets locks, and removes
in-flight progress files. Doesn't touch your accepted state.

### "My state files look corrupt"

```bash
/coherence:repair
```

Fixes anchor collisions, schema drift on state files, trust-ledger
orphan references to deleted sections, and pending.md/buffer
mismatches. Targeted flags:

```bash
/coherence:repair --reassociate <old-ref> --to <new-ref>
/coherence:repair --expire-orphans
```

If `repair` can't fix it, the file gets moved to
`.claude/coherence/quarantine/` and a fresh schema-default file
takes its place.

### "I want to undo a recently-accepted proposal"

```bash
/coherence:propose-revert-acceptance <id>
```

This restores the prior state and records a `revert` event in the
trust ledger (which has the side-effect of cooling the section's
score).

### "How do I roll back across a major version?"

You don't (DD-118). Each major version stands alone. To downgrade:

```bash
claude plugin uninstall coherence
# Re-install the older version
```

Your `.claude/coherence/` per-project state is preserved across
re-installs. Cross-major schema migrations are intentionally NOT
supported — re-install rather than migrate.

See [`rollback.md`](rollback.md) for the full rollback matrix
(same-major recover, cross-major re-install, signed-release rollback,
orphan repair).

### "An assertion is failing but I think it's wrong"

Two paths:

1. **The assertion is stale** — the doc made a claim that's no
   longer true. Update the assertion (e.g., change
   `symbol_exported:multiply` to `symbol_exported:times` after the
   rename).
2. **The assertion's engine has a bug** — file an issue with a
   reproducer. The v1.0.1 release fixed three such bugs
   (`anchorScanner` opening fence, `isFrontmatterOnlyDiff`,
   `apply.ts` trailing newline); the engines are actively
   maintained.

While you decide, you can downgrade the assertion's policy from
`block` to `warn` to unblock the patch without removing the contract.

## Privacy at a glance

The full policy lives in [`privacy.md`](privacy.md). The short
version:

- **No backend, ever** (DD-117). Coherence is a file-only plugin.
- **No automatic uploads.** Telemetry stays on your disk
  (`.claude/coherence/metrics.jsonl`) unless you explicitly opt in
  with `/coherence:consent --upload on` AND run an explicit
  `/coherence:export-metrics` AND copy-paste the printed `curl`
  yourself.
- **No raw emails persisted.** Author identity is the 12-hex
  SHA-256 of `git config user.email` (DD-107).
- **`.claude/coherence/` is gitignored at directory level** when
  Coherence first-runs in a repo, so no per-developer state lands in
  git (NFR-PRIVACY-N5).
- **LLM transport.** Stage 1 and Stage 2 calls go through
  `@anthropic-ai/claude-agent-sdk` which uses your authenticated
  `claude` CLI session — typically a Claude Code subscription. No
  separate API key needed for subscribers. Content of your code +
  docs is sent to Anthropic's API as part of these calls (that's how
  Claude reads them); nothing else.

## Where to go next

- [`commands.md`](commands.md) — every slash command, every flag,
  every output shape.
- [`state-files.md`](state-files.md) — every file under
  `.claude/coherence/` and `coherence/`, what writes it, what reads
  it, and the schema.
- [`privacy.md`](privacy.md) — telemetry catalogue, consent model,
  OWASP commitments, release-signing summary.
- [`rollback.md`](rollback.md) — same-major recover, cross-major
  re-install, signed-release rollback.
- [`../README.md`](../README.md) — architecture, ship-time gates,
  release notes index.
- [`../SECURITY.md`](../SECURITY.md) — responsible disclosure policy.

For the verification command to check that a published release was
signed by the legitimate GitHub Actions workflow, see the
[Verification block](../README.md#verification) in the top-level
README.
