<!-- url: https://www.notion.so/e16010d46a7082bd90a1014c0c3246c6 -->
<!-- id: e16010d4-6a70-82bd-90a1-014c0c3246c6 -->
<!-- title: 🎯 1. Overview & Goals -->
## Problem Statement
As a Claude Code project grows, three categories of guiding files decay:
- **Skills** (`.claude/skills/*/SKILL.md`) — their descriptions stop matching the work they cover; they stop triggering or trigger incorrectly
- **Subagents** (`.claude/agents/*.md`) — their system prompts reference outdated patterns, tools, or conventions; they produce confidently wrong output in isolated context
- **Referring docs** (`CLAUDE.md`, `ARCHITECTURE.md`, `PATTERNS.md`, etc.) — they accumulate stale facts that become the agent's worldview
When these three layers go out of sync with each other and with the codebase, AI agent output quality degrades in ways that are hard to diagnose: the agent isn't broken, it's just working from wrong context.
---
## Goals
- Detect drift across all three layers using passive, zero-token signals wherever possible
- Propose surgical patches to affected files at natural session boundaries
- Gate all changes behind human permission, tuned to change-class not file-type
- Keep all three layers coherent with each other, not just individually accurate
- Impose near-zero token cost during normal development sessions
- Ship as a distributable Claude Code plugin (one install command)
---
## Non-Goals (v1)
- No automatic content generation from codebase scans
- No cross-session drift accumulation (sessions are isolated)
- No greenfield project bootstrapping (requires some existing structure)
- No fuzzy/semantic pattern detection (deterministic signals only in v1)
- No external integrations (GitHub, Jira, etc.)
---
## Success Metrics
- Skills trigger correctly on relevant tasks after installation
- Subagent output requires fewer manual corrections per session
- CLAUDE.md / ARCHITECTURE.md stay within 2 weeks of codebase reality
- Zero Coherence-caused corruption incidents
- Plugin disabled rate < 5% after 30 days (proxy for friction level)
