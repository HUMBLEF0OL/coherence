<!-- url: https://www.notion.so/93d010d46a708280ba6c013d97211fd6 -->
<!-- id: 93d010d4-6a70-8280-ba6c-013d97211fd6 -->
<!-- title: 🧭 Coherence -->
Status: v1.0.0 shipped (2026-05-13). Trust + intelligence release — M0 trust ledger, M1 trust ladder, M2 asserts pipeline, M3 metrics + deep audit, M4 cosign signing — all complete. v1.0.0 tagged; cosign-signed release.
## Project Summary
Coherence is a Claude Code plugin that solves documentation drift — the progressive decay of skills, subagents, and referring docs ([CLAUDE.md](http://CLAUDE.md), [ARCHITECTURE.md](http://ARCHITECTURE.md), [PATTERNS.md](http://PATTERNS.md) etc.) as a project grows. When these files go stale, AI agents hallucinate, produce inconsistent output, and lose alignment with the real codebase. Coherence installs as a native Claude Code plugin, uses hooks to passively observe change signals during normal development sessions, and proposes surgical inline updates to affected docs at session end — with human permission gating tuned to minimize friction while protecting sensitive files like skills and subagent definitions.
## Documentation index
- Read Me First — start here. What Coherence is, audience, and how to navigate this hub.
- Architecture — system design, components, data flow, and the pipeline diagram.
- BRD — product/business requirements held across versions (evergreen).
- Technical Spec — system-wide technical contract held across versions (evergreen).
- Roadmap — forward-looking scope and milestone list per version.
- Releases — per-version frozen BRD, Technical Spec, Open Questions, Design Decisions, and Planning Archive.
- Reference — consolidated DD-001..DD-147 register and project glossary.
### Reading paths
- New to the project: Read Me First, then Architecture, then glance at the latest release in Releases.
- Approving a release: Releases > that version > BRD (release criteria) and Open Questions (resolved at spec-freeze).
- Implementing a release: Releases > that version > Technical Spec slices in order, with the per-release BRD open alongside.
- Tracing a DD-NNN: Reference > Design Decisions for the index; Releases > that version > Design Decisions for full text.
<page url="https://www.notion.so/5fd010d46a70821cbc6901ee992bbd5b">Roadmap</page>
<page url="https://www.notion.so/35b010d46a70814fbfbbd7110373a2e4">BRD</page>
<page url="https://www.notion.so/35b010d46a70819da60fe8948e2b36e2">Technical Spec</page>
<page url="https://www.notion.so/35b010d46a7081688d3fe27c531626b6">Releases</page>
<page url="https://www.notion.so/35f010d46a70810589c2f3736efd925a">Implementation Plans (archive)</page>
<page url="https://www.notion.so/35f010d46a70816787b7f13d292ecd20">Read Me First</page>
<page url="https://www.notion.so/35f010d46a7081feb7e7e2ab737e96d5">Architecture</page>
<page url="https://www.notion.so/35f010d46a7081b4a2afc659a55c3701">Reference</page>
