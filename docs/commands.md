# Slash command reference

All commands are invoked via the Claude Code chat prompt as
`/coherence:<command>`. Commands surface through autogen stubs at
`commands/<name>.md`, which `UserPromptSubmit` routes to handlers via
`src/hooks/commandDispatch.ts`.

## Lifecycle

### `/coherence:status`

Render plugin status in canonical fixed-order output (DD-055).

| # | Section            | Notes                                                          |
| - | ------------------ | -------------------------------------------------------------- |
| 1 | Header             | plugin version, effective mode                                 |
| 2 | Capabilities       | host probes (if available)                                     |
| 3 | Sentinels          | kill-switch state (if active)                                  |
| 4 | Buffer             | pending section count + entries                                |
| 5 | Recent activity    | last 3 `coherence-log.md` entries                              |
| 6 | Subagent stats     | accepted / edited / discarded / rejected                       |
| 7 | Velocity           | revert count, auto-ignored sections                            |
| 8 | Cost               | last stop cost, session total                                  |
| 9 | `[limitation]`     | DD-044 footer (always present)                                 |

Performance bound: < 250 ms p95 (NFR-PERF-7).

### `/coherence:review`

Run the Stop pipeline mid-session against the current buffer.

```bash
/coherence:review                # full pipeline; applies in Graduated mode
/coherence:review --estimate     # Stage 1 only, reports group/section count
```

### `/coherence:doctor`

Probe host capabilities and write `host-capabilities.json`. Run after host
upgrades; coherence auto-probes on first SessionStart per project
(FR-INSTALL-3).

Probes: `subagent_attribution`, `frontmatter_preserves_unknown_keys`,
`hook_event_shapes`, `token_count_in_posttooluse`, `terminal_hyperlink`,
`claude_url_scheme_supported`.

### `/coherence:graduate`

Toggle between Observe and Graduated modes (scoped per directory).

```bash
/coherence:graduate                       # global → Graduated
/coherence:graduate annotate docs/        # annotate mode for docs/
/coherence:graduate author                # author mode (signal detectors fire)
/coherence:graduate --revert              # → Observe
/coherence:graduate --status              # print effective mode for cwd
```

In Graduated mode, **additive** patches auto-apply; **modifying** patches
auto-apply only when the section's trust score ≥ 0.85 (DD-131);
**destructive** and **frontmatter** patches always require confirmation
regardless of trust.

### `/coherence:repair`

Fix state inconsistencies: anchor collisions, schema drift, buffer
corruption, `pending.md` mismatches, and trust-ledger orphan keys.

```bash
/coherence:repair                                      # default: report orphans, clear stale state
/coherence:repair --reassociate <oldRef> --to <newRef> # atomic trust-key move
/coherence:repair --expire-orphans                     # bulk-drop orphan trust-ledger keys
```

Flags are symmetric: `--reassociate` requires `--to`, and vice versa.
Each branch writes a `coherence-log.md` entry; `--expire-orphans` lists
up to 20 refs with a `… and N more` tail.

### `/coherence:recover`

Clear recovery state: auto-disable sentinel, stale locks, orphaned
progress files, quarantine. Cross-major-version rollback is refused —
`/coherence:recover --target <tag>` only proceeds within the same
SemVer major bucket (DD-095 amended under DD-118).

## Trust + intelligence

### `/coherence:trust`

View or manage personal + team trust state.

```bash
/coherence:trust                          # default: 5-section status report
/coherence:trust sync                     # write coherence/trust/<author-hash>.json
/coherence:trust --promote --auto-land annotate,skill
/coherence:trust --prune-stale --yes      # delete team files older than 365 days
```

The status report has five sections: current trust state, top 5 highest
personal scores, top 5 lowest personal scores, team aggregate summary
(file count, active contributors, contested sections), and promote
eligibility.

Promote eligibility requires all three of (FR-TRUST-4): at least one
section with score ≥ 0.85, ≥ 5 distinct sections with score > 0, and
ledger spanning ≥ 30 days from the earliest event. After
`--promote --auto-land <kinds>`, SessionStart auto-accepts surfaced
proposals whose `kind` is in `auto_land_kinds`; kinds outside that set
still require explicit `/coherence:propose-accept` (DD-065 preserved).

### `/coherence:metrics`

Render the quality metrics report (5 Markdown sections).

```bash
/coherence:metrics                                   # full report to stdout
/coherence:metrics --since 2026-04-01
/coherence:metrics --revert-threshold 15             # integer 0..100, default 20
/coherence:metrics --out report.md                   # sandboxed; --allow-out-of-tree to escape
```

Sections: summary (5 event types × all-time + 30-day windows), top
drifting sections (with contested flag from team aggregate), trust scores
(top 10 high + 10 low with team aggregate column), 30-day cost-trend
Unicode sparkline, revert hotspots (≥ threshold).

### `/coherence:audit`

Coherence audit: free-tier bundling + token budget, or LLM cross-section
consistency pass with flag-based cost gate.

```bash
/coherence:audit                              # free: doctor + scope-debug + status + metrics + token budget
/coherence:audit --deep                       # prints pair list + 12-char signature; no LLM call yet
/coherence:audit --deep --confirm-deep <sig>  # invokes the LLM consistency pass
/coherence:audit --deep --no-confirm          # CI-only (requires CI=true)
/coherence:audit --deep --sections sec1,sec2  # narrow the candidate pair set
```

The free tier classifies each section by token count: `< 2000` Normal,
`2000..5000` ⚠ Large, `> 5000` ❌ Bloated (with a "consider splitting"
hint). Estimates use `ceil(content_length_chars / 4)`.

The `--deep` flow is two-step: the first call computes the candidate
pair list and a sha256 signature, the second call replays that signature
back to authorise the LLM call. If the underlying index changes between
calls the signature drifts and the user must re-run without
`--confirm-deep`. Live LLM calls flow through `src/llm/cassette.ts`.

### `/coherence:consent`

View or update telemetry consent without a TTY (DD-127).

```bash
/coherence:consent                  # print current consent state
/coherence:consent --local on       # enable local hashed event collection
/coherence:consent --upload off     # disable curl export hint
/coherence:consent --reset          # restore silent defaults
```

Defaults: local collection ON, upload OFF. Per DD-117 coherence never
initiates a network request — `/coherence:export-metrics` only writes a
file and prints a copy-paste curl line iff upload consent is granted.

## Proposals (cross-the-boundary)

Coherence proposes net-new artifacts (skills, agents, slash commands,
annotations) into quarantine at `.claude/coherence/proposals/<kind>/<id>/`
and never auto-lands them outside `.claude/coherence/` without an
explicit cross-the-boundary write (DD-065).

```bash
/coherence:propose-list                    # list queued + surfaced proposals
/coherence:propose-show <id>               # render artifact + manifest
/coherence:propose-accept <id>             # cross-the-boundary write
/coherence:propose-accept <id> --rename    # suffix on collision (SKILL-2.md, etc.)
/coherence:propose-accept <id> --overwrite <retyped-path>
/coherence:propose-reject <id>             # state → rejected
/coherence:propose-revert-acceptance <id>  # undo an accepted proposal (DD-083)
```

For `kind: 'annotate'` (DD-069), accept overwrites the source doc named
in the manifest (the original is quarantined for safety). For
`kind: 'slash_command'` (D7), accept also appends an entry to
`plugin.json` so Claude Code surfaces the new command.

Promoted developers (via `/coherence:trust --promote --auto-land <kinds>`)
have their matching surfaced proposals auto-accepted by the SessionStart
sweep — the token-gated SG-3 boundary is still traversed, just not
user-typed.

### `/coherence:annotate`

Generate an annotation proposal for an anchor-less doc (DD-069).

```bash
/coherence:annotate docs/intro.md
```

The proposal lands in quarantine; accept with
`/coherence:propose-accept <id>` to materialise it.

### `/coherence:de-annotate`

Strip auto-annotations or graduate them to user-owned anchors
(DD-102 / DD-110).

```bash
/coherence:de-annotate docs/intro.md
/coherence:de-annotate docs/intro.md --keep-as-user-anchor   # graduate to user-owned
/coherence:de-annotate docs/ --scope per-directory           # apply to a directory
/coherence:de-annotate '*' --scope global                    # apply project-wide
```

The decision persists in `graduation.json#de_annotate` so future trickle
scans honour it. Composes with the tombstone cache (DD-103) for
per-file scan-skip.

## Team workflows

### `/coherence:ignore-split`

Set up the two-file additive ignore model (DD-096): `coherence/ignore`
(committed; team-shared) and `coherence/ignore.local` (gitignored;
personal). Both are merged additively at scan time.

```bash
/coherence:ignore-split                    # idempotent
```

SessionStart runs the team-ignore FSM sweep: when a teammate's commit to
`coherence/ignore` matches a queued annotate proposal's `target_path`,
the FSM transitions the proposal to `ignored_by_team` (DD-088 amended).

### `/coherence:plan-create` / `plan-accept` / `plan-reject`

Cross-team plan store (DD-099 amended; DD-117 file-only).

```bash
/coherence:plan-create <kind> <title> [--body <markdown>]
/coherence:plan-accept <branch-sha> <plan-id>
/coherence:plan-reject <branch-sha> <plan-id> <stale|superseded|rejected_explicit>
```

Plans live as committed JSON under
`coherence/plans/<branch-sha-12>/<plan-id>.json`. IDs derive
deterministically from `branch_sha + author_hash + title + created_at`
so two parallel branches never collide. Author identity is hashed
(12-hex SHA-256 of `git config user.email`); raw emails are never
serialised. Accept/reject paths run under
`withCacheLock('team-plan-store')` for safe concurrent review.

### `/coherence:scope-debug`

Walk ancestor `CLAUDE.md` and `coherence/scope.json` files, print the
resolved scope chain, and report cache hit / miss + age (DD-097).

```bash
/coherence:scope-debug src/handlers/x.ts
```

Cold-start budget ≤ 200 ms p95 on a 100-package monorepo
(NFR-PERF-N4); telemetry sampled 1:100 via `scope_cache_miss`.

### `/coherence:export-metrics`

Write redacted `metrics.jsonl` to a user-supplied path; print a
copy-paste curl line only when upload consent is granted (DD-115).

```bash
/coherence:export-metrics
/coherence:export-metrics --since 2026-05-01
/coherence:export-metrics --anonymized               # also hash proposal_id / signal_hash / session_id
/coherence:export-metrics --out /tmp/m.jsonl         # sandboxed
```

`--out` paths outside the project root require `--allow-out-of-tree`
(NFR-PATH-SANDBOX). Per DD-117 the export only writes a file; no
network request is initiated.

### `/coherence:share-metrics`

Legacy v0.1 helper that writes anonymised metrics to a user-chosen file
path (DD-060). Superseded by `/coherence:export-metrics` for most
workflows.

## Statusline

### `/coherence:install-statusline` / `uninstall-statusline`

Install / restore the click-target badge in `~/.claude/settings.json`
(FR-STATUSLINE-2 / 3). The badge renders an OSC 8 / OSC 52 / plain
three-tier graceful degradation showing surfaced-proposal counts.

```bash
/coherence:install-statusline
/coherence:uninstall-statusline
```

The render is cancellation-safe (single atomic read of
`.claude/coherence/state-snapshot.json`).

## Plugin manifest

All commands above are registered in
[`.claude-plugin/plugin.json#slashCommands`](../.claude-plugin/plugin.json).
The build step (`npm run build`) regenerates `commands/<name>.md` autogen
stubs from the manifest (DD-130).
