# Coherence

> Package name: `cohrence` · Brand name: Coherence · Slash command
> namespace: `/coherence:*` — same project, three labels.

A Claude Code plugin that detects documentation drift (when code
changes without updating its docs) and proposes surgical patches via a
two-stage LLM pipeline. It runs as a set of Claude Code hooks +
slash commands; team-distributable surfaces live as committed files
under `coherence/` (no backend, ever).

- **Detects** drift through PostToolUse signal capture + a SessionStart
  trickle scan; surfaces proposals on demand.
- **Plans** repairs via a Stage 1 canonical-selection LLM call
  (claude-sonnet-4-5).
- **Writes** patches via a Stage 2 patch-writer LLM call with
  deterministic validation: format → apply → change-class recount →
  line-count ratio → prompt injection → hallucination grep → asserts.
- **Auto-applies** patches in Graduated mode with a per-section trust
  gate; never auto-applies destructive or frontmatter changes.
- **Validates** documentation contracts via `asserts:` frontmatter
  with 7 engines (text-pattern + codebase-linked).
- **Audits** the corpus with a free-tier bundling report + flag-gated
  LLM cross-section consistency pass.
- **Signs** releases with Sigstore `cosign` keyless OIDC via GitHub
  Actions; verifiable via Rekor.

## Install

```bash
claude plugin install cohrence    # Anthropic plugin registry (canonical)
```

For local development:

```bash
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install
npm run build
```

The plugin manifest is [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json).

## Capabilities

### Drift detection + repair

```bash
/coherence:status            # mode, buffer, costs, recent activity
/coherence:review            # run the Stop pipeline mid-session
/coherence:review --estimate # Stage 1 only — group/section count
/coherence:doctor            # probe host capabilities
/coherence:repair            # fix anchor collisions, state drift, trust orphans
/coherence:recover           # clear auto-disable sentinel, reset locks
```

Anchor format: HTML comment pairs in any Markdown file —

```markdown
<!-- coherence:section id="install" -->
## Install

...

<!-- /coherence:section -->
```

GitHub-slug heading fallback with `-1` / `-2` disambiguation when an
explicit `id="..."` is absent. Fenced code blocks are skipped during
scan (R-18).

### Modes (per-directory)

```bash
/coherence:graduate                       # global → Graduated
/coherence:graduate annotate docs/        # annotate mode for docs/
/coherence:graduate author                # author mode (signal detectors fire)
/coherence:graduate --revert              # → Observe
/coherence:graduate --status              # effective mode for cwd
```

| Mode       | Behaviour |
| ---------- | --------- |
| Observe    | Watch + propose for review; never auto-apply.                                    |
| Annotate   | Detect anchor-less Markdown; propose anchor placement (DD-069).                  |
| Author     | Three signal detectors fire (bash repetition, file-creation patterns, agent corrections) and seed Author LLM proposals into the DD-065 quarantine boundary.  |
| Graduated  | Additive patches auto-apply; modifying patches gated by trust score ≥ 0.85; destructive + frontmatter always require confirmation.  |

### Proposals (cross-the-boundary)

Net-new artifacts (skills, agents, slash commands, annotations) land
in `.claude/coherence/proposals/<kind>/<id>/`. Nothing reaches
user-owned paths (`.claude/skills/`, etc.) without an explicit
cross-the-boundary write (DD-065 / SG-3 — token-gated, statically
asserted by `tests/security/v0.2/sg-3-no-out-of-quarantine-write.test.ts`).

```bash
/coherence:propose-list
/coherence:propose-show <id>
/coherence:propose-accept <id>             # user-typed accept
/coherence:propose-accept <id> --rename    # suffix on collision
/coherence:propose-reject <id>
/coherence:propose-revert-acceptance <id>  # undo (DD-083)
/coherence:annotate docs/intro.md          # ad-hoc annotate proposal
/coherence:de-annotate docs/intro.md       # strip or graduate auto-annotations
```

### Trust ladder

A per-developer, per-section accept/edit/revert event log at
`.claude/coherence/trust-ledger.json` drives the auto-apply gate for
modifying patches. The score is the DD-138 weighted accept rate with
a 30-day half-life decay (`ALPHA = 0.977`):

```
numerator   = Σ ev.weight   × ALPHA^ageDays   (accept=+1, revert=−1, edit=0)
denominator = Σ ev.denWeight × ALPHA^ageDays   (accept=1,  revert=1,  edit=0.5)
score       = numerator / denominator           (0 when |denominator| < 0.001)
```

LRU-capped at 200 events/section, sorted ascending by `_ts`.
Concurrent `recordEvent` calls are serialised by an in-process
per-ledger mutex (M-LEDGER-1).

```bash
/coherence:trust                              # 5-section status report
/coherence:trust sync                         # write coherence/trust/<author-hash>.json
/coherence:trust --promote --auto-land annotate,skill
/coherence:trust --prune-stale --yes
```

**Promote eligibility** (FR-TRUST-4) requires all three of:

- at least one section with score ≥ 0.85,
- ≥ 5 distinct sections with score > 0,
- ledger spans ≥ 30 days from the earliest event.

Once promoted, SessionStart auto-accepts surfaced proposals whose
`kind` is in `auto_land_kinds`; kinds outside that set still require
explicit `/coherence:propose-accept` (DD-065 preserved).

**Team aggregate** at `coherence/trust/<author-hash>.json` (committed)
is the arithmetic mean across active contributors (180-day staleness
filter). A section is `contested` when ≥ 2 contributors disagree AND
`|aggregate| < 0.2`.

### `asserts:` frontmatter validation

Per-file validation contracts in YAML frontmatter:

```yaml
---
asserts:
  - { type: has_example,            policy: block }
  - { type: min_words, param: '50', policy: warn  }
  - { type: symbol_exists, param: 'runStopOrchestrator', policy: block }
  - { type: file_exists,   param: 'src/pipeline/stop.ts' }
---
```

Seven engines:

- **Text-pattern** (sync): `has_example`, `no_placeholder_links`,
  `max_words:<N>`, `min_words:<N>`, `no_todo_comments`.
- **Codebase-linked** (async, fast-glob + parallel batched reads with
  short-circuit, per-session file-list cache by language):
  `symbol_exists[:lang]`, `file_exists`.

Each assertion carries `policy: 'block' | 'warn'` (default `warn`).
Block violations escalate the patch to ESCALATE; warn violations
attach to the review UX. Cap of 10 assertions per section with one
combined stderr warning per (section, session). Integration point is
`src/pipeline/stage2.ts` after the hallucination check.

### Quality metrics + deep audit

```bash
/coherence:metrics                                   # 5-section quality report
/coherence:metrics --since 2026-04-01 --revert-threshold 15
/coherence:metrics --out report.md                   # sandboxed; --allow-out-of-tree to escape

/coherence:audit                                     # free tier + token-budget classifier
/coherence:audit --deep                              # prints candidate pairs + 12-char signature
/coherence:audit --deep --confirm-deep <sig>         # invokes the LLM consistency pass
/coherence:audit --deep --no-confirm                 # CI-only (requires CI=true)
/coherence:audit --deep --sections sec1,sec2         # narrow the candidate pair set
```

`/coherence:metrics` sections: summary (5 event types × all-time +
30-day windows), top drifting sections (with contested flag from team
aggregate), trust scores (top 10 high + 10 low with team aggregate
column), 30-day cost-trend Unicode sparkline, revert hotspots.

`/coherence:audit` free tier classifies each section by token count:
`< 2000` Normal, `2000..5000` ⚠ Large, `> 5000` ❌ Bloated
(`ceil(content_length_chars / 4)`).

`/coherence:audit --deep` is two-step: the first call computes the
candidate pair list and a sha256 signature, the second call replays
that signature back to authorise the LLM call. Symbol extraction
rejects English-word noise — only identifiers with shape markers
(underscore, digit, internal capital, or backtick wrapper) qualify.
LLM calls flow through `src/llm/cassette.ts` so tests replay
deterministically.

### Team workflows

```bash
/coherence:ignore-split                                       # two-file additive ignore
/coherence:scope-debug src/handlers/x.ts                      # ancestor walk + scope chain
/coherence:plan-create <kind> <title> [--body <markdown>]     # cross-team plan store
/coherence:plan-accept <branch-sha> <plan-id>
/coherence:plan-reject <branch-sha> <plan-id> <reason>
/coherence:export-metrics                                     # writes redacted JSONL
/coherence:export-metrics --anonymized --since 2026-05-01
/coherence:consent                                            # view consent state
/coherence:consent --local on|off  --upload on|off  --reset
/coherence:install-statusline                                 # OSC 8 / OSC 52 / plain badge
/coherence:uninstall-statusline                               # restore previous settings.json
```

Plans live as committed JSON under
`coherence/plans/<branch-sha-12>/<plan-id>.json` with deterministic
IDs derived from `branch_sha + author_hash + title + created_at`
(DD-099 amended). Author identity is the 12-hex SHA-256 of
`git config user.email` (DD-107); raw emails are never persisted.

### Cosign-signed releases

Release tarballs published to GitHub Releases are signed with Sigstore
`cosign` keyless OIDC. The README `## Verification` section below is
regenerated from `package.json#repository.url` so forks remain
fork-correct without code changes.

GitHub Actions `release.yml` runs on every `v*.*.*` tag with both
`id-token: write` (cosign OIDC) and `contents: write` (release upload)
permissions. See [SECURITY.md](SECURITY.md) for responsible disclosure.

## Architecture

```
src/hooks/                    Entry points — SessionStart, PostToolUse, Stop, etc.
src/pipeline/                 Stage 1 planner + Stage 2 patch writer + merge + bundle
src/detection/                Anchor scanning, section index, file discovery
src/validation/               Hallucination, plan validation, sanity, line ratio, prompt-injection
src/validation/assertions/    asserts: pipeline — 7 engines + policy + dispatcher
src/audit/                    Token budget classifier, lazy symbol-index cache, --deep LLM pass
src/state/                    Atomic state store, schemas, locks, sentinels, trust ledger, team aggregate, plan store
src/llm/                      LLM client, cassette (record/replay), cost ledger (DD-085 tri-partition budget)
src/git/                      Git adapter, coherence commits
src/commands/                 Slash commands (all of them)
src/subagent/                 Tracking, stats, window management, retro-reclassification
src/proposals/                DD-065 quarantine + store + expiry + auto-accept sweep
src/buffer/                   Content hash, lifecycle, velocity (revert detection)
src/permissions/              Permission gate, review assembly
src/scanner/                  DD-066 trickle deep-scan
src/proposers/                DD-069 annotate proposer
src/signal/                   DD-068 telemetry + bash/file/agent signal detectors
src/modes/                    DD-074 mode resolver
prompts/v2/                   Stage1/Stage2/author/annotate prompts
prompts/v3/                   audit-consistency.md for /coherence:audit --deep
bin/                          Statusline shell scripts (OSC 8 / OSC 52 / plain)
.claude-plugin/plugin.json    Plugin manifest (slashCommands, hooks, metadata)
.github/workflows/release.yml v*.*.* tag → cosign sign + GH release upload
```

The detailed state-file inventory lives in
[`docs/state-files.md`](docs/state-files.md). The full command reference
lives in [`docs/commands.md`](docs/commands.md).

## Architectural commitments (permanent)

Two stances govern the project in perpetuity:

- **No backend, ever (DD-117).** Cohrence is a file-only plugin.
  Cross-team plans live as committed files under `coherence/plans/`
  (git is the substrate). Telemetry is local JSONL +
  user-driven `curl` only. There is no project-side server, database,
  or hosted upload service.
- **No legacy version support (DD-118).** Each major version stands
  alone. No cross-major migrator, no `prompts/v1/` in the tarball,
  no rollback across a major bump. Major bumps may break the on-disk
  format; re-install rather than migrate. `.claude/coherence/`
  per-project state is preserved across plugin re-install.

## Ship-time gates

`npm run gates` runs the static-analysis + ship test projects. The
gate catalogue:

- **M-ARCH-1** (NFR-ARCH-1, DD-117) — no production module imports a
  network API, references global network constructors, or embeds
  non-Anthropic HTTPS URLs.
- **M-PRIVACY-1** (NFR-PRIVACY-N5, DD-109) — no codepath writes
  `signal-cache.json` or `session-map.json` under the committed
  `coherence/` root; the `.gitignore` patcher emits both lines.
- **M-LEGACY-1** (NFR-ARCH-2, DD-118) — `npm pack --dry-run` excludes
  legacy paths; tarball ≤ 10 MB; `dist/state/schemas/` non-empty
  post-build.
- **M-VALIDATE-1** (DD-122) — `claude plugin validate .` exits zero.
- **M-AUTOGEN-1** (DD-130) — every `slashCommands` entry has a
  `commands/<name>.md` stub with the
  `<!-- coherence-command: <name> -->` sentinel.
- **M-LEDGER-1..4** (TS-2 / TS-3, DD-138) — atomic writes under
  concurrent `recordEvent`, 180-day staleness filter, formula
  correctness within ±0.01, contested-flag derivation.
- **M-TRUST-1..4** — one-shot promote hint, `auto_land_kinds`
  persistence, destructive/frontmatter never auto-applied, per-kind
  auto-land scope.
- **M-ASSERTS-1..4** — block/warn policy semantics, 10-cap
  enforcement, unknown-type ignore.
- **M-METRICS-1..2** — 5-section render correctness and < 200 ms p95.
- **M-AUDIT-1..3** — token-budget tier boundaries, flag-based
  `--confirm-deep` cost gate, symbol-index cache hit + invalidation.
- **M-SIGN-1..3** — cosign keyless OIDC signing, GitHub Release
  upload, `SECURITY.md` + README `## Verification` block structurally
  complete.
- **M-REPAIR-1** — `/coherence:repair` orphan listing, symmetric
  `--reassociate`/`--to` flags, `--expire-orphans` bulk path.

NFR performance bounds (p95) verified empirically:

| Bound          | Target  | Measured |
| -------------- | ------- | -------- |
| `/coherence:metrics`        | < 200 ms | ~26 ms |
| `/coherence:trust --status` | < 200 ms | ~22 ms |
| `/coherence:audit` free     | < 100 ms | ~3 ms (1000-section index) |
| stop-hook `recordEvent`     | < 20 ms  | ~17.5 ms (100 affected sections) |

A meta-test (`tests/static-analysis/meta-gates-trip.test.ts`) re-runs
each gate against synthetic regressions to ensure the gate logic
itself isn't silently broken.

## Calibration

Detector thresholds (DD-076 / DD-077 / DD-078) are calibrated against
a synthetic corpus under `tests/fixtures/signal-corpora/`. The
`scripts/corpus-calibrate.mjs` framework (run via `npm run calibrate`)
sweeps a threshold grid, computes Wilson 95 % CI on the corpus, and
picks the config maximising `precision_lower_bound` while keeping
`recall ≥ 0.6`. Acceptance floor (DD-116): per-detector
`precision_wilson_lower ≥ 0.7`. Field calibration against real
`metrics.jsonl` becomes a future-version commitment once a distributed
version accumulates ≥ 50 sessions × ≥ 30 days observation.

## Test + build

```bash
npm run typecheck
npm test                  # full suite (unit / integration / e2e / security / perf / preconditions / rollback / schema / cost / static-analysis / ship)
npm run lint
npm run build             # tsc → render-readme-verification → copy-schemas → generate-command-stubs
npm run validate-plugin   # claude plugin validate .
npm run calibrate         # corpus-calibration sweep
npm run gates             # ship-time gates
```

## Verification

<!-- BEGIN: coherence-verification -->
> Release artifacts are signed with [Sigstore `cosign`](https://docs.sigstore.dev/) keyless OIDC.
> Verify the published tarball with:
>
> ```bash
> cosign verify-blob cohrence-1.0.1.tgz \
>   --signature cohrence-1.0.1.tgz.sig \
>   --certificate cohrence-1.0.1.tgz.pem \
>   --certificate-identity-regexp '^https://github.com/HUMBLEF0OL/coherence/\.github/workflows/release\.yml@refs/tags/v.*$' \
>   --certificate-oidc-issuer https://token.actions.githubusercontent.com
> ```
>
> A successful verification prints `Verified OK`. The certificate's Rekor
> transparency-log entry is searchable at <https://search.sigstore.dev/>.
> Gate names asserted at release time: `M-SIGN-1`, `M-SIGN-2`, `M-SIGN-3`.
<!-- END: coherence-verification -->

## Release history

Per-version release notes live as GitHub Releases:
<https://github.com/HUMBLEF0OL/coherence/releases>.

Implementation plans (one per major) are archived in Notion under the
**Coherence** project page: [Implementation Plans (archive)](https://www.notion.so/Implementation-Plans-archive-35f010d46a70810589c2f3736efd925a).
Each entry links to the full markdown in git history at `master/cb52271`.
