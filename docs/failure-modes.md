# Failure modes — operator catalog

Coherence is a file-only plugin (DD-117). When something goes wrong, the
diagnostic substrate is the JSON files on disk. This document is the
operator's reference for what each state file looks like in four
scenarios — **healthy**, **quarantined**, **locked**, **missing** — plus
the global degraded / auto-disabled paths and the trust-orphan repair
flow.

A full state-file inventory with schemas lives in
[state-files.md](state-files.md). This doc is the operational complement.

## The four scenarios

| Scenario | What it means | Coherence's reaction |
| -------- | ------------- | -------------------- |
| **Healthy** | File parses cleanly + passes AJV schema validation. | Used as-is. |
| **Quarantined** | File failed JSON parse or AJV schema validation on read. Bytes are moved to `.claude/coherence/quarantine/<basename>.<unix-ts>.bak` (last 10 retained per filename). | The read returns `null`; coherence proceeds as if the file were missing for this read. The original is gone from its home path. |
| **Locked** | An `.lock` sidecar (e.g. `trust-ledger.json.lock`) exists. The lock manager probes liveness (same host: `process.kill(pid, 0)`; cross-host: age-only fence at 30 s buffer / 5 s scanner). | Writers retry with exponential backoff (10 / 20 / 40 ms, capped at 500 ms, total budget 5 s). On 3 consecutive timeouts the lock manager flips `degraded = true` and writes are best-effort dropped. |
| **Missing** | File does not exist at its expected path. | Coherence recreates with defaults on next write (atomic temp-file + rename), usually emitting a one-line warning. No crash. |

## Per-file behaviour

The shapes below use schema names from
[src/state/stateStore.ts](../src/state/stateStore.ts) (`FILE_TO_SCHEMA`).
Schema definitions are under
[src/state/schemas/](../src/state/schemas/).

### `.claude/coherence/trust-ledger.json` (`trust-ledger.schema.json`)

- **Healthy.** `{ schema_version: 3, events: { ... }, summary: { ... }, promoted_at, promote_hint_emitted_at, auto_land_kinds }` — see the canonical example in [state-files.md](state-files.md#trust-ledgerjson-trust-ledgerschemajson-schema_version-3).
- **Quarantined.** Schema-version mismatch (e.g. an older `schema_version: 2` file picked up by v1.x) fails AJV and the file is quarantined fail-closed (Edge #12). New ledger is initialised empty on the next `recordEvent`.
- **Locked.** `withCacheLock` with namespace `trust-ledger` serialises read-modify-write (M-LEDGER-1). 50 concurrent `recordEvent` calls converge to a single consistent final state.
- **Missing.** Treated as empty ledger. Per-section score defaults to 0; the trust gate refuses auto-apply for modifying patches until a real history exists.

### `.claude/coherence/state-snapshot.json` (`state-snapshot.schema.json`)

- **Healthy.** Single-write bootstrap snapshot consumed by the statusline (DD-094). Single atomic read, cancellation-safe.
- **Quarantined.** Statusline falls back to a "loading…" badge. Coherence rewrites the snapshot on the next `markDirty` -> `flush` cycle.
- **Locked.** Statusline ignores the lock; it never blocks.
- **Missing.** Statusline shows "loading…" until the next SessionStart / SessionEnd writes a fresh snapshot.

### `.claude/coherence/signal-cache.json` (`signal-cache.schema.json`)

- **Healthy.** Three buckets — `bash_repetition` (max 500), `file_creation` (max 500), `agent_correction` (max 200). LRU-capped.
- **Quarantined.** Bucket lost; signal detectors operate on an empty cache until the next prune-and-write cycle rebuilds it. Existing in-flight signals from the current session are not re-captured.
- **Locked.** Never written under the committed `coherence/` root (NFR-PRIVACY-N5, asserted by `M-PRIVACY-1`).
- **Missing.** Recreated with empty buckets at first signal capture.

### `.claude/coherence/proposal-cache.json` (`proposal-cache.schema.json`)

- **Healthy.** DD-081 entries keyed by `proposal_id`. Each entry carries `kind`, `signal_hash`, `state` (`queued` / `surfaced` / `ignored` / `accepted` / `rejected` / `expired` / `reverted` / `ignored_by_team`), generation + expiry timestamps, and a 50-cap `state_history`.
- **Quarantined.** Live proposals on disk in `.claude/coherence/proposals/<kind>/<id>/` are NOT lost — they exist as their own files. The cache rebuilds opportunistically on the next sweep. Until then, listings via `/coherence:propose-list` may show stale states.
- **Locked.** `withCacheLock` namespace `proposal-cache` serialises FSM transitions so two `propose-accept` invocations cannot race.
- **Missing.** Coherence treats the cache as empty and re-walks the proposals tree.

### `.claude/coherence/cost-ledger.json` (`cost-ledger.schema.json`)

- **Healthy.** Per-session LLM cost ledger (stage / tokens / USD / prompt_version). DD-085 tri-partition budget enforcement reads this file on `flush()`.
- **Quarantined.** The current session's running total is lost. The flush-time budget cap treats the new ledger as empty.
- **Locked.** Single-writer pattern; brief lock window during flush.
- **Missing.** Recreated on next flush.

### `.claude/coherence/metrics.jsonl`

- **Healthy.** Rolling 90-day JSONL (DD-060). One record per line with `_ts`.
- **Quarantined.** Not validated against AJV (free-form JSONL). On read errors the retention sweep at SessionStart skips and logs.
- **Locked.** Lock held briefly per `appendJsonl` call.
- **Missing.** Recreated on next emit.

### `.claude/coherence/metrics-summary.json`

- **Healthy.** Aggregated counts for events older than 90 days, truncated from `metrics.jsonl` by the SessionStart retention sweep.
- **Quarantined.** Lost summary. Subsequent retention runs aggregate freshly from the current rolling log.
- **Locked.** Written under the same window as `metrics.jsonl`; transient.
- **Missing.** Recreated on next retention sweep.

### `.claude/coherence/drift-buffer.json` (`drift-buffer.schema.json`)

- **Healthy.** Pending drift entries. Only content **hashes** are persisted — never raw content (NFR-PRIVACY-4).
- **Quarantined.** Empty buffer; the Stop pipeline has nothing to act on this round. Next signal capture refills.
- **Locked.** Buffer-append paths serialise on the file lock.
- **Missing.** Recreated empty.

### `.claude/coherence/stop-progress.json` (`stop-progress.schema.json`)

- **Healthy.** Resumable checkpoint for an in-flight Stop pipeline.
- **Quarantined.** Stop assumes no in-progress run and starts fresh.
- **Locked.** Held during the Stop run; cleared on success.
- **Missing.** Normal — file is cleared on successful completion. Orphan files (progress present but buffer empty) are surfaced by `/coherence:repair` and can be removed.

### `.claude/coherence/section-index.json` (`section-index.schema.json`)

- **Healthy.** Section index built on SessionStart and refreshed as files change.
- **Quarantined.** SessionStart rebuilds from scratch on next session.
- **Locked.** Brief window during write.
- **Missing.** Rebuilt on next SessionStart or on first reference.

### `.claude/coherence/scope-cache.json` (`scope-cache.schema.json`)

- **Healthy.** DD-097 ancestor-walk cache; PostToolUse hot-path uses it.
- **Quarantined.** Cold-start; first lookup pays the full walk cost.
- **Locked.** `withCacheLock` namespace `scope-cache` serialises read-modify-write on the PostToolUse hot path.
- **Missing.** Cold-start; rebuilt opportunistically.

### `coherence/trust/<author-hash>.json` (`team-aggregate.schema.json`)

- **Healthy.** Per-developer trust aggregate, written by `/coherence:trust sync`. Committed to git.
- **Quarantined.** Treated as missing. Re-sync rewrites.
- **Locked.** Single writer per author hash; transient.
- **Missing.** Sections without an aggregate fall back to local-only trust scoring; no team-mean column in `/coherence:metrics`.

### `coherence/plans/<branch-sha-12>/<plan-id>.json`

- **Healthy.** Cross-team plan artifact (DD-099 amended). Committed to git.
- **Quarantined.** Coherence skips that plan; `/coherence:doctor` warns about stale or corrupt plans.
- **Locked.** `withCacheLock` namespace `team-plan-store` serialises mutations.
- **Missing.** No-op; plan was never created or was rejected and cleaned up.

## Sentinels (kill-switches)

Two files in `.claude/coherence/` short-circuit every hook handler. Both
are checked first thing inside `withExceptionGuard()`. While either
sentinel exists, all coherence handlers early-return SUCCESS without
doing any work.

| File | Type | Set by | Cleared by |
| ---- | ---- | ------ | ---------- |
| `DISABLED` | Manual kill-switch | The operator (`touch .claude/coherence/DISABLED`) | The operator (manual `rm`) — **`/coherence:recover` does NOT touch this file** |
| `auto-disabled` | Auto crash-disable | `withExceptionGuard()` after the 3rd hook exception in a session | `/coherence:recover` |

On case-insensitive filesystems the names are deliberately distinct
(uppercase manual, lowercase-hyphenated auto). The `auto-disabled` file
body carries a timestamp + last-exception reason so you can read it
straight off disk to understand why coherence backed off.

## Degraded mode

Two ways coherence enters degraded mode:

- **Lock manager.** Three consecutive `lockManager.acquire` timeouts (5 s budget each) flip `degraded = true`. Subsequent writes to `StateStore.write` and `appendJsonl` early-return without doing work when the lock is unavailable, instead of blocking.
- **Exception guard.** `exceptionCount` is process-scoped. Three exceptions in a session write the `auto-disabled` sentinel and stop coherence for the rest of the session.

**How to clear:**

- Lock-manager degraded: `lockManager.reset()` is called by `/coherence:recover`, which also resets the consecutive-timeout counter.
- Sentinel auto-disabled: `/coherence:recover` removes `auto-disabled`. Until cleared, every hook silently no-ops.
- Sentinel manual: remove the `DISABLED` file by hand.

`/coherence:doctor` reports the current state of both sentinels and
prints the body of `auto-disabled` if present.

## Trust-orphan repair

The trust ledger can accumulate entries for `sectionRef`s that no longer
appear in `section-index.json` — typically because a section was renamed
or its anchor was removed. `/coherence:repair` exposes two flag-based
flows:

```bash
/coherence:repair --reassociate <oldRef> --to <newRef>
/coherence:repair --expire-orphans
```

- `--reassociate` moves a ledger key from the old `sectionRef` to the new
  one. Useful immediately after renaming an anchor in source.
- `--expire-orphans` walks the ledger, intersects keys with the current
  `section-index.json`, and drops anything that no longer corresponds to
  a known section. Bulk path for cleanup after a large refactor.

Both write a `repair` entry into `coherence-log.md` with the affected
section refs. No `--dry-run` flag today; if you want to preview, run
`/coherence:trust` first to see the ledger contents.

## Recovery cookbook

| Symptom | First check | Then |
| ------- | ----------- | ---- |
| Coherence stopped applying patches | `cat .claude/coherence/auto-disabled` | `/coherence:recover` |
| Statusline shows "loading…" forever | `ls .claude/coherence/state-snapshot.json` | Trigger any tool use; SessionStart / SessionEnd will rewrite the snapshot |
| `/coherence:trust` reports unexpected zero scores | `ls .claude/coherence/quarantine/trust-ledger.json.*.bak` | If quarantined, inspect the backup; the new ledger started empty |
| Two sessions racing on a write | `ls .claude/coherence/*.lock` | Stale locks older than the 30 s buffer fence are cleared automatically; if a lock file is much older, remove by hand |
| Cross-major upgrade refused | `cat .claude/coherence/version.json` | DD-118: re-install the target major manually; no migrator chain |
| `/coherence:repair` finds many orphans | (run repair) | `/coherence:repair --expire-orphans` for the bulk path |

## File-only debugging

Because there is no backend, every diagnostic is local-only. The
operator's standard toolkit:

```bash
ls -la .claude/coherence/
cat .claude/coherence/auto-disabled              # if present
tail -n 50 .claude/coherence/coherence-log.md    # newest-first
tail -n 50 .claude/coherence/metrics.jsonl       # latest events
ls .claude/coherence/quarantine/                 # what's been quarantined
ls .claude/coherence/*.lock                      # outstanding locks
/coherence:doctor                                # capability + sentinel probe
/coherence:status                                # buffer + costs + recent activity
```

Nothing escapes the project tree. Telemetry export is user-driven only
(`/coherence:export-metrics` then a manual `curl`).
