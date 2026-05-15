# Privacy & data handling

Coherence is **file-only** (DD-117 — no backend, no database, no hosted
upload service, ever). All state lives locally. Two surfaces ever leave
the developer's machine: the Anthropic API (during LLM calls) and
optional user-initiated `coherence/trust/<author-hash>.json` commits to
the team git repository.

## Data sent to the Anthropic API

Coherence uses the Anthropic API (claude-sonnet-4-6 for stage1/stage2;
claude-sonnet-4-6 for author / annotate / audit_deep) for five pipeline
stages:

### Stage 1 — Canonical Selection Planner

**Sent:** section references (file paths + anchor IDs), section
headings, buffer metadata (which files changed, from which source).

**Not sent:** raw file content, source code, personal information.

### Stage 2 — Patch Writer

**Sent:** current section content (the text between coherence anchors),
the coherence plan from Stage 1, changed-token list (identifiers from
changed source files, for hallucination grounding), project file token
set.

**Not sent:** full source files beyond the changed-token summary,
database content, credentials, secrets, personal information outside
documentation text.

### Author / Annotate

**Sent:** signal context (privacy-safe shape per DD-068), candidate
artifact metadata, repository structure for skill/agent contracts.

**Not sent:** raw user-entered bash commands (DD-076 hashes shape only),
file contents outside the proposal target, identifying user information.

### Audit deep (`/coherence:audit --deep`)

**Sent:** for each candidate pair, the bodies of the two sections under
analysis and the structured prompt at `prompts/v3/audit-consistency.md`.
Only invoked after explicit `--confirm-deep <signature>` (or
`--no-confirm` in CI). The pair list signature stops accidental cost
spend.

**Not sent:** sections outside the candidate pair list, project source
beyond the section bodies.

### Authentication

Coherence supports two auth paths for live LLM calls (v1.0.1+):

1. **Subscription auth (default for Claude Code users).** When the
   `claude` CLI is authenticated against a Claude.ai paid plan,
   coherence's LLM transport uses that session via
   `@anthropic-ai/claude-agent-sdk`. **No `ANTHROPIC_API_KEY` is
   required.** No env var is touched. Auth lives entirely in the
   CLI's own credential storage.
2. **API key.** If `ANTHROPIC_API_KEY` is set in the environment, the
   SDK reads it and uses direct API-key auth. The key is read from
   the environment only and is **never** persisted to disk in any
   coherence state file (NFR-SECURITY-3).

The runtime picks whichever auth source is available; explicit env
overrides (`COHERENCE_AUTHOR_LIVE=1` / `COHERENCE_AUTHOR_MOCK=1`)
short-circuit the detection if needed.

## Local storage

All coherence state stays under `.claude/coherence/` (gitignored) or
under `coherence/` (committed team state). The full inventory lives in
[state-files.md](state-files.md); the privacy-relevant subset:

| File | Content | Retention |
| ---- | ------- | --------- |
| `drift-buffer.json` | Section hashes only — no raw content (NFR-PRIVACY-4) | Cleared after each Stop run |
| `cost-ledger.json` | Per-call USD + tokens + timestamps + stage label | Session-scoped; manual deletion |
| `metrics.jsonl` | Event type, session id (non-identifying), `_ts` | 90-day rolling window (NFR-OBS-2) |
| `coherence-log.md` | Patch summaries + git refs | Append-only, never rotated (NFR-OBS-1) |
| `section-index.json` | File paths, line numbers, content hashes | Rebuilt on SessionStart |
| `section-symbol-index.json` | sectionRef → code-symbol tokens | Lazy cache; invalidated on hash change |
| `trust-ledger.json` | Per-section accept / edit / revert event log | LRU-capped (200/section); survives re-install |
| `signal-cache.json` | LRU signal buckets (DD-068 privacy-safe shapes) | **Gitignored** under NFR-PRIVACY-N5; never serialised under `coherence/` |
| `quarantine/` | Files that failed schema validation | Manual deletion |

Raw section content is loaded from disk during Stage 2 / audit-deep
processing and exists only in memory during the pipeline run. It is
not written to any state file.

## Telemetry catalogue (FR-OBS-N4 / FR-TELEMETRY-1)

Coherence emits structured events to `metrics.jsonl` on the local disk
only. **No event leaves the machine** unless the developer explicitly
runs `/coherence:export-metrics` (writes a file) or
`/coherence:share-metrics` (legacy v0.1 writes a file). Per DD-117 no
network egress is ever initiated by coherence itself; uploads go via a
user-typed `curl` command if at all.

The full event catalogue is enumerated in
[state-files.md → `metrics.jsonl`](state-files.md#metricsjsonl). Every
event payload is bounded and privacy-safe by construction:

- `sectionRef` is `path#anchor` form, the same identifier used in every
  pipeline stage.
- `session_id` is a non-identifying random id minted per SessionStart.
- `author_hash` is the 12-hex SHA-256 of lowercased
  `git config user.email` (DD-107). Raw email is **never** persisted.
- Signal-detector payloads (DD-076 / DD-077 / DD-078) carry shape
  fingerprints, not raw bash text or file contents.
- LLM cassette IDs are sha256-derived; cassette payloads are never
  emitted as telemetry.

## Consent (DD-115 / DD-127)

Two-tier consent:

| Tier | Default | Knob |
| ---- | ------- | ---- |
| Local collection | **ON** (opt-OUT) | `/coherence:consent --local off` |
| Upload | **OFF** (opt-IN) | `/coherence:consent --upload on` |

The first-run prompt is replaced (in v0.4+) by the
`/coherence:consent` slash command because Claude Code hooks run
without a TTY. Choices persist in `.claude/coherence/config.json#telemetry`.
Non-interactive shells take defaults silently and re-prompt next
interactive session.

`/coherence:export-metrics` writes redacted JSONL to a user-chosen
path. Only when **upload consent** is granted does the command print a
copy-paste curl line — coherence itself never issues the request.
`--out` paths outside `projectRoot` require `--allow-out-of-tree`
(NFR-PATH-SANDBOX).

## Author hashing (DD-107)

Plan-store entries (`coherence/plans/...`) and team-aggregate trust
files (`coherence/trust/<author-hash>.json`) key on a 12-hex SHA-256 of
lowercased `git config user.email`. The hash is deterministic across
machines + time for the same email. Display names (from
`git config user.name`) may surface in **interactive CLI output**
(plan-author shown in `/coherence:plan create` etc.) with ANSI control
sequences stripped (audit-3 S7 sanitisation), but display names are
**never persisted** to plan files or trust files.

## Path sandbox (NFR-PATH-SANDBOX, DD-128)

`/coherence:metrics --out` and `/coherence:export-metrics --out` reuse
a single sandbox helper that refuses paths outside `projectRoot`
unless `--allow-out-of-tree` is explicitly passed. The bypass logs a
stderr warning. The cross-the-boundary `/coherence:propose accept`
write target is similarly bounded to known kind-specific paths
under `.claude/` (DD-082).

## Ignore semantics

Two-file additive ignore (DD-096):

- `coherence/ignore` (committed) — team-shared, applied to every
  developer's scan.
- `coherence/ignore.local` (gitignored) — personal, composes
  additively at scan time.

The `.gitignore` patcher (`/coherence:ignore-split`) emits per-developer
lines (`signal-cache.json`, `session-map.json`,
`.claude/coherence/`) so personal state never escapes into committed
team files (NFR-PRIVACY-N5).

## OWASP / security commitments

- **A02 (Cryptographic Failures)** — API key never persisted
  (NFR-SECURITY-3).
- **A01 (Broken Access Control)** — path traversal blocked
  (NFR-SECURITY-2, SG-2); cross-the-boundary writes go through a
  token-gated operator (DD-065, SG-3).
- **A03 (Injection)** — prompt-injection detection
  (NFR-SECURITY-7) + the v0.2 quarantine boundary.
- **Network egress** — only `src/llm/client.ts` makes outbound HTTPS
  calls; an M-ARCH-1 static-analysis gate enforces "no other module
  imports a network API, references global network constructors, or
  embeds non-Anthropic HTTPS URLs" (NFR-PRIVACY-3).

## Release signing

Release tarballs published to GitHub Releases are signed with Sigstore
`cosign` keyless OIDC. See [SECURITY.md](../SECURITY.md) for the
disclosure policy and the README `## Verification` section for the
`cosign verify-blob` command.
