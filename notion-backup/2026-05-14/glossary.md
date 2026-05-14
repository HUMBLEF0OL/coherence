<!-- url: https://www.notion.so/35f010d46a7081bd963bff8b9837f1e2 -->
<!-- id: 35f010d4-6a70-81bd-963b-ff8b9837f1e2 -->
<!-- title: Glossary -->
Terms used across the BRD, Technical Spec, and codebase.
- Anchor — a frontmatter marker that binds a documentation section to a code symbol. Anchors give Coherence stable identifiers across edits.
- asserts: — frontmatter-declared invariants checked during the validation pipeline. Two flavours: text-pattern (always-on) and codebase-linked (opt-in via fast-glob).
- Bundle — a package of one or more section patches submitted to the user for approval (assembleBundle, src/pipeline/bundle.ts).
- Cassette — a recorded LLM call that can be replayed deterministically in tests. All Coherence LLM calls go through the cassette system.
- Coherence log — the audit trail recording every accepted, edited, and reverted patch. Lives in .claude/coherence/coherence-log.jsonl.
- Degraded mode — a back-off state Coherence enters when exception rates breach threshold. The plugin silently skips work rather than blocking the session.
- Destructive patch — a patch that removes content. Always defers to user confirmation regardless of trust score.
- Frontmatter patch — a patch that touches YAML frontmatter (e.g. asserts:, version, anchor). Always defers to user confirmation regardless of trust score.
- Hallucination corpus — the registry of valid symbols and file paths Coherence is permitted to reference in a patch. Language-specific lists live in src/validation/registries.
- Modifying patch — a patch that changes existing content (not destructive, not frontmatter). Auto-applies when the section's trust score is \>= 0.85.
- Net-new — a proposal to add a file, skill, or agent that does not yet exist. Gated by the trust ladder; promoted developers can auto-land specific kinds (DD-139).
- Quarantine — a staging area for patches that did not pass auto-apply. Patches accumulate in pending.md until the user accepts or rejects them.
- Section — a frontmatter-delimited region of a documentation file. Sections are the unit of patching.
- Section ref — a path#anchor identifier for a section. Stable across edits as long as the anchor is preserved.
- Sentinel — a kill-switch file under .claude/coherence/sentinels that disables specific behaviour without uninstalling the plugin.
- Stage 1 / Stage 2 — the two LLM passes. Stage 1 is the planner (produces a structured plan); Stage 2 is the patch writer (produces diffs). Never collapse them.
- Trust ladder — per-section event log recording accept / edit / revert; produces a score that drives auto-apply behaviour. v1.0 feature.
- Trust ledger — the file storing the trust ladder events (.claude/coherence/trust-ledger.json, gitignored).
