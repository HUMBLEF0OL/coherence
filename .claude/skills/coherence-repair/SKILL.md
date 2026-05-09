# Skill: coherence:repair
Trigger: `/coherence:repair`
BRD: FR-COMMANDS-3 · DD-038, DD-045

## Purpose
Targeted recovery from buffer corruption, broken section anchors, or schema validation failures — without a full re-bootstrap. Diagnoses the specific failure mode and applies the minimal fix.

## Steps

### 1. Diagnose
Run four checks in order and report findings before taking any action:

**a. Buffer schema check** — validate every entry in `.claude/coherence/drift-buffer.jsonl` against the v1.0 buffer schema:
- Required fields: `schema_version`, `session_id`, `ts`, `signal_type`, `source_file`, `anchor`, `relation`, `payload`
- `relation` must be one of: `outdated`, `missing`, `contradicts`, `assertion-failed`
- `ts` must be parseable as ISO-8601
- Report: count of valid entries, count of invalid entries, first invalid entry (truncated).

**b. Anchor integrity check** — for each valid buffer entry, verify that the `anchor` value exists as a heading slug or `id=` attribute in the referenced `source_file`:
- Read each referenced doc (skip if doc is not in the tracked list).
- Report: count of dangling anchors (anchor in buffer but not found in doc).

**c. Config schema check** — validate `.claude/coherence/config.yaml`:
- Required fields: `schema_version`, `mode`, `tracked`
- `mode` must be `observe` or `graduated`
- `tracked` must be an array with at least one entry
- Report: valid or list of violations.

**d. Pending.md integrity check** (FR-PERMISSION-6) — validate `.claude/coherence/pending.md` if it exists:
- Each entry must have a `section_id`, `doc_path`, `reason`, and `escalated_at` ISO-8601 timestamp.
- Entries whose `doc_path` is no longer in the `tracked` list are stale.
- Report: count of valid entries, count of malformed entries, count of stale entries (doc no longer tracked).

### 2. Present diagnosis
```
─── Coherence Repair Diagnosis ──────────────────────────
Buffer entries:   <valid_count> valid / <invalid_count> invalid
Anchor issues:    <dangling_count> dangling anchor(s)
Config:           <OK | N violations>
Pending.md:       <valid_count> valid / <malformed_count> malformed / <stale_count> stale
─────────────────────────────────────────────────────────
```
If all checks pass, print "No issues found. Buffer, config, and pending items are healthy." and exit.

### 3. Prompt for repair actions
For each issue found, offer a targeted repair:

**Invalid buffer entries:**
```
Purge <N> invalid buffer entry/entries? [y/n]
```
If yes: rewrite `.claude/coherence/drift-buffer.jsonl` keeping only valid entries. (DD-038)

**Dangling anchors:**
```
Drop <N> buffer entry/entries with dangling anchors? [y/n]
```
If yes: remove entries whose `anchor` cannot be resolved in the target doc. (DD-045)

**Config violations:**
List each violation and for each ask:
```
Reset '<field>' to default value '<default>'? [y/n]
```

**Pending.md issues:**
```
Purge <N> malformed pending entry/entries? [y/n]
Remove <N> stale pending entry/entries (doc no longer tracked)? [y/n]
```
If yes: rewrite `.claude/coherence/pending.md` keeping only valid, non-stale entries. (FR-PERMISSION-6)

### 4. Apply repairs atomically
- All rewrites use temp + rename. (NFR-RELIABILITY-1)
- Log each repair action to `.claude/coherence/metrics.jsonl` with `action: "repair"`.
- Update `state.json`: increment `repair_count`, set `last_repair_ts`.

### 5. Post-repair validation
Re-run the three checks from Step 1. If all pass, print:
```
─── Repair complete — all checks pass ───────────────────
```
If any check still fails, print the remaining issues and suggest `/coherence:recover` for a full re-bootstrap.

## Constraints
- All writes must be atomic (temp + rename). (NFR-RELIABILITY-1)
- Do not invoke LLM subagents — this is a deterministic repair operation. (DD-008)
- Do not modify tracked doc files — only buffer, config, and state files.
- Acquire `.claude/coherence/drift-buffer.jsonl.lock` before modifying the buffer. (FR-FAILURE-3b)
