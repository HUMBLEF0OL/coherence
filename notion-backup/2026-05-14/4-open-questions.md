<!-- url: https://www.notion.so/094010d46a7082dfafe9811e1b387a22 -->
<!-- id: 094010d4-6a70-82df-afe9-811e1b387a22 -->
<!-- title: ❓ 4. Open Questions -->
Active questions that need resolution before the BRD can be finalized. Updated as decisions are made (resolved items move to Design Decisions page).
---
## Status Legend
🔴 Blocking — must resolve before BRD
🟡 Important — should resolve before implementation
🟢 Nice to have — can defer to v2
---
## ✅ RESOLVED (all 46)
- **OQ-001** — Patch-writing prompt quality → DD-008
- **OQ-002** — Section anchor format and integrity → DD-007
- **OQ-003** — Mid-session nudge mechanism → DD-012
- **OQ-004** — Subagent output-use signal capture → DD-013
- **OQ-005** — Trickle scan implementation detail → DD-014
- **OQ-006** — Monorepo scope precedence → DD-018
- **OQ-007** — Statusline badge format → DD-019
- **OQ-008** — Stage 1 planner prompt design → DD-015
- **OQ-009** — Section depth measurement formula → DD-016
- **OQ-010** — Change-class sanity check formal definition → DD-017
- **OQ-011** — Silent context refresh cadence → DD-020
- **OQ-012** — `/coherence:review` UX vs Stop UX → DD-021
- **OQ-013** — Subagent rolling window size → DD-022
- **OQ-014** — Insufficient-data subagent handling → DD-023
- **OQ-015** — Subagent flagging in silent context refresh → DD-024
- **OQ-016** — Trigger-source identity → DD-025
- **OQ-017** — Buffer entry schema → DD-026
- **OQ-018** — Qualified section reference format → DD-027
- **OQ-019** — Multiple pre-declared canonicals tiebreak → DD-028
- **OQ-020** — SessionStart re-validation rules → DD-029
- **OQ-021** — Observe-mode buffer accumulation behavior → DD-030
- **OQ-022** — Same section flagged by two trigger groups → DD-031
- **OQ-023** — Hallucination grep tier definitions → DD-032
- **OQ-024** — `PLAN_DISAGREES` recovery path → DD-033
- **OQ-025** — Reject/accept keyword classifier window → DD-034
- **OQ-026** — Revert detection mechanism → DD-035
- **OQ-027** — Trickle deep-scan execution model → DD-036
- **OQ-028** — Auto-apply commit timing → DD-037
- **OQ-029** — Quarantine marker removal mechanism → DD-038
- **OQ-030** — Compaction detection → DD-039
- **OQ-031** — Skill/agent path conventions → DD-040
- **OQ-032** — Concurrent-session file locking → DD-041
- **OQ-033** — Stage 2 skipped for `no-change` → DD-042
- **OQ-034** — Frontmatter `coherence:` key preservation → DD-043
- **OQ-035** — Mid-session branch switch handling → DD-044
- **OQ-036** — Anchor ID collision detection → DD-045
- **OQ-037** — `/coherence:review` cost telemetry → DD-046
- **OQ-038** — Multi-language hallucination grep → DD-047
- **OQ-039** — `/coherence:graduate` semantics → DD-048
- **OQ-040** — DD-018 ↔ DD-028 scope/canonical precedence sequencing → DD-049 (unified Canonical Selection Algorithm)
- **OQ-041** — HTML anchors in [SKILL.md](http://SKILL.md) pollute agent context → DD-050 (YAML-only for skills/agents; HTML restricted to prose docs)
- **OQ-042** — Velocity learning gap on defer-and-drop → DD-051 (consecutive-session defer counter)
- **OQ-043** — `coherence-log.md` entry schema → DD-052 (structured markdown, newest-first, git-ref not inline diff)
- **OQ-044** — Finalize commits ↔ Stop patch ordering → DD-053 (strict SessionStart sequence + Stage 2 reads current state)
- **OQ-045** — Assertion-triggered entries confidence → DD-054 (always high-confidence; separate Stop review section with 3-action UX)
- **OQ-046** — `/coherence:status` output structure → DD-055 (canonical fixed-order output with conditional sections)
---
## Active questions
None. All 46 questions resolved.
---
## Overall readiness
🟢 **GREEN. Design complete.** DD-001 through DD-055 are locked. No open questions remain. BRD can now be written.
