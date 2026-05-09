# Skill: coherence:doctor
Trigger: `/coherence:doctor`
BRD: FR-COMMANDS-5 · DD-043, DD-062

## Purpose
Re-run the host capability probe and report the full environment compatibility matrix for Coherence v0.1. Does not modify any user files.

## Steps

### 1. Probe Claude Code version
- Check the Claude Code CLI version via `claude --version` (if available).
- Verify it is ≥ 2.0.0 (minimum required by Coherence v0.1, TS-8 §8.1).
- Record: `claude_code_version`, `meets_minimum`.

### 2. Probe frontmatter key preservation (DD-043)
- Write a temporary YAML file with an unknown key (`_coherence_test_key: true`) to a temp path.
- Read it back via Claude's file tools.
- Check whether `_coherence_test_key` is preserved.
- Record: `frontmatter_preserves_unknown_keys: true | false`.
- Delete the temp file.

### 3. Probe git availability (DD-062)
- Run `git rev-parse --is-inside-work-tree` in the workspace root.
- Record: `git_available: true | false`, `git_version` (if available).

### 4. Probe filesystem atomics
- Write a temp file, rename it over a target path, verify the target contains the written content.
- Record: `atomic_rename_ok: true | false`.
- (Required for NFR-RELIABILITY-1 temp+rename write strategy.)

### 5. Probe Node.js / runtime
- Check `node --version`.
- Record: `node_version`, `node_meets_minimum` (≥ 18.0.0 required).

### 6. Check coherence config validity
- Read `.claude/coherence/config.yaml` if it exists.
- Validate schema (see `/coherence:repair` Step 1c for rules).
- Record: `config_present: true | false`, `config_valid: true | false`, `config_violations: [...]`.

### 7. Write results
- Save probe results to `.claude/coherence/host-caps.json` (atomic write):
```json
{
  "schema_version": "1.0",
  "probed_at": "<ISO-8601 UTC>",
  "claude_code_version": "<string>",
  "meets_minimum": true,
  "frontmatter_preserves_unknown_keys": true,
  "git_available": true,
  "git_version": "<string | null>",
  "atomic_rename_ok": true,
  "node_version": "<string>",
  "node_meets_minimum": true,
  "config_present": true,
  "config_valid": true,
  "config_violations": []
}
```

### 8. Report
```
─── Coherence Doctor ────────────────────────────────────
Claude Code:  <version>  <✓ meets minimum | ✗ upgrade required>
Frontmatter:  <✓ preserves unknown keys | ⚠ does not — use /coherence:enable-sidecars>
Git:          <✓ available (<version>) | ✗ not available — commits disabled>
Atomic FS:    <✓ ok | ✗ rename failed — check filesystem>
Node.js:      <version>  <✓ meets minimum | ✗ upgrade required>
Config:       <✓ valid | ✗ N violation(s) — run /coherence:repair>
─────────────────────────────────────────────────────────
Overall:      <✓ READY | ⚠ WARNING(S) | ✗ BLOCKED>
```

- **READY**: all checks pass.
- **WARNING**: non-blocking issues (e.g., no git, frontmatter doesn't preserve keys).
- **BLOCKED**: blocking issues that prevent plugin operation (e.g., Claude Code below minimum, atomic rename failed).

If any WARNING exists, suggest the appropriate remediation command.

## Constraints
- Read-only for user files: only writes to `.claude/coherence/host-caps.json`.
- All writes atomic (temp + rename). (NFR-RELIABILITY-1)
- Do not invoke LLM subagents. (DD-008)
- Temp files must be cleaned up even if a probe step fails.
