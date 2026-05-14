<!-- url: https://www.notion.so/35f010d46a70811d9000c58a1ec70dde -->
<!-- id: 35f010d4-6a70-811d-9000-c58a1ec70dde -->
<!-- title: TS-6 — Deep Audit & Section-Symbol Index -->
TS-6 — DEEP AUDIT & SECTION-SYMBOL INDEX. Maps to FR-AUDIT-2..5, NFR-PERF-N7, DD-135, DD-142.
Free-tier audit (FR-AUDIT-2, always-on, no LLM)
- Entry: /coherence:audit routes to src/audit/tokenBudget.ts (free) or src/audit/deepConsistency.ts (--deep).
- Token budget (src/audit/tokenBudget.ts): estimatedTokens = section.content_length_chars / 4.
- Thresholds (DD-135 pass2, hardcoded): Normal < 2000; Large 2000–5000 (advisory); Bloated > 5000 (strong warning + suggest split).
- Bundling preserved (FR-AUDIT-1): doctor + scope-debug + status + export-metrics as preamble.
- Output: Markdown to chat. Perf NFR-PERF-N7 < 100 ms p95.
section-symbol-index.json (FR-AUDIT-5, DD-142 pass2): .claude/coherence/section-symbol-index.json (gitignored). Schema: schema_version 1, source_index_hash (SHA-256 of section-index.json), built_at, symbols (Map<symbol, sectionRef[]>).
Build (lazy on first --deep): for each section, grep content for each hallucination registry symbol for detected language. Inverted (symbol → sections containing it).
Cache invalidation: SHA-256 of current section-index.json vs source_index_hash. Audit#9: also registry_hash = SHA-256 of concatenated language registry files (alphabetical sort of fs.readdirSync(src/validation/registries/), concat utf8). Cache hit requires BOTH match.
Hash check < 50 ms (NFR-PERF-N7) streaming.
Build O(sections × symbols), early-terminate at 10 pairs.
Symbol-sharing pair identification: iterate symbols; for symbols with > 1 sections, enumerate unordered pairs; dedupe across symbols; cap at 10 (FR-AUDIT-3); rank by shared-symbol count desc; tiebreak alphabetical sectionRef pair.
Cost gate (FR-AUDIT-4) — Audit#1 (Critical) redesigned: stdin y/N CANNOT work in Claude Code (no TTY, same constraint as DD-127). Two-step flag pattern: (1) /coherence:audit --deep prints pair count, est tokens, est cost, AND 'Proceed with: /coherence:audit --deep --confirm-deep <signature>' where signature = first 12 hex chars of SHA-256(JSON.stringify(deterministically-sorted Array<[refA, refB]>)). (2) User re-runs with --confirm-deep <signature>. If signature matches → proceed. If mismatch → 'pair list changed; re-run --deep'. --no-confirm allowed only in CI (process.env.CI === 'true').
LLM call: prompts/v3/audit-consistency.md. Inputs: pair (path+heading+content). Output JSON {consistent, issues?: [{symbol, section_a_says, section_b_says, suggestion}]}. Model claude-sonnet-4-5 (carry from v0.2). Cost-ledger stage='audit_deep' (Audit#10 schema enum extension; M-COST-1 verifies).
Output: per pair heading + issues or '✅ Consistent'. Final summary: pairs analysed, issues found, suggested next steps.
Cassette: src/llm/cassette.ts records --deep under tests/fixtures/v1/audit-consistency/. M-AUDIT-2/3 use cassette without live API.
