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
Re-run the full host capability probe inline (see `/coherence:doctor` steps). Save results to `.claude/coherence/host-capabilities.json`.

### 3. Snapshot current config
- Read `.claude/coherence/config.yaml`.
- Extract `tracked` and `mode` if the file is readable and those fields are valid.
- If config is unreadable or missing, use defaults: `mode: "observe"`, `tracked: []`.

### 4. Reset state and runtime artefacts
Perform all of the following (all file writes atomic via temp + rename):

**a. Delete the disabled sentinel file** (FR-FAILURE-6, FR-FAILURE-8):
- If `.claude/coherence/disabled` exists, delete it. This re-enables the plugin.
- This is the only command that removes the sentinel.

**b. Clear quarantine directory** (FR-FAILURE-7):
- Delete all files inside `.claude/coherence/quarantine/` if the directory exists.
- Do not delete the directory itself — just its contents.

**c. Remove stale lock files** (FR-FAILURE-7):
- Delete `.claude/coherence/drift-buffer.jsonl.lock` if it exists (stale lock from a crashed session).
- Delete any other `*.lock` files found inside `.claude/coherence/`.

**d. Delete stop-progress.json** (FR-FAILURE-7):
- Delete `.claude/coherence/stop-progress.json` if it exists (orphaned checkpoint from an interrupted review).

**e. Reset `.claude/coherence/state.json`:**
```json
{
  "schema_version": "1.0",
  "consecutive_failure_count": 0,
  "last_review_ts": null,
  "last_review_item_count": null,
  "last_repair_ts": null,
  "repair_count": 0,
  "recovered_at": "<ISO-8601 UTC now>"
}
```

**f. Truncate `.claude/coherence/drift-buffer.jsonl`** to empty (zero bytes). Acquire lock first before truncating, then release. (FR-FAILURE-3b)

**g. Reset `.claude/coherence/config.yaml`:** if the previous config was valid, preserve `tracked` and `mode`:
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
- Re-enabling the plugin is done exclusively by deleting the `.claude/coherence/disabled` sentinel file — this is the only command that does so. (FR-FAILURE-6/8)
- `state.json` does NOT contain a `plugin_disabled` field — disabled state is tracked only by the sentinel file.
