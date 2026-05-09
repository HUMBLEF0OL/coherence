# Skill: coherence:review
Trigger: `/coherence:review`
BRD: FR-COMMANDS-2 · DD-021

## Purpose
Run the full Stop pipeline mid-session on demand: Stage 1 heuristic triage → Stage 2 planner → Stage 3 ranker → Stage 4 patcher → permission UX. Equivalent to a manual Stop trigger. Works in both `observe` and `graduated` modes.

## Flags
- `--estimate` — run Stage 1 only and project token cost without making any LLM calls. (FR-MIDSESSION-6)
- `--dry-run` — run all stages but do not apply any patches; print the diff set only.

## Steps

### 1. Pre-flight
- Read `.claude/coherence/config.yaml`. If `plugin_disabled: true`, abort with: "Coherence is disabled. Run `/coherence:recover` first."
- Read `.claude/coherence/drift-buffer.jsonl`. If empty, print "No drift signals in buffer. Nothing to review." and exit.
- If `--estimate` flag present: count buffer entries, estimate tokens at ~150 tokens/entry × 2 (planner + ranker), print the estimate, and exit without LLM calls.

### 2. Stage 1 — Heuristic triage (deterministic, no LLM)
- Load all buffer entries from `.claude/coherence/drift-buffer.jsonl`.
- Filter out entries older than 7 days (FR-BUFFER-4).
- Deduplicate entries with identical `(source_file, anchor, relation)` within the same session — keep only the most recent.
- Load snapshots for all tracked docs listed in config's `tracked` array (read each file, truncate to ≤1500 chars per doc).
- Build the Stage 2 input object.

### 3. Stage 2 — Invoke coherence-planner agent
- Pass the filtered buffer entries and doc snapshots to the `coherence-planner` subagent.
- Receive `PlannerOutput` JSON.
- If `PlannerOutput.items` is empty: print "Stage 2 found no actionable drift. Buffer cleared." Clear the buffer and exit.

### 4. Stage 3 — Invoke coherence-ranker agent
- For each `target_doc` in `PlannerOutput.items`, read the doc and extract its section anchor list (headings + id attributes).
- Pass `PlannerOutput` + `candidate_sections` map to the `coherence-ranker` subagent.
- Receive `RankerOutput` JSON.

### 5. Stage 4 — Invoke coherence-patcher agent
- For each item in `RankerOutput.items`, read the relevant section content from the target doc.
- Pass `RankerOutput` + `section_contents` + `language_registry` + current `mode` to the `coherence-patcher` subagent.
- Receive `PatcherOutput` JSON.
- If `PatcherOutput.patches` is empty: print "Stage 4 produced no valid patches." and exit.

### 6. Permission UX (FR-PERMISSION-1 through FR-PERMISSION-7)
Present each patch for user review:

```
─── Coherence Review — <N> patch(es) proposed ──────────
[1/<N>] <target_doc> § <resolved_anchor>
Relation:  <relation>
Class:     <additive | update | deletion>
Rationale: <rationale>

<diff content>

Apply? [y]es / [n]o / [a]ll / [s]kip-all / [v]iew-full-doc
```

- `y` — apply this patch only.
- `n` — skip this patch (do not apply).
- `a` — apply all remaining patches without further prompts.
- `s` — skip all remaining patches.
- `v` — show the full current document before deciding.

In `observe` mode: any `deletion` or `update` class patches MUST be shown to the user; they cannot be auto-applied even with `a`.

### 7. Apply approved patches
- For each approved patch: apply atomically via temp-file + rename. (NFR-RELIABILITY-1)
- Stage git commit with prefix `[coherence] patch: <target_doc> §<anchor>` if `git_available` in host caps. (FR-PERMISSION-4)
- Log applied patch metadata to `.claude/coherence/metrics.jsonl`.

### 8. Post-review cleanup
- Remove all buffer entries for sessions that had at least one item reviewed (regardless of approval). (FR-BUFFER-5)
- Update `.claude/coherence/state.json`: set `last_review_ts`, `last_review_item_count`, reset `consecutive_failure_count` to 0.
- Update `.claude/coherence/cost-ledger.json` with token usage for this review run.

### 9. Summary
Print:
```
─── Review complete ──────────────────────────────────────
Applied:  <N> patch(es)
Skipped:  <N> patch(es)
Buffer:   cleared for reviewed sessions
Cost:     ~$<X.XX> (<N> tokens)
─────────────────────────────────────────────────────────
```

## Constraints
- LLM stages (2/3/4) MUST only run at Stop or `/coherence:review` time — never inside PreToolUse/PostToolUse hooks. (DD-008)
- All file writes must be atomic (temp + rename). Never partially write a doc. (NFR-RELIABILITY-1)
- Maximum 20 items per plan (enforced by planner). If > 20 items remain after review, append overflow to `.claude/coherence/pending.md` with a "N sections deferred" notice. (FR-STOP-11)
- Concurrent session safety: acquire `.claude/coherence/drift-buffer.jsonl.lock` before reading/writing buffer. (FR-FAILURE-3b)
