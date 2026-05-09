# Skill: coherence:review
Trigger: `/coherence:review`
BRD: FR-COMMANDS-2 · DD-021

## Purpose
Run the full Stop pipeline on demand mid-session: group buffer entries → Stage 1 planner (multi-section groups only) → parallel Stage 2 patch writers → permission UX. Equivalent to a manual Stop trigger. Works in both `observe` and `graduated` modes.

## Flags
- `--estimate` — count buffer entries and project token cost without any LLM calls. (FR-MIDSESSION-6)
- `--dry-run` — run all stages but do not apply any patches; print the diff set only.

## Steps

### 1. Pre-flight
- Check whether `.claude/coherence/disabled` sentinel file exists. If it does, abort: "Coherence is disabled. Run `/coherence:recover` first."
- Read `.claude/coherence/drift-buffer.jsonl`. Acquire lock (`.claude/coherence/drift-buffer.jsonl.lock`) before reading. (FR-FAILURE-3b)
- If buffer is empty: print "No drift signals in buffer. Nothing to review." and exit.
- Read `.claude/coherence/config.yaml` to get `tracked` list and `mode`.
- If `--estimate` flag: count entries, estimate tokens at ~200 tokens/Stage-2-call × (number of sections after grouping, capped at 36), print estimate, and exit.

### 2. Group buffer entries (deterministic, no LLM)
Group buffer entries by the set of tracked doc sections they implicate:

1. For each buffer entry, resolve which `(doc_path, section_anchor)` pairs it touches based on `source_file` and `matched_watch_glob`.
2. Merge entries that implicate overlapping section sets into the same group (union-find).
3. Deduplicate entries with identical `(source_file, anchor, relation)` within a session — keep the most recent.
4. Apply **FR-STOP-10 caps** before proceeding:
   - Process at most **3 groups** per review run.
   - Each group may contain at most **12 sections**.
   - Total Stage 2 calls across all groups: at most **36**.
   - If more groups or sections exist beyond the caps, mark excess as **deferred** (FR-BUFFER-3) and note in the summary.

### 3. Check for existing checkpoint
- Read `.claude/coherence/stop-progress.json` if it exists. (FR-STOP-12)
- If present and `status == "in-progress"`, offer to resume from the last completed group or start fresh.
- On fresh start, write an initial checkpoint: `{status: "in-progress", groups_total: N, groups_completed: 0, started_at: "<ISO-8601>"}`.

### 4. For each group (up to 3): run the pipeline

#### 4a. Single-section group → Stage 2 directly
If the group has exactly **1 section**:
- Skip Stage 1. Read the section's current content fresh from disk.
- Invoke `coherence-patcher` (Stage 2) with:
  ```json
  {
    "session_changes_json": { ... },
    "section_content": "<fresh content>",
    "section_id": "<id>",
    "doc_path": "<path>",
    "change_class": "<from buffer hint or 'modifying' if unknown>"
  }
  ```
  (No `stage1_plan` field — it is omitted for single-section groups.)
- Proceed to step 4c.

#### 4b. Multi-section group → Stage 1 → parallel Stage 2
If the group has **2+ sections**:
- Read each section's current content fresh from disk (truncated to ≤1500 chars for Stage 1 input).
- Invoke `coherence-planner` (Stage 1) once with all sections.
- Receive the plan: `{canonical, assignments[], demoted_canonicals[]}`.
- For sections with `role: "no-change"`: emit `NO_PATCH_NEEDED` immediately without a Stage 2 call.
- For all other sections: invoke `coherence-patcher` (Stage 2) **in parallel** (up to 8 concurrent calls per FR-STOP-10), passing the fresh section content + relevant `stage1_plan` fields (`{role, relation, peer_roles}`).

#### 4c. Handle Stage 2 responses
For each Stage 2 response:
- `diff` → queue for permission UX (step 5).
- `NO_PATCH_NEEDED` → note as clean; no user action needed.
- `ESCALATE` → write to `.claude/coherence/pending.md` with the reason. Log to metrics. (FR-STOP-5)
- `PLAN_DISAGREES` → re-invoke Stage 1 for this group once (only once). If Stage 2 still returns `PLAN_DISAGREES` on retry, write to `pending.md` and continue. (FR-STOP-5)

#### 4d. Checkpoint after each group
After all Stage 2 calls for a group complete, update `stop-progress.json`:
```json
{
  "status": "in-progress",
  "groups_total": N,
  "groups_completed": M,
  "last_group_id": "<group identifier>",
  "updated_at": "<ISO-8601>"
}
```
(FR-STOP-12)

### 5. Permission UX — atomic bundle presentation (FR-STOP-9)

Patches are presented **per group** as an atomic accept/reject bundle — not patch-by-patch. The user either accepts or rejects the whole group.

```
─── Coherence Review — Group <M>/<N> ────────────────────
Docs in this group: <list of doc_path values>
Sections:           <count>
Patches proposed:   <count>  (<additive: N>  <modifying: N>  <destructive: N>)

[1/<count>] <doc_path> § <section_anchor>
  Relation: <relation>
  Class:    <additive | modifying | destructive | frontmatter>

<diff hunk>

[2/<count>] ...

Accept all patches in this group? [y]es / [n]o / [v]iew-full-doc / [d]efer-group
```

- `y` — apply all patches in the group atomically.
- `n` — reject all patches in the group; mark all as deferred in the buffer. (FR-BUFFER-3)
- `v` — display the full current document for the first doc in the group, then re-show the prompt.
- `d` — explicitly defer this group; same as `n` but marks reason as "user-deferred".

**Graduated mode auto-apply rule** (FR-PERMISSION-8):
If `mode == "graduated"` and **all** patches in a group are `additive` (zero `lines_removed`), auto-accept the group without prompting. Print:
```
✓ Group <M> auto-applied (graduated mode, all patches additive).
```

If any patch in the group is `modifying` or `destructive`, always prompt — even in graduated mode. (FR-PERMISSION-9)

**Observe mode**: always prompt for every group regardless of patch class. (FR-PERMISSION-10)

### 6. Apply accepted patches
For each accepted group:
- Apply each patch atomically: write to temp file, rename over target. (NFR-RELIABILITY-1)
- If `git_available` in host caps: stage a git commit per group with prefix `[coherence] review: <first doc> and <N-1> others`. (FR-PERMISSION-4)
- Log each applied patch to `.claude/coherence/metrics.jsonl` with `action: "patch_applied"`.
- Update `.claude/coherence/cost-ledger.json` with token usage.

### 7. Buffer cleanup
- Entries from **reviewed groups** (accepted or rejected): mark `state: "reviewed"` and remove from active buffer. (FR-BUFFER-5)
- Entries from **deferred groups**: mark `state: "deferred"` and keep in buffer for next session. (FR-BUFFER-3)
- Entries from **groups beyond the cap** (not processed this run): leave untouched with current state.
- Write the updated buffer atomically. Release lock.

### 8. Finalize checkpoint
Write final `stop-progress.json`:
```json
{
  "status": "complete",
  "groups_total": N,
  "groups_completed": M,
  "completed_at": "<ISO-8601>"
}
```

Update `state.json`: set `last_review_ts`, `last_review_item_count`, reset `consecutive_failure_count` to 0.

### 9. Summary

```
─── Review complete ──────────────────────────────────────
Groups processed:  <M> of <N>
Patches applied:   <count>
Patches deferred:  <count>
Escalated:         <count> (see .claude/coherence/pending.md)
Deferred groups:   <count> (will re-surface next session)
Cost:              ~$<X.XX> (<N> tokens)
─────────────────────────────────────────────────────────
```

If any groups were capped (beyond FR-STOP-10 limits), append:
```
ℹ  <N> group(s) exceeded the per-run cap and will be processed next session.
```

## Constraints
- LLM stages MUST only run at Stop or `/coherence:review` time — never inside PreToolUse/PostToolUse hooks. (DD-008)
- All file writes must be atomic (temp + rename). (NFR-RELIABILITY-1)
- Acquire buffer lock before any read or write to drift-buffer.jsonl. (FR-FAILURE-3b)
- Maximum 3 groups, 12 sections/group, 36 Stage 2 calls per review run. (FR-STOP-10)
- Skipped/deferred entries stay in the buffer as `state: "deferred"` — never delete unreviewed entries. (FR-BUFFER-3)
- Do not invoke LLM subagents outside of steps 4a–4b. (DD-008)
- ESCALATE and PLAN_DISAGREES outcomes always write to pending.md — never silently drop. (FR-STOP-5)
