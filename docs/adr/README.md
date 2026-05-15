# Coherence — Design Decisions (DD register)

> Repo-as-source-of-truth mirror of the DD register that lives in the
> private [Notion workspace](https://www.notion.so/Coherence-93d010d46a708280ba6c013d97211fd6).
> One file per decision, named `DD-NNN-<slug>.md`. Decisions are immutable
> once accepted — corrections happen in a follow-up DD that supersedes.

## Sync direction

**Repo -> Notion.** If you need to edit a DD, edit the markdown file here
and the maintainer mirrors the change up. Notion is the human-facing
read view; this directory is the canonical source.

## Status

The Notion register currently has 147 entries (DD-001..DD-147). This
mirror is seeded with the **template** (this file plus the per-DD shape
below) and one **worked example** ([DD-117](DD-117-no-backend-file-only.md))
so reviewers can evaluate the format. Remaining entries land
incrementally as content is extracted from Notion — that is intentionally
NOT gated on any release cadence.

## Index (incremental)

Each row links to the full file once it lands here.

| ID | Title | Status | Introduced in |
| --- | --- | --- | --- |
| [DD-117](DD-117-no-backend-file-only.md) | No backend, ever — file-only architecture | Accepted | v0.3 |

(DD-001..DD-147 add rows here as files land.)

## Reading paths

- **New to the project?** Start with [DD-117](DD-117-no-backend-file-only.md)
  (file-only architecture rationale) — it's the load-bearing
  architectural invariant everything else assumes.
- **Looking for trust-gate design?** DD-131 + DD-138 (forthcoming).
- **Wondering about plugin schema choices?** DD-130, DD-122
  (forthcoming).

## Per-DD template

Each `docs/adr/DD-NNN-<slug>.md` follows:

```markdown
# DD-NNN — <Title>

**Status**: Accepted (YYYY-MM-DD) | Superseded by DD-XXX (YYYY-MM-DD)
**Version**: Introduced in vX.Y.Z

## Context

Why this came up.

## Decision

What was decided, in one paragraph.

## Consequences

What this enables, what it forecloses, what cost it carries.

## Alternatives considered

Brief notes on what else was on the table.

## References

Issues, PRs, code locations.
```

## Naming

`DD-NNN-<slug>.md` where `NNN` is the zero-padded decision number and
`<slug>` is a 1-5-word kebab-case summary. Examples:

- `DD-117-no-backend-file-only.md`
- `DD-131-trust-gate-modifying-patches.md`
- `DD-138-weighted-accept-rate-decay.md`
