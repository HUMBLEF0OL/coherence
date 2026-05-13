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
**v0.4** is the first-impressions polish + marketplace structural release:
official Anthropic plugin manifest layout (`.claude-plugin/plugin.json`),
telemetry-gated trigger contracts, `/coherence:consent` without a TTY,
`/coherence:audit` bundling, `--out` path sandboxing, and `parseMajor`
correctness for ≥ 1.0.0 versions.
**v1.0** is the trust + intelligence release: per-section trust ladder
(`/coherence:trust`) with cross-session team aggregate, `asserts:` frontmatter
validation pipeline (7 engines, `block`/`warn` policy), 5-section quality
metrics report (`/coherence:metrics`), `/coherence:audit --deep` LLM
cross-section consistency pass with flag-based cost gate, and Sigstore
`cosign` keyless OIDC release signing — see
[docs/v1.0/CHANGELOG.md](docs/v1.0/CHANGELOG.md) and
[RELEASE_NOTES_v1.0.0.md](RELEASE_NOTES_v1.0.0.md).

## Install

The canonical install path is the Anthropic plugin registry. For local
development:

```
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install
npm run build
```

Wire the plugin into your Claude Code config (see [.claude-plugin/plugin.json](.claude-plugin/plugin.json)).

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

## Architecture (per-version deltas)

**v0.2** (DD-065 quarantine + DD-068 signals + Author pipeline):

```
src/proposals/                 DD-065 quarantine, manifest, store, expiry sweep
src/signal/                    DD-068 telemetry + bash/file/agent detectors
src/modes/                     DD-074 mode resolver
src/scanner/                   DD-066 trickle deep-scan
src/proposers/                 DD-069 annotate proposer
prompts/v2/                    author/* + annotate/* prompts (claude-sonnet-4-5)
bin/                           statusline shell scripts
```

**v0.3** (team workflows):

```
src/state/scope/               DD-097 walker + resolver + cache
src/state/plans/               DD-099 cross-team plan store
src/state/scope/               DD-117 file-only telemetry export
```

**v0.4** (marketplace structural):

```
.claude-plugin/plugin.json     DD-122 manifest relocation
src/state/triggerContracts.ts  DD-129 TC-1 + TC-2 hint contracts
src/state/refuseLegacy.ts      DD-122 refuseLayout for old plugin.json shapes
commands/<name>.md             DD-130 autogen stubs from manifest
src/hooks/commandDispatch.ts   DD-130 sentinel dispatch
```

**v1.0** (trust + intelligence):

```
src/state/trustLedger.ts       TS-2/DD-138 personal trust ledger
src/state/teamAggregate.ts     TS-3 team aggregate from coherence/trust/*.json
src/state/schemas/trust-ledger.schema.json
src/state/schemas/team-aggregate.schema.json
src/commands/trust.ts          /coherence:trust (TS-5)
src/commands/metrics.ts        /coherence:metrics 5-section renderer
src/validation/assertions/     TS-4 asserts: pipeline (7 engines)
src/audit/tokenBudget.ts       FR-AUDIT-2 token-budget classifier
src/audit/sectionSymbolIndex.ts  lazy symbol-index cache (M-AUDIT-3)
src/audit/deepConsistency.ts   /coherence:audit --deep flag-gated LLM pass
src/proposals/autoAcceptSweep.ts  FR-TRUST-3 net-new auto-accept sweep
prompts/v3/audit-consistency.md  LLM consistency prompt
SECURITY.md                    coordinated disclosure (M-SIGN-3)
scripts/render-readme-verification.mjs  README ## Verification regen
scripts/release-ga.mjs         + runSignStep (cosign keyless OIDC)
.github/workflows/release.yml  v*.*.* tag → sign + upload pipeline
docs/v1.0/                     CHANGELOG, commands, state-files, privacy, rollback
```

See [docs/v0.2/CHANGELOG.md](docs/v0.2/CHANGELOG.md),
[docs/v0.3/CHANGELOG.md](docs/v0.3/), [docs/v0.4/CHANGELOG.md](docs/v0.4/CHANGELOG.md),
and [docs/v1.0/CHANGELOG.md](docs/v1.0/CHANGELOG.md) for full per-version
DD registers and gate inventories.

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

## v0.4 walkthrough — First-impressions polish

v0.4 is a structural + ergonomics release on top of the v0.3 team workflow layer.

### Manifest layout (G-1, DD-119)

`plugin.json` has moved to `.claude-plugin/plugin.json` per the official Anthropic plugin schema.
`${CLAUDE_PLUGIN_ROOT}` is now used for internal paths; `${CLAUDE_PLUGIN_DATA}` for per-installation
state. **Users upgrading from v0.3 must re-install** — no migration is provided (DD-118 / DD-122).

```bash
claude plugin install cohrence   # canonical install via Anthropic registry
```

On SessionStart, if `plugin.json` is found at the plugin install root (v0.3 layout), coherence
refuses and prints a re-install prompt. `.claude/coherence/` (per-project state) is preserved.

### Consent without a TTY (G-2, DD-127)

```
/coherence:consent                # print current consent state
/coherence:consent --local on     # enable local hashed event collection
/coherence:consent --upload off   # disable curl export hint
/coherence:consent --reset        # restore silent defaults
```

Because Claude Code hooks run without a TTY, v0.4 replaces the interactive consent prompt with an
explicit command. Prior defaults (local ON, upload OFF) are unchanged.

### Audit bundling (G-2, DD-125)

```
/coherence:audit
```

Runs `/coherence:doctor`, `/coherence:scope-debug`, `/coherence:status`, and
`/coherence:export-metrics` in sequence and renders a single Markdown report. Failures in any
sub-command are captured as `[error: ...]` rather than aborting the report. Deep audit ships v1.0.

### Trigger contracts TC-1 / TC-2 (G-3, DD-129)

v0.4 ships the *trigger contracts* that let two deferred capabilities fire automatically when field
telemetry crosses thresholds — without a code release:

- **TC-1** — author-planner promotion hint: fires when ≥ 25 % of accepted patches are cross-kind
  AND the window spans ≥ 30 days. Prints a one-time hint to enable `author` mode and sets
  `trigger-state.json#tc1_hint_emitted_at`. Never repeats.
- **TC-2** — calibration re-tune hint: fires when ≥ 50 sessions × ≥ 30 days have accumulated.

Both read `metrics.jsonl` locally; no events are emitted for the threshold crossing itself.

### parseMajor fix (G-4, DD-122, DD-124)

`parseMajor()` now uses the SemVer major digit only. Prior versions conflated minor into major
(`major × 1000 + minor`), causing cross-major refusal between `0.x` versions. All `0.x.y` installs
are the same major bucket. Cross-major recovery refusal in `/coherence:recover --target <tag>` only
fires when the SemVer major digit differs (e.g. `v0.x` → `v1.0`).

---

## v1.0 walkthrough — Trust + intelligence

v1.0 layers cross-session learning on top of the v0.2 quarantine boundary
and the v0.4 marketplace shape. The four new surfaces are
`/coherence:trust`, `/coherence:metrics`, `/coherence:audit --deep`, and
the extended `/coherence:repair` orphan flags. Release tarballs are now
signed with Sigstore cosign keyless OIDC.

### 1. Personal trust ledger (M0, TS-2, DD-138)

Coherence keeps a per-developer per-section accept/edit/revert event log
at `.claude/coherence/trust-ledger.json` (gitignored; survives plugin
re-install). The score is the DD-138 weighted accept rate with a 30-day
half-life decay (`ALPHA = 0.977`):

```
numerator   = Σ ev.weight   × ALPHA^ageDays   (accept=+1, revert=−1, edit=0)
denominator = Σ ev.denWeight × ALPHA^ageDays   (accept=1,  revert=1,  edit=0.5)
score       = numerator / denominator  (returns 0 when |denominator| < 0.001)
```

LRU-capped at 200 events per section, sorted ascending by `_ts`.
Recompute happens lazily when the cached summary is older than the
newest event timestamp. Concurrent `recordEvent` calls are serialised
by an in-process per-ledger mutex so the read-modify-write cycle can't
lose events under contention (M-LEDGER-1).

### 2. Trust ladder + /coherence:trust (M1, TS-3/TS-5)

```bash
/coherence:trust                              # 5-section status report
/coherence:trust sync                         # write coherence/trust/<author-hash>.json
/coherence:trust --promote --auto-land annotate,skill
/coherence:trust --prune-stale --yes
```

The status report has five sections: current trust state, top 5 highest
personal scores, top 5 lowest personal scores, team aggregate summary
(file count, active contributors, contested sections), and promote
eligibility. **Eligibility requires all three** of: at least one section
with score ≥ 0.85, ≥ 5 distinct sections with score > 0, and ledger
spanning ≥ 30 days from the earliest event (FR-TRUST-4).

The stop pipeline's auto-apply gate is amended per DD-131:

| `changeClass`  | Behaviour                                                                  |
| -------------- | -------------------------------------------------------------------------- |
| `additive`     | auto-applies (v0.2 carry)                                                  |
| `modifying`    | auto-applies **iff** `getSectionScore(sectionRef) ≥ 0.85`                  |
| `destructive`  | **always** requires confirmation regardless of score                       |
| `frontmatter`  | **always** requires confirmation regardless of score                       |

When a developer has run `/coherence:trust --promote --auto-land <kinds>`,
SessionStart sweeps surfaced proposals; those whose `kind` is in
`auto_land_kinds` are auto-accepted through the existing token-gated SG-3
boundary (security model unchanged). Kinds outside that set still require
explicit `/coherence:propose-accept` (DD-065 preserved).

Team aggregate (`coherence/trust/<author-hash>.json`, committed) is
computed as the arithmetic mean across active contributors (≤ 180-day
staleness filter). A section is flagged `contested` when ≥ 2
contributors disagree and `|aggregate| < 0.2`.

### 3. asserts: frontmatter validation (M2, TS-4)

Authors can add per-file validation contracts to a section file's YAML
frontmatter:

```yaml
---
asserts:
  - { type: has_example,            policy: block }
  - { type: min_words, param: '50', policy: warn  }
  - { type: symbol_exists, param: 'runStopOrchestrator', policy: block }
  - { type: file_exists,   param: 'src/pipeline/stop.ts' }
---
```

Seven engines ship:

- **Text-pattern** (sync): `has_example`, `no_placeholder_links`,
  `max_words:<N>`, `min_words:<N>`, `no_todo_comments`.
- **Codebase-linked** (async, `fast-glob` + parallel batched reads with
  short-circuit, per-session file-list cache by language):
  `symbol_exists[:lang]`, `file_exists`.

Each assertion has a `policy: 'block' | 'warn'` (default `warn`). Block
violations escalate the patch to ESCALATE; warn violations attach to the
review UX. Cap of 10 assertions per section with one combined stderr
warning per (section, session). Integration point is
`src/pipeline/stage2.ts` after the hallucination check.

### 4. /coherence:metrics + /coherence:audit --deep (M3, TS-6)

```bash
/coherence:metrics                             # 5-section quality report
/coherence:metrics --since 2026-04-01 --revert-threshold 15
/coherence:metrics --out report.md             # sandboxed; --allow-out-of-tree to escape

/coherence:audit                               # free tier + token-budget classifier
/coherence:audit --deep                        # prints pair list + 12-char signature, no LLM call yet
/coherence:audit --deep --confirm-deep <sig>   # invokes the LLM consistency pass
/coherence:audit --deep --no-confirm           # CI-only (requires CI=true)
```

`/coherence:metrics` sections: summary (5 event types × all-time + 30-day
windows), top drifting sections (with contested flag from team
aggregate), trust scores (top 10 high + 10 low, with team aggregate
column), 30-day cost-trend Unicode sparkline, revert hotspots.

`/coherence:audit` free tier adds a section-token-budget classifier:
`< 2000` Normal, `2000..5000` ⚠ Large, `> 5000` ❌ Bloated (with a
"consider splitting" hint). Estimates use `ceil(content_length_chars/4)`.

`/coherence:audit --deep` first prints candidate pairs (≤ 10) with a
sha256 signature; the second invocation passes that signature back so
the LLM call is intentional and idempotent. The signature is computed
from the pair list; if the underlying index changes between calls, the
signature drifts and the user must re-run without `--confirm-deep`.
Live LLM calls flow through `src/llm/cassette.ts` keyed by
`audit-deep-<sha256(audit_deep|a|b|signature)[:16]>`, so test runs replay
deterministically. The symbol-extraction step rejects English-word
noise (only identifiers with shape markers — underscore, digit, internal
capital, or backtick wrapper — make the cut).

### 5. Cosign-signed releases (M4, TS-7)

```bash
cosign verify-blob cohrence-1.0.0.tgz \
  --signature cohrence-1.0.0.tgz.sig \
  --certificate cohrence-1.0.0.tgz.pem \
  --certificate-identity-regexp '^https://github.com/HUMBLEF0OL/coherence/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

GitHub Actions `release.yml` runs on every `v*.*.*` tag with both
`id-token: write` (cosign keyless OIDC) and `contents: write` (release
upload) permissions. The Rekor transparency-log entry is searchable at
<https://search.sigstore.dev/>. See [SECURITY.md](SECURITY.md) for the
responsible-disclosure policy.

### 6. /coherence:repair trust-orphan flags (M4, FR-REPAIR-1)

```bash
/coherence:repair                                       # default — lists orphan keys
/coherence:repair --reassociate <oldRef> --to <newRef>  # atomic key move
/coherence:repair --expire-orphans                      # bulk-drop orphans
```

Orphans are trust-ledger keys whose `sectionRef` no longer appears in
the current `section-index.json` (typically after an anchor rename or
file deletion). Each flag branch writes a `coherence-log.md` entry; the
`--expire-orphans` summary lists up to 20 refs with a `… and N more`
tail. The `--reassociate` and `--to` flags are symmetric — each
requires the other.

See [docs/v1.0/CHANGELOG.md](docs/v1.0/CHANGELOG.md) for the per-milestone
FR coverage with DD references; [docs/v1.0/commands.md](docs/v1.0/commands.md)
for the full command reference; [docs/v1.0/state-files.md](docs/v1.0/state-files.md)
for the trust-ledger and team-aggregate schemas;
[docs/v1.0/privacy.md](docs/v1.0/privacy.md) for the new telemetry events;
[docs/v1.0/rollback.md](docs/v1.0/rollback.md) for the v0.4 → v1.0
re-install path.

---

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
npm run validate-plugin  # v0.4 manifest validation (claude plugin validate)
npm run calibrate        # corpus-calibration sweep (DD-116, DD-092 amended)
npm run gates            # ship-time gates (M-ARCH-1, M-PRIVACY-1, M-LEGACY-1, M-TRIPLEX-1)
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
`scope_cache_miss`. PostToolUse populates the cache on the hot path so the
first edit to a file warms the entry for every subsequent tool call in the
session.

### Two-file additive ignore (G-2)

```
/coherence:ignore-split   # idempotent — creates coherence/ignore + coherence/ignore.local + .gitignore line
```

`coherence/ignore` is committed (team-shared); `coherence/ignore.local` is
gitignored (personal). Both are merged additively at scan time. SessionStart
runs the team-ignore FSM sweep: when a teammate's commit to
`coherence/ignore` matches a queued annotate proposal's `target_path`,
the FSM transitions the proposal to `ignored_by_team` and emits the
`proposal_ignored_by_team` telemetry event (DD-088 amended).

### Cross-team plan store (G-4)

```
/coherence:plan-create <kind> <title> [--body <markdown>]
/coherence:plan-accept <branch-sha> <plan-id>
/coherence:plan-reject <branch-sha> <plan-id> <stale|superseded|rejected_explicit>
```

`coherence/plans/<branch-sha-12>/<plan-id>.json` files capture team plans —
proposals, decisions, directives — as committed artifacts. Plan ids derive
deterministically from `branch_sha + author_hash + title + created_at` so two
parallel branches never collide (DD-099 amended; DD-107; DD-108). Author
identity is hashed (12-hex SHA-256 of `git config user.email`) and never
serialised in clear text. `/coherence:doctor` flags any plan older than 7
days. Accept/reject paths run under `withCacheLock('team-plan-store')` so
two simultaneous reviews can't lose either decision.

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

### Ship-time gates

`npm run gates` runs the static-analysis + ship test projects. Carry
gates from v0.3 / v0.4:

- **M-ARCH-1** (NFR-ARCH-1, DD-117) — no production module imports a network
  API, references global network constructors, or embeds non-Anthropic HTTPS URLs.
- **M-PRIVACY-1** (NFR-PRIVACY-N5, DD-109) — no codepath writes
  `signal-cache.json` or `session-map.json` under the committed `coherence/`
  root; the `.gitignore` patcher emits both lines.
- **M-LEGACY-1** (NFR-ARCH-2, DD-118) — `npm pack --dry-run` excludes any
  path under `prompts/v1/` and `src/state/migrate/v1_to_v2.ts`; tarball ≤
  10 MB; `dist/state/schemas/` is non-empty post-build.
- **M-VALIDATE-1** (DD-122) — `claude plugin validate .` exits zero.
- **M-AUTOGEN-1** (DD-130) — every `slashCommands` entry has a
  `commands/<name>.md` stub with the `<!-- coherence-command: <name> -->`
  sentinel.

v1.0 adds:

- **M-LEDGER-1..4** (TS-2/TS-3, DD-138) — atomic writes under 50
  concurrent `recordEvent` calls, 180-day team-staleness filter, formula
  correctness within ±0.01, contested-flag derivation
  (`|aggregate| < 0.2` with ≥ 2 contributors).
- **M-TRUST-1..4** — one-shot promote hint, `auto_land_kinds`
  persistence, destructive/frontmatter never auto-applied, per-kind
  auto-land scope.
- **M-ASSERTS-1..4** — block/warn policy semantics, 10-cap enforcement,
  unknown-type ignore.
- **M-METRICS-1..2** — 5-section render correctness and < 200 ms p95
  performance.
- **M-AUDIT-1..3** — token-budget tier boundaries, flag-based
  `--confirm-deep`, symbol-index cache hit + invalidation.
- **M-SIGN-1..3** — cosign keyless OIDC signing, GitHub Release upload,
  `SECURITY.md` + README `## Verification` block structurally complete.
- **M-REPAIR-1** — `/coherence:repair` orphan listing,
  `--reassociate`/`--to` symmetric flags, `--expire-orphans` bulk path.

NFR performance bounds (p95) verified empirically:

- **NFR-PERF-N6** — `/coherence:metrics` < 200 ms (measured ~26 ms).
- **NFR-PERF-N6-EXT** — `/coherence:trust --status` < 200 ms (~22 ms).
- **NFR-PERF-N7** — `/coherence:audit` free tier < 100 ms (~3 ms on
  1000-section index).
- **NFR-PERF-N8** — stop-hook `recordEvent` contribution < 20 ms p95
  for 100 affected sections (~17.5 ms).

A round-2 P7 meta-test (`tests/static-analysis/meta-gates-trip.test.ts`)
re-runs each gate against synthetic regressions to ensure the gate logic
itself isn't silently broken.

## Verification

<!-- BEGIN: coherence-verification -->
> Release artifacts are signed with [Sigstore `cosign`](https://docs.sigstore.dev/) keyless OIDC.
> Verify the published tarball with:
>
> ```bash
> cosign verify-blob cohrence-1.0.0.tgz \
>   --signature cohrence-1.0.0.tgz.sig \
>   --certificate cohrence-1.0.0.tgz.pem \
>   --certificate-identity-regexp '^https://github.com/HUMBLEF0OL/coherence/\.github/workflows/release\.yml@refs/tags/v.*$' \
>   --certificate-oidc-issuer https://token.actions.githubusercontent.com
> ```
>
> A successful verification prints `Verified OK`. The certificate's Rekor
> transparency-log entry is searchable at <https://search.sigstore.dev/>.
> Gate names asserted at release time: `M-SIGN-1`, `M-SIGN-2`, `M-SIGN-3`.
<!-- END: coherence-verification -->
