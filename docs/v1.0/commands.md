# v1.0 commands

The v1.0 release adds three new slash commands and extends two existing ones.

## `/coherence:trust`

View or manage personal + team trust state.

| Subcommand                              | Description                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| _(none)_ / `--status`                   | Default — print 5-section Markdown status report.                                            |
| `sync`                                  | Write personal summary to `coherence/trust/<author-hash>.json` (committed).                  |
| `--promote --auto-land <kinds>`         | Flip auto-land kinds for net-new files. Requires all 3 thresholds met.                       |
| `--prune-stale --yes`                   | Delete `coherence/trust/*.json` files whose `last_synced_at` is > 365 days old.              |

**Status report sections** (TS-5 §5.4):

1. Current trust state — promoted or unpromoted; sections tracked; hint state.
2. Top 5 highest personal scores.
3. Top 5 lowest personal scores.
4. Team aggregate summary — file count, active contributors (≤ 180 d), contested-section count.
5. Promote eligibility — three conditions independently reported.

**Promote thresholds** (FR-TRUST-4):
- At least one section with score ≥ 0.85, AND
- ≥ 5 distinct sections with score > 0, AND
- Ledger spans ≥ 30 days from earliest event.

The promote hint is emitted **once** (FR-TRUST-1) — `promote_hint_emitted_at`
stamps the ledger after first eligibility detection at `SessionStart`.

## `/coherence:metrics`

Render the quality metrics report (5 Markdown sections).

| Flag                              | Description                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `--since YYYY-MM-DD`              | Filter all windows from that date forward.                                                    |
| `--revert-threshold <int 0..100>` | Override the default 20% revert-rate threshold for hotspot inclusion.                         |
| `--out <path>`                    | Write report to a file path (sandboxed to projectRoot unless `--allow-out-of-tree`).          |
| `--allow-out-of-tree`             | Permit `--out` paths outside the project root (stderr warning logged).                        |

Sections rendered:

1. **Summary** — event counts (all-time + last 30 days), 5 telemetry event types.
2. **Top drifting sections** — by `patch_applied` count, with contested flag from team aggregate.
3. **Trust scores** — top 10 highest + top 10 lowest personal scores with team aggregate column.
4. **Cost trend** — 30-day Unicode sparkline from `cost-ledger.json` daily sums.
5. **Revert hotspots** — sections with revert rate ≥ threshold (default 20%).

## `/coherence:audit` (extended)

The free tier now also reports section token budgets.

```bash
/coherence:audit                   # free: doctor + scope-debug + status + metrics + token budget
/coherence:audit --deep            # first call: print pair list + cost estimate + 12-char signature
/coherence:audit --deep --confirm-deep <sig>   # actually invoke LLM consistency pass
/coherence:audit --deep --no-confirm           # CI-only (CI=true env var required)
```

The `--deep` tier:
- Builds (or reuses) `.claude/coherence/section-symbol-index.json`.
- Picks the top 10 section pairs that share ≥ 3 symbols.
- Cap-aware: more candidates → advise narrowing via `--sections sec1,sec2,…`.
- Cost-gated: requires explicit signature confirmation (no TTY).

## `/coherence:repair` (extended)

Trust-ledger orphan management (FR-REPAIR-1):

```bash
/coherence:repair                                       # default — also lists orphaned trust keys
/coherence:repair --reassociate <oldRef> --to <newRef>  # move events from old → new key
/coherence:repair --expire-orphans                      # bulk-drop orphan keys
/coherence:repair --auto-expire                         # alias for --expire-orphans
```

Validation: `--reassociate` requires `--to`, `--to` requires `--reassociate`
(symmetric — pass-2 Minor #2).

Each flag branch writes an entry to `coherence-log.md` recording the action.

## Manifest registration

All three v1.0 commands are registered in `.claude-plugin/plugin.json#slashCommands`.
The DD-130 autogen build step emits `commands/coherence-{trust,metrics}.md` stubs
with the `<!-- coherence-command: ... -->` sentinel that UserPromptSubmit routes
through `src/hooks/commandDispatch.ts`.
