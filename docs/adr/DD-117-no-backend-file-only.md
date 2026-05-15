# DD-117 — No backend, ever (file-only architecture)

**Status**: Accepted (2026-03-14)
**Version**: Formalised in v0.3 (load-bearing since v0.1)

## Context

Coherence is a Claude Code plugin. Early versions of the design considered
several options for the persistence and coordination substrate:

- A small project-side server (Node + SQLite, run locally), for the
  trust ledger, team aggregates, and proposal store.
- A hosted upload service for telemetry and team trust scores.
- A pure file-only architecture using the project's own filesystem and
  git for cross-team distribution.

Each was attractive in different ways. A backend would have simplified
the trust-aggregate join across contributors, and a hosted endpoint would
have made telemetry collection trivial. But two constraints dominated:

1. **Install footprint.** A backend would require running a daemon
   alongside Claude Code. That changes the deployment story from "drop a
   plugin in `.claude/plugins/`" to "drop a plugin, run a service,
   manage its lifecycle, handle its crashes." The friction is fatal for
   adoption at the scale Coherence is aimed at (per-developer, per-repo).

2. **Trust and privacy.** A hosted upload service introduces an
   exfiltration surface for code symbols, doc content, and behavioural
   telemetry. For a tool that runs inside the user's editor and reads
   the user's source, "the data never leaves your machine without your
   explicit action" is a non-negotiable starting position.

## Decision

**Coherence is a file-only plugin. There is no project-side server,
database, or hosted upload service, ever.** This is a permanent
architectural commitment — not a current-version constraint that might
relax later.

Concrete entailments:

- All per-developer state lives under `.claude/coherence/` (gitignored).
- All team-distributable surfaces live as committed JSON under
  `coherence/` (the substrate is git, not a backend).
- Cross-team plans use `coherence/plans/<branch-sha-12>/<plan-id>.json`
  with deterministic plan IDs derived from
  `branch_sha + author_hash + title + created_at` (DD-099 amended).
- Author identity in committed files is hashed (12-hex SHA-256 of
  `git config user.email`, DD-107) — raw emails are never persisted.
- Telemetry is a local JSONL file + a user-driven `curl` only
  (`/coherence:export-metrics` produces a redacted artifact; nothing
  uploads automatically).

This is enforced statically. `tests/static-analysis/no-network.test.ts`
(gate **M-ARCH-1**) asserts that no production module imports a network
API, references global network constructors, or embeds a non-Anthropic
HTTPS URL.

## Consequences

**What this enables:**

- **Zero-install scaling.** Coherence is a drop-in plugin. There is no
  service to manage, no port to allocate, no auth flow to configure.
- **Trust and privacy by construction.** A reviewer can audit the
  static-analysis gate and reason about the entire exfiltration surface
  in one place.
- **Git as the team-coordination substrate.** Plans, ignores, and team
  trust aggregates ride the same review and merge workflow as the rest
  of the codebase.
- **Offline-first.** Coherence runs without network access.

**What this forecloses:**

- **No real-time team coordination.** Cross-team plans propagate at the
  speed of `git push` / `git pull`. There is no live channel for
  proposals to converge across contributors.
- **No central trust aggregate.** Each repo computes its own
  arithmetic-mean aggregate at `coherence/trust/<author-hash>.json` per
  sync; there is no organisation-wide view.
- **No cross-machine session continuity.** Per-developer state is local;
  switching machines means starting with an empty trust ledger.
- **Telemetry analytics are best-effort.** The opt-in export produces
  redacted JSONL that the user `curl`s by hand — there is no funnel,
  no dashboard.

**Cost it carries:**

- Every cross-developer feature must invent a file-shaped representation
  and a merge strategy. This is more work than reaching for a database.
- Some natural workflows (live "team trust" updates, real-time
  collision detection on parallel sessions) are out of scope.
- The plugin must defend itself against a hostile filesystem (corrupt
  JSON, partial writes, stale locks) where a backend would defend itself
  against a hostile network. Hence the atomic-write + AJV-validate +
  quarantine machinery in `src/state/`.

## Alternatives considered

- **Project-side daemon.** Rejected for install-footprint reasons (see
  context). A daemon would also have its own crash semantics that
  compound with Claude Code's session lifecycle.
- **Hosted upload service (opt-in).** Rejected because even an opt-in
  service creates a maintenance and security obligation. The local-JSONL +
  user-driven `curl` design preserves user agency without the obligation.
- **SQLite under `.claude/coherence/`.** Considered for the trust ledger
  specifically. Rejected because the operational benefits (file-only is
  inspectable with `cat`, fixable with `rm`) outweigh the schema
  ergonomics that SQLite would have brought, and because the existing
  AJV + atomic-write pattern already handles concurrency well at
  expected scale.

## References

- [docs/state-files.md](../state-files.md) — full inventory of every
  file the architecture commits to.
- [docs/architecture.md](../architecture.md#file-only-architecture-dd-117) —
  the operational view.
- [docs/failure-modes.md](../failure-modes.md) — what the file-only
  substrate looks like when things go wrong, and how to recover.
- `tests/static-analysis/no-network.test.ts` — the M-ARCH-1 gate.
- Companion: DD-118 (no legacy version support — each major version
  stands alone).
- Companion: DD-109 / NFR-PRIVACY-N5 — the `signal-cache.json` privacy
  invariant, asserted by M-PRIVACY-1.
- Companion: DD-099 amended — cross-team plan ID derivation.
- Companion: DD-107 — author identity hashing.
