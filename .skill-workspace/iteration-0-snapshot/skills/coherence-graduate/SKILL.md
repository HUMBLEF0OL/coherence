# Skill: coherence:graduate
Trigger: `/coherence:graduate`
BRD: FR-COMMANDS-6 · DD-048

## Purpose
Toggle the operating mode between `observe` (default, read-only — no auto-writes) and `graduated` (additive patches auto-apply at Stop without per-patch prompts). The `--revert` flag switches back to `observe`.

## Flags
- _(no flags)_ — switch from `observe` → `graduated`
- `--revert` — switch from `graduated` → `observe`

## Steps

### 1. Read current mode
Load `.claude/coherence/config.yaml`. Extract `mode`.

### 2. Determine target mode
| Current mode | Flag     | Target mode  |
|---|---|---|
| observe      | (none)   | graduated    |
| graduated    | (none)   | graduated *(already — print notice and exit)* |
| graduated    | --revert | observe      |
| observe      | --revert | observe *(already — print notice and exit)* |

If already in the target mode, print:
```
Already in <mode> mode. No change made.
```
And exit.

### 3. Explain the implications
Before applying the change, print the mode description:

**Switching to `graduated`:**
```
─── Switching to Graduated mode ─────────────────────────
In Graduated mode, Coherence will:
  ✓ Automatically apply ADDITIVE patches at Stop (no per-patch prompts)
  ✓ Still surface UPDATE and DELETION patches for your review
  ✓ Log all auto-applied patches to metrics.jsonl
  ✓ Git-commit each auto-applied patch with [coherence] prefix

Additive = new content only (lines_removed == 0).
Patches that remove or change existing lines always require approval.

Confirm switch to Graduated mode? [y/n]
```

**Switching to `observe` (--revert):**
```
─── Reverting to Observe mode ───────────────────────────
In Observe mode, Coherence will:
  ✓ Continue passive drift detection during sessions
  ✓ Accumulate signals in the drift buffer
  ✗ NOT auto-apply any patches at Stop — all patches require explicit approval

Confirm revert to Observe mode? [y/n]
```

Abort if user answers `n`.

### 4. Apply mode change
- Read config, update `mode` field, write back atomically (temp + rename). (NFR-RELIABILITY-1)
- Update `state.json`: set `mode_changed_at: <ISO-8601 UTC>`, `previous_mode: <old mode>`.

### 5. Confirm
```
─── Mode changed ─────────────────────────────────────────
Previous mode:  <old>
Current mode:   <new>
Config saved:   .claude/coherence/config.yaml
─────────────────────────────────────────────────────────
```

If switching to `graduated` and `frontmatter_preserves_unknown_keys: false` in host-caps, append:
```
ℹ  Note: frontmatter key preservation is unavailable. Auto-apply will use
   sidecar files. Run /coherence:enable-sidecars if not already done.
```

## Constraints
- Config write must be atomic (temp + rename). (NFR-RELIABILITY-1)
- Do not invoke LLM subagents. (DD-008)
- Annotate/Author mode transitions (v0.2 features) are NOT implemented here — only observe ↔ graduated. (FR-COMMANDS-6, BRD note)
- Mode change persists across sessions (stored in config.yaml, not session state).
