<!-- url: https://www.notion.so/35b010d46a7081618743d49e75a40eda -->
<!-- id: 35b010d4-6a70-8161-8743-d49e75a40eda -->
<!-- title: 🎯 BRD-1 — Business Context & Objectives -->
**Parent:** [📘 10. BRD — Coherence v0.1](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea)
---
## 1.1 Problem Statement
Claude Code projects accumulate three categories of guiding files that the AI agent depends on for correct behavior:
- **Referring docs** — `CLAUDE.md`, `ARCHITECTURE.md`, `PATTERNS.md`, etc. Always loaded into context. Set the agent's worldview.
- **Skills** — `.claude/skills/*/SKILL.md`. Conditional capabilities loaded when their description matches the current task.
- **Subagents** — `.claude/agents/*.md`. Specialist agents invoked with isolated context.
As the codebase changes, these files decay. The agent isn't broken — it's working from wrong context. Symptoms are hard to diagnose:
<table header-row="true">
<tr>
<td>Layer</td>
<td>Decay rate</td>
<td>Failure mode</td>
</tr>
<tr>
<td>Referring docs</td>
<td>Slow (weeks)</td>
<td>Agent works from wrong mental model; subtle long-form drift</td>
</tr>
<tr>
<td>Skills</td>
<td>Medium (days)</td>
<td>Skill never triggers (invisible) or triggers with stale instructions</td>
</tr>
<tr>
<td>Subagents</td>
<td>Per-invocation</td>
<td>Confidently wrong output in isolated context, no correction signal</td>
</tr>
</table>
Without intervention, project quality degrades, agent output becomes unreliable, and developers lose trust in AI assistance — often blaming the model when the actual fault is stale documentation.
## 1.2 Opportunity
Claude Code's native hook surface (PostToolUse, SubagentStop, SessionStart, Stop, etc.) makes drift detection mostly free — most signals are deterministic and zero-token. A plugin can passively observe normal development and propose surgical, human-gated patches at session end. This is the right shape for the problem because:
- It piggybacks on activity the developer is already doing.
- It batches LLM cost into a single end-of-session pipeline (\~\$0.07–\$0.15).
- It keeps the human in the loop for every write — trust is earned, not assumed.
- It is multi-layer aware: a single change can ripple across docs, skills, and agents, and the plan-first pipeline reconciles them coherently.
## 1.3 Target Users (Personas)
### P1 — Solo Claude Code developer (primary)
- Works on a single repo, mixes greenfield and refactoring.
- Already maintains some `CLAUDE.md` / skills / subagents but updates them inconsistently.
- Wants the AI to keep getting better at their codebase, not silently worse.
- Pain: notices skill misfires or stale doc references but doesn't have time to audit.
### P2 — Small-team lead (secondary)
- 2–6 developers sharing one repo with `.claude/` checked in.
- Wants documentation to stay current without becoming a code-review chore.
- Pain: drift compounds across team members; nobody owns the docs.
- v0.1 supports this persona for individual sessions; team-shared workflows are v0.3.
### P3 — Plugin author / contributor (tertiary)
- Builds skills and subagents for distribution.
- Wants automated checks that their own [SKILL.md](http://SKILL.md) / [agent.md](http://agent.md) don't drift relative to their own examples.
- Pain: no current tooling for this beyond manual review.
## 1.4 Goals
<table header-row="true">
<tr>
<td>#</td>
<td>Goal</td>
<td>Measurable target</td>
</tr>
<tr>
<td>G1</td>
<td>Detect drift across all three layers using passive, zero-token signals where possible</td>
<td>≥1 deterministic signal per layer (path watch, anchor, assertion, etc.)</td>
</tr>
<tr>
<td>G2</td>
<td>Propose surgical patches at natural session boundaries</td>
<td>Stop hook produces patches; no mid-session interruptions outside DD-012 mechanisms</td>
</tr>
<tr>
<td>G3</td>
<td>Gate all changes behind human permission, tuned to change-class</td>
<td>Observe mode default; auto-apply only allowed for additive class with explicit opt-in (DD-037)</td>
</tr>
<tr>
<td>G4</td>
<td>Keep all three layers coherent with each other, not just individually accurate</td>
<td>Stage 1 planner reconciles cross-layer impact before Stage 2 writes patches</td>
</tr>
<tr>
<td>G5</td>
<td>Impose near-zero token cost during normal development</td>
<td>\$0.07 p50 / \$0.15 p95 per Stop session (DD-056)</td>
</tr>
<tr>
<td>G6</td>
<td>Ship as a distributable Claude Code plugin</td>
<td>One install command; zero post-install configuration required for default operation</td>
</tr>
</table>
## 1.5 Non-Goals (v0.1)
- Automatic content generation from codebase scans.
- Cross-session drift accumulation beyond `pending.md` re-validation (sessions remain isolated).
- Greenfield project bootstrapping (some existing structure required).
- Fuzzy / semantic pattern detection (deterministic signals only in v0.1).
- External integrations (GitHub, Jira, Linear, etc.).
- Author mode (proposing new skills / agents) — deferred to v0.2.
- Annotate mode (auto-injection of metadata into existing docs) — deferred to v0.2.
- Marketplace distribution — deferred to v0.3.
- Team-shared configurations / monorepo cross-package workflows — deferred to v0.3.
## 1.6 Success Metrics
All metrics are deterministic per DD-060 (no fuzzy intent inference). Stored locally in `metrics.jsonl`; no auto-upload.
<table header-row="true">
<tr>
<td>ID</td>
<td>Metric</td>
<td>Definition</td>
<td>v0.1 target</td>
</tr>
<tr>
<td>SM1</td>
<td>Patch acceptance rate</td>
<td>accepted_patches / proposed_patches</td>
<td>≥70% across early adopters</td>
</tr>
<tr>
<td>SM2</td>
<td>Apply rate (technical correctness)</td>
<td>patches_that_apply_cleanly / patches_proposed</td>
<td>≥80% (gated by DD-057 fixture suite)</td>
</tr>
<tr>
<td>SM3</td>
<td>Regret rate</td>
<td>(reverted_patches ≤7d ∪ accepted_then_consecutive_deferred≥2) / accepted_patches</td>
<td>\<15% (DD-060)</td>
</tr>
<tr>
<td>SM4</td>
<td>Hallucination escape rate</td>
<td>hallucinated_patches_committed / total_patches_committed</td>
<td>release gate ≤2% on DD-058 corpus; production target \<1% (DD-060)</td>
</tr>
<tr>
<td>SM5</td>
<td>Cost per Stop session</td>
<td>observed token cost (input + output)</td>
<td>p50 ≤ \$0.07 · p95 ≤ \$0.15</td>
</tr>
<tr>
<td>SM6</td>
<td>PostToolUse latency</td>
<td>hook duration</td>
<td>p95 \< 50 ms</td>
</tr>
<tr>
<td>SM7</td>
<td>Stop pipeline latency</td>
<td>hook duration</td>
<td>p95 \< 10 s typical (≤12 sections); \< 25 s at DD-056 ceiling</td>
</tr>
<tr>
<td>SM8</td>
<td>Plugin disabled rate (proxy for friction)</td>
<td>sessions_with_kill_switch / total_sessions over 30 days</td>
<td>\< 5%</td>
</tr>
<tr>
<td>SM9</td>
<td>Coherence-caused corruption</td>
<td>detected file corruptions attributable to plugin</td>
<td>0</td>
</tr>
</table>
## 1.7 Business Value
- **Trust restoration in AI tooling:** users see the AI getting better at their codebase rather than degrading, restoring confidence in agentic development.
- **Reduced manual maintenance:** developers stop manually auditing docs because the plugin does it as a byproduct of normal work.
- **Higher-quality subagent output:** fewer wasted invocations from agents working on stale system prompts.
- **Foundation for Coherence v0.2+:** a working healing loop is the platform on which Author and Annotate modes are built.
## 1.8 Constraints
- Must run inside Claude Code's plugin sandbox; no external services in v0.1.
- Must work offline-capable for hooks; only the Stop pipeline requires network (Anthropic API).
- Must respect the host's permission model; no out-of-band file writes.
- Must remain backward compatible with Claude Code v2.0+ (hook surface stable from that release).
