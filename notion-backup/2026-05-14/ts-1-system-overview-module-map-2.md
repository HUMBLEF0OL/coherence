<!-- url: https://www.notion.so/35f010d46a7081fb9acde499ea32918f -->
<!-- id: 35f010d4-6a70-81fb-9acd-e499ea32918f -->
<!-- title: TS-1 — System Overview & Module Map -->
TS-1 — SYSTEM OVERVIEW & MODULE MAP
v1.0 extends the v0.4 architectural envelope without introducing new architectural commitments. All trust + intelligence work fits inside DD-117 (no backend) and DD-118 (no legacy support). Module boundaries follow existing v0.3/v0.4 conventions: state in src/state/, validation in src/validation/, commands in src/commands/, hooks in src/hooks/, audit in src/audit/ (new), release in scripts/.
New source files
- src/state/trustLedger.ts — personal ledger read/write/score computation (TS-2).
- src/state/teamAggregate.ts — per-developer file management + aggregate compute (TS-3).
- src/state/schemas/trust-ledger.schema.json — personal ledger JSON schema (Zod-validated).
- src/state/schemas/team-aggregate.schema.json — per-developer file JSON schema.
- src/commands/trust.ts — /coherence:trust subcommand dispatcher (TS-5).
- src/commands/metrics.ts — /coherence:metrics 5-section renderer (TS-5).
- src/validation/assertions/textPatterns.ts — 5 text-pattern engine functions (TS-4).
- src/validation/assertions/codebaseLinked.ts — symbol_exists + file_exists engine (TS-4).
- src/validation/assertions/policy.ts — block/warn policy enforcement (TS-4).
- src/audit/tokenBudget.ts — char-count-based token estimation, Normal/Large/Bloated thresholds (TS-6).
- src/audit/sectionSymbolIndex.ts — lazy-built symbol-to-sections index (TS-6).
- src/audit/deepConsistency.ts — --deep LLM call orchestration with cost gate (TS-6).
- src/release/cosign.ts — cosign keyless signing wrapper invoked from release-ga.mjs (TS-7).
- prompts/v3/audit-consistency.md — LLM prompt for cross-section consistency pass (TS-6).
- SECURITY.md (project root) — responsible disclosure (TS-7).
- scripts/render-readme-verification.mjs — build-time generates README ## Verification (Pass 2 #4).
- .github/workflows/release.yml — NEW; hosts cosign sign step + .sig/.pem upload (Pass 2 #5; needs id-token: write OIDC).
New state files
- .claude/coherence/trust-ledger.json (personal, gitignored, per-developer).
- .claude/coherence/section-symbol-index.json (gitignored, lazy-built cache for --deep audit).
- coherence/trust/<author-hash>.json (committed, one file per active team developer).
- release-artifacts/cohrence-<version>.sha256 (committed for git provenance; .npmignore excludes from tarball).
Modified files
- src/hooks/stop.ts — on accept/revert/edit, write to trust-ledger.json via trustLedger.recordEvent().
- src/hooks/userPromptSubmit.ts — sentinel dispatch routes coherence:trust + coherence:metrics commands (DD-130 carry from v0.4).
- src/validation/apply.ts — assertion pipeline integrated after hallucination check, before patch application.
- src/detection/parseAnchors.ts — extend frontmatter parser to read asserts: nested YAML object list.
- src/commands/repair.ts — add orphaned trust-ledger key detection + --reassociate / --expire-orphans flags.
- src/commands/audit.ts — add free-tier token budget + --deep flag dispatch.
- src/pipeline/stop.ts — trust ladder gate (when score ≥ 0.85, modifying patches auto-apply). Destructive + frontmatter always require confirmation.
- scripts/release-ga.mjs — add cosign sign step (CI-only) + --unsigned local fallback with renamed output.
- .claude-plugin/plugin.json — add slashCommands entries for coherence:trust and coherence:metrics. Bump version to 1.0.0.
- README.md — add ## Verification section with cosign verify command, Rekor link, M6 gates list.
- .npmignore — add release-artifacts/ exclusion.
- .gitignore — add .claude/coherence/section-symbol-index.json.
Module dependency graph (top-down): foundation (trustLedger → teamAggregate → metrics + trust commands); validation (assertion engine pluggable into validation/apply.ts); audit (sectionSymbolIndex from section-index.json → deepConsistency LLM-gated); release (cosign ← release-ga.mjs CI; release-ga.mjs local --unsigned). No cycles.
