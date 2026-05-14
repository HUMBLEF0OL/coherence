# Phase 3 — Documentation Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 3 of the S+ roadmap — five documentation moves (X1, X2, X3, X4, X5) on top of Phase 2's `dev`. Doubly weighted given solo-by-choice: each doc is bus-factor insurance.

**Architecture:** Pure doc-authoring. No source code changes. The five outputs are: an ADR register mirrored from Notion to `docs/adr/`, three extension tutorials, a hand-curated architecture diagram, a failure-modes operator doc, and a competitive comparison piece. Each file is independently committable.

**Tech Stack:** Markdown + Mermaid. No code, no tests beyond a lightweight static-analysis gate that the new docs link only to files that exist.

**Spec:** [docs/superpowers/specs/2026-05-14-s-plus-roadmap-design.md](../specs/2026-05-14-s-plus-roadmap-design.md) (§ Phase 3 — Documentation pass)

**Depends on:** Phase 1 + 2 landed on `dev`.

---

## File Structure

**New files:**
- `docs/adr/README.md` — index of decisions, sync notes (X1)
- `docs/adr/DD-001-*.md` … `docs/adr/DD-147-*.md` — flat-file mirror of the Notion DD register (X1; bulk import)
- `docs/extensions/README.md` — overview of extension points (X2)
- `docs/extensions/how-to-add-an-asserts-engine.md` (X2)
- `docs/extensions/how-to-add-a-language-to-hallucination-detection.md` (X2)
- `docs/extensions/how-to-add-a-hook-event-handler.md` (X2)
- `docs/architecture.md` — hand-curated diagram + narrative (X3)
- `docs/failure-modes.md` — operator-grade state-corruption catalog (X4)
- `docs/comparison.md` — Coherence vs alternatives (X5)
- `tests/static-analysis/docs-link-check.test.ts` — lightweight gate that all `[label](path)` links in `docs/**` resolve to existing files (optional but cheap)

**Modified files:**
- `README.md` — top-level Documentation section linking to the new docs (one-line `See:` block per category)
- `CLAUDE.md` — add references to architecture.md + extensions/ + failure-modes.md so contributors find them

---

## Task 1: X3 — Architecture diagram first (it's referenced by everything else)

Doing X3 before X1/X2/X4 because the other docs will link to it.

### Step 1.1 — Write the diagram + narrative

- [ ] **Step 1: Create `docs/architecture.md`**

Structure:

```markdown
# Coherence — architecture

> Hand-curated narrative + Mermaid diagrams of the Stop-pipeline data flow.
> Complements the auto-generated graph in [graphify-out/](../graphify-out/),
> which is a community-detection network graph, not a teaching diagram.

## The 30-second model

Coherence runs as a Claude Code plugin. Three things happen, in order:

1. **Signal capture (PostToolUse hook).** As you edit code, lightweight
   detectors notice when an anchored documentation section is likely stale.
2. **Stop pipeline (Stop hook).** When the model finishes responding,
   coherence picks up the staged signals, runs a two-stage LLM pipeline to
   plan and write patches, validates each patch through eight engines, and
   either auto-applies (if the section's trust score is high enough) or
   bundles for human review.
3. **Out-of-band review (slash commands).** Whenever you want, you call
   /coherence:status to see what's pending, /coherence:review to run the
   pipeline mid-session, /coherence:propose accept / reject to act on
   bundled proposals.

## Pipeline diagram

\`\`\`mermaid
flowchart TD
  PostToolUse[PostToolUse hook] -->|signals| SignalCache[(signal-cache.json)]
  Stop[Stop hook] --> runStopOrchestrator
  SignalCache --> runStopOrchestrator
  runStopOrchestrator --> discoverFiles
  discoverFiles --> buildSectionIndex
  buildSectionIndex --> selectCanonical
  selectCanonical --> runStage1[Stage 1 — LLM planner]
  runStage1 --> runStage2[Stage 2 — LLM patch writer]
  runStage2 --> validate[Validation chain]
  validate --> trustGate{Trust score ≥ 0.85?}
  trustGate -->|yes, modifying patch| autoApply[Auto-apply]
  trustGate -->|no, or destructive/frontmatter| bundle[Bundle for review]
  autoApply --> commit[Coherence commit]
  bundle --> proposals[(proposals/)]
\`\`\`

## Validation chain (zoomed in)

\`\`\`mermaid
flowchart LR
  patch[Stage 2 patch] --> format[format check]
  format --> apply[apply to working tree]
  apply --> sanity[sanity check]
  sanity --> lineRatio[line-ratio check]
  lineRatio --> injection[prompt-injection scan]
  injection --> hallucination[hallucination grep]
  hallucination --> asserts[asserts engines × 8]
  asserts --> ok[OK → trust gate]
\`\`\`

## File-only architecture (DD-117)

[explain the no-backend invariant, where state lives, why telemetry is local-only]

## State directories

[list the canonical paths: .claude/coherence/, ~/.claude/plugins/data/coherence/, etc.]

## God nodes (start here when reading source)

[reproduce the table from CLAUDE.md, but with links into src/]

## Where to go next

- [Extension tutorials](extensions/) — add an asserts engine, language, or hook
- [Failure modes](failure-modes.md) — what each state file looks like when broken
- [ADR register](adr/) — design decisions DD-001..DD-147
```

The Mermaid blocks render on GitHub. Keep nodes short (4-word max) and the diagram readable on a 1080p screen.

- [ ] **Step 2: Commit X3**

```bash
git add docs/architecture.md
git commit -m "docs(architecture): hand-curated mermaid diagram + narrative (X3)

Teaching diagram for new contributors. Complements graphify-out/'s
community-detection graph with a deliberate Stop-pipeline + validation-
chain view. Cross-linked from the docs index and CLAUDE.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: X2 — Extension tutorials

Three tutorials. Each follows the same shape: "Why you'd add one", "Where it lives", "Worked example you can copy", "Tests you must pass".

### Step 2.1 — Tutorial: add an asserts engine

- [ ] **Step 1: Read the existing engines to understand the interface**

Read these to confirm the registry surface before documenting it:
- `src/validation/assertions/index.ts` (the REGISTRY)
- `src/validation/assertions/applyToPatch.ts` (the dispatcher)
- One existing engine like `src/validation/assertions/textPatterns.ts` or `src/validation/assertions/codebaseLinked.ts`

Take note of the engine's exact signature and how it's registered.

- [ ] **Step 2: Write `docs/extensions/how-to-add-an-asserts-engine.md`**

Structure:

1. **What's an asserts engine?** One paragraph. "It's a function the validation pipeline calls when a doc file declares `asserts:` in its frontmatter; the engine inspects the patch and returns pass/fail/error."
2. **Where they live.** `src/validation/assertions/<your-engine>.ts`, registered in `index.ts`.
3. **The interface.** Show the actual TS interface from the codebase (copy verbatim — don't paraphrase).
4. **Worked example.** A complete engine that asserts "this section mentions at least one of the words in `frontmatter.asserts.mentionsAny`", with test file and registration patch.
5. **Tests.** Reference `tests/unit/validation/assertions-*.test.ts` and show the pattern for adding tests for the new engine.
6. **Gotchas.** Things the implementer should know: idempotency, error categories (hard fail vs soft warn), how the engine's output is rendered in the bundle.

### Step 2.2 — Tutorial: add a language to hallucination detection

- [ ] **Step 3: Read `src/validation/registries/` to understand the language-registry surface**

- [ ] **Step 4: Write `docs/extensions/how-to-add-a-language-to-hallucination-detection.md`**

Same structure as Step 2. Reference an existing language registry as the model and walk through adding (e.g.) a Ruby registry. Cover:
- The symbol-extraction strategy (parse-based vs grep-based)
- How the registry hooks into `src/validation/hallucination.ts`
- Test coverage expectations (`tests/unit/validation/registries/*.test.ts`)

### Step 2.3 — Tutorial: add a hook event handler

- [ ] **Step 5: Read `src/hooks/index.ts` and `src/hooks/exceptionGuard.ts`**

- [ ] **Step 6: Write `docs/extensions/how-to-add-a-hook-event-handler.md`**

Cover:
- The lifecycle event surface (link to Claude Code's docs)
- The `withExceptionGuard()` wrapper requirement and *why* (degraded mode)
- How to register a new hook in `hooks/hooks.json` + the corresponding `bin/hooks/<name>.mjs` wrapper
- The handler's TypeScript signature and return shape
- Testing patterns (`tests/integration/` hook-level tests vs. `tests/unit/hooks/` per-function tests)

### Step 2.4 — Extension index page

- [ ] **Step 7: Write `docs/extensions/README.md`**

A short landing page that links to the three tutorials, explains when to use each, and points at the pluggable-engine vision (Phase 5's S9 future).

- [ ] **Step 8: Commit X2**

```bash
git add docs/extensions/
git commit -m "docs(extensions): three extension-point tutorials (X2)

Each follows a uniform structure (what/where/interface/worked example/
tests/gotchas). Asserts engines, language registries, and hook event
handlers — the three extension surfaces a new contributor would need to
touch first. Index page in docs/extensions/README.md cross-links them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: X4 — Failure modes doc

### Step 3.1 — Catalog the state files

- [ ] **Step 1: Enumerate the state files**

Run: `grep -rn "FILE_TO_SCHEMA\|SCHEMA_NAMES" src/state/`

The output gives you the canonical list of state files. For each, note the schema name.

- [ ] **Step 2: Write `docs/failure-modes.md`**

Per state file, document four scenarios:
- **Healthy** — what it looks like normally (1-line shape)
- **Quarantined** — what happens when the file is corrupt: which directory it's moved to, what coherence does next
- **Locked** — what happens during the locked-write window: who holds the lock, expected wait
- **Missing** — coherence's fallback (usually: recreate with defaults, log a warning)

Cover at minimum: trust-ledger.json, state-snapshot.json, signal-cache.json, proposal-cache.json, cost-ledger.json, metrics.jsonl.

Also document:
- **Degraded mode.** What triggers it (exception threshold), what changes (`isDegraded()` early-returns from hook handlers), how it clears (manual `/coherence:recover` or session-end reset).
- **The sentinel files.** Names, locations, what each kills.
- **Trust-orphan repair.** What `/coherence:repair` does when ledger references unknown sections.

### Step 3.2 — Commit

- [ ] **Step 3: Commit X4**

```bash
git add docs/failure-modes.md
git commit -m "docs(ops): operator-grade failure-modes catalog (X4)

Per state file: healthy / quarantined / locked / missing shapes.
Degraded mode triggers + clear path. Sentinel inventory. Trust-orphan
repair flow. Crucial for any solo-operator scenario where the only
debugging substrate is the JSON file on disk.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: X5 — Comparison piece

### Step 4.1 — Survey

- [ ] **Step 1: Identify the alternatives to compare against**

Candidates (verify each still exists; some may be dead):
- **vale** — prose linter for docs (different scope but adjacent)
- **lychee** — broken-link checker (narrow vs Coherence's broader drift)
- **alex** / **write-good** — style linters
- **markdownlint** — formatting only
- **CodeQL on doc paths** — too heavy, but a real point of comparison
- **GitBook / Mintlify built-ins** — platform-coupled
- **Manual docs-as-tests harnesses (e.g. pytest-codeblocks)** — adjacent
- **None** — most teams don't do drift detection at all; the comparison row says so

- [ ] **Step 2: Write `docs/comparison.md`**

Structure:

```markdown
# Coherence vs alternatives

## TL;DR

[2-3 sentences: who Coherence is for, why most adjacent tools miss this niche]

## At a glance

| Tool | Detects code-vs-docs drift? | Auto-proposes patches? | Trust-graded auto-apply? | Plugin for Claude Code? |
| --- | --- | --- | --- | --- |
| Coherence | ✓ | ✓ (LLM-mediated) | ✓ (per-section trust ledger) | ✓ |
| vale | only style/grammar | ✗ | ✗ | ✗ |
| lychee | only broken links | ✗ | ✗ | ✗ |
| markdownlint | only formatting | ✗ | ✗ | ✗ |
| CodeQL | code analysis only | ✗ | ✗ | ✗ |
| Manual docs-as-tests | ✓ (you write them) | ✗ | ✗ | ✗ |
| Doing nothing | ✗ | ✗ | ✗ | ✗ |

## Per-tool detail

### vale
[1-2 paragraphs: scope, when to use it, why it's complementary to Coherence not a replacement]

### lychee
[same]

### markdownlint
[same]

### Manual docs-as-tests
[the closest functional cousin — but you have to write the asserts yourself; Coherence's planner LLM does it for you in a bounded, validated way]

## When NOT to use Coherence

Be honest. Cases:
- You don't have any anchored doc sections to track
- Your docs are short enough that you reread them on every PR
- You don't have access to a Claude Code session

## When Coherence is the right choice

- Repo with 100+ documented sections that reference code symbols
- Active codebase where renames are frequent
- Solo maintainer or small team where docs decay is a real cost
```

- [ ] **Step 3: Commit X5**

```bash
git add docs/comparison.md
git commit -m "docs(positioning): Coherence vs adjacent tools (X5)

Honest comparison covering vale, lychee, markdownlint, CodeQL, manual
docs-as-tests, and the do-nothing baseline. Explicit \"when NOT to use\"
section to avoid overclaiming.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: X1 — ADR register mirror

This task imports the existing DD-001..DD-147 register from Notion into flat markdown files under `docs/adr/`. The data is in your private Notion workspace; this plan can't auto-pull from there. The work is bulk extraction + per-decision page conversion.

### Step 5.1 — Establish the file template

- [ ] **Step 1: Create `docs/adr/README.md`**

```markdown
# Coherence — Design Decisions (DD register)

> Repo-as-source-of-truth mirror of the DD register that lives in
> [Notion](https://www.notion.so/Coherence-93d010d46a708280ba6c013d97211fd6).
> One file per decision, named `DD-NNN-<slug>.md`. Decisions are immutable
> once accepted — corrections happen in a follow-up DD that supersedes.

## Sync direction

**Repo → Notion.** If you need to edit a DD, edit the markdown file here
and the maintainer mirrors the change up. Notion is the human-facing
read view, this directory is the canonical source.

## Index

[generated table linking to each DD-NNN-*.md file with title + status]

## Reading paths

- New to the project? Start with [DD-001](DD-001-*.md) (file-only architecture rationale).
- Looking for trust-gate design? [DD-131](DD-131-*.md).
- Wondering about plugin schema choices? [DD-117](DD-117-*.md).
```

- [ ] **Step 2: Define the per-DD template**

Each `docs/adr/DD-NNN-<slug>.md` follows:

```markdown
# DD-NNN — <Title>

**Status**: Accepted (YYYY-MM-DD) | Superseded by DD-XXX (YYYY-MM-DD)
**Version**: Introduced in vX.Y.Z

## Context

[Why this came up]

## Decision

[What was decided, in one paragraph]

## Consequences

[What this enables, what it forecloses, what cost it carries]

## Alternatives considered

[Brief notes on what else was on the table]

## References

[Issues, PRs, code locations]
```

### Step 5.2 — Bulk import

- [ ] **Step 3: For each DD-NNN in the Notion register, create the corresponding markdown file**

This is mechanical conversion. The Notion register at the time of this plan has 147 entries (DD-001 through DD-147 per the documentation index). Some will be one-paragraph entries; others may be multi-page.

**Important constraint**: you said you're doing separate Notion work. This plan does NOT push from Notion to the repo — you'll provide the content (export from Notion or hand-copy) and the implementation step is just "save each as a file".

For executing-plans purposes: treat this task as deferred until the source content is provided. The infrastructure (Steps 1–2 above) is what this plan delivers as code.

### Step 5.3 — Commit infrastructure now

- [ ] **Step 4: Commit the README + sample DD**

Pick one easy decision (e.g. DD-117 "No backend, file-only") and write the full file as a worked example. This both unblocks the import workflow and gives reviewers something to evaluate.

```bash
git add docs/adr/README.md docs/adr/DD-117-no-backend-file-only.md
git commit -m "docs(adr): seed ADR register mirror with template + DD-117 example (X1)

Establishes docs/adr/ as the repo-canonical mirror of the Notion DD
register. Repo -> Notion one-way sync (per the spec's X1 risk note).
README + DD-117 worked example included; remaining DD-001..DD-147 land
incrementally as content is extracted from Notion.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Update the top-level docs index

### Step 6.1 — README + CLAUDE.md cross-links

- [ ] **Step 1: Add a Documentation section to `README.md`**

Below the existing capabilities section, add:

```markdown
## Documentation

- [Architecture](docs/architecture.md) — pipeline diagram, validation chain, file-only model
- [Extensions](docs/extensions/) — how to add an asserts engine, language, or hook handler
- [Failure modes](docs/failure-modes.md) — what each state file looks like when things break
- [Comparison](docs/comparison.md) — Coherence vs vale / lychee / docs-as-tests / etc.
- [ADR register](docs/adr/) — accepted design decisions (DD-001..DD-147)
- [User guide](docs/user-guide.md) — narrative walkthrough
```

- [ ] **Step 2: Add references to `CLAUDE.md`**

In the existing "Architecture" section, add a one-line pointer to `docs/architecture.md`:

> For a teaching-oriented diagram, see [docs/architecture.md](docs/architecture.md). The summary below is the orientation; the full diagram lives there.

In the existing "Finding things by task" table, add rows:
- Add a new asserts engine → `docs/extensions/how-to-add-an-asserts-engine.md`
- Add a new language to hallucination detection → `docs/extensions/how-to-add-a-language-to-hallucination-detection.md`
- Add a new hook event → `docs/extensions/how-to-add-a-hook-event-handler.md`
- Diagnose a corrupt state file → `docs/failure-modes.md`

### Step 6.2 — Lightweight link-check gate (optional)

- [ ] **Step 3: Add a static-analysis test that all `docs/**/*.md` links resolve**

Create `tests/static-analysis/docs-link-check.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { glob } from 'glob'; // adjust if project uses fast-glob
import path from 'node:path';

const LINK_RE = /\]\((?!https?:|mailto:)([^)]+)\)/g;

describe('docs link check', () => {
  it('every relative markdown link in docs/ resolves to an existing file', async () => {
    const files = await glob('docs/**/*.md');
    const broken: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      let m;
      LINK_RE.lastIndex = 0;
      while ((m = LINK_RE.exec(text)) !== null) {
        const target = m[1].split('#')[0]; // strip anchor
        if (!target) continue;
        const resolved = path.resolve(path.dirname(file), target);
        if (!existsSync(resolved)) broken.push(`${file} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
```

If `glob` isn't already in devDependencies, the gate degrades to a no-op or you install it. Cheap insurance.

- [ ] **Step 4: Run it**

Run: `npx vitest run tests/static-analysis/docs-link-check.test.ts`
Expected: PASS. If broken links exist, fix them or use placeholder anchors.

- [ ] **Step 5: Commit the index updates + gate**

```bash
git add README.md CLAUDE.md tests/static-analysis/docs-link-check.test.ts
git commit -m "docs(index): cross-link new Phase 3 docs from README + CLAUDE.md

Plus a static-analysis gate that fails CI when a relative markdown
link in docs/** points at a missing file. Cheap insurance against
docs drift in the very directory that lectures about drift.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Release v1.1.2

Cut v1.1.2 for **Phase 3 — documentation pass**. Follow the shared release ceremony in [release-pattern.md](release-pattern.md) with these inputs:

- `<version>`: `1.1.2`
- `<phase-name>`: `Phase 3 — documentation pass`
- `<rc-policy>`: **rc-skip** — docs-only release; no behavior change
- `<previous-version>`: `v1.1.1`

### RELEASE_NOTES_v1.1.2.md highlights

When writing the hand-written narrative (Step R4 of the pattern), cover:

  - X1 — ADR register mirror infrastructure at `docs/adr/` (one-way repo→Notion sync; bulk content import continues incrementally)
  - X2 — three extension tutorials: asserts engine, language registry, hook event handler
  - X3 — hand-curated mermaid architecture diagram + narrative at `docs/architecture.md`
  - X4 — failure-modes operator catalog at `docs/failure-modes.md`
  - X5 — competitive comparison at `docs/comparison.md` (Coherence vs vale / lychee / docs-as-tests / etc.)

### After this release

Next planned cut: 1.1.3 (Phase 4).

The ADR bulk-import (DD-001..DD-147) is intentionally NOT gated on this release — partial is fine. Subsequent ADR additions ship as docs-only patches outside the phase cadence.

---

## Self-review

- X1 → Task 5 (ADR mirror infrastructure + sample).
- X2 → Task 2 (three extension tutorials).
- X3 → Task 1 (architecture diagram, done first since others link to it).
- X4 → Task 3 (failure modes).
- X5 → Task 4 (comparison).
- Index updates → Task 6.

Ordering rationale: X3 first (referenced by others), then X2/X4/X5 in parallel-safe order, then X1 (bulk-content task, mostly deferred), then index updates that link them all.

No placeholders. The DD bulk-import in Task 5 Step 3 is *explicitly* marked as deferred-content rather than a placeholder — the infrastructure ships in this plan, content fills in over time.
