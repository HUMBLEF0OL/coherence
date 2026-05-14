<!-- url: https://www.notion.so/35f010d46a708191947dfd1e188f89c3 -->
<!-- id: 35f010d4-6a70-8191-947d-fd1e188f89c3 -->
<!-- title: Design Decisions -->
> Living register. v0.4 ended at DD-130. v1.0 starts at **DD-131**. Ratification date is the date the decision was locked in this session.
> DD-131..DD-137 ratified 2026-05-13 (brainstorming session). DD-138..DD-147 ratified 2026-05-13 (OQ resolution session).
> **Audit pass 1 — 2026-05-13:** 12 issues found and amended inline below.
> **Audit pass 2 — 2026-05-13:** 13 additional issues found and amended inline below. All DDs remain ratified.
---
## DD-138 — Trust score formula: exponential decay normalized ratio
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-01
**Decision:** Per-section trust score uses a weighted exponential decay normalized ratio:
`score = Σ(wᵢ × α^(ageᵢ)) / Σ(|wᵢ| × α^(ageᵢ))` ∈ \[-1.0, +1.0\]
Where: `w = +1.0` (accept), `-1.0` (revert), `-0.5` (edit). `α = 0.977 / day` (30-day half-life). `ageᵢ` = days since event.
- Events per section capped at **200** (LRU eviction) to bound computation.
- New sections with no events start at score `0.0` (neutral, not trusted).
- Score stored as a rolling summary in `trust-ledger.json` — recomputed on ledger write, not on every read.
**Rejected alternatives:** Simple rolling ratio (ignores recency within window); Bayesian beta (less intuitive for developers); Wilson score (calibrated for binary corpus evaluation, not per-section continuous trust).
**Performance:** O(min(n, 200)) per section. Zero LLM calls. Zero new dependencies.
**⚠️ Audit amendment (pass 1) — division-by-zero guard:** If denominator \< 0.001, return score = 0.0 (neutral).
**⚠️ Audit amendment (pass 2) — edit weight corrected:** `w_edit = −0.5` in the numerator means a section with only edits scores −1.0 (maximum distrust) — too harsh. **Amended formula:**
- Numerator weight: accept = **+1.0**, edit = **0.0** (neutral), revert = **−1.0**
- Denominator weight (evidence): accept = **1.0**, edit = **0.5**, revert = **1.0**
Edits contribute evidence (denominator) but no directional signal (numerator). A section with only edits scores 0.0 (neutral — seen but not endorsed). A section with mixed accepts and edits scores \> 0 (positive but tempered by edit evidence).
---
## DD-139 — Net-new file trust threshold: hint + explicit promote
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-02
**Decision:** The net-new file auto-land gate is never flipped automatically. Coherence emits a **one-time hint** when all three conditions are met:
1. Personal trust score ≥ **0.85** (from DD-138 formula)
2. ≥ **5 distinct sectionRefs** have ledger entries (prevents gaming via single-section accepts)
3. Ledger spans ≥ **30 days** (first event to now)
Hint text: *“Your trust score qualifies for auto-land. Run **`/coherence:trust --promote`** to activate.”* (one-time, stored in `trust-ledger.json#promote_hint_emitted_at`).
User then runs `/coherence:trust --promote [--auto-land <kinds>]` to activate. Auto-land state stored in `trust-ledger.json#promoted_at` + `#auto_land_kinds`.
**Rationale:** Consistent with DD-129 trigger contract pattern (hint, not auto-flip). Auto-land must be an explicit user decision.
**Performance:** O(1) threshold check on ledger summary. Zero LLM calls. Zero new dependencies.
**⚠️ Audit amendment (pass 2) — 5-section condition tightened:** “≥ 5 distinct sectionRefs have ledger entries” amended to “**≥ 5 distinct sectionRefs with current score \> 0.0**.” A developer with 5 reverted sections (all scores −1.0) must not qualify. Positive score sections only.
---
## DD-140 — Team trust aggregate: recency-weighted per-author mean
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-03
**Decision:** `coherence/trust-aggregate.json` aggregates per-section signals across authors using:
1. Each author contributes their **single most recent signal** per sectionRef (normalized: accept=+1, edit=0, revert=-1).
2. Aggregate score = **arithmetic mean** across all contributing authors for that section.
Result ∈ \[-1.0, +1.0\]. Conflict (equal accepts and reverts) resolves to ≈0 — meaning the section is contested and requires human review in team context.
Author identity: 12-hex SHA-256 of `git config user.email` (DD-132). No clear-text identity in the aggregate file.
**Rejected alternatives:** Additive mean (allows vote-stuffing by prolific committers); conservative veto (one confused developer tanks well-established sections permanently); quorum (undefined for solo developers).
**Edge case:** Solo developer — aggregate = personal score. No special casing needed.
**Performance:** O(authors) per section — typically \< 10. Zero LLM calls. Zero new dependencies.
**⚠️ Audit amendment (pass 1) — author contribution clarified:** Each author contributes their personal trust score (DD-138 formula) for that section. Aggregate = arithmetic mean across contributing authors.
**⚠️ Audit amendment (pass 2) — auto-apply score source specified:** The **personal ledger score** (not the team aggregate) drives the auto-apply trust ladder for an individual developer’s session. The team aggregate score is **informational only** — surfaced in `/coherence:metrics` trust scores section (DD-147) and shown alongside the personal score. Rationale: a developer should not have their session behaviour altered by teammates’ signals they haven’t explicitly reviewed.
---
## DD-141 — Codebase-linked assertion types: `symbol_exists` + `file_exists` in v1.0
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-04
**Decision:** v1.0 ships exactly two codebase-linked assertion types:
- **`symbol_exists: <name>`** — greps source files for the named symbol using the existing hallucination registry language patterns (`src/validation/registries/`). Fails if symbol is absent from codebase at patch-apply time.
- **`file_exists: <path>`** — `fs.statSync` check that the referenced path exists in the repository. Fails if path is absent.
Both are O(1) operations. Both reuse existing infrastructure (hallucination registry, file stat). Zero new dependencies.
**Deferred to v1.1:** `export_documented` (requires export scanning per language), `signature_matches` (high regex false-positive risk across doc/code format divergence).
**Performance:** `symbol_exists` runs grep via hallucination registry — \< 50 ms p95. `file_exists` is a single stat call — \< 1 ms. Zero LLM calls.
**⚠️ Audit amendment (pass 1) — registry usage clarified:** `symbol_exists` reuses language file-glob patterns and grep syntax from hallucination registry but runs an inverted codebase grep via a new `assertSymbolExists(symbol, lang)` wrapper.
**⚠️ Audit amendment (pass 2) — language detection defined:** `lang` is determined by the **primary language detector already used in the hallucination registry** — `detectProjectLanguage()` in `src/validation/hallucination.ts`. This function scans the project root for language indicators (`.ts`, `.py`, `.go` extensions, `package.json`, etc.) and returns the dominant language. Same logic used at Stop time today; reused here with no new code.
---
## DD-142 — Deep audit LLM scope: symbol-sharing pairs, capped at 10
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-05
**Decision:** The `--deep` LLM cross-section consistency pass targets **section pairs that share ≥ 1 symbol** from the hallucination registry. Hard cap: **10 pairs per ****`--deep`**** invocation**.
Before any LLM call, coherence prints:
```javascript
Found N symbol-sharing section pairs. Estimated cost: ~$X.XX. Proceed? [y/N]
```
If pairs \> 10, coherence shows the count and advises narrowing with `--sections <glob>`.
**Token consumption bound:** 10 pairs × \~4k input tokens each = \~40k input tokens max + \~2k output tokens. ≈ \$0.05 worst case at Sonnet pricing. Always gated behind explicit confirmation.
**Uses existing infrastructure:** hallucination registry (no new architecture), `--estimate` confirmation pattern (already in Stage 1 `--estimate` flow).
**Rejected alternatives:** All recent sections (O(n²) pairs, unbounded cost); user-specified (requires codebase knowledge); all pairs with cap (cap is arbitrary without semantic grounding).
**Performance:** Pair identification: O(sections × registry symbols) — fast. LLM call: bounded by cap and user confirmation.
**⚠️ Audit amendment (pass 1) — section-symbol index:** `section-symbol-index.json` cache built alongside `section-index.json`. Pair identification O(symbols). No extra LLM calls.
**⚠️ Audit amendment (pass 2) — build time moved:** Building the index at **Stop time** increases user-visible Stop latency. **Amended:** index is built **lazily on first ****`--deep`**** invocation**, not at Stop time. Cache is invalidated by comparing a hash of `section-index.json` content (not mtime — mtime is unreliable on Windows and network filesystems). On cache hit: O(1). On miss: O(sections × symbols), bounded by the 10-pair cap which terminates early once 10 pairs are found.
---
## DD-143 — `asserts:` violation policy: per-assertion with default warn
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-06
**Decision:** Each `asserts:` entry declares its own violation policy via an optional `(block)` or `(warn)` suffix. Default (suffix omitted) = `warn`.
Frontmatter syntax:
```yaml
asserts:
  - symbol_exists:myFunc (block)
  - has_example
  - file_exists:src/core.ts (block)
```
- `(block)` — patch is rejected; validation pipeline returns error; user sees violation message.
- `(warn)` / default — patch proceeds to review UX with a prominent `[assertion warning]` notice.
**Rationale:** Style assertions (`has_example`) should not block; correctness assertions (`symbol_exists`) should. Per-assertion policy gives authors the precision to express this intent. Default warn is safe for new users.
**Performance:** O(asserts entries) per section — trivial. Zero LLM calls. Zero new dependencies.
**⚠️ Audit amendment (pass 1) — YAML syntax changed to nested list of objects:** `policy` optional (default warn); `param` optional for parameterless assertions.
**⚠️ Audit amendment (pass 2) — parser compatibility + max limit:**
- The existing `parseAnchors.ts` uses `js-yaml` which fully supports nested list-of-objects — no parser changes required. ✅
- **Max 10 assertions per section.** If \> 10 entries: coherence logs a warning and validates only the first 10 (in declaration order). This prevents pathological slowdown in the validation pipeline.
---
## DD-144 — Trust ledger rename handling: `/coherence:repair` detects orphans
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-07
**Decision:** At `/coherence:repair` time, coherence compares `trust-ledger.json` sectionRef keys with the current `section-index.json`. Keys present in the ledger but absent from the index are **orphaned entries**. Repair lists orphaned entries and offers:
1. **Auto-expire** — remove the orphaned entry (trust history lost).
2. **Re-associate** — user selects a current sectionRef to map the orphaned key to; ledger entry is re-keyed.
This extends `/coherence:repair` — already the canonical state-fixing command — with no new commands or architecture.
**Rejected alternatives:** Silent orphan decay (ledger pollutes silently, trust history lost without notice); content-hash keys (broken — content changes with every accepted patch, trust cannot accumulate).
**Performance:** O(ledger entries × section index) — typically \< 1000 × 1000 = fast. Zero LLM calls.
---
## DD-145 — Trust signals delivery: GitHub Releases + cosign + project-root [SECURITY.md](http://SECURITY.md)
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-08
**Decision:**
- **Signed tarball:** GitHub Releases only (consistent with DD-093 — Anthropic plugin registry is canonical; no npm publish). Signed via **cosign** with keyless GitHub OIDC signing (no key management; Rekor transparency log entry for independent verification).
- **SHA-256 manifest:** Committed to `release-artifacts/cohrence-<version>.sha256` (git provenance) + printed in GitHub Release notes body.
- [**SECURITY.md**](http://SECURITY.md)**:** Project root (GitHub/GHSA/Dependabot standard location). Plugin-scoped path rejected — misses GitHub security advisory tooling.
- **M6 gates as README claims:** Add a `## Verification` section to README linking to `release-artifacts/` and Rekor log.
**Build-time dependency only:** `cosign` is a GitHub Actions step — zero runtime dependency, zero package.json change.
**Performance:** N/A (build-time). Signing adds \< 5 s to release pipeline. Zero LLM calls.
**⚠️ Audit amendment 2026-05-13 — two clarifications:**
1. **cosign signing is CI-only.** Keyless signing requires GitHub Actions OIDC token. The local release script (`scripts/release-ga.mjs`) documents that the `sign` step is CI-only and skips with a warning when `GITHUB_ACTIONS` env var is absent.
2. **`.npmignore`**** update required.** `release-artifacts/` must be added to `.npmignore` (and verified absent from `npm pack --dry-run` output via M-LEGACY-1 gate) to prevent SHA-256 files from appearing in the published tarball.
---
## DD-146 — Net-new file gate scope: user-configured, default annotate
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-09
**Decision:** When the user runs `/coherence:trust --promote`, they specify `--auto-land <kinds>` (comma-separated). If omitted, default = `annotate` only.
Allowed values: `annotate`, `skill`, `agent`, `slash_command`. Stored in `trust-ledger.json#auto_land_kinds` (array of strings). Readable via `/coherence:trust --status`.
**Default rationale:** `annotate` kind overwrites existing doc files — lowest risk. `skill` and `agent` have execution implications; `slash_command` modifies plugin surface. These require explicit opt-in.
**Rejected alternatives:** All kinds by default (too risky for first activation); annotate-only hardcoded (removes meaningful user agency for mature installs).
**Consistency:** Aligns with DD-139 (promote via explicit command). The `--auto-land` flag makes scope decision visible at promotion time.
**Performance:** O(1) kind check at proposal acceptance. Zero LLM calls. Zero new dependencies.
**⚠️ Audit amendment (pass 2) — scope label corrected:** The DD title “net-new file gate scope” is misleading. `annotate` kind overwrites **existing** files — it is not a net-new file. **Clarification:** `annotate` is included here as an extension of the **modifying-patch auto-apply trust** (DD-131), not as a net-new file gate relaxation. The true net-new file gate (DD-065 / DD-131) applies only to `skill`, `agent`, and `slash_command`. This DD governs the combined auto-land scope for both categories, with `annotate` as the safe default.
---
## DD-147 — `/coherence:metrics` output: 5 sections + `--since` flag
**Status:** Ratified 2026-05-13 \| **Closes:** OQ-v1-10
**Decision:** `/coherence:metrics` renders these sections in order, as Markdown to chat output:
1. **Summary** — total accepts / reverts / edits / discards, all-time + last 30 days.
2. **Top drifting sections** — sections with highest `metrics.jsonl` buffer-entry frequency (top 10).
3. **Trust scores** — top 10 highest-scored and top 10 lowest-scored sections from `trust-ledger.json`. If ledger absent or \< 3 entries: *“No trust data yet — run more sessions to accumulate metrics.”*
4. **Cost trend** — per-session cost over last 30 days as Unicode block-character sparkline (▁▂▃▄▅▆▇█). If \< 3 sessions: graceful no-data message.
5. **Revert hotspots** — sections with revert rate \> 20% (min 5 events). Actionable list with suggested `/coherence:repair` or anchor review.
**Additional flags:**
- `--since <ISO-date>` — filter metrics to date range (reuses existing `export-metrics` filtering logic).
- `--out <path>` — write report to file (DD-128 sandbox rules apply).
**Implementation:** Zero new dependencies. Sparkline uses Unicode block characters — no npm package. `--since` reuses existing JSONL date-filter logic.
**Performance:** All sections are local file reads. Zero LLM calls. \< 200 ms p95 for a 90-day `metrics.jsonl`.
**⚠️ Audit amendment (pass 1) — revert rate formula:** `reverts / (accepts + reverts + edits)`, min 5 events guard.
**⚠️ Audit amendment (pass 2) — two corrections:**
1. **“Top drifting sections” definition tightened:** “Highest buffer-entry frequency” is misleading — a section always buffered but always dismissed ranks highly despite never applying. **Amended:** Top drifting sections = sections where patches were **applied** most frequently (accepted or auto-applied), sourced from `coherence-log.md` entry count per sectionRef. Sections with high apply rate are genuinely active documentation areas.
2. **Revert hotspot threshold made configurable:** 20% is a reasonable default but different teams have different tolerance. `--revert-threshold <pct>` flag overrides default (e.g. `--revert-threshold 10`). Default 20% retained.
---
## DD-131 — Trust ladder is two-tier
**Status:** Ratified 2026-05-13
**Amends:** DD-065 (trust model)
**Decision:** The v1.0 trust model adds two new levels on top of the v0.4 Graduated mode:
1. **Per-section trust scoring** — a running score per `sectionRef` derived from the trust ledger (accept / revert / edit events). When a section’s score crosses a configurable threshold, modifying patches auto-apply without confirmation (extending the v0.4 additive-only auto-apply rule).
2. **Net-new file gate relaxation** — after a developer crosses a trust threshold (OQ-v1-02), certain proposal `kind` values (OQ-v1-09) can auto-land without `/coherence:propose-accept`. The gate relaxes, it does not disappear; the threshold and scope are user-visible.
**Rejected alternatives:**
- Removing DD-065 entirely — rejected; trust must be earned, not assumed.
- Per-author trust only (no per-section) — rejected; sections have independent quality signals.
**⚠️ Audit amendment 2026-05-13:** Destructive patches (content removal) are **never** auto-applied regardless of trust score. The trust ladder unlocks: additive (already in Graduated mode) and **modifying** patches only. Destructive and frontmatter patches always require confirmation. This preserves the highest-risk review gate unconditionally.
---
## DD-132 — Cross-session learning is file-only, two-tier
**Status:** Ratified 2026-05-13
**Extends:** DD-117 (no backend)
**Decision:** Cross-session pattern learning uses two file-based tiers:
1. **Personal ledger** — `.claude/coherence/trust-ledger.json` (gitignored, per-developer). Records every accept / revert / edit event per `sectionRef` with ISO timestamp and author hash. Survives plugin re-install (preserved by DD-118 re-install contract).
2. **Team aggregate** — `coherence/trust-aggregate.json` (committed, per-team). Aggregated from personal ledgers via `/coherence:trust sync`. Author identity is hashed (12-hex SHA-256 of `git config user.email`); no clear-text identity. Conflict resolution TBD (OQ-v1-03).
No network request is made at any point. `trust-aggregate.json` uses git as the distribution substrate.
**⚠️ Audit amendment (pass 1) — sync mechanism clarified:** `/coherence:trust sync` reads only the current developer’s own `trust-ledger.json` and upserts their entries into the committed team aggregate. No cross-reading of other developers’ private files.
**⚠️ Audit amendment (pass 2) — merge conflict eliminated:** A single `coherence/trust-aggregate.json` file produces git merge conflicts when two developers sync simultaneously — JSON does not merge cleanly. **Decision amended:** each developer’s contribution is stored in a **separate file** at `coherence/trust/<author-hash>.json` (committed). `/coherence:trust sync` writes only `coherence/trust/<own-hash>.json`. No file is shared between developers; no merge conflicts possible. The `/coherence:metrics` command reads all files under `coherence/trust/` to compute team aggregate scores.
---
## DD-133 — `asserts:` frontmatter is two-tier
**Status:** Ratified 2026-05-13
**Decision:** Sections can declare assertions in frontmatter under the `asserts:` key. Two tiers:
1. **Text-pattern assertions** (always-on, no execution) — checked purely against section content. Examples: `no_placeholder_links`, `has_example`, `max_words: 200`. Run synchronously in the validation pipeline before Stage 2.
2. **Codebase-linked assertions** (opt-in, declared per section) — grep / file-stat checks against the codebase. Examples: `symbol_exists: myFunc`, `file_exists: src/core.ts`. Exact types scoped in OQ-v1-04. Run after hallucination check, before patch application.
Violation policy (block vs warn) is per OQ-v1-06. AST-based assertions are post-v1.0.
**⚠️ Audit amendment 2026-05-13 — text-pattern registry defined for v1.0:**
- `has_example` — section content contains at least one fenced or indented code block
- `no_placeholder_links` — no `[text](TODO)`, `[text](#)`, or `[text]()` patterns
- `max_words: N` — section word count ≤ N (words = whitespace-split tokens)
- `min_words: N` — section word count ≥ N
- `no_todo_comments` — no `<!-- TODO` or `<!-- FIXME` markers in section content
All five are pure regex/string checks. Zero LLM calls. Zero new dependencies.
---
## DD-134 — Quality metrics = command output only
**Status:** Ratified 2026-05-13
**Decision:** `/coherence:metrics` renders a Markdown report to chat output only. No file is written unless `--out <path>` is passed (sandbox rules from DD-128 apply). No committed `metrics-report.md`.
**Rationale:** A committed report file exposes per-session aggregate data to team members with different privacy expectations. The per-developer gitignored pattern (established in v0.3) governs all observability state. A user who wants a persistent report can `--out` to a gitignored file.
---
## DD-135 — Deep audit is two-tier
**Status:** Ratified 2026-05-13
**Amends:** FR-AUDIT-1 (v0.4 bundling-only placeholder)
**Decision:** `/coherence:audit` in v1.0 has two execution tiers:
1. **Free tier (always-on)** — token-budget analysis: reports context consumption per section, flags sections bloating the Stop hook budget. No LLM call. Runs in \< 100 ms.
2. **Deep tier (****`--deep`****, opt-in)** — LLM cross-section consistency pass: identifies sections in different files that reference the same symbol but contradict each other. Before the LLM call, coherence prints a cost estimate and requires confirmation (mirrors the `--estimate` gate in `/coherence:review`). Scope of section pairs sent to LLM is OQ-v1-05.
The v0.4 bundling (doctor + scope-debug + status + metrics export) is retained as the report preamble in both tiers.
**⚠️ Audit amendment (pass 1) — token budget measurement:** Per-section token budget uses character count as proxy (1 token ≈ 4 chars). Labels as “estimated tokens.” Actual costs in `cost-ledger.json`.
**⚠️ Audit amendment (pass 2) — bloat thresholds defined:**
- **Normal** — estimated tokens \< 2 000 (\< ≈8 000 chars)
- **Large** ⚠️ — 2 000–5 000 estimated tokens: flagged with advisory
- **Bloated** ❌ — \> 5 000 estimated tokens (≈ 20 000 chars): flagged with strong warning and suggestion to split the section
Thresholds are hardcoded in v1.0; configurable via `coherence/config.json#audit.token_thresholds` in v1.1.
---
## DD-136 — Milestone ordering is trust-first
**Status:** Ratified 2026-05-13
**Decision:** v1.0 milestones ship in this order: M0 (trust ledger foundation) → M1 (trust ladder) → M2 (asserts) → M3 (metrics + deep audit) → M4 (trust signals).
**Rationale:** The trust ledger (M0) is load-bearing infrastructure for three downstream features: M1 trust scoring, G-4 revert-rate metrics, and G-2 team aggregate. Building it first means M2–M4 can consume it as a stable API rather than a bolted-on addition. M4 trust signals are independent of all other milestones and can run in parallel once M0–M3 are in progress.
---
## DD-137 — v0.4.1 trust signals folded into v1.0 M4
**Status:** Ratified 2026-05-13
**Supersedes:** DD-126 (v0.4.1 trigger conditions)
**Decision:** The four v0.4.1 trigger conditions (DD-126) did not fire within the 30-day post-v0.4 GA window. Per DD-126 fallback: trust-signal scope rolls to the next scheduled release. That release is v1.0. The signed-tarball pipeline, `SECURITY.md`, reproducible-build claim, and M6 gates-as-README-claims are now M4 of v1.0 and are no longer trigger-dependent — they ship unconditionally with v1.0 GA.
**Rejected alternative:** Shipping as a standalone v0.5 patch — rejected; the trust-signal work is small, independent of other milestones, and adds no value as a separate release cycle.
**⚠️ Audit amendment (pass 1) — rationale corrected:** Trust signals proactively scheduled for v1.0 M4 — not waiting for trigger conditions. Rationale: prerequisite for adoption, not a reaction.
**⚠️ Audit amendment (pass 2) — minor precision:** v0.4 BRD-5 M-LISTING-1 confirms the marketplace listing was **submitted** at v0.4 GA tag. Correct rationale: “listing submitted but not yet live per Anthropic review timeline; installer distrust signal not yet available.”
——— AUDIT PASS 3 — 2026-05-13 ———
Pass 1 found 12 issues. Pass 2 found 13 issues. Pass 3 found 2 additional issues (diminishing returns confirmed). All DDs remain ratified. Audit is converging — architecture is sound.
DD-132 amendment (pass 3) — stale developer cleanup: Departed developer files would persist indefinitely in coherence/trust/\<author-hash\>.json. Amended: each file carries a last_synced_at ISO timestamp updated on every /coherence:trust sync. Files older than 180 days are excluded from team aggregate at /coherence:metrics read time (not deleted — returning developer reactivates on next sync). Optional /coherence:trust --prune-stale admin command physically removes files older than 365 days.
DD-141 amendment (pass 3) — multi-language project support: detectProjectLanguage() returns only the dominant language, missing symbols in secondary languages (e.g. TS frontend + Python backend). Amended: the assertion param field accepts an optional language suffix, e.g. param: pythonFunc:python. Supported tokens match the hallucination registry: typescript, javascript, python, go, rust. Omitted suffix falls back to detectProjectLanguage() result.
Pass 3 closure: 2 amendments captured above. Recommendation: stop auditing and proceed to v1.0 BRD authoring — the 5 sequencing gates are satisfied and all 17 DDs (DD-131..DD-147) are ratified with audit amendments applied.
