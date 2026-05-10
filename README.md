# Coherence

> Package name: `cohrence` · Brand name: Coherence · Slash command namespace:
> `/coherence:*`. Same project, three labels — see [DD-093](docs/v0.3/) for
> the rationale.

Claude Code plugin that detects documentation drift (when code changes
without updating its docs) and proposes surgical patches via a two-stage
LLM pipeline. v0.2 extends the plugin with proactive detection: it watches
for recurring user behaviour, anchor-less docs, and idle-window drift, and
surfaces proposals on demand through a sandboxed quarantine boundary.
**v0.3** extends to team workflows: monorepo scope-cache, two-file additive
ignore (committed + personal), cross-team plan store rooted at `coherence/`,
file-only metrics export with first-run consent, de-annotate + tombstone
ergonomics, and ship-time gates that enforce the **no-backend / no-legacy**
architectural commitments — see [Architectural commitments](#architectural-commitments-v03) below.

## Install

The canonical install path is the Anthropic plugin registry. For local
development:

```
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install
npm run build
```

Wire the plugin into your Claude Code config (see [plugin.json](plugin.json)).

## v0.2 walkthrough — Observe → Annotate → Author (DG-1)

Coherence v0.2 introduces a **mode lifecycle** with three levels of
proactivity. The default is `observe` — coherence does nothing beyond v0.1
healing. Promote per scope or globally.

### 1. Observe (default — v0.1 behaviour)

```
/coherence:status            → shows current mode + proposal counts
/coherence:graduate --status → shows the effective mode for the cwd
```

Coherence runs the v0.1 Stop pipeline (planner → patch → review). Nothing
new is proposed.

### 2. Annotate

```
/coherence:graduate annotate docs/   → switch docs/ to annotate mode
/coherence:annotate docs/intro.md    → ad-hoc annotate proposal
```

Coherence detects anchor-less markdown docs and proposes anchor placement
above each heading (DD-069 byte-for-byte format with `auto-annotated:
true` discriminator; sidecar fallback honoured). Proposals land in
**quarantine** (`.claude/coherence/proposals/annotate/<id>/`) and are
surfaced via `/coherence:propose-list`.

### 3. Author

```
/coherence:graduate author
```

Three privacy-safe-by-construction signal detectors fire:
- **bash repetition** (DD-076): same normalised command 3× in 30 minutes
- **file-creation pattern** (DD-077): 3 structurally similar files in
  the same directory (Jaccard ≥ 0.8)
- **agent correction** (DD-078): a subagent corrected ≥ 3 times in a
  7-day rolling window with aggregate line ratio ≥ 0.20

Each signal seeds an Author LLM proposal that materialises under
quarantine. **DD-065 quarantine boundary** is the load-bearing trust
constraint of v0.2: net-new skill / agent / command files never reach
`.claude/skills/`, `.claude/agents/`, `.claude/commands/`, or
`~/.claude/settings.json` without an explicit user-typed
`/coherence:propose-accept <id>`. Per-session cap: ≤ 3 proposals
(FR-AUTHOR-3).

### Reviewing and accepting

```
/coherence:propose-list                  → list queued + surfaced proposals
/coherence:propose-show <id>             → render artifact + manifest
/coherence:propose-accept <id>           → cross-the-boundary write
/coherence:propose-accept <id> --rename  → suffix on collision
/coherence:propose-accept <id> --overwrite <retyped-path>  → overwrite
/coherence:propose-reject <id>           → state → rejected
/coherence:propose-revert-acceptance <id>   → undo an accepted proposal
```

`/coherence:propose-accept` is the only operator that writes outside
`.claude/coherence/`. For `kind: 'slash_command'`, the accept also
appends an entry to `plugin.json` so Claude Code surfaces the new
command (D7). For `kind: 'annotate'`, the accept overwrites the source
doc named in the manifest (D2; the original is quarantined for safety).

### Statusline

```
/coherence:install-statusline   → installs the click-target badge
/coherence:uninstall-statusline → restores the previous settings.json
```

Renders an OSC 8 / OSC 52 / plain three-tier graceful degradation badge
showing surfaced-proposal counts. Cancellation-safe (single atomic read
of `.claude/coherence/state-snapshot.json`).

## Architecture (v0.2 deltas)

```
src/proposals/      DD-065 quarantine, manifest, store, expiry sweep
src/signal/         DD-068 telemetry + bash/file/agent detectors
src/modes/          DD-074 mode resolver
src/scanner/        DD-066 trickle deep-scan
src/proposers/      DD-069 annotate proposer
src/llm/            authorPipeline.ts (DD-067/091)
prompts/v2/         author/* + annotate/* prompts (claude-sonnet-4-5)
bin/                statusline shell scripts
docs/v0.2/          CHANGELOG, commands, state-files, rollback, privacy
```

See [docs/v0.2/CHANGELOG.md](docs/v0.2/CHANGELOG.md) for the full DD
register and gate inventory; [docs/v0.2/state-files.md](docs/v0.2/state-files.md)
for the v0.2 schemas; [docs/v0.2/privacy.md](docs/v0.2/privacy.md) for
the event redaction matrix.

## Rollback

- Statusline: `/coherence:uninstall-statusline`
- Accepted proposal: `/coherence:propose-revert-acceptance <id>`
- All quarantine state: `rm -rf .claude/coherence/proposals/`
- Disable plugin entirely: `touch .claude/coherence/DISABLED`

`/coherence:recover` rolls back **within** the current major version only
(DD-095 amended under DD-118). Cross-major-version rollback is not
supported — major-version bumps may break the on-disk format and users
re-install rather than migrate. See [Architectural commitments](#architectural-commitments-v03).

## Architectural commitments (v0.3+)

Two stances govern v0.3 onwards and are permanent (not deferred to a
future version):

- **No backend, ever (DD-117).** cohrence is a file-only plugin in
  perpetuity. Cross-team plans live as committed files under
  `coherence/plans/` (git is the substrate). Telemetry is local JSONL +
  user-driven `curl` only. There is no project-side server, database,
  or hosted upload service. Scaling beyond ~50-developer teams is not
  a project goal.
- **No legacy version support (DD-118).** Each major version stands
  alone. v0.3 ships fresh state on install — no v1→v2 / v2→v3 migrator,
  no `prompts/v1/` in the tarball, no rollback to a prior major version.
  Major-version bumps may break the on-disk format; re-install rather
  than migrate. v0.2 codebase remains as historical baseline; v0.3 is
  the next published version.

## Calibration

Detector thresholds (DD-076/077/078) are calibrated against a synthetic
corpus under `tests/fixtures/signal-corpora/`. The
`scripts/corpus-calibrate.mjs` framework (run via `npm run calibrate`)
sweeps a threshold grid, computes Wilson 95 % CI on the corpus, and
picks the config maximising `precision_lower_bound` while keeping
`recall ≥ 0.6`. Acceptance floor (DD-116): per-detector
`precision_wilson_lower ≥ 0.7`. Field-calibration against real
`metrics.jsonl` becomes a future-version commitment once a distributed
version accumulates ≥ 50 sessions × ≥ 30 days observation.

## Test + build

```
npm run typecheck
npm test          # full suite across unit / integration / e2e / security / perf / preconditions / rollback / schema / cost / static-analysis / ship
npm run lint
npm run build
npm run calibrate # corpus-calibration sweep (DD-116, DD-092 amended)
npm run gates     # v0.3 ship-time gates (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1)
```

## v0.3 walkthrough — Team workflows

v0.3 adds team-distributable surfaces on top of the v0.2 lifecycle. The new
slash commands are read-only or idempotent so they're safe to chain into any
session.

### Monorepo scope-cache (G-3)

```
/coherence:scope-debug src/handlers/x.ts
```

Walks ancestor `CLAUDE.md` and `coherence/scope.json` files (depth cap 8),
prints the resolved scope chain, and reports cache hit/miss + age. Powered by
`src/state/scope/{walker,resolver,cache}.ts`. Cold-start budget ≤ 200 ms p95
on a 100-package monorepo (NFR-PERF-N4); telemetry sampled 1:100 via
`scope_cache_miss`.

### Two-file additive ignore (G-2)

```
/coherence:ignore-split   # idempotent — creates coherence/ignore + coherence/ignore.local + .gitignore line
```

`coherence/ignore` is committed (team-shared); `coherence/ignore.local` is
gitignored (personal). Both are merged additively at scan time. When a
teammate's commit to `coherence/ignore` matches a queued proposal's anchor,
the FSM transitions to `ignored_by_team` and emits the
`proposal_ignored_by_team` telemetry event (DD-088 amended).

### Cross-team plan store (G-4)

`coherence/plans/<branch-sha-12>/<plan-id>.json` files capture team plans —
proposals, decisions, directives — as committed artifacts. Plan ids derive
deterministically from `branch_sha + author_hash + title + created_at` so two
parallel branches never collide (DD-099 amended; DD-107; DD-108). Author
identity is hashed (12-hex SHA-256 of `git config user.email`) and never
serialised in clear text. `/coherence:doctor` flags any plan older than 7
days.

### Metrics export + first-run consent (G-5)

```
/coherence:export-metrics                              # writes redacted metrics-export-<ts>.jsonl in cwd
/coherence:export-metrics --since 2026-05-01           # filter by ISO timestamp
/coherence:export-metrics --anonymized                 # also hash proposal_id / signal_hash / session_id
```

Consent is two-tier (DD-115): **local collection** is opt-OUT (default ON),
**upload** is opt-IN (default OFF). The first-run prompt persists the choices
in `.claude/coherence/config.json#telemetry`; non-interactive shells take
defaults and re-prompt next interactive session. Per DD-117, v0.3 NEVER
initiates a network request — `/coherence:export-metrics` only writes a file
and prints a copy-paste curl line iff upload consent is granted.

### De-annotate + tombstone (G-6/G-8)

```
/coherence:de-annotate docs/intro.md                            # strip auto-annotated blocks
/coherence:de-annotate docs/intro.md --keep-as-user-anchor      # graduate to user-owned
/coherence:de-annotate docs/ --scope per-directory              # apply to a directory
/coherence:de-annotate '*' --scope global                       # apply project-wide
```

The decision persists in `graduation.json#de_annotate` so future trickle scans
honour it. The companion **tombstone** (DD-103) is a per-file scan-cache
entry keyed by normalised path; mtime advancement evicts entries; LRU at 5,000.
Composes with the v0.2 P7 doc-content memo so a tombstone hit + memo match
skips the disk re-read.

### Ship-time gates (M6)

`npm run gates` runs three static-analysis checks:

- **M-ARCH-1** (NFR-ARCH-1, DD-117) — no production module imports a network
  API, references global network constructors, or embeds non-Anthropic HTTPS URLs.
- **M-PRIVACY-1** (NFR-PRIVACY-N5, DD-109) — no codepath writes
  `signal-cache.json` or `session-map.json` under the committed `coherence/`
  root; the `.gitignore` patcher emits both lines.
- **M-LEGACY-1** (NFR-ARCH-2, DD-118) — `npm pack --dry-run` excludes any
  path under `prompts/v1/` and `src/state/migrate/v1_to_v2.ts`; tarball ≤
  10 MB; `dist/state/schemas/` is non-empty post-build.

A round-2 P7 meta-test (`tests/static-analysis/meta-gates-trip.test.ts`)
re-runs each gate against synthetic regressions to ensure the gate logic
itself isn't silently broken.
