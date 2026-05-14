<!-- url: https://www.notion.so/35b010d46a70815285cef48ffce741d4 -->
<!-- id: 35b010d4-6a70-8152-85ce-f48ffce741d4 -->
<!-- title: Technical Specification (v0.1) -->
**Status:** Draft 1 · 2026-05-09  
**Owner:** Coherence project · Engineering  
**Source corpus:** v0.1 BRD (BRD-1..BRD-5), Design Decisions DD-001..DD-064, Architecture, Cold-Start & Init Flow, Permission & Friction Model, Token Efficiency Strategy, Patch Quality & Prompt Design.

> This Tech Spec describes how Coherence v0.1 is built. Architecture-level: components, contracts, data flow, validation pipelines, acceptance mapping. Code-level details deferred to implementation PRs.

## Design Constraints (binding)
- In-process plugin sandbox. Runs inside Claude Code v2.x; no daemons; Anthropic API only at Stop time.
- Deterministic-first. Every signal that can be computed without an LLM must be.
- Atomic, reversible writes. All file mutations temp+rename; every commit `[coherence]` prefix; revertable in one `git revert`.
- Observe-mode default. Out-of-the-box install never auto-writes user files.
- Hard caps before targets. Performance + cost targets enforced by deterministic caps in code (DD-056).
- Schema-versioned everything. Buffer entries, plans, prompts, host capabilities, migration chains versioned + validated on read.

## Slice Index (10 sub-pages)
- TS-1 System Overview & Context
- TS-2 Component Architecture
- TS-3 Data Model & Storage
- TS-4 Hook Pipeline & Runtime Flow
- TS-5 LLM Pipeline (Stage 1 / Stage 2)
- TS-6 Permission, Security & Privacy
- TS-7 Performance, Cost & Observability
- TS-8 Cold-Start, Init, Distribution & Migration
- TS-9 Test Strategy & Acceptance Mapping
- TS-10 Traceability Matrix (FR / NFR / DD ↔ TS)

## Conventions
- MUST / SHOULD / MAY follow RFC 2119.
- References: FR-AREA-N, NFR-AREA-N, DD-NNN, QG-N, PG-N, RG-N, SG-N, RB-N, E2E-N map back to BRD.
- Section refs use DD-027 normal form: `<workspace-relative-path>#<id-or-heading-anchor>`.
- Time is ISO-8601 UTC everywhere on disk and in logs (NFR-OBS-5).

<page url="https://www.notion.so/35b010d46a708125a059f71afef0d07e">TS-1 — System Overview & Context</page>
<page url="https://www.notion.so/35b010d46a708134843dc4fed567f896">TS-2 — Component Architecture</page>
<page url="https://www.notion.so/35b010d46a7081d9b307fd6a27a4deb8">TS-3 — Data Model & Storage</page>
<page url="https://www.notion.so/35b010d46a7081fdad11c61f762961af">TS-4 — Hook Pipeline & Runtime Flow</page>
<page url="https://www.notion.so/35b010d46a708159bd13d26674fccd05">TS-5 — LLM Pipeline (Stage 1 / Stage 2)</page>
<page url="https://www.notion.so/35b010d46a7081a2813fdbf8138c8fb2">TS-6 — Permission, Security & Privacy</page>
<page url="https://www.notion.so/35b010d46a7081d98a3ad878e7e6e904">TS-7 — Performance, Cost & Observability</page>
<page url="https://www.notion.so/35b010d46a70819081b5e19278b4bcd2">TS-8 — Cold-Start, Init, Distribution & Migration</page>
<page url="https://www.notion.so/35b010d46a70816a9682c531ee3e5efe">TS-9 — Test Strategy & Acceptance Mapping</page>
<page url="https://www.notion.so/35b010d46a70814da24cf2282be2f310">TS-10 — Traceability Matrix (FR / NFR / DD ↔ TS)</page>
