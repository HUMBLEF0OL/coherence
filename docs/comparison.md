# Coherence vs alternatives

## TL;DR

Coherence is the only tool we know of that detects **code-vs-docs drift**
— when source changes without updating the documentation that describes
it — and proposes surgical patches via an LLM pipeline, trust-gated by a
per-section ledger. The adjacent tools below are all good at narrower
slices (prose style, broken links, formatting) but none of them watch
for the staleness of doc *content* relative to code symbols. The honest
default for most teams is **do nothing** about drift; Coherence exists
to change that default for the specific case where it matters.

## At a glance

| Tool | Detects code-vs-docs drift? | Auto-proposes patches? | Trust-graded auto-apply? | Plugin for Claude Code? |
| --- | --- | --- | --- | --- |
| Coherence | yes | yes (LLM-mediated, validated by 8 asserts + hallucination grep) | yes (per-section trust ledger; auto-apply gate at score ≥ 0.85) | yes |
| vale | no (style/grammar only) | no | no | no |
| lychee | no (broken links only) | no | no | no |
| markdownlint | no (formatting only) | no | no | no |
| CodeQL on doc paths | no (code analysis only) | no | no | no |
| Manual docs-as-tests (e.g. pytest-codeblocks) | yes (you write the asserts) | no | no | no |
| Doing nothing | no | no | no | no |

## Per-tool detail

### vale

[vale](https://vale.sh/) is a prose linter — style, grammar, voice, and
custom rules expressed as YAML "styles". It is excellent at what it
does. It is not a drift detector: it cannot tell when a code symbol
referenced in your docs has been renamed or removed. **vale and Coherence
are complementary, not substitutes.** A team that cares about both prose
quality and code accuracy would run both.

### lychee

[lychee](https://github.com/lycheeverse/lychee) is a fast async broken-
link checker. It catches one specific class of doc drift: a link target
that no longer exists. Coherence's `asserts: [{ type: file_exists }]`
covers the same ground for in-repo file references, but lychee is the
better choice for external URLs at scale. Run lychee in CI; let
Coherence handle code-symbol drift.

### markdownlint

[markdownlint](https://github.com/DavidAnson/markdownlint) enforces
formatting conventions — heading hierarchy, list indentation, line
length, etc. Strictly cosmetic. Nothing to do with whether the content
matches the code it describes. Use it for the cosmetic layer; it does
not overlap with Coherence's scope.

### CodeQL on doc paths

[CodeQL](https://codeql.github.com/) is a code-analysis platform. You
*could* in principle write CodeQL queries that join code symbols with
their doc-comment occurrences, but the engineering cost is heavy, the
feedback loop is slow (CI-only), and it does not propose patches — it
only flags. Coherence's two-stage LLM pipeline plus asserts engines is
purpose-built for this specific niche.

### Manual docs-as-tests (pytest-codeblocks, mdsh, etc.)

This is the closest functional cousin. Frameworks like
[pytest-codeblocks](https://github.com/nschloe/pytest-codeblocks) or
[mdsh](https://github.com/zimbatm/mdsh) treat fenced code blocks in
Markdown as executable assertions. They are powerful but require you to
*write* every assertion by hand and keep them green by hand.

Coherence inverts the responsibility: you declare lightweight contracts
in YAML frontmatter (`asserts:`), and the planner LLM proposes the
*content* updates when drift is detected. The `asserts:` engines are the
deterministic backstop — `symbol_exists`, `symbol_exported`, `file_exists`,
`has_example`, etc. — that validate any patch the LLM writes.

If your team is already happy maintaining docs-as-tests by hand,
Coherence does not displace that workflow. It is for the case where
hand-maintenance has decayed.

### Doing nothing

This is the honest baseline. Most repositories do not detect doc drift.
The cost is silent — docs slowly go stale, new contributors are
mis-onboarded, the maintainer eventually does a heroic catch-up pass.
If your docs are short, change rarely, or are not load-bearing for
contributors, "do nothing" is a defensible choice. Coherence is for the
case where the silent cost has become loud.

## When NOT to use Coherence

Be honest. If any of these apply, Coherence is overkill:

- **You don't have anchored doc sections to track.** Coherence depends on
  HTML-comment anchors (or GitHub-slug heading fallbacks) to identify
  sections. Without anchors there is nothing for the trust ledger to
  score.
- **Your docs are short enough that you reread them on every PR.** If
  the whole README fits on one screen, a human-review pass beats any
  automation.
- **You can't run a Claude Code session.** Coherence is a Claude Code
  plugin. The Stop-hook pipeline depends on the session lifecycle.
- **Your project's docs change much faster than its code.** The drift
  signal Coherence watches for is *code without docs*; if your authoring
  loop is dominated by doc edits, Coherence will rarely fire.

## When Coherence is the right choice

- A repo with **100+ documented sections** that reference code symbols.
- **Active codebase** where renames are frequent.
- **Solo maintainer or small team** where docs decay is a real cost and
  hand-review-on-every-PR doesn't scale.
- Teams that already use Claude Code for development and want the
  drift-detection loop to participate in the same session lifecycle
  rather than as a separate CI step.

## Stacking with other tools

Coherence is happy to live alongside vale, lychee, and markdownlint —
they cover different slices and there is no overlap. A reasonable doc
quality stack for a serious project:

1. **markdownlint** — formatting (pre-commit hook or CI).
2. **lychee** — external link health (CI).
3. **vale** — prose style (CI or editor).
4. **Coherence** — code-vs-docs drift (in-session via Claude Code).

Each catches a class of decay the others miss.
