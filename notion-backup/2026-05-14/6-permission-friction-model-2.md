<!-- url: https://www.notion.so/76d010d46a708283b5e481563f61a628 -->
<!-- id: 76d010d4-6a70-8283-b5e4-81563f61a628 -->
<!-- title: 🔐 6. Permission & Friction Model -->
## Core Principle
The permission model gates on **what kind of change** is proposed, not on which file it affects. Most drift is additive (low friction). User sees explicit interruption only at Stop or `/coherence:review`.
---
## Change Classes
- **Additive** — new bullet/pattern/keyword. Auto-apply + log. Zero friction.
- **Modifying** — rewording, restructuring. Show diff at Stop, default Accept. One keystroke.
- **Destructive** — removing rules, narrowing scope. Show diff, require explicit confirm. Deliberate.
- **Frontmatter** — any change to skill/agent description, triggers, allowed-tools. Always confirm. Deliberate.
---
## Confidence Tiers
- **High confidence** — specific path match, clear assertion failure → surface at Stop.
- **Low confidence** — ambiguous match, weak signal → silent log to observations.md only.
---
## Mid-Session Surfacing (DD-012)
**Mechanism 1: Silent Context Refresh** (always on) — `additionalContext` injection on PostToolUse when buffer non-empty.
**Mechanism 2: Conversational Drift Mention** (rare) — Claude mediated when 3+ trigger groups, 15+ minutes session, user just sent message after long agent turn.
---
## One-Prompt-Per-Session Rule
At most one consolidated review prompt per session at Stop, plus zero-or-more user-initiated `/coherence:review`. Plan-derived bundles present as single accept/reject unit.
---
## Reversibility
Every applied patch immediately committed with `[coherence]` prefix. `git revert` restores. If user reverts a coherence commit, originating pattern auto-added to `.claude/coherence/ignore`.
---
## Quarantine Period
Auto-applied additive changes marked `<!-- coherence-pending: YYYY-MM-DD -->` for 7 days. After 7 days without rollback, marker removed.
---
## Velocity Limit
If a section is patched and reverted 2 times within 30 days, plugin auto-adds it to ignore (DD-011).
