<!-- url: https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea -->
<!-- id: 35b010d4-6a70-81da-b5f8-c31a6d59dcea -->
<!-- title: 📘 BRD (v0.1) -->
**Status:** Draft 1 · 2026-05-09  
**Owner:** Coherence project · Planning phase complete  
**Source design corpus:** DD-001 through DD-064 in [3. Design Decisions](https://www.notion.so/e3d010d46a70839f9e358122c2a8cd07); audit closure in [✅ Critical Readiness Assessment - Resolved](https://www.notion.so/35b010d46a7081a8832fdce324014628).
> All 7 critical and 4 medium audit gaps are resolved (11/11 ✅). 0 BRD blockers remain.
---
## Executive Summary
Coherence is a Claude Code plugin that prevents AI-agent hallucination caused by stale documentation. As a project grows, three categories of guiding files decay — referring docs ([CLAUDE.md](http://CLAUDE.md), [ARCHITECTURE.md](http://ARCHITECTURE.md), [PATTERNS.md](http://PATTERNS.md)), skills (`.claude/skills/*/SKILL.md`), and subagents (`.claude/agents/*.md`). Coherence detects this drift passively during normal development sessions using deterministic, zero-token signals, then proposes surgical, human-gated patches at session end.

v0.1 ships the complete healing loop: PostToolUse buffer → Stop pipeline (Stage 1 planner + Stage 2 patch writers) → deterministic validation → consolidated review → git commits.

## v0.1 Scope at a Glance
- Core capability: detect drift across all three layers; propose patches.
- Default mode: Observe (no auto-writes).
- Hooks used: PostToolUse, UserPromptSubmit, SubagentStop, SessionStart, Stop, SessionEnd.
- LLM usage: Two-stage pipeline at Stop; ~50 tokens silent context refresh in PostToolUse.
- Cost: $0.07 p50, $0.15 p95 per Stop session (DD-056).
- Performance: PostToolUse p95<50ms · SessionStart p95<2s · Stop p95<10s (DD-059).
- Quality: ≥90% planner schema-valid; ≥80% Stage 2 apply rate; ≤2% hallucination escape (DD-057, DD-058).
- Platforms: Linux, macOS, Windows on Node.js 20.x and 22.x.
- Distribution: `claude plugin install coherence` (marketplace packaging is v0.3).

## Document Structure (5 sub-pages: BRD-1..BRD-5)
- BRD-1 Business Context & Objectives
- BRD-2 Functional Requirements
- BRD-3 Non-Functional Requirements
- BRD-4 Release Criteria & Acceptance
- BRD-5 Risks, Dependencies, Out-of-Scope

## Reading Order
- Stakeholders / approvers: BRD-1 + BRD-4.
- Engineering implementers: BRD-2 + BRD-3 + BRD-4 (with DDs and Architecture open).
- QA / release management: BRD-4 + BRD-5.

<page url="https://www.notion.so/35b010d46a70816d8562ca52c48a9b27">BRD-5 — Risks, Dependencies, Out-of-Scope</page>
<page url="https://www.notion.so/35b010d46a708197ba8efff2ba988296">BRD-3 — Non-Functional Requirements</page>
<page url="https://www.notion.so/35b010d46a708156b8f6fbbb8ac00f68">BRD-4 — Release Criteria & Acceptance</page>
<page url="https://www.notion.so/35b010d46a7081618743d49e75a40eda">BRD-1 — Business Context & Objectives</page>
<page url="https://www.notion.so/35b010d46a7081b0b4afec8eb33fcba5">BRD-2 — Functional Requirements</page>
