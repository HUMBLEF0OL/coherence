# Skill: coherence:status
Trigger: `/coherence:status`
BRD: FR-COMMANDS-1 · DD-055

## Purpose
Display the canonical coherence status for the current workspace: operating mode, tracked document count, buffer depth, last review time, and cost ledger summary.

## Steps

1. **Read config** — load `.claude/coherence/config.yaml`. Extract:
   - `mode` (observe | graduated)
   - `tracked` array (list of tracked doc paths and their layers)
   - `schema_version`

2. **Read buffer** — count lines in `.claude/coherence/drift-buffer.jsonl`. If the file does not exist, buffer depth = 0.

3. **Check disabled sentinel** — check whether `.claude/coherence/disabled` exists. If it does, `plugin_enabled = false`; otherwise `plugin_enabled = true`.

4. **Read state** — load `.claude/coherence/state.json` if it exists. Extract:
   - `last_review_ts` (ISO-8601 UTC, or "never")
   - `last_review_item_count`
   - `consecutive_failure_count`

5. **Read cost ledger** — load `.claude/coherence/cost-ledger.json` if it exists. Extract:
   - `total_tokens_used`
   - `total_usd_estimate`
   - `session_count`

6. **Read host caps** — load `.claude/coherence/host-capabilities.json` if it exists. Extract `frontmatter_preserves_unknown_keys`, `git_available`, and `subagent_attribution`.

7. **Read pending/deferred counts** — (FR-PERMISSION-5)
   - Count lines in `.claude/coherence/pending.md` (escalated items awaiting human review). If file is absent, count = 0.
   - Count buffer entries with `state: "deferred"`. If absent, count = 0.

8. **Read subagent metrics** — (FR-OBS-5) for each agent listed in `.claude/coherence/metrics.jsonl`, compute a rolling window of the last 50 invocations:
   - `patch_applied_count`, `no_patch_count`, `escalate_count`, `plan_disagrees_count` within the window.
   - If metrics file is absent, skip this block.

9. **Format output** using this exact layout:

```
─── Coherence v0.1 Status ───────────────────────────────
Mode:            <observe | graduated>
Plugin:          <enabled | ⚠ DISABLED — run /coherence:recover>
Tracked docs:    <N> (<skills: X  agents: Y  referring: Z>)
Drift buffer:    <N entries pending>  (<N deferred>)
Pending review:  <N escalated items in pending.md>
Last review:     <ISO timestamp or "never">
  └─ items found: <N or n/a>
Cost (lifetime): ~$<X.XX> across <N> sessions (<N> tokens)
Host caps:       frontmatter=<ok|warn>  git=<ok|unavailable>  subagent=<line-level|file-level-fallback|absent>
─────────────────────────────────────────────────────────
```

If subagent metrics data is available (FR-OBS-5), append:

```
─── Subagent Stats (last 50 invocations) ────────────────
coherence-planner:  applied=<N>  no-patch=<N>  escalated=<N>  disagrees=<N>
coherence-patcher:  applied=<N>  no-patch=<N>  escalated=<N>  disagrees=<N>
─────────────────────────────────────────────────────────
```

If session-level cost data is available (FR-OBS-6), append:

```
─── This Session ─────────────────────────────────────────
Stage 1 calls:   <N>  (~$<X.XX>)
Stage 2 calls:   <N>  (~$<X.XX>)
Total session:   ~$<X.XX>  (<N> tokens in / <N> tokens out)
─────────────────────────────────────────────────────────
```

If velocity data is available (FR-OBS-7), append:

```
─── Velocity (last 7 days) ──────────────────────────────
Patches applied:  <N>
Patches deferred: <N>
Patches reverted: <N>
─────────────────────────────────────────────────────────
```

10. If `plugin_enabled == false` (sentinel file present), append a warning:
   > ⚠ Coherence is disabled (sentinel file present). Buffer accumulation and Stop pipeline are paused.
   > Run `/coherence:recover` to restore.

11. If `consecutive_failure_count ≥ 3`, append:
   > ⚠ <N> consecutive pipeline failures. Run `/coherence:doctor` to diagnose.

## Constraints
- Read-only: this command MUST NOT write any files.
- If any state file is missing, display "n/a" for that field rather than failing.
- Do not invoke any LLM subagent. (DD-008 — deterministic-first)
