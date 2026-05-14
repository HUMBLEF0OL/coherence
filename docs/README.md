# Coherence — documentation drift detection for Claude Code

Coherence is a Claude Code plugin that detects and repairs drift
between your codebase and its documentation. It watches for changes
during a session and proposes surgical patches at session end (`Stop`)
or on demand (`/coherence:review`).

Coherence is **file-only** (DD-117 — no backend, no database, no
hosted upload service, ever) and **standalone per major version**
(DD-118 — re-install rather than migrate across major bumps).

## Install

```bash
claude plugin install coherence    # Anthropic plugin registry (canonical)
```

For local development:

```bash
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install && npm run build
```

The plugin manifest is [`.claude-plugin/plugin.json`](../.claude-plugin/plugin.json).

## Modes

Coherence has a per-directory mode lifecycle (DD-074):

- **Observe** (default) — watches and proposes patches for review;
  never auto-applies.
- **Annotate** — proposes anchor placement for anchor-less Markdown
  docs (DD-069).
- **Author** — three signal detectors fire (DD-076 bash repetition,
  DD-077 file-creation patterns, DD-078 agent corrections) and seed
  Author LLM proposals.
- **Graduated** — additive patches auto-apply; modifying patches
  auto-apply only when the section's trust score ≥ 0.85 (DD-131);
  destructive and frontmatter patches always require confirmation.

Switch modes with `/coherence:graduate <mode>` (scoped per directory)
or `/coherence:graduate --revert` to return to Observe.

## What's in this directory

- [`user-guide.md`](user-guide.md) — practical narrative walk-through:
  what Coherence does, quick start, core concepts, common scenarios,
  troubleshooting. **Start here if you're new.**
- [`commands.md`](commands.md) — every slash command, grouped by
  surface (lifecycle / trust + intelligence / proposals / team
  workflows / statusline).
- [`state-files.md`](state-files.md) — every state file, schema,
  ownership pattern, and the full telemetry catalogue.
- [`privacy.md`](privacy.md) — what data leaves the machine,
  consent model, OWASP commitments, release-signing summary.
- [`rollback.md`](rollback.md) — same-major recover, cross-major
  re-install, trust-ledger orphan repair, signed-release rollback.

## Top-level docs at the repo root

- [`README.md`](../README.md) — capabilities overview, install,
  architecture, ship-time gates.
- [`SECURITY.md`](../SECURITY.md) — coordinated disclosure policy.
- [`CLAUDE.md`](../CLAUDE.md) — guidance for AI agents working in the
  repo (architecture map, god nodes, task index).
- [`RELEASE_NOTES_v1.0.0.md`](../RELEASE_NOTES_v1.0.0.md) — most
  recent release notes (older release notes live at the corresponding
  GitHub tag).

## Architectural commitments

Two stances are permanent and enforced by ship-time static-analysis
gates wired into `scripts/release-ga.mjs`:

- **DD-117 — no backend, ever.** Cross-team plans live as committed
  files under `coherence/plans/` (git is the substrate). Telemetry is
  local JSONL + user-driven `curl` only. There is no project-side
  server, database, or hosted upload service. Scaling beyond
  ~50-developer teams is not a project goal.
- **DD-118 — no legacy version support.** Each major version stands
  alone. There is no cross-major migrator, no `prompts/v1/` in the
  tarball, no rollback across a major bump.

Gate enforcement: `M-ARCH-1` (no network egress outside
`src/llm/client.ts`), `M-PRIVACY-1` (no per-developer state under
`coherence/`), `M-LEGACY-1` (`npm pack --dry-run` excludes legacy
paths). See [README.md → Ship-time gates](../README.md#ship-time-gates)
for the full list.

## Release history

Per-version release notes live as GitHub Releases:
<https://github.com/HUMBLEF0OL/coherence/releases>. Each release is
signed with Sigstore `cosign` keyless OIDC; the verification command
is in the README `## Verification` section.

Implementation plans (one per major) are archived in Notion under the
**Coherence** project page: [Implementation Plans (archive)](https://www.notion.so/Implementation-Plans-archive-35f010d46a70810589c2f3736efd925a).
