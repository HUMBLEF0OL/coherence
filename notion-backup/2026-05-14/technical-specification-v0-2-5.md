<!-- url: https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614 -->
<!-- id: 35b010d4-6a70-8175-a4f1-d6e4e2c3e614 -->
<!-- title: 🛠️ 🛠️ Technical Specification (v0.2) -->
**Status:** **Frozen** · 2026-05-10 · spec-freeze gates cleared — (a) v0.1.0 shipped ✅, (b) v0.1.1 telemetry patch landed (DD-068) ✅, (c) Open-Questions register OQ-v2-\* resolved ✅ · implementation in progress
**Owner:** Coherence project · Engineering · v0.2 planning phase
**Source corpus:** [📘 v0.2 BRD](https://www.notion.so/35b010d46a7081718781cd2cb908ac52) (BRD-1..BRD-5), [Design Decisions DD-065..DD-092](https://www.notion.so/35b010d46a708147911ddfddfb5a2f80), [Open Questions OQ-v2-01..31](https://www.notion.so/35b010d46a7081fcaff1fce4c0dcbec0), [v0.1 Technical Specification](https://www.notion.so/35b010d46a70815285cef48ffce741d4) (parent format reference).
> This Tech Spec describes **how** Coherence v0.2 is built. It is **strictly additive** to the v0.1 Tech Spec — every v0.1 contract holds unchanged unless a slice below explicitly amends it. Code-level details (function signatures, module file layouts, line-by-line algorithms) are deferred to the implementation PRs that land each TS section.
---
## Theme
**v0.1 reacts. v0.2 proposes.** v0.2 turns the plugin proactive: it watches what the user does during sessions and proposes net-new artifacts (skills, slash commands, agent definitions, `CLAUDE.md` additions) when DD-076 / DD-077 / DD-078 signals fire, while also auto-injecting tracking metadata into anchor-less prose docs. **Author mode is proposal-only** (DD-065): no file is ever written under `.claude/skills/`, `.claude/agents/`, or any user-owned config directory unless the user types `/coherence:propose-accept <id>`.
## Purpose & Audience
<table header-row="true">
<tr>
<td>Audience</td>
<td>Read</td>
</tr>
<tr>
<td>Engineering implementers</td>
<td>TS-1 → TS-9 in order, with BRD-2 / BRD-3 and Design Decisions open alongside</td>
</tr>
<tr>
<td>Tech lead / reviewers</td>
<td>TS-1, TS-2, TS-10 (traceability)</td>
</tr>
<tr>
<td>QA / release management</td>
<td>TS-9 + the BRD-4 acceptance gates it maps to</td>
</tr>
<tr>
<td>New contributors</td>
<td>TS-1 + TS-2 + TS-4</td>
</tr>
</table>
## Design Constraints (binding, additive to v0.1)
- **Quarantine boundary is load-bearing.** Author and Annotate mode never write into user-owned config; they materialise candidate artifacts under `.claude/coherence/proposals/<kind>/<id>/` and graduate via explicit `/coherence:propose-accept`. (DD-065, FR-PERMISSION-N1)
- **v0.1 PostToolUse 50 ms p95 is inviolate.** Any v0.2 work that risks regression runs at SessionEnd or behind an idle gate. (DD-078, DD-066, DD-084, NFR-PERF-N6)
- **Single coordinated v1 → v2 migrator.** Schema bump + new files + enum widenings happen atomically in `src/state/migrate/v1_to_v2.ts`; quarantine-and-continue on failure. (DD-080, FR-FAILURE-N1..N2)
- **Signal hashing is privacy-safe by construction.** SHA-256 / first 12 hex chars / 48-bit, single source of truth in `src/util/signatureHash.ts`; no raw command, path, or prompt content ever leaves a hook. (DD-068, NFR-PRIVACY-N1)
- **Cost partition, not relaxation.** Per-session ceiling = v0.1 baseline × 1.30; partition Author ≤ 60% / Annotate ≤ 30% / Trickle ≤ 10% of the +30% headroom; degrade-to-no-LLM on overrun. (DD-085, NFR-COST-N1..N2)
- **`prompts/v1/`**** ships unchanged side-by-side with ****`prompts/v2/`****.** Stage 1 / Stage 2 contracts are not reused by the Author pipeline. (DD-067, DD-091, NFR-MAINT-N2)
- **Five new state files participate in v0.1 atomic-write / lock-manager / quarantine semantics**, registered in `SCHEMA_NAMES` / `FILE_TO_SCHEMA`. (DD-080, NFR-RELIABILITY-N1)
- **Hard caps before targets.** `proposals_per_session ≤ 3`, `trickle_entries_per_session ≤ 20`, signal-cache `maxItems` 500 / 500 / 200 — bounds, not tuning knobs. (FR-AUTHOR-3, FR-TRICKLE-4, FR-AUTHOR-13)
## Slice Index
<table header-row="true">
<tr>
<td>#</td>
<td>Slice</td>
<td>Purpose</td>
</tr>
<tr>
<td>TS-1</td>
<td>System Overview & Context</td>
<td>v0.2 plugin shape, Observe / Annotate / Author runtime context, top-level component map (additive to v0.1 TS-1)</td>
</tr>
<tr>
<td>TS-2</td>
<td>Component Architecture</td>
<td>New modules: signal detectors, proposer pipeline, mode resolver, proposal store, snapshot writer, statusline scripts; dependency graph and v0.1 surface reuse</td>
</tr>
<tr>
<td>TS-3</td>
<td>Data Model & Storage</td>
<td>Five new state files, schema bumps, `proposal.schema.json`, on-disk layout under `.claude/coherence/proposals/`</td>
</tr>
<tr>
<td>TS-4</td>
<td>Hook Pipeline & Runtime Flow</td>
<td>PostToolUse signal capture, SessionEnd correction sweep, trickle idle gate, Stop → Author chain, debounced snapshot flush</td>
</tr>
<tr>
<td>TS-5</td>
<td>LLM Pipeline (Author / Annotate)</td>
<td>Author + Annotate prompt contracts, proposal validation pipeline, hallucination grep, cost accounting, prompt-version manifest</td>
</tr>
<tr>
<td>TS-6</td>
<td>Permission, Security & Privacy</td>
<td>DD-065 quarantine, name-collision policy, `coherence/ignore` reuse, statusline install backup, OSC 8 / 52 / plain degradation</td>
</tr>
<tr>
<td>TS-7</td>
<td>Performance, Cost & Observability</td>
<td>Partitioned latency / cost budgets, debounced snapshot writer, v0.2 telemetry events, regression-gate cells</td>
</tr>
<tr>
<td>TS-8</td>
<td>Cold-Start, Init, Distribution & Migration</td>
<td>v1 → v2 migrator, `/coherence:install-statusline` flow, host-capabilities probe extensions, plugin distribution</td>
</tr>
<tr>
<td>TS-9</td>
<td>Test Strategy & Acceptance Mapping</td>
<td>E2E + fixture + cassette + perf harnesses; BRD-4 FG / PG / CG / SG ↔ TS module ownership; v0.2.1 calibration corpus</td>
</tr>
<tr>
<td>TS-10</td>
<td>Traceability Matrix</td>
<td>Bidirectional DD-065..092 ↔ FR ↔ NFR ↔ TS-section ↔ Gate matrix</td>
</tr>
</table>
## Conventions
- **MUST / SHOULD / MAY** follow RFC 2119 (inherited from BRD-2).
- **References:** `FR-AREA-N` / `FR-AREA-NN` (v0.2 additive rows tagged `-N1..`), `NFR-AREA-NN`, `DD-NNN`, `FG-N`, `PG-N`, `CG-N`, `SG-N`, `RG-N`, `OQ-v2-NN` map back to the v0.2 BRD.
- **Section refs** anywhere on disk and in runtime use the DD-027 normal form: `<workspace-relative-path>#<id-or-heading-anchor>` (inherited).
- **Time** is ISO-8601 UTC everywhere on disk and in logs (NFR-OBS-5 inherited).
- **Hashing** is SHA-256, first 12 hex characters (48 bits), via `src/util/signatureHash.ts` (DD-068). **Status note:** the canonical module is scheduled to land in v0.1.1 ahead of v0.2 spec freeze; v0.2 implementation PRs MUST verify it exists in the working tree before extending its callers, and create it if missing.
## Sign-off
<table header-row="true">
<tr>
<td>Role</td>
<td>Name</td>
<td>Date</td>
<td>Status</td>
</tr>
<tr>
<td>Tech lead</td>
<td>TBD</td>
<td>—</td>
<td>☐ Pending (v0.1.0 ship gate cleared)</td>
</tr>
<tr>
<td>Engineering reviewer 1</td>
<td>TBD</td>
<td>—</td>
<td>☐ Pending</td>
</tr>
<tr>
<td>Engineering reviewer 2</td>
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
## Change Log
<table header-row="true">
<tr>
<td>Date</td>
<td>Version</td>
<td>Change</td>
</tr>
<tr>
<td>2026-05-09</td>
<td>0.2-draft1</td>
<td>Initial v0.2 Tech Spec authored from v0.2 BRD draft1 + DD-065..DD-092 + OQ-v2-01..31 resolutions.</td>
</tr>
<tr>
<td>2026-05-10</td>
<td>0.2-frozen</td>
<td>Spec frozen. v0.1.0 shipped, v0.1.1 telemetry patch (DD-068) landed, OQ-v2-\* resolved. v0.2 implementation now in progress.</td>
</tr>
</table>
<page url="https://www.notion.so/35b010d46a70813fb222ef8715828c20">TS-1 — System Overview & Context</page>
<page url="https://www.notion.so/35b010d46a708103b54ff2f187fc822b">TS-2 — Component Architecture</page>
<page url="https://www.notion.so/35b010d46a708101b005d2d3e7005fef">TS-3 — Data Model & Storage</page>
<page url="https://www.notion.so/35b010d46a70812885eae82db682b9f8">TS-4 — Hook Pipeline & Runtime Flow</page>
<page url="https://www.notion.so/35b010d46a70811c989eeef8b985b5da">TS-5 — LLM Pipeline (Author / Annotate)</page>
<page url="https://www.notion.so/35b010d46a708123b9f6f9c022be58e5">TS-6 — Permission, Security & Privacy</page>
<page url="https://www.notion.so/35b010d46a7081a8bd20c60860394376">TS-7 — Performance, Cost & Observability</page>
<page url="https://www.notion.so/35b010d46a7081dbada3f47596216e94">TS-8 — Cold-Start, Init, Distribution & Migration</page>
<page url="https://www.notion.so/35b010d46a708161b853cd1f72017a41">TS-9 — Test Strategy & Acceptance Mapping</page>
<page url="https://www.notion.so/35b010d46a7081da8978d276d57b7836">TS-10 — Traceability Matrix (DD / FR / NFR ↔ TS ↔ Gate)</page>
