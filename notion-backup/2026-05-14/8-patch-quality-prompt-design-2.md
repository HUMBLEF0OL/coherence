<!-- url: https://www.notion.so/9bc010d46a708234863f8193175d1c71 -->
<!-- id: 9bc010d4-6a70-8234-863f-8193175d1c71 -->
<!-- title: 📋 8. Patch Quality & Prompt Design -->
## Status: ✅ Resolved (DD-008)
OQ-001 has been resolved with the two-stage patch pipeline. This page documents the prompt designs and the failure modes the design protects against.
---
## The Original Problem
The plugin's value depends entirely on the patch-writing prompts producing surgical diffs, not rewrites. Bad prompts produce:
- Rewrites of sections the user didn't ask to change
- Confident-sounding but incorrect patches
- Section growth instead of updates (exacerbating bloat)
- Removal of nuance the human added intentionally
This would be worse than no plugin — confident incorrectness.
---
## Stage 1 Prompt: Coherence Planner
**Input:** code change summary + multiple affected sections (each with id, doc, current content, watches)
**Output:** JSON coherence plan
**Validation (deterministic, post-LLM):** Exactly one canonical, all flagged sections accounted for, section IDs valid, JSON schema correct. Failure → fall back to independent patches, log warning.
---
## Stage 2 Prompt: Patch Writer
**Input:** session changes + one affected section + coherence plan (if Stage 1 ran)
**Output:** unified diff against the section, OR one of: NO_PATCH_NEEDED, ESCALATE, PLAN_DISAGREES
**Validation (deterministic, post-LLM):** Format check, apply check, sanity (change-class), line-count (>0.4 → ESCALATE), hallucination grep two-tier.
---
## Failure Modes Protected Against
- Sycophantic expansion → negative examples + line-count check
- Scope creep → section-only input/output
- False precision → user review at Stop, plan-bundle atomicity
- Hallucinated file references → two-tier grep
- Cross-section contradictions → Stage 1 planner roles
- Partial bundle inconsistency → atomic bundles
- Patch/revert loops → velocity limit (DD-011)
- Broken plan → PLAN_DISAGREES escape hatch
---
## Open Items
All resolved: OQ-008→DD-015, OQ-009→DD-016, OQ-010→DD-017.
