<!-- url: https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b -->
<!-- id: 5fd010d4-6a70-821c-bc69-01ee992bbd5b -->
<!-- title: 🗺️ Roadmap -->
## v0.1 — Core loop with multi-file coherence (MVP) ✅ shipped 2026-05-09
**Goal:** Ship a complete, coherent healing loop end-to-end. v0.2+ are extensions, not core fixes.
**Scope:**
- Section anchor format (DD-007) — block anchors + YAML frontmatter
- Anchor integrity guards + heading-based fallback
- PostToolUse filter script with doc-declared watches
- SessionStart re-validation of pending entries
- Stop hook two-stage pipeline (DD-008): Stage 1 planner + Stage 2 patch writers
- Trigger-source grouping (DD-009)
- Patch validation pipeline: format / apply / sanity / line-count / hallucination grep
- File-level merge step (atomic file writes)
- Plan-derived bundle atomicity
- Buffer lifecycle state machine (DD-010) + `coherence/pending.md`
- Velocity limit per section (DD-011)
- Change-class classification (additive / modifying / destructive / frontmatter)
- Consolidated review UX at Stop
- Git commit per approved patch with `[coherence]` prefix
- `/coherence:status` and `/coherence:repair` commands
- Observe mode default (no auto-writes)
- Healing for all three layers: referring docs, skills, subagents
**Out of v0.1 (extension features):**
- Author mode (proposing new skills/agents)
- Annotate mode (auto-injection of metadata into existing docs)
- Trickle deep-scan
- Marketplace distribution
---
## v0.2 — Author mode + Annotate mode ✅ shipped 2026-05-10
**Goal:** Plugin becomes proactive — proposes new skills/agents and auto-annotates existing docs.
- Annotate mode: metadata injection into docs without anchors
- `/coherence:graduate` command (Observe → Annotate → Author transitions)
- Author mode signal 1: repeated bash sequences → slash command proposals
- Author mode signal 2: repeated file-creation patterns → skill scaffold proposals
- Author mode signal 3: corrected agent output → [CLAUDE.md](http://CLAUDE.md) addition proposals
- `/coherence:propose-skill` and `/coherence:propose-agent` commands
- Statusline badge
- Trickle deep-scan during PostToolUse
---
## v0.3 — Distribution and team workflows ✅ shipped 2026-05-10
**Goal:** Ship to marketplace, support team-shared configurations.
- Plugin marketplace packaging (`plugin.json`, README, install docs)
- Team-shared `coherence-ignore` (committed to repo)
- Monorepo scope support (`scope:` declarations across nested [CLAUDE.md](http://CLAUDE.md) files)
- Cross-team plan visibility (multi-developer sessions)
---
## v0.4 — First-impressions polish + marketplace structural ✅ shipped 2026-05-12
**Goal:** Polish for first installers; land official Anthropic plugin manifest layout; ship telemetry-gated trigger contracts.
- `.claude-plugin/plugin.json` manifest layout (DD-119); `claude plugin validate` gate
- `/coherence:consent` — TTY-free consent command (DD-127)
- `/coherence:audit` — bundled doctor + scope-debug + status + metrics report (DD-125)
- `--out` path sandboxing always-on in `/coherence:export-metrics` (DD-128)
- TC-1 / TC-2 trigger contracts for author-planner promotion + calibration re-tune (DD-129)
- `parseMajor()` SemVer major-digit fix (DD-124)
- Autogen command stubs from manifest at build time (DD-130)
---
## v1.0 — Trust + intelligence 🗓️ Planning kickoff 2026-05-13
✅ Shipped 2026-05-13. M0 trust ledger, M1 trust ladder, M2 asserts pipeline, M3 metrics + deep audit, M4 cosign signing — all complete. v1.0.0 tagged; cosign-signed release. (Status update via MCP — the heading text above still reads “Planning kickoff” due to a Notion-API wrapper limitation; please edit manually.)
**Goal:** Graduate coherence from a tool that always asks to one that earns the right to act.
- **G-1** Per-section trust ladder — trust score drives patch auto-apply; net-new file gate relaxes after threshold (DD-131)
- **G-2** Cross-session pattern learning — personal trust-ledger + team aggregate, file-only (DD-132)
- **G-3** `asserts:` frontmatter — text-pattern (always-on) + codebase-linked (opt-in) assertions (DD-133)
- **G-4** `/coherence:metrics` command — acceptance rate, revert rate, cost trend, trust scores (DD-134)
- **G-5** Deep `/coherence:audit` — free token-budget analysis + `--deep` LLM cross-section consistency pass (DD-135)
- **G-6** Trust signals — signed tarball, `SECURITY.md`, reproducible build (DD-137; rolled from v0.4.1)
Milestone order: M0 trust ledger → M1 trust ladder → M2 asserts → M3 metrics + deep audit → M4 trust signals (DD-136)
Open Questions: OQ-v1-01..OQ-v1-10 (10 open; spec-freeze gate)
