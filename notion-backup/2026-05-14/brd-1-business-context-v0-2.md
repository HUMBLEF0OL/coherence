<!-- url: https://www.notion.so/35b010d46a70811f886df73e0cea0176 -->
<!-- id: 35b010d4-6a70-811f-886d-f73e0cea0176 -->
<!-- title: 🎯 BRD-1 — Business Context & Objectives (v0.2) -->
**Parent:** [📘 BRD](https://www.notion.so/35b010d46a7081718781cd2cb908ac52) · **Status:** Draft 1 · 2026-05-09
---
## 1. Theme
> v0.1 reacts. v0.2 proposes.
v0.1 keeps existing knowledge-layer files coherent with the codebase. v0.2 turns the plugin proactive: watches what the user does and proposes net-new artifacts (skills, slash commands, agent definitions, [CLAUDE.md](http://CLAUDE.md) additions), while auto-injecting tracking metadata into prose docs without anchors.

## 2. Problem Statement
v0.1 solves drift for files that already exist and have anchors. Five problems remain:
1. Anchor-less docs invisible to healing loop.
2. Recurring user behaviour signals missing automation (none captured by v0.1).
3. No pull-based discovery.
4. Drift caught by reactive signals only.
5. No ambient state surface.

## 3. Load-bearing Premise — Trust Model (DD-065)
v0.2 Author mode is proposal-only. Plugin never writes net-new files into `.claude/skills/`, `.claude/agents/`, or any user-owned config directory automatically. All Author/Annotate output materialised under `.claude/coherence/proposals/<kind>/<id>/` (DD-072) and surfaces only via slash commands. Graduation requires explicit user-accept; no auto-promote flag in v0.2 (graduated auto-apply is v1.0+ candidate).

## 4. Stakeholders & Users
- Solo developer using Claude Code → Author pipeline + `/coherence:propose-*`
- Doc-heavy project owner → Annotate mode + `/coherence:annotate` + `/coherence:graduate`
- Trust-cautious maintainer → DD-065 quarantine + accept/reject flow
- Power user with custom statusline → Hybrid statusline + OSC 8 click affordance
- Privacy-conscious operator → DD-068 hashed signatures + DD-086 share-metrics allowlist
- v0.1 operator upgrading in place → DD-080 single coordinated v1→v2 migrator

## 5. Success Metrics
- Annotate-mode false-positive rate < 5%
- Proposal accept rate ≥ 30% over 2-week window
- Proposal time-to-decision p50 < 7 days
- Statusline overhead < 5ms per render
- Trickle deep-scan budget ≤ 100ms cumulative per PostToolUse, gated by idle detection
- v0.2.1 calibration precision ≥ 0.7 projected accept rate (DD-092 acceptance gate)

## 6. Goals (G-1..G-11)
See parent BRD index for goal table mapped to DDs.

## 7. Business Value
- Retention of v0.1 trust contract (DD-065).
- Reduced manual anchoring cost (Annotate mode).
- Compounding skill/agent quality.
- Ambient situational awareness (statusline).
- Calibratable, not guessed (DD-068 → DD-092).
