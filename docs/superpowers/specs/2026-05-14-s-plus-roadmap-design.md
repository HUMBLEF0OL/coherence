# S+ Roadmap — v1.0.3 → v1.1.0 (S+ trajectory)

**Status**: approved 2026-05-14
**Author**: HUMBLEFOOL (with Claude Opus 4.7 brainstorming)
**Target version**: v1.1.0 (next minor — slug rename + post-v1.0.3 moves land here; phases ship as v1.1.x patches as they complete)
**Scope**: composite-score lift from ~8.0 / 10 to ~9.5+ / 10 (S+)
**Companion**: [Notion mirror](https://www.notion.so/S-Roadmap-v1-0-3-v1-1-0-360010d46a7081ce8ee7e7ffff4981e3) under *Coherence project → Releases → v1.1*

---

## Premise

The v1.0.3 release closed two gaps (marketplace source-shape fix, master-branch catch-up) and lifted the project to an estimated B+/A- composite score (~8.0). S+ is defined here as a composite ≥ 9.5 on the rubric below. Reaching it requires both:

1. Closing the four weak axes — maintainability (6.5), distribution (7.0), plugin polish (7.0), documentation (7.5).
2. Tightening the strong axes from 9 → 10 — test rigor, release engineering, architecture, code quality, safety/security.

Pushing only one half does not get there; the bottom drags the average.

## Scoring rubric (the 10 axes)

Composite is the unweighted mean of the per-axis scores. Each axis is scored 1–10 against the criteria below.

| # | Axis | v1.0.3 score | What pulls it up |
|---|---|---|---|
| 1 | Test rigor | 9.0 | Mutation tests, property-based tests, coverage threshold, end-to-end install smoke |
| 2 | Release engineering | 9.0 | Auto-derived tag, single-command bump, auto-generated notes, perf regression gates |
| 3 | Architecture | 8.5 | Pluggable extension surface, decoupled subsystems, fewer magic conventions |
| 4 | Code quality | 8.5 | Zero TODOs, mutation-tested, coverage-gated |
| 5 | Safety / security | 8.5 | SLSA L3, SBOM, public threat model, Dependabot |
| 6 | Velocity | 8.0 | Continued release cadence; not the dragging axis |
| 7 | Documentation | 7.5 | ADR mirror, extension tutorials, architecture diagram, failure-mode doc, comparison piece |
| 8 | Distribution | 7.0 | Official-marketplace listing, CI install-smoke, devcontainer, awesome-list discoverability |
| 9 | Plugin polish | 7.0 | Single-name unification, native slash dispatch, command consolidation, userConfig schema, more plugin surface used |
| 10 | Maintainability | 6.5 | `.gitattributes`, derived TAG, magic-convention audit, debug log parity, docs that fake bus-factor |

## Constraints

- **Solo by choice**. No human contributor onboarding for now. Documentation does bus-factor work in lieu.
- **Coherence is a tool, not a brand**. Library extractions (trust-ladder lib, cassettes lib, asserts spec proposal) and rebrand moments are out of scope.
- **D1 already in flight**. Official Anthropic marketplace submission via [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit) — tracked elsewhere.
- **D2 declined**. npm publish skipped per maintainer decision.
- **Feedback loop available**. Three external testers can be onboarded.

## Phased roadmap

### Phase 0 — In flight (do not re-execute)

| ID | Move | Owner |
|---|---|---|
| D1 | Anthropic marketplace submission | maintainer (external review) |

### Phase 1 — Foundational hygiene

Order matters: C1 unblocks M4.

| ID | Move | Axes lifted | Effort |
|---|---|---|---|
| C1 | Rename `cohrence` → `coherence` across `package.json`, `plugin.json`, `marketplace.json`. Cut as **v1.1.0** (slug rename within minor line; npm isn't published per D2, so the only impacted users are marketplace installers who re-add once). Update README's three-name tagline accordingly. | Plugin polish, Maintainability, Docs | Low |
| M4 | Drop the custom `UserPromptSubmit` slash-command dispatch + `<!-- coherence-command: -->` sentinel routing. Migrate to Claude Code's native `/<plugin>:<command>` namespacing. Half a subsystem disappears. | Architecture, Maintainability, Plugin polish | Medium |
| M2 | Add `.gitattributes` with `* text=auto eol=lf`. Eliminates the perpetual `.claude/settings.json` CRLF dirty-state noise. | Maintainability | Trivial |
| M3 | Derive `TAG` from `package.json#version` in `scripts/release-ga.mjs`. Add `npm run bump <ver>` that atomically updates all 7 version sources. Releases become one command. | Release engineering, Maintainability | Low |
| T7 | Dependabot or Renovate config — auto-PR for dependency updates. | Maintainability, Safety | Trivial |

**Expected composite lift**: ~8.0 → ~8.7

### Phase 2 — Feedback loop

| ID | Move | Axes lifted | Effort |
|---|---|---|---|
| S6 | Onboard the three testers. Per-tester feedback channel (issue template + a `/coherence:feedback` command that captures session state). Run for ~2 weeks. | Distribution, Maintainability, Plugin polish | Medium |
| D3 | CI job: on tag push, run `claude plugin marketplace add <repo>@<tag>` + `claude plugin install`, assert hooks register. Catches the next v1.0.2-style install bug before shipping. | Test rigor, Release engineering, Distribution | Medium |
| C3 | Consolidate the 27 commands. Five `propose-*` collapse into `/coherence:propose <subcommand>`; same for `plan-*`. Target: ~15 commands. | Plugin polish, Docs | Medium |
| C4 | Declare `userConfig` for `defaultMode` (observe/graduated/annotate/author) and `telemetryOptIn`. Removes hand-editing of config files post-install. | Plugin polish | Low |

**Expected composite lift**: ~8.7 → ~9.0

### Phase 3 — Documentation pass

Doubly weighted given solo-by-choice. Each item is a teaching artifact that future-maintainer or future-contributor leans on.

| ID | Move | Axes lifted | Effort |
|---|---|---|---|
| X1 | Mirror the Notion ADR register to `docs/adr/` as flat markdown. Discoverable + grep-able + survives Notion access loss. | Docs, Maintainability | Medium |
| X2 | Three extension tutorials under `docs/extensions/`: "How to add an asserts engine", "How to add a language to hallucination detection", "How to add a hook event handler". | Docs, Architecture | Medium |
| X3 | Hand-curated mermaid architecture diagram of the Stop-pipeline data flow. Complements `graphify-out/` (which is a network graph, not a teaching diagram). | Docs | Low |
| X4 | "Failure modes" doc: what each state file looks like when broken / quarantined / locked; what degraded mode looks like; what the sentinel says. Operator-grade. | Docs, Safety | Medium |
| X5 | Comparison piece: Coherence vs alternatives (docs-as-tests linters, broken-link checkers, etc.). | Docs, Distribution | Low |

**Expected composite lift**: ~9.0 → ~9.3

### Phase 4 — Hardening pass (9 → 10 on strong axes)

| ID | Move | Axes lifted | Effort |
|---|---|---|---|
| T1 | Mutation testing via `stryker-mutator`. Reveals which tests actually constrain behavior. | Test rigor | Medium |
| T2 | Property-based tests via `fast-check` on the validation chain. Random patches, pipeline invariants. | Test rigor | Medium |
| T3 | Coverage threshold gate. Start with `src/validation/` ≥ 90%; expand. | Test rigor | Low |
| T4 | Lock wall-clock budgets on `tests/perf/` and fail CI on regression. The perf tests exist but are not gates. | Release engineering | Low |
| T8 | Auto-generated release-notes from conventional-commits; keep the manual narrative on top. | Release engineering | Low |
| T6 | CycloneDX SBOM via `npm sbom` shipped alongside the tarball. | Safety | Low |
| T5 | SLSA Level 3 build provenance. Hardened ephemeral builder + non-falsifiable provenance. GitHub-hosted runners provide most of it. | Safety | High |
| T9 | Public STRIDE threat model writeup. Articulates the trust boundary, blast radius, and what cosign + asserts + line-ratio + hallucination-grep each defend against. | Safety, Docs | Medium |
| T10 | `claude --debug` parity — every state transition gets a debug log line. | Maintainability | Low |
| M5 | Convention audit: each magic convention (sentinel comments, version-scanner allowlist, autogen hash check) → keep + document, or delete. | Maintainability | Medium |

**Expected composite lift**: ~9.3 → ~9.6

### Phase 5 — Platform moves (S+ territory)

| ID | Move | Axes lifted | Effort |
|---|---|---|---|
| S9 | Pluggable asserts engines. Third parties ship `coherence-engine-<x>` npm packages; Coherence auto-discovers via `package.json`. Plugin → ecosystem. Pairs with X2. | Architecture, Distribution, Maintainability | High |
| C2 | Use more of Claude Code's plugin surface: a `skills/coherence-explain/SKILL.md`, an `agents/coherence-reviewer.md` subagent, an `output-styles/coherence.md`, a `monitors/proposals-watch.json`. | Plugin polish, Architecture | Medium |
| S8 | `npx coherence init` standalone CLI. Drops `.claude-plugin/`, anchor templates, `asserts:` examples, default config. One command to start. | Distribution, Plugin polish | Medium |
| S7 | VS Code companion (read-only). Squiggly lines on stale doc sections; hover tooltip with drift bundle. Surface beyond Claude Code. | Distribution, Plugin polish | High |
| S4 | Multi-mode UX writeup (observe / graduated / annotate / author). Blog post or conference talk. Positions Coherence as thought leadership. | Adoption signal | Low |
| S5 | Anthropic pilot outreach. Concrete proposal: Coherence on Anthropic's own docs repo. Mutual win. | Adoption signal | Low |

**Expected composite lift**: ~9.6 → ~9.9 (**S+**)

## Critical path

```
C1 ──> M4 ──> C3
S6 ──> influences C3, X4, S8
S6 ──> validates D3
X2 ──> S9
```

All other moves are parallel-safe.

## Score projection by phase

| Phase | Composite | Equivalent grade |
|---|---|---|
| v1.0.3 (today) | ~8.0 | B+/A- |
| Phase 1 done | ~8.7 | A- |
| Phase 2 done | ~9.0 | A |
| Phase 3 done | ~9.3 | A/A+ |
| Phase 4 done | ~9.6 | **S** |
| Phase 5 done | ~9.9 | **S+** |

## Explicit non-goals

- Library extractions of trust-ladder, cassettes, asserts (S1-S3). Coherence is a tool, not a brand.
- Project rebrand or fresh-launch moment (S10). Same reason.
- Onboarding human contributors (M1). Solo by choice; docs do the work instead.
- npm publish (D2). Maintainer-declined.
- Wider framing as "executable docs contracts" platform. Drift detection is the framing.

## Open risks

- **C1 slug rename is install-breaking even at minor.** Existing marketplace installers of `cohrence@cohrence` won't auto-migrate to `coherence@coherence` — they have to `claude plugin marketplace remove cohrence` + `add` the new slug. Ship a v1.1.0 release-notes migration block + a `coherence` README banner. No npm impact (D2 declined). Semver-wise this is an alias change, not a behavior break, hence minor.
- **D3 CI install-smoke requires Claude Code in CI.** May need a containerized Claude Code runner or a mock harness. Investigate before committing to the CI design.
- **S9 pluggable engines** is the only High-effort move that doesn't yield a directly user-visible feature. Worth doing only after Phase 4 confirms the asserts engine surface is stable.
- **Notion ↔ repo drift (X1).** ADR mirror needs one-way sync. Recommend repo-as-source-of-truth from this point forward; Notion mirrors the repo, not the reverse.
- **Score-projection estimates are not measured.** Each phase's lift estimate is judgment, not instrumentation. Re-score after each phase using the rubric above and adjust the plan if a phase under-delivers.

## Implementation cadence

This is a **roadmap**, not an implementation plan. Each phase is its own future `superpowers:writing-plans` invocation when ready to execute:

| Phase | Ships as | Plan trigger |
|---|---|---|
| 1 | v1.1.0 (first cut, includes C1 rename) | Right after this spec is approved |
| 2 | v1.1.1 – v1.1.3 (per move) | After Phase 1 stabilizes for ~1 week |
| 3 | v1.1.4 – v1.1.x (docs, no code impact) | Parallel-safe with Phase 2 |
| 4 | v1.1.x (hardening, no user-visible) | After feedback-loop signals from Phase 2 |
| 5 | v1.2.0+ (platform moves) | After Phases 1–4 land and stabilize |

S+ is a destination, not a single deliverable. Each phase landing is a real release with its own gates, notes, and tag.

## Next step (after this spec is committed)

This brainstorm explicitly ends at the design stage. No implementation plan is being written here. When Phase 1 is ready to execute, invoke `superpowers:writing-plans` against the **Phase 1 — Foundational hygiene** moves (C1 → M4 → M2 → M3 → T7). Subsequent phases each get their own plan invocation.
