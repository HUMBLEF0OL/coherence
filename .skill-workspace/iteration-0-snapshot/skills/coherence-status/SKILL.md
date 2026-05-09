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

3. **Read state** — load `.claude/coherence/state.json` if it exists. Extract:
   - `last_review_ts` (ISO-8601 UTC, or "never")
   - `last_review_item_count`
   - `consecutive_failure_count`
   - `plugin_disabled` (bool)

4. **Read cost ledger** — load `.claude/coherence/cost-ledger.json` if it exists. Extract:
   - `total_tokens_used`
   - `total_usd_estimate`
   - `session_count`

5. **Read host caps** — load `.claude/coherence/host-caps.json` if it exists. Extract `frontmatter_preserves_unknown_keys` and `git_available`.

6. **Format output** using this exact layout:

```
─── Coherence v0.1 Status ───────────────────────────────
Mode:            <observe | graduated>
Plugin:          <enabled | ⚠ DISABLED — run /coherence:recover>
Tracked docs:    <N> (<skills: X  agents: Y  referring: Z>)
Drift buffer:    <N entries pending>
Last review:     <ISO timestamp or "never">
  └─ items found: <N or n/a>
Cost (lifetime): ~$<X.XX> across <N> sessions (<N> tokens)
Host caps:       frontmatter=<ok|warn>  git=<ok|unavailable>
─────────────────────────────────────────────────────────
```

7. If `plugin_disabled == true`, append a warning:
   > ⚠ Coherence is disabled. Buffer accumulation and Stop pipeline are paused.
   > Run `/coherence:recover` to restore.

8. If `consecutive_failure_count ≥ 3`, append:
   > ⚠ <N> consecutive pipeline failures. Run `/coherence:doctor` to diagnose.

## Constraints
- Read-only: this command MUST NOT write any files.
- If any state file is missing, display "n/a" for that field rather than failing.
- Do not invoke any LLM subagent. (DD-008 — deterministic-first)
