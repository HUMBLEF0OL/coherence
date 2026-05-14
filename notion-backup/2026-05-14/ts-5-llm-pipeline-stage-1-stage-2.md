<!-- url: https://www.notion.so/35b010d46a708159bd13d26674fccd05 -->
<!-- id: 35b010d4-6a70-8159-bd13-d26674fccd05 -->
<!-- title: TS-5 — LLM Pipeline (Stage 1 / Stage 2) -->
**Parent:** [📐 11. Technical Specification — Coherence v0.1](https://www.notion.so/35b010d46a70815285cef48ffce741d4)
---
## 5.1 Pipeline Shape
Two distinct LLM call types, **only at Stop** or `/coherence:review`:
```javascript
Group with 1 section  → Stage 2 (single call)
Group with 2+ sections → Stage 1 (one call)  → Stage 2 (≤N parallel calls, per-section)
```
No other LLM call type exists in v0.1 (token strategy §"What Never Happens").
## 5.2 Provider & Model
- Provider: Anthropic API.
- Model: Sonnet 4.5 (or successor; pinned in `prompts/v{n}/manifest.json`).
- Prompt caching enabled for the stable Stage 1 / Stage 2 prefix (FR-STOP-13, NFR-COST-6). Budget assumes \~70% input-token savings on cache hits within the 5-minute idle window.
- Max concurrency: 8 parallel Stage 2 calls (NFR-PERF-10).
## 5.3 Stage 1 — Coherence Planner
### Input contract
- Code-change summary derived deterministically from buffer entries' `triggering_files` (no LLM-generated summary).
- For each affected section: `{section_id, doc_path, role_declared?, current_content_text, frontmatter_yaml, depth_score (DD-016, pre-computed)}`.
- Tiebreak metadata: deepest common ancestor `D` and per-section directory distance to `D`.
### Output contract
JSON conforming to `plan_schema_version: 1`:
```json
{
  "canonical": "<section_id>",
  "assignments": [
    { "section_id": "...",
      "role": "canonical|reference|consumer|no-change",
      "relation": "extends|supersedes|contradicts|omits" }
  ],
  "demoted_canonicals": ["<section_id>", ...]
}
```
### Validation (deterministic, post-LLM)
- Exactly one `canonical`.
- All flagged sections accounted for.
- IDs valid (match input).
- JSON schema conforms.
- Reject `role: no-change` + `relation: omits` as contradictory → fall back to per-section independent patches with logged warning (FR-STOP-16).
Validation failure → fall back to independent patches; warning to `revalidation-log.md` and `coherence-log.md` (FR-STOP-3, NFR-OBS-3).
### Quality gate
QG-1: ≥90% schema-valid across the planner fixture set.  
- Traces to: NFR-QUALITY-1 (planner schema-validation quality gate).
QG-2: ≥80% picks the correct canonical against expected role assignments.
- Traces to: NFR-QUALITY-2 (canonical-recall quality gate).
### Prompt
Versioned at `prompts/v1/stage1-planner.md`. Bumping `n` requires green QG-1/QG-2 (NFR-MAINT-1). Carries the role definitions, change-relation enum, six rules (canonical singularity, declared-role honour, architecture/skill/[CLAUDE.md](http://CLAUDE.md) tiebreakers, JSON-only output) per [📋 8. Patch Quality & Prompt Design](https://www.notion.so/9bc010d46a708234863f8193175d1c71) Stage 1.
## 5.4 Stage 2 — Patch Writer
### Input contract
Per-section, one call:
- Session changes JSON (deterministically built from buffer + git status of triggering files).
- The single affected section content (read fresh from disk at call time, FR-STOP-15).
- The Stage 1 plan (when one ran) with this section's role + relation + peer roles.
- The deterministic `change_class` (additive / modifying / destructive / frontmatter), already recounted (FR-STOP-6b).
### Output contract
Exactly one of:
<table header-row="true">
<tr>
<td>Output</td>
<td>Meaning</td>
</tr>
<tr>
<td>Unified diff against the section</td>
<td>Apply candidate</td>
</tr>
<tr>
<td>`NO_PATCH_NEEDED`</td>
<td>Section already correct</td>
</tr>
<tr>
<td>`ESCALATE`</td>
<td>Cannot be expressed without major rewrite</td>
</tr>
<tr>
<td>`PLAN_DISAGREES <one-line reason>`</td>
<td>Plan role incompatible with section reality (DD-033)</td>
</tr>
</table>
### Behaviour rules (in prompt)
Per [📋 8. Patch Quality & Prompt Design](https://www.notion.so/9bc010d46a708234863f8193175d1c71) Stage 2: surgical-only, no rewrites for style, no scope creep, never invent paths/symbols, change-class enforced, plan-disagree escape hatch, negative examples included.
### Plan-derived role behaviour
- `role: no-change` → **no Stage 2 call**; pipeline records `NO_PATCH_NEEDED` automatically (FR-STOP-16).
- `PLAN_DISAGREES` → patch dropped from bundle, no retry, single user-visible note; section transitions to `state: deferred` (FR-STOP-17).
## 5.5 Validation Pipeline
Five deterministic checks, in order, first failure short-circuits (FR-STOP-6):
<table header-row="true">
<tr>
<td>#</td>
<td>Check</td>
<td>Reject path</td>
<td>DD / FR</td>
</tr>
<tr>
<td>1</td>
<td>Format</td>
<td>Reject malformed diff or unknown literal</td>
<td>DD-008</td>
</tr>
<tr>
<td>2</td>
<td>Apply</td>
<td>`git apply --check` against current section</td>
<td>DD-008</td>
</tr>
<tr>
<td>3</td>
<td>Sanity / change-class recount</td>
<td>Reclassify (not reject) on disagreement; auto-apply privilege follows recount</td>
<td>FR-STOP-6b, DD-017</td>
</tr>
<tr>
<td>4</td>
<td>Line-count ratio</td>
<td>`(added+removed)/original > 0.40` → auto-`ESCALATE`</td>
<td>DD-008</td>
</tr>
<tr>
<td>5</td>
<td>Hallucination grep (two-tier)</td>
<td>Strict reject; loose-only ≥3 unknown → demote class one tier</td>
<td>FR-STOP-6c, FR-STOP-7, DD-032, DD-047, DD-058</td>
</tr>
</table>
All failures → silent log to `revalidation-log.md` with the failed check identifier and the rejected payload (FR-OBS-4, NFR-OBS-3). Nothing reaches the user from a failed Stage 2 patch.
### Hallucination grep (DD-032, DD-047)
Per-token deterministic regex tiering:
<table header-row="true">
<tr>
<td>Tier</td>
<td>Token kind</td>
<td>Source-of-truth corpus</td>
</tr>
<tr>
<td>Strict</td>
<td>Paths (`/`, `\`, `::`); member-access chains (`foo.bar`); import-line tokens; length-≥16 with structural marker; length-≥6 mixed-case-with-digit</td>
<td>Changed files in this session</td>
</tr>
<tr>
<td>Loose</td>
<td>Everything else (bare symbols, common identifiers)</td>
<td>Whole project surface</td>
</tr>
</table>
Language detection by file extension. v0.1 import-line registry: TypeScript/JavaScript, Python, Go, Rust, Java, C#, Ruby, PHP. Unregistered languages still get rules 1, 2, 4, 5.
Quality gates: QG-4 ≤2% escape rate on DD-058 corpus (50 valid + 50 hallucinated, 8+2 langs); QG-5 per-language precision/recall published.
- Traces to: NFR-QUALITY-4 (hallucination-escape quality gate), NFR-QUALITY-5 (per-language precision quality gate).
## 5.6 Cost & Caps
Per-Stop hard caps (DD-056, FR-STOP-10):
<table header-row="true">
<tr>
<td>Cap</td>
<td>Value</td>
</tr>
<tr>
<td>Trigger groups</td>
<td>≤3</td>
</tr>
<tr>
<td>Sections per group</td>
<td>≤12</td>
</tr>
<tr>
<td>Total Stage 2 calls</td>
<td>≤36</td>
</tr>
<tr>
<td>Total input tokens</td>
<td>≤30,000</td>
</tr>
<tr>
<td>Total output tokens</td>
<td>≤8,000</td>
</tr>
<tr>
<td>Stage 2 concurrency</td>
<td>≤8</td>
</tr>
</table>
When a cap fires: select sections by canonical-first priority (FR-STOP-14) and defer overflow to `pending.md` with a user-visible "N sections deferred" notice (FR-STOP-11).
Cost telemetry per Stop in `metrics.jsonl` (NFR-COST-5). Cost ledger aggregated across review + Stop in `cost-ledger.json` (FR-OBS-6).
`/coherence:review --estimate` runs Stage 1 only (or pure heuristic) to project spend before any chargeable call (FR-MIDSESSION-6).
## 5.7 Assertion Engine (`asserts:`)
v0.1 evaluates exactly **one predicate kind**: `import_exists "<token>"` against indexed code files (BRD-5 §5.3 deferred row).
- Run at SessionStart; failure becomes a synthetic trigger group with planner role `assertion-failed` and relation `contradicts` (FR-STOP-19, DD-054).
- Stop review surfaces `[assert]`-tagged rows with a 3-action UX (Patch / Update assertion / Dismiss) and `last-verified` age (FR-PERMISSION-8, FR-PERMISSION-10).
- Buffer entries from assertions carry `source: assertion` (FR-STOP-19).
Richer predicates (AST invariants, regex-on-output, custom matchers) are deferred to v1.0.
## 5.8 Prompt Management
- Prompts live under `prompts/v{n}/` (NFR-MAINT-1, FR-STOP-13).
- A `manifest.json` per version pins model name, model temperature, schema version, and known-good fixture identifiers.
- Cassette tests record/replay raw API responses; refresh requires explicit CI flag (BRD-4 §4.2).
- Prompt-version bump requires QG-1, QG-2, QG-3 green (gating prevents R-11).
## 5.9 Failure Handling Specific to LLM Pipeline
<table header-row="true">
<tr>
<td>Failure</td>
<td>Behaviour</td>
<td>Source</td>
</tr>
<tr>
<td>API outage / network error</td>
<td>Whole Stop run aborts cleanly; buffer entries persist to `pending.md`; user-visible one-liner</td>
<td>R-15, FR-BUFFER-4</td>
</tr>
<tr>
<td>Rate-limit (429)</td>
<td>Bounded retry with backoff; if budget exceeded → same as outage</td>
<td>DD-056</td>
</tr>
<tr>
<td>Malformed Stage 1 JSON</td>
<td>Fallback to independent patches; log warning</td>
<td>FR-STOP-3</td>
</tr>
<tr>
<td>`PLAN_DISAGREES` for any section</td>
<td>Drop section from bundle, defer state, single review note</td>
<td>FR-STOP-17</td>
</tr>
<tr>
<td>Validation reject</td>
<td>Silent log; never reaches user</td>
<td>FR-OBS-4</td>
</tr>
<tr>
<td>Crash mid-Stage 2</td>
<td>Resume from `stop-progress.json`; skip done sections</td>
<td>FR-STOP-12, NFR-RELIABILITY-2</td>
</tr>
</table>
## 5.10 Cross-References
- Validation regex tiers and per-language registries: TS-2 §2.7.
- Cost aggregation in `/coherence:status`: TS-7 §7.4.
- Prompts versioning + cassette policy: TS-5 §5.8; maintainability rule for prompt versions: TS-7 §7.8. State-file schema migration chain (separate from prompt versioning): TS-8 §8.5.
- Quality gates: TS-9 §9.3.
