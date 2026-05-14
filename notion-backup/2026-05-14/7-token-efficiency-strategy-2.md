<!-- url: https://www.notion.so/10f010d46a7083459b2281e3ca70cf2a -->
<!-- id: 10f010d4-6a70-8345-9b22-81e3ca70cf2a -->
<!-- title: ⚡ 7. Token Efficiency Strategy -->
## Budget Targets
- No drift detected: 0 tokens.
- 1 section affected: ~600 (single Stage 2 call).
- 2-3 sections, one trigger group: ~2,000-2,600 (Stage 1 + parallel Stage 2).
- 5 sections, one trigger group: ~4,000 (worst typical case).
- Multiple trigger groups: sum per group.
---
## Where Tokens Are Spent
- PostToolUse filter, SessionStart checks, SubagentStop capture, patch validation, file merge, velocity counter: **all 0 tokens** (deterministic JS).
- `additionalContext` nudges: ~50 per nudge.
- Stop hook Stage 1 planner (when triggered): ~800-1,200.
- Stop hook Stage 2 patch writer (per section): ~600.
---
## Section Extraction Efficiency
Stop hook never loads full doc files into LLM prompts. Extracts only flagged sections via `<!-- coherence:section -->` anchors. Typical section 200-400 tokens vs 2,000+ for full CLAUDE.md.
---
## Stage 1 Skip When 1 Section
When a trigger group has exactly one affected section, Stage 1 is skipped entirely. Common case stays at ~600 tokens.
---
## additionalContext vs. Full Prompt
Low-confidence signals use `additionalContext` from hooks — no new LLM request. If >10,000 chars, Claude Code writes to file and passes path.
---
## What Never Happens
- No LLM call on every PostToolUse
- No full-doc reads in any LLM prompt
- No per-change relevance-checking via LLM
- No session-start LLM warm-up
- No semantic concept clustering
- No LLM call when buffer is empty
