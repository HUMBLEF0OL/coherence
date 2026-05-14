<!-- url: https://www.notion.so/35b010d46a7081718781cd2cb908ac52 -->
<!-- id: 35b010d4-6a70-8171-8781-cd2cb908ac52 -->
<!-- title: 📘 📘 BRD -->
**Status:** Draft 1 · 2026-05-09 · spec-freeze gated on (a) v0.1.0 shipped, (b) v0.1.1 telemetry patch landed (DD-068), (c) Open-Questions register OQ-v2-\* resolved
**Owner:** Coherence project · v0.2 planning phase
**Source design corpus:** DD-065 through DD-092 in [Design Decisions](https://www.notion.so/35b010d46a708147911ddfddfb5a2f80); Open Questions resolutions OQ-v2-01..OQ-v2-31 (page [Open Questions](https://www.notion.so/35b010d46a7081fcaff1fce4c0dcbec0)).
> Continues v0.1's BRD format. v0.1 BRD lives at [📘 v0.1 BRD](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea). DD numbering continues — v0.1 ended at DD-064, v0.2 covers **DD-065 .. DD-092** (27 ratified DDs as of 2026-05-09).
---
## Executive Summary
**v0.1 reacts. v0.2 proposes.**
v0.1 keeps existing knowledge-layer files coherent with the codebase as it changes — passively observing edits, proposing surgical patches at session end. v0.2 turns the plugin **proactive**: it watches *what the user does* during sessions and proposes **net-new artifacts** (skills, slash commands, agent definitions, `CLAUDE.md` additions) when patterns emerge, while also auto-injecting tracking metadata into prose docs that don't yet have anchors.
v0.2 ships behind a load-bearing trust constraint (DD-065): **Author mode is proposal-only.** No file is ever written under `.claude/skills/`, `.claude/agents/`, or any user-owned config directory unless the user explicitly types `/coherence:propose-accept <id>`. All Author-mode and Annotate-mode output lands in a quarantined directory (`.claude/coherence/proposals/<kind>/<id>/`) and surfaces only via dedicated slash commands.
## v0.2 Scope at a Glance
<table header-row="true">
<tr>
<td>Aspect</td>
<td>v0.2 Commitment</td>
</tr>
<tr>
<td>New capabilities</td>
<td>Annotate mode · Author mode (3 signal types) · pull-based proposal commands · Statusline badge · Trickle deep-scan</td>
</tr>
<tr>
<td>Default mode</td>
<td>Observe (v0.1 carry-forward); user must `/coherence:graduate` to enable Annotate or Author</td>
</tr>
<tr>
<td>Trust boundary</td>
<td>Quarantine + explicit accept; no auto-promote flag in v0.2 (deferred to v1.0)</td>
</tr>
<tr>
<td>New hooks</td>
<td>None — reuses v0.1 hook surface</td>
</tr>
<tr>
<td>New LLM pipeline</td>
<td>Author pipeline runs **after** Stop; ≤ 5 s p95 latency budget; Stage 1 NOT reused</td>
</tr>
<tr>
<td>Cost target</td>
<td>v0.1 baseline × 1.30 (per-session ceiling); per-feature partition Author 60% / Annotate 30% / Trickle 10% of headroom (DD-085)</td>
</tr>
<tr>
<td>Performance</td>
<td>Inherits v0.1 NFR-PERF-1 (PostToolUse p95 \< 50 ms); Statusline render \< 5 ms; Trickle median \< 5 ms</td>
</tr>
<tr>
<td>State schema</td>
<td>v1 → v2 single coordinated migrator (DD-080); 5 new state files; 2 enum widenings (additive)</td>
</tr>
<tr>
<td>Telemetry</td>
<td>3 new privacy-safe event types shipped as v0.1.1 patch (DD-068); SHA-256 12-hex hashing; no raw content</td>
</tr>
<tr>
<td>Calibration commitment</td>
<td>v0.2.1 patch tunes DD-076/077/078 thresholds against opt-in telemetry (precision ≥ 0.7 gate, DD-092)</td>
</tr>
<tr>
<td>Platforms</td>
<td>Linux, macOS, Windows on Node.js 20.x and 22.x (v0.1 matrix carry-forward)</td>
</tr>
</table>
## Goals (v0.2)
<table header-row="true">
<tr>
<td>#</td>
<td>Goal</td>
<td>Maps to DD</td>
</tr>
<tr>
<td>G-1</td>
<td>**Annotate mode** — auto-inject coherence frontmatter / anchors into anchor-less docs, opt-in, never overwriting semantic content</td>
<td>DD-069, DD-073</td>
</tr>
<tr>
<td>G-2</td>
<td>**Mode lifecycle command** — `/coherence:graduate` per-doc / per-dir / global Observe → Annotate → Author</td>
<td>DD-074</td>
</tr>
<tr>
<td>G-3</td>
<td>**Author signal: bash repetition** — propose slash-command scaffolds when normalised bash sequences recur</td>
<td>DD-076</td>
</tr>
<tr>
<td>G-4</td>
<td>**Author signal: file-creation patterns** — propose skill scaffolds when structurally-similar files recur</td>
<td>DD-077</td>
</tr>
<tr>
<td>G-5</td>
<td>**Author signal: agent-output corrections** — propose agent / `CLAUDE.md` refinements</td>
<td>DD-078</td>
</tr>
<tr>
<td>G-6</td>
<td>**Pull-based proposal commands** — `/coherence:propose-list / -show / -accept / -reject / -revert-acceptance`</td>
<td>DD-081, DD-082, DD-083</td>
</tr>
<tr>
<td>G-7</td>
<td>**Statusline badge** — ambient mode + drift + proposal count rendering</td>
<td>DD-070, DD-071, DD-084</td>
</tr>
<tr>
<td>G-8</td>
<td>**Trickle deep-scan** — opportunistic background drift scanning during PostToolUse idle windows</td>
<td>DD-066</td>
</tr>
<tr>
<td>G-9</td>
<td>**State schema bump v1 → v2** — additive, atomic, single-migrator</td>
<td>DD-080</td>
</tr>
<tr>
<td>G-10</td>
<td>**Author/Annotate LLM contract + cost partition** — `prompts/v2/`, widened cost ledger, unified ceiling</td>
<td>DD-085, DD-091</td>
</tr>
<tr>
<td>G-11</td>
<td>**Privacy-safe Author-signal telemetry** (v0.1.1 patch) and `share-metrics` redaction extension</td>
<td>DD-068, DD-086</td>
</tr>
</table>
## Non-goals (deferred)
- **Auto-apply / graduated trust ladder** for accepted proposals → v1.0 candidate at the earliest (DD-065).
- **Egress / opt-in HTTPS upload** of anonymised metrics → v0.3 (DD-086).
- **Plugin marketplace packaging, team-shared ****`coherence-ignore`****, monorepo ****`scope:`**** declarations** → v0.3.
- **Cross-session pattern learning beyond a single 7-day rolling window** → v1.0 (explicit opt-in).
- **`/coherence:audit`**** + assertion checking** → v1.0.
- **`/coherence:de-annotate`** (rollback of Annotate-mode anchors) → v0.3.
- **Per-file scan tombstones** under `scan-cache/<hash>.json` → v0.3.
- **Author-pipeline planner / consolidation stage** — ships in v0.2 *final* only if v0.2-alpha telemetry justifies it (DD-067 staged adoption).
## Document Structure
This BRD is sliced into 5 child pages, mirroring v0.1's BRD layout:
<table header-row="true">
<tr>
<td>Slice</td>
<td>Page</td>
<td>Purpose</td>
</tr>
<tr>
<td>1</td>
<td><mention-page url="https://www.notion.so/35b010d46a70811f886df73e0cea0176">BRD-1 — Business Context & Objectives</mention-page></td>
<td>Theme, problem statement, personas, success metrics, trust premise, business value</td>
</tr>
<tr>
<td>2</td>
<td><mention-page url="https://www.notion.so/35b010d46a7081cf900ee676993165c6">BRD-2 — Functional Requirements</mention-page></td>
<td>FR-MODES / FR-ANNOTATE / FR-AUTHOR / FR-PROPOSE / FR-STATUSLINE / FR-TRICKLE / FR-OBS / FR-COST / FR-PERMISSION / FR-COMMANDS / FR-FAILURE / FR-PRIVACY (additive to v0.1)</td>
</tr>
<tr>
<td>3</td>
<td><mention-page url="https://www.notion.so/35b010d46a7081b284d5e2c645ed6e5f">BRD-3 — Non-Functional Requirements</mention-page></td>
<td>NFR-PERF / NFR-COST / NFR-PRIVACY / NFR-RELIABILITY / NFR-OBS / NFR-COMPAT / NFR-MAINT — all additive partitions of v0.1 budgets</td>
</tr>
<tr>
<td>4</td>
<td><mention-page url="https://www.notion.so/35b010d46a7081199331dda1062fc202">BRD-4 — Release Criteria & Acceptance</mention-page></td>
<td>Functional / Performance / Cost / Privacy / Release gates; state-file & schema summary; sign-off checklist</td>
</tr>
<tr>
<td>5</td>
<td><mention-page url="https://www.notion.so/35b010d46a70816fa5cbf2da31f11bd4">BRD-5 — Risks, Dependencies, Out-of-Scope</mention-page></td>
<td>Risk register R-v0.2-01..12, v0.1 dependency surface, deferred features, glossary, DD ↔ FR / NFR / Gate traceability matrix</td>
</tr>
</table>
Each slice page is linked above and listed at the bottom of this page.
## Reading Order
- **Stakeholders / approvers:** read this index + Slice 1 + Slice 4.
- **Engineering implementers:** read Slice 2 + Slice 3 + Slice 4, with the [Design Decisions](https://www.notion.so/35b010d46a708147911ddfddfb5a2f80) page open alongside.
- **QA / release management:** read Slice 4 + Slice 5.
## Source Documents
- [v0.2 Overview](https://www.notion.so/35b010d46a7081e68fe1df7d7b708c90)
- [Design Decisions (DD-065 .. DD-092)](https://www.notion.so/35b010d46a708147911ddfddfb5a2f80)
- [Open Questions (OQ-v2-01..OQ-v2-31)](https://www.notion.so/35b010d46a7081fcaff1fce4c0dcbec0)
- [v0.1 BRD (parent format reference)](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea)
- [Roadmap](https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b)
## Sign-off
<table header-row="true">
<tr>
<td>Role</td>
<td>Name</td>
<td>Date</td>
<td>Status</td>
</tr>
<tr>
<td>Product owner</td>
<td>TBD</td>
<td>—</td>
<td>☐ Pending (gated on v0.1 ship)</td>
</tr>
<tr>
<td>Tech lead</td>
<td>TBD</td>
<td>—</td>
<td>☐ Pending</td>
</tr>
<tr>
<td>QA lead</td>
<td>TBD</td>
<td>—</td>
<td>☐ Pending</td>
</tr>
</table>
<page url="https://www.notion.so/35b010d46a70811f886df73e0cea0176">BRD-1 — Business Context & Objectives</page>
<page url="https://www.notion.so/35b010d46a7081cf900ee676993165c6">BRD-2 — Functional Requirements</page>
<page url="https://www.notion.so/35b010d46a7081b284d5e2c645ed6e5f">BRD-3 — Non-Functional Requirements</page>
<page url="https://www.notion.so/35b010d46a7081199331dda1062fc202">BRD-4 — Release Criteria & Acceptance</page>
<page url="https://www.notion.so/35b010d46a70816fa5cbf2da31f11bd4">BRD-5 — Risks, Dependencies, Out-of-Scope</page>
