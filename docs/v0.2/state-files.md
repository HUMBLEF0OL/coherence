# v0.2 state files (DG-3)

All files live under `.claude/coherence/`. Atomic-write contract via
`stateStore.ts`; quarantine-and-continue on corruption (FR-FAILURE-N1, N2).

## Inherited from v0.1

| File | Schema | Notes |
|------|--------|-------|
| `version.json` | `version.schema.json` | `schema_version: 2` after migration |
| `config.json` | `config.schema.json` | Legacy v0.1 mode toggle |
| `host-capabilities.json` | `host-capabilities.schema.json` | DD-090: extended with `terminal_hyperlink`, `claude_url_scheme_supported` |
| `drift-buffer.json` | `drift-buffer.schema.json` | Source enum widened (DD-080 step b) |
| `velocity.json` | `velocity.schema.json` | Unchanged |
| `stop-progress.json` | `stop-progress.schema.json` | Unchanged |
| `cost-ledger.json` | `cost-ledger.schema.json` | Stage enum widened (DD-080 step c) |
| `subagent-stats.json` | `subagent-stats.schema.json` | Unchanged |
| `section-index.json` | `section-index.schema.json` | Unchanged |
| `plan.json` | `plan.schema.json` | Unchanged |

## Added in v0.2

| File | Schema | Notes |
|------|--------|-------|
| `graduation.json` | `graduation.schema.json` | DD-074 mode lifecycle |
| `proposal-cache.json` | `proposal-cache.schema.json` | DD-088 FSM (queued/surfaced/ignored/accepted/rejected/reverted/expired) |
| `signal-cache.json` | `signal-cache.schema.json` | DD-089 caps (bash 500, file 500, agent 200) |
| `state-snapshot.json` | `state-snapshot.schema.json` | DD-084 debounced statusline source |
| `scan-cache/state.json` | `scan-cache-state.schema.json` | DD-066 trickle scanner pacing |
| `proposals/<kind>/<id>/manifest.json` | `proposal.schema.json` (DD-087) | Per-proposal manifest |
| `proposals/<kind>/<id>/<artifact>` | n/a (markdown) | Per-proposal artifact body |
