<!-- url: https://www.notion.so/35d010d46a7081d687d8f32f4a25f500 -->
<!-- id: 35d010d4-6a70-81d6-87d8-f32f4a25f500 -->
<!-- title: v0.4 -->
**Status:** **Complete** · 2026-05-12 (`v0.4.0` tagged; all milestones shipped)
**Source corpus:** [v0.3](https://www.notion.so/35c010d46a7081539285e448bcd2cf35), [Roadmap](https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b)
> v0.3 implementation complete (`v0.3.0` tagged). All 13 Open Questions closed. All 12 Design Decisions ratified (DD-119–DD-130). All 5 sequencing gates closed. **v0.4 BRD / Tech Spec authoring is fully unblocked across all four goals.**
---
## Theme
**v0.1 reacts. v0.2 proposes. v0.3 distributes. v0.4 polishes for first impressions, gets cohrence into the official marketplace, and stages telemetry-gated work for v0.4.1+.**
v0.4 is the **first-impressions polish + marketplace structural** release. It rides the v0.3 launch wave — shipping alongside or shortly after v0.3's marketplace debut so the rough edges a new installer would hit get smoothed before they accumulate distrust. Trust-signal work (signed tarball, reproducible build, `SECURITY.md`) is deferred to **v0.4.1** so its scope can be informed by what real installers actually distrust.
---
## Problem statement
v0.3 ships the cross-team substrate (plans, ignore split, scope, monorepo) and the static-analysis gates that prove the architectural commitments. Three classes of problem remain:
1. **Marketplace listing structural gap.** v0.3 ships `plugin.json` at the plugin root, internal paths use project-relative references, and persistent state writes to `.claude/coherence/` (per-project). The official Anthropic plugin schema requires `.claude-plugin/plugin.json`, `${CLAUDE_PLUGIN_ROOT}` for internal paths, and `${CLAUDE_PLUGIN_DATA}` for per-installation state. **None of this is migratable** — v0.4 honours DD-118 (no legacy migration); users re-install.
2. **First-installer ergonomics gap.** E9 consent prompt is a placeholder (Claude Code hooks have no TTY, defaults always apply). N4 `--out` accepts paths outside project root (security review item). There is no minimal `/coherence:audit` to bundle existing doctor + scope-debug + status reports for installer self-diagnosis.
3. **Telemetry-gated work has no trigger contract.** DD-104 (Author-pipeline planner promotion to default ON) and DD-116 (field calibration of DD-076/077/078) are deferred to v0.4+ pending real telemetry. v0.3 left them as prose deferrals; v0.4 ships the **trigger contracts** (env-flag readiness checks) so the work can fire automatically when ≥30 days × ≥50 sessions of field data exists, without a separate code release.
---
## Goals (v0.4)
<table header-row="true">
<tr><td>#</td><td>Goal</td><td>Source</td></tr>
<tr><td>G-1</td><td>**Official Anthropic marketplace listing** — `.claude-plugin/plugin.json`, `${CLAUDE_PLUGIN_ROOT}`, state-storage tri-partition, `claude plugin validate` clean</td><td>[Plugin docs](https://code.claude.com/docs/en/plugins-reference)</td></tr>
<tr><td>G-2</td><td>**First-impressions ergonomics** — E9 consent surface, N4 path sandboxing, minimal `/coherence:audit` bundling, slash-command discoverability</td><td>v0.3 post-M8 audit</td></tr>
<tr><td>G-3</td><td>**Telemetry-gated trigger contracts** — DD-104 + DD-116 specifiable now, fire when v0.3 field telemetry crosses thresholds</td><td>v0.3 BRD-5 deferrals</td></tr>
<tr><td>G-4</td><td>**B2 `parseMajor` correctness for ≥1.0.0** — codify before v1.0.x ships (no installed base to migrate today)</td><td>v0.3 post-M8 audit</td></tr>
</table>
---
## Non-goals (still v1.0+)
- Auto-apply / graduated trust ladder for accepted proposals (v1.0 reservation; DD-065 trust contract preserved across v0.4).
- Assertion checking implementation (`asserts:` frontmatter) — v1.0.
- Quality-metrics dashboard (acceptance rate, revert rate per section) — v1.0.
- Cross-session pattern learning beyond the 7-day rolling window — v1.0.
- Deep `/coherence:audit` functionality — v1.0. v0.4's minimal version is **bundling-only** (existing doctor + scope-debug + status outputs into a single readable report).
- Trust signals (signed tarball, reproducible build, `SECURITY.md`, M6 gates as README claims) — **v0.4.1** fast-follow.
- Field-calibration *execution* — v0.4 ships the trigger contracts only; execution waits for ≥50 sessions × ≥30 days field telemetry.
---
## Load-bearing premises (carry-over from v0.3)
- **DD-117 (no backend, ever)** — file-only architecture is the end state. v0.4 marketplace listing does NOT introduce hosted services.
- **DD-118 (no legacy version support)** — v0.4 has no migrator from "v0.3 plugin.json layout" → "v0.4 .claude-plugin/plugin.json layout". Users re-install. This applies recursively to every future structural change.
- **DD-065 trust model** — net-new files never auto-land. Marketplace install does NOT change this.
- **No npm channel** — DD-093 reaffirmed. Anthropic plugin registry is the canonical install path.
---
## Success metrics (placeholder — tune from v0.3 install signal)
<table header-row="true">
<tr><td>Metric</td><td>Target</td><td>Why</td></tr>
<tr><td>`claude plugin validate` exit 0</td><td>100% on master</td><td>M-VALIDATE-1</td></tr>
<tr><td>Official marketplace listing</td><td>Submitted via in-app form by v0.4 GA tag</td><td>G-1 closure</td></tr>
<tr><td>Marketplace install → first proposal accept</td><td>p50 \< 24h (carry from v0.3)</td><td>First-impressions signal</td></tr>
<tr><td>First-installer abandonment within 7 days</td><td>\< 30%</td><td>Polish quality signal</td></tr>
<tr><td>Telemetry-gated trigger fires correctly when threshold met</td><td>100% in synthetic harness; 100% in field when conditions met</td><td>M-TRIGGER-1</td></tr>
<tr><td>Cost ceiling</td><td>0 sessions over v0.1 × 1.30 (DD-112 carry)</td><td>NFR-COST inheritance</td></tr>
</table>
---
## v0.3 dependency list (parallel-planning risk)
v0.4 features depend on v0.3 internals that are still in bug-fix closure. These must be validated before v0.4 spec freeze:
- **v0.3 GA tag + marketplace submission** — without an installed base, first-impressions polish has no signal. v0.4 BRD/Tech Spec authoring is unblocked sooner, but ship-time gates need a v0.3 baseline.
- **`claude plugin validate` baseline run on v0.3** — required to size G-1 structural work (OQ-v4-03).
- **State files schema** — v0.3 lays out `.claude/coherence/` + `coherence/` per-project; v0.4 splits a small subset to `${CLAUDE_PLUGIN_DATA}` (OQ-v4-01 → DD-120). The split must not break v0.3's cross-team plan store (G-4) or two-file ignore (G-2).
- **B1 / N8 / E1..E10 audit closures from v0.3 post-M8 pass** — must land before v0.4 starts so v0.4's own bug-fix surface stays small.
- **DD numbering** — v0.3 ratified DD-093..DD-118 (24 active + 4 retired). v0.4 starts at **DD-119**.
- **OQ numbering** — v0.4 uses **OQ-v4-NN** namespace (parallel to v0.3's OQ-v3-NN).
---
## Sequencing gates (v0.3 → v0.4)
**All must be ✅ before v0.4 spec freeze.** Mirrors v0.3's gate discipline.
1. ✅ v0.3 GA tagged (`v0.3.0`) + marketplace submission proceeds as an independent operational task (non-blocking).
2. `claude plugin validate` run against v0.3 codebase; failure list captured (closes OQ-v4-03 → DD-123 sizing).
3. State-storage tri-partition rule decided (closes OQ-v4-01 → DD-120).
4. Manifest layout migration policy confirmed = strict re-install per DD-118 (closes OQ-v4-02 → DD-122).
5. v1.0 Notion scope decision: blocking or placeholder? (closes OQ-v4-07).
---
## Document structure (this release)
This page is the Overview. Two sibling pages hold the working planning state during the kickoff phase. BRD and Technical Specification slices will be authored only after the Overview, DD register, and Open Questions are stable.
- **Open Questions** — every assumption v0.4 makes about v0.3 + the marketplace structural work; spec-freeze gate.
- **Design Decisions** — living register continuing from DD-119 (v0.3 ended at DD-118).
— — —
*v0.4.1 fast-follow scope (informational, not part of v0.4 freeze): trust signals — signed-tarball release flow extending FR-MARKETPLACE-4 SHA256 commit, reproducible-build claim, **`SECURITY.md`** + responsible disclosure path, M6 static-analysis gates reframed as verifiable claims in README. Ship-train slot decision is OQ-v4-06.*
<page url="https://www.notion.so/35d010d46a7081c78b93ff369aa93147">Open Questions</page>
<page url="https://www.notion.so/35d010d46a7081e58c1bcb14fd4b8ea5">Design Decisions</page>
<page url="https://www.notion.so/35d010d46a7081e0a2d9f7a928fbaa58">📋 BRD — Business Requirements Document</page>
<page url="https://www.notion.so/35d010d46a7081858d6ff32edcce2e2b">🛠️ Technical Specification (v0.4)</page>
