<!-- url: https://www.notion.so/35b010d46a7081e68fe1df7d7b708c90 -->
<!-- id: 35b010d4-6a70-81e6-8fe1-df7d7b708c90 -->
<!-- title: 🚧 v0.2 -->
**Status:** Planning **complete** · Implementation **in progress** · 2026-05-10 (v0.1 shipped; spec freeze cleared)  
**Source corpus:** [v0.1 BRD](https://www.notion.so/35b010d46a7081dab5f8c31a6d59dcea), [v0.1 Technical Specification](https://www.notion.so/35b010d46a70815285cef48ffce741d4), [Roadmap](https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b)
> v0.1 has shipped. v0.2 BRD, Tech Spec, Design Decisions (DD-065..DD-092), and Open Questions (OQ-v2-01..31) are resolved — spec is frozen and implementation has started.
---
## Theme
**v0.1 reacts. v0.2 proposes.**
v0.1 keeps existing knowledge-layer files coherent with the codebase as it changes — passively observing edits, proposing surgical patches at session end. v0.2 turns the plugin **proactive**: it watches *what the user does* during sessions and proposes *new* artifacts (skills, slash commands, [CLAUDE.md](http://CLAUDE.md) additions) when patterns emerge, while also auto-injecting tracking metadata into docs that don't yet have anchors.
---
## Problem statement
v0.1 solves drift for files that *already exist and already have anchors*. Three classes of problem remain unaddressed after v0.1 ships:
1. **Anchor-less docs are invisible to the healing loop.** Any prose doc that pre-dates the plugin (or was authored without coherence anchors) cannot be tracked. Users have to manually anchor every existing file to bring it under coherence's watch.
2. **Recurring user behaviour signals missing automation.** When a user repeatedly types the same multi-step bash sequence, repeatedly creates files matching the same pattern, or repeatedly corrects an agent's output the same way, that's a signal that a missing skill / slash command / `CLAUDE.md` instruction would have prevented the repetition. v0.1 captures none of this.
3. **No pull-based discovery.** v0.1 only ever pushes patches when sessions end; there is no command for "what would coherence propose if I asked right now?", and no graduation path from passive observation to active proposal.
---
## Goals (v0.2)
<table header-row="true">
<tr><td>#</td><td>Goal</td><td>Maps to roadmap bullet</td></tr>
<tr><td>G-1</td><td>**Annotate mode** — auto-inject coherence frontmatter / anchors into docs that lack them, behind explicit user opt-in, never overwriting existing semantic content</td><td>Annotate mode</td></tr>
<tr><td>G-2</td><td>**Mode lifecycle command** — `/coherence:graduate` lets users move the plugin (per-doc or globally) through Observe → Annotate → Author trust tiers with explicit consent at each step</td><td>`/coherence:graduate`</td></tr>
<tr><td>G-3</td><td>**Author-mode signal: bash repetition** — detect repeated multi-step bash sequences and propose slash command scaffolds</td><td>Author signal 1</td></tr>
<tr><td>G-4</td><td>**Author-mode signal: file-creation patterns** — detect repeated file-creation templates and propose skill scaffolds</td><td>Author signal 2</td></tr>
<tr><td>G-5</td><td>**Author-mode signal: agent-output corrections** — detect repeated user corrections to agent output and propose [CLAUDE.md](http://CLAUDE.md) additions</td><td>Author signal 3</td></tr>
<tr><td>G-6</td><td>**Pull-based proposal commands** — `/coherence:propose-skill` and `/coherence:propose-agent` surface the current proposal queue on demand</td><td>propose-skill / propose-agent</td></tr>
<tr><td>G-7</td><td>**Statusline badge** — surface coherence state (proposal count, mode, drift backlog) in the Claude Code statusline without polluting the chat transcript</td><td>Statusline badge</td></tr>
<tr><td>G-8</td><td>**Trickle deep-scan** — opportunistic background scanning during PostToolUse idle windows to catch drift v0.1's reactive signals miss</td><td>Trickle deep-scan</td></tr>
</table>
## Non-goals (still v0.3+)
- Plugin marketplace packaging, team-shared `coherence-ignore`, monorepo `scope:` declarations (v0.3)
- Cross-session pattern learning beyond a single session (v1.0; needs explicit opt-in)
- Assertion checking and `/coherence:audit` (v1.0)
---
## Load-bearing premise — Trust model
**v0.2 Author mode is proposal-only.** The plugin **never** writes net-new files into `.claude/skills/` or `.claude/agents/` automatically. All Author-mode output lands in a quarantined `coherence/proposals/` directory, surfaced only via `/coherence:propose-skill` and `/coherence:propose-agent`, and graduates to live skill/agent files only via explicit user accept. This is the load-bearing constraint that every other Author-mode design decision derives from. See **DD-065** (Design Decisions register) for the full statement and rationale.
This is consistent with v0.1's Observe-default philosophy: the plugin earns trust by being predictable about *where* it can write, never about *whether* it asked first.
---
## Success metrics (proposed; tune from v0.1 telemetry)
<table header-row="true">
<tr><td>Metric</td><td>Target</td><td>Why</td></tr>
<tr><td>Annotate-mode false-positive rate</td><td>\< 5% (annotated doc later removed by user)</td><td>Must not be perceived as noise</td></tr>
<tr><td>Proposal accept rate (`/coherence:propose-*`)</td><td>≥ 30% over a 2-week window</td><td>Measures signal quality; below 30% → thresholds need tuning</td></tr>
<tr><td>Proposal time-to-decision (queued → accept/reject)</td><td>p50 \< 7 days</td><td>Stale queues mean the plugin is generating noise users ignore</td></tr>
<tr><td>Statusline overhead</td><td>\< 5ms per render</td><td>Cannot regress NFR-PERF</td></tr>
<tr><td>Trickle deep-scan budget</td><td>≤ 100ms cumulative per PostToolUse, gated by idle detection</td><td>Cannot regress PostToolUse p95 \< 50ms (NFR-PERF inherited from v0.1)</td></tr>
</table>
---
## v0.1 dependency list (parallel-planning risk)
Several v0.2 features depend on v0.1 internals that may shift during implementation. These are tracked in *Open Questions* and **must be validated before v0.2 spec freeze**:
- **PostToolUse buffer shape** — trickle deep-scan rides on whatever schema v0.1 ships
- **Stop pipeline plan JSON** — Author-mode proposals reuse Stage 1 grouping semantics
- **Telemetry events** — bash repetition, file-creation patterns, and agent-output corrections need event streams that v0.1 may not currently emit. May require an additive **v0.1.x patch** to v0.1 instrumentation *before* v0.1 ships.
- **DD numbering** — v0.2 continues from **DD-065** (v0.1 ends at DD-064)
- **Frontmatter contract** — Annotate mode injects coherence frontmatter; the schema must round-trip through v0.1's `coherence:doctor` and quarantine paths
---
## Document structure (this release)
This page is the Overview. Two sibling pages hold the working planning state during this kickoff phase. BRD and Technical Specification slices will be authored only after the Overview, DD register, and Open Questions are stable and v0.1 has shipped.
- **Design Decisions** — living register continuing from DD-065 (v0.1 ended at DD-064)
- **Open Questions** — every assumption v0.2 makes about v0.1; spec-freeze gate
<page url="https://www.notion.so/35b010d46a708147911ddfddfb5a2f80">Design Decisions</page>
<page url="https://www.notion.so/35b010d46a7081fcaff1fce4c0dcbec0">Open Questions</page>
<page url="https://www.notion.so/35b010d46a7081718781cd2cb908ac52">📘 BRD</page>
<page url="https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614">🛠️ Technical Specification (v0.2)</page>
— — —
<span color="green">**Status update 2026-05-10 — v0.2 work complete in main; v0.2.1 path defined**</span>
- **Audits closed.** v0.2-audit-1 through v0.2-audit-7 all landed (HEAD = `fcaefea`). 575/575 tests passing across 116 files; lint clean (0 problems, down from 1044 via post-audit hygiene pass in commit `fcaefea`).
- **Shipped to master.** Code on `origin/master` at the same SHA as dev + staging. Distribution tag `v0.2.0-alpha.1` ready to apply (not yet pushed to origin).
- **Package renamed.** `package.json#name` + `plugin.json#name`: `coherence → cohrence` (vowel-drop; same pronunciation; brand-clean for marketplace). Brand 'Coherence', slash command namespace `/coherence:*`, state directory `.claude/coherence/`, and bin/ filenames preserved — zero user-facing breakage.
- **DD-067 amendment 2026-05-10.** Author-pipeline planner ships behind `COHERENCE_AUTHOR_PLANNER=1` env flag, default OFF, in v0.2 + v0.3. Promotion to default ON deferred to v0.4 pending real telemetry. See also v0.3 DD-104 (ratified).
- **DD-092 amendment 2026-05-10.** v0.2.1 ships with corpus-calibrated thresholds (synthetic from `tests/fixtures/signal-corpora/`); field-calibrated re-tuning becomes v0.4 work once ≥50 sessions × ≥30 days observation accrue. See also v0.3 DD-116 (ratified).
- **v0.2.1 path.** Implementation begins now via `scripts/corpus-calibrate.mjs` replaying expanded corpus fixtures, computing Wilson 95% CIs, picking thresholds that maximise precision while keeping recall ≥0.6. Acceptance: per-detector corpus precision ≥0.7 lower bound.
- **Marketplace prep done.** `package.json#author` filled (HUMBLEF0OL \<123amitrana0123@gmail.com\>); `repository.url` populated; husky commit-msg hook modernised to v9 contract; privacy doc at `docs/v0.2/privacy.md` ready to link from registry submission.
- **Sequencing gate to v0.3.** Gate #1 (v0.2.0 GA tag) pending application. Gates #2/#3 reclassified as process risk per DD-104 + DD-116. Gates #4/#5 closed by DD-093 + DD-099. v0.3 BRD/Tech Spec authoring is unblocked.
<span color="red">**Note 2026-05-10 — no separate v0.2 release.**</span> Per v0.3 DD-118 (no legacy version support burden) and the no-audience-yet reality, v0.2 will not ship as a marketplace release. v0.2 code stays in master as the historical baseline; v0.3 is the first published version. No `v0.2.0` or `v0.2-alpha` git tag will be created. The marketplace listing request raised earlier will resolve onto v0.3 once it ships (recommend pausing Anthropic review until v0.3 is built; otherwise the listed version may land at the v0.2-baseline state and v0.3 becomes a manual re-install per DD-118).
