# Skill: coherence:recover
Trigger: `/coherence:recover`
BRD: FR-COMMANDS-4 · DD-061

## Purpose
Full manual recovery from degraded, disabled, or corrupted coherence state. Re-runs the doctor probe, resets all state files to safe defaults, and re-bootstraps the plugin — preserving the config's `tracked` list and `mode` if they are intact.

## Steps

### 1. Warn user
Print:
```
⚠ /coherence:recover will reset all runtime state files.
  Your tracked doc list and mode setting will be preserved if config is valid.
  Buffer entries will be cleared. Metrics and cost-ledger are preserved.

Proceed? [y/n]
```
Abort if user answers `n`.

### 2. Re-run doctor probe (FR-COMMANDS-5 steps 1–4)
Re-run the full host capability probe inline (see `/coherence:doctor` steps). Save results to `.claude/coherence/host-caps.json`.

### 3. Snapshot current config
- Read `.claude/coherence/config.yaml`.
- Extract `tracked` and `mode` if the file is readable and those fields are valid.
- If config is unreadable or missing, use defaults: `mode: "observe"`, `tracked: []`.

### 4. Reset state files
Overwrite the following with safe defaults (atomic writes):

**`.claude/coherence/state.json`:**
```json
{
  "schema_version": "1.0",
  "plugin_disabled": false,
  "consecutive_failure_count": 0,
  "last_review_ts": null,
  "last_review_item_count": null,
  "last_repair_ts": null,
  "repair_count": 0,
  "recovered_at": "<ISO-8601 UTC now>"
}
```

**`.claude/coherence/drift-buffer.jsonl`:** truncate to empty (zero bytes). Acquire lock first. (FR-FAILURE-3b)

**`.claude/coherence/config.yaml`:** if the previous config was valid, preserve `tracked` and `mode`:
```yaml
schema_version: "1.0"
mode: <preserved or "observe">
tracked:
  <preserved list or empty>
```
If previous config was invalid, write the minimal default above.

### 5. Re-validate install
- Verify hook registrations are still active (check Claude Code hooks config for PreToolUse, PostToolUse, Stop entries pointing to coherence handlers).
- If hooks are missing: print a warning with the exact hook registration commands to run, referencing TS-8 §8.2 bootstrap steps.

### 6. Confirm recovery
Print:
```
─── Coherence recovery complete ────────────────────────
Mode:          <observe | graduated>
Tracked docs:  <N> (preserved from previous config)
Buffer:        cleared
State:         reset
Host caps:     re-probed — frontmatter=<ok|warn>  git=<ok|unavailable>
Hooks:         <registered | ⚠ missing — see above>
────────────────────────────────────────────────────────
Run /coherence:status to verify.
```

### 7. Post-recovery: enable-sidecars check
If doctor probe reported `frontmatter_preserves_unknown_keys: false`, append:
```
ℹ  Your Claude Code version does not preserve unknown frontmatter keys.
   Run /coherence:enable-sidecars to use .claude/coherence/sidecars/ as fallback
   so skills and agents can carry coherence metadata. (FR-COMMANDS-7)
```

## Constraints
- All state-file writes must be atomic (temp + rename). (NFR-RELIABILITY-1)
- Preserve `cost-ledger.json` and `metrics.jsonl` — do not truncate or overwrite them.
- Do not invoke LLM subagents. (DD-008)
- Acquire buffer lock before truncating buffer. (FR-FAILURE-3b)
- This command re-enables a disabled plugin (`plugin_disabled: false`). It is the only command that does so.
