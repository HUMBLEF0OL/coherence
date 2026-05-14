<!-- url: https://www.notion.so/35b010d46a70811c989eeef8b985b5da -->
<!-- id: 35b010d4-6a70-811c-989e-eef8b985b5da -->
<!-- title: 🧠 TS-5 — LLM Pipeline (Author / Annotate) -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-5](https://www.notion.so/35b010d46a708159bd13d26674fccd05). v0.1 Stage 1 / Stage 2 contracts and prompts under `prompts/v1/` are unchanged. v0.2 introduces a parallel **Author** pipeline and an **Annotate** proposer, both shipped under `prompts/v2/`.
---
## 1. Pipeline taxonomy
<table header-row="true">
<tr>
<td>Pipeline</td>
<td>Trigger</td>
<td>Reuses Stage 1?</td>
<td>Output kind</td>
<td>Prompt root</td>
</tr>
<tr>
<td>Stage 1 / Stage 2 (v0.1)</td>
<td>Stop / `/coherence:review`</td>
<td>—</td>
<td>Healing patches</td>
<td>`prompts/v1/`</td>
</tr>
<tr>
<td>Author</td>
<td>Post-Stop (bash + file_creation signals); SessionEnd tail (agent_correction signals only, per FR-AUTHOR-12)</td>
<td>**No** (FR-AUTHOR-2)</td>
<td>Proposal: `slash_command` \| `skill` \| `agent`</td>
<td>`prompts/v2/author/`</td>
</tr>
<tr>
<td>Annotate</td>
<td>Hook timing **pending OQ-v2-NN resolution** (working assumption: Stop tail in continuous mode), OR `/coherence:annotate <path>` on-demand</td>
<td>**No**</td>
<td>Proposal: `annotate`</td>
<td>`prompts/v2/annotate/`</td>
</tr>
</table>
DD-067 deliberately **does not** reuse Stage 1 grouping; the Author pipeline owns its own input contract, prompt(s), and output schema. A Proposer planner stage is added in v0.2 *final* only if v0.2-alpha telemetry shows consolidation has measurable value (FR-AUTHOR-2).
**Two Author entry points.** The Author pipeline is dispatched from two hook sites with shared budgets (`proposals_per_session ≤ 3`, Author cost share ≤ 60% of the +30% headroom, applied across both entry points): (a) **post-Stop** for `bash_repetition` and `file_creation` candidates whose signals are computed during the session, (b) **SessionEnd tail** for `agent_correction` candidates whose line-ratio invocation-aggregate (DD-078, OQ-v2-24) is only computed at SessionEnd. The TS-2 dependency graph and TS-4 §4/§5 reflect both edges.
## 2. Author pipeline contracts
### 2.1 Input contract
One invocation per enqueued signal. Input envelope (passed to the proposer prompt as a structured user message):
```json
{
  "signal": {
    "kind": "bash_repetition",            // | 'file_creation' | 'agent_correction'
    "signal_refs": [ "<signal-cache entry hash>" ],
    "summary": {                              // privacy-safe summary; raw content NEVER included
      "normalised_command": "git push <FLAGS> <BRANCH>",   // Bash only, FR-OBS-N1a placeholders
      "count": 3,
      "window_minutes": 30
    }
  },
  "context": {
    "workspace_kind": "node" | "python" | "unknown",
    "existing_commands": ["..."]              // names only, for collision avoidance hints
  }
}
```
### 2.2 Output contract (matches `proposal.schema.json`, DD-087)
See TS-3 §3.6 for the full schema. The proposer prompt MUST emit JSON conforming exactly; `additionalProperties: false`.
### 2.3 Validation pipeline
Two-phase per FR-AUTHOR-1:
```javascript
A. Generate-time validation (run before persisting to proposal-cache):
   1. proposal.schema.json structural validation (DD-087)
   2. coherence/ignore respect: proposed_path NOT in ignore (FR-PERMISSION-N4)
   3. Name-collision pre-check against existing target path
   4. Hallucination grep: every code-fenced reference in `body` MUST resolve to a workspace path or an explicit `<placeholder>` token

B. Accept-time validation (re-run on /coherence:propose-accept):
   1. proposal.schema.json re-validate (drift between generation and acceptance)
   2. DD-082 collision re-check (target path may have appeared since generation)
   3. If --rename: rename validation
   4. If --overwrite <retyped-path>: typed path MUST equal the proposed_path; quarantineFile() the existing file before write
```
### 2.4 Cost accounting
- Model: `claude-sonnet-4-5-20251022`, `temperature: 0` (FR-COST-N5).
- Each call appends a `CostEntry { stage: 'author', prompt_version: { author: 'v2.0' }, ... }` to `cost-ledger.json`.
- Before each call: `CostLedger.totalCostUsd()` is compared against the **per-feature share** of the +30% headroom (Author ≤ 60%, Annotate ≤ 30%, Trickle ≤ 10%); on overrun, **no LLM call is issued** for the remainder of the session, `cost_ceiling_hit { feature, total_usd, ceiling_usd }` and `degraded_mode_entered` are emitted (DD-061 precedent reused). (FR-COST-N3, NFR-COST-N1..N2)
### 2.5 Latency budget
- Author-pipeline-run p95 latency ≤ 5 s (FR-AUTHOR-4, NFR-PERF-N1, PG-1) — budget covers the entire Author run for the session, **not** each individual proposal. With `proposals_per_session ≤ 3` (FR-AUTHOR-3) the implied per-proposal budget is ≈ 1.6 s.
- Aggregate Stop+Author p95 ≤ 15 s when proposals exist.
- Author pipeline runs **after** Stop output is committed; failure does NOT corrupt the v0.1 healing UX (FR-AUTHOR-5).
### 2.6 Per-kind proposers
<table header-row="true">
<tr>
<td>Kind</td>
<td>Source signal</td>
<td>Output artifact</td>
</tr>
<tr>
<td>`slash_command`</td>
<td>Bash repetition (DD-076)</td>
<td>Markdown command file under `.claude/commands/<name>.md` (proposed_path)</td>
</tr>
<tr>
<td>`skill`</td>
<td>File creation pattern (DD-077)</td>
<td>[SKILL.md](http://SKILL.md) scaffold under `.claude/skills/<name>/SKILL.md`</td>
</tr>
<tr>
<td>`agent`</td>
<td>Agent correction (DD-078)</td>
<td>Refinement to existing `<agent>.agent.md` OR `CLAUDE.md` addition</td>
</tr>
</table>
> **Note (TS-introduced).** Per-kind `proposed_path` conventions (`.claude/commands/<name>.md`, `.claude/skills/<name>/SKILL.md`, agent refinement vs. `CLAUDE.md` addition) are inferred from Claude Code conventions — not pinned by FR-AUTHOR rows. Implementation PRs MAY adjust on review.
## 3. Annotate proposer
### 3.1 Trigger
- **Continuous mode hook timing is unfixed.** BRD FR-ANNOTATE-1 mandates "per anchor-less doc detected within an Annotate-enabled scope" but does not pin the hook event. Working assumption pending OQ-v2-NN: dispatch on Stop tail (after v0.1 healing pipeline) for any anchor-less doc touched in the session, generating up to `annotate_calls_per_session` (default 5) annotation proposals (FR-ANNOTATE-6).
- On-demand: `/coherence:annotate <path>` produces a single proposal regardless of global mode, but **respects** `coherence/ignore` (FR-ANNOTATE-7..8).
### 3.2 Output contract
Proposal of `kind = 'annotate'` carrying:
- Candidate frontmatter / anchor block in the v0.1 byte-for-byte format (FR-ANNOTATE-2).
	- Prose: paired `<!-- coherence:section id=auto-<heading-slug> ... -->` blocks.
	- Skills/agents: `coherence:` block in YAML frontmatter.
	- Sidecar fallback when `host-capabilities.frontmatter_preserves_unknown_keys == false` (DD-069).
- All blocks MUST include `auto-annotated: true` (FR-ANNOTATE-3) for rollback discoverability.
- Heading-slug ids satisfy `[a-z0-9_-]+` and auto-disambiguate with `-N` (FR-ANNOTATE-4).
- Inferred `watches:` glob.
### 3.3 Hallucination grep
Annotation proposals additionally assert:
- Every generated `<heading-slug>` corresponds to an actual heading in the target doc.
- `watches:` globs resolve to at least one file (or are explicit user-provided patterns).
### 3.4 Cost accounting
Annotate calls log `CostEntry { stage: 'annotate', prompt_version: { annotate: 'v2.0' } }`. Per-feature share ≤ 30% of the +30% headroom (FR-COST-N2).
## 4. Prompt management (`prompts/v2/`)
```javascript
prompts/v2/
  manifest.json              # see TS-3 §4
  author/
    slash_command.md
    skill.md
    agent.md
  annotate/
    annotate.md
  schema/
    proposal.schema.json     # the closed schema (DD-087)
```
- All prompts pinned by version in `manifest.json` (FR-COST-N5).
- `prompts/v1/` ships unchanged side-by-side (NFR-MAINT-N2).
- Cassettes recorded under `tests/cassettes/author/` and `tests/cassettes/annotate/` (FR-COST-N6).
## 5. Hallucination grep (shared)
Reused unchanged from v0.1: every workspace-relative path mentioned in the proposed `body` MUST resolve in the current workspace, or be an explicit `<placeholder>` token. (No additional v0.2 extensions are mandated by the BRD.)
## 6. Failure semantics
<table header-row="true">
<tr>
<td>Failure</td>
<td>Behaviour</td>
</tr>
<tr>
<td>LLM 5xx / timeout</td>
<td>Skip the proposal; emit `proposal_validation_failed { reason: 'llm_error' }`; do not retry in this session.</td>
</tr>
<tr>
<td>Schema-invalid output</td>
<td>Drop; emit `proposal_validation_failed { reason: 'schema' }`.</td>
</tr>
<tr>
<td>Hallucination grep failure</td>
<td>Drop; emit `proposal_validation_failed { reason: 'hallucination' }`.</td>
</tr>
<tr>
<td>`coherence/ignore` hit</td>
<td>Drop pre-LLM (generate-time validation); emit `proposal_validation_failed { reason: 'ignored' }`.</td>
</tr>
<tr>
<td>Cost-ceiling overrun</td>
<td>No LLM call issued; emit `cost_ceiling_hit + degraded_mode_entered`; remainder of session is no-LLM.</td>
</tr>
</table>
## 7. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>FRs</td>
<td>NFRs</td>
<td>DDs</td>
</tr>
<tr>
<td>§1..§2 Author pipeline</td>
<td>FR-AUTHOR-1..14, FR-COST-N1..N6, FR-PROPOSE-13, FR-PERMISSION-N4</td>
<td>NFR-PERF-N1, NFR-COST-N1..N2</td>
<td>DD-067, DD-076..078, DD-082, DD-085, DD-087, DD-091</td>
</tr>
<tr>
<td>§3 Annotate</td>
<td>FR-ANNOTATE-1..8</td>
<td>NFR-PRIVACY-N2</td>
<td>DD-069, DD-073</td>
</tr>
<tr>
<td>§4 Prompts</td>
<td>FR-COST-N5..N6</td>
<td>NFR-MAINT-N2</td>
<td>DD-091</td>
</tr>
<tr>
<td>§5 Hallucination grep</td>
<td>FR-AUTHOR-1, FR-PROPOSE-13</td>
<td>—</td>
<td>DD-087</td>
</tr>
<tr>
<td>§6 Failures</td>
<td>FR-AUTHOR-5, FR-PROPOSE-13, FR-COST-N3</td>
<td>NFR-RELIABILITY-N2</td>
<td>DD-085, DD-087, DD-088</td>
</tr>
</table>
