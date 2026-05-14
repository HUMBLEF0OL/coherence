<!-- url: https://www.notion.so/35c010d46a7081209377c025f389ca6f -->
<!-- id: 35c010d4-6a70-8120-9377-c025f389ca6f -->
<!-- title: v0.3 TS-4 — LLM Pipeline -->
No v0.3 changes. v0.2 LLM contract carries forward unchanged.
Stage 1 (planner): structured plan per section. Prompt: prompts/v2/stage1-planner.md (v0.2). v0.3 ships no v3 prompt iteration.
Stage 2 (patch writer): unified diff. Prompt: prompts/v2/stage2-patch.md (v0.2). Unchanged.
Author/Annotate proposers: 4 prompt kinds (bash, file, agent, planner) + annotate. Under prompts/v2/author/ + prompts/v2/annotate/. Unchanged.
Cassette: src/llm/cassette.ts record/replay. v0.3 reuses without change. New v0.3 commands (export-metrics, ignore-split, scope-debug) don't call LLMs and don't interact with cassette.
Cost partition (DD-085): ceiling stays v0.1 × 1.30. CG-1/CG-2 partition tests carry forward. v0.3 has no LLM-heavy default-on features (G-7 planner env-gated per DD-104), ceiling not stressed.
DD-118 effect: v0.3 ships only prompts/v2/ (slim tarball; prompts/v1/ dropped). /coherence:recover in v0.3 cannot roll back to v1 prompt behaviour. See TS-8 for tarball composition.
