<!-- url: https://www.notion.so/49c010d46a7082a0aa1a01f8b72e465d -->
<!-- id: 49c010d4-6a70-82a0-aa1a-01f8b72e465d -->
<!-- title: 🚀 5. Cold-Start & Init Flow -->
## Three Starting States
- Greenfield: nothing exists. Out of v1 scope (templates only).
- Partial: some docs (CLAUDE.md, maybe README), no skills/agents. Full flow applies.
- Mature-but-messy: docs + skills + agents, all unstructured. Full flow applies — highest value.
---
## Phase 0: Discovery (instant, runs on install)
Scans only bounded surface — does NOT walk full file tree:
- Top-level directory listing (depth 1)
- All `.claude/` content (skills, agents, commands)
- All `*.md` files at root and one level deep
- `package.json` / `pyproject.toml` at root
Outputs `.claude/coherence/discovery.md` — a read-only report.
---
## Phase 1: Observe Mode (default, first ~1-2 weeks)
All hooks run normally but write nothing. Every signal goes to `.claude/coherence/observations.md`. Three passive surfacing channels: agent-side context injection, command-time surfacing, statusline badge.
Graduation trigger: user runs `/coherence:graduate`.
---
## Phase 2: Annotate Mode (opt-in)
Plugin can now write, but only metadata — no content changes. Inserts `<!-- section: id watches: ... -->` anchors, adds `<!-- last-verified -->` timestamps, generates `.claude/coherence/ignore`.
---
## Phase 3: Author Mode (manual trigger only)
Proposes new skills/agents based on deterministic evidence: repeated bash sequences (3+), repeated file-creation patterns (3+), corrected agent output patterns (3+). Generates structure only; human writes the knowledge.
---
## Bail-Halfway Safety
No phase produces a broken half-state. After Phase 0: discovery report. Mid Phase 1: observation log. Mid Phase 2: metadata in some docs. Mid Phase 3: proposal draft.
---
## Command Surface
`/coherence:scan`, `/coherence:graduate`, `/coherence:status`, `/coherence:propose-skill`, `/coherence:propose-agent`.
