# Notion redesign — database / view ID register

Created during Phase 1 of the 2026-05-14 redesign. All four databases live as
inline children of the `[Template] New Project` row
(`f2a010d4-6a70-83ee-903e-01b55b968b74`). Phase 2.5 will duplicate this
template into a fresh "Coherence (v2)" project — Coherence-scoped IDs (Phase
3.0) will be appended below under their own headings.

---

## Releases db (template)
- database_id: `d0fb4b3a-c9e7-4a3c-bbf7-955136ef3639`
- data_source_id: `247ab3e1-148b-4854-83e0-6d4de00bb250`
- url: https://www.notion.so/d0fb4b3ac9e74a3cbbf7955136ef3639
- properties (12 user-defined + 3 auto back-relations):
  - `Version` (TITLE)
  - `Status` (SELECT: Planning, Authoring, Implementing, Shipped, Superseded)
  - `Ship date` (DATE)
  - `Tag SHA` (RICH_TEXT)
  - `Substrate` (RELATION self DUAL `Extended by`)
  - `BRD-delta` (URL)
  - `TSD-delta` (URL)
  - `Working Log` (URL)
  - `DD range` (RICH_TEXT)
  - `Rolled to next` (RICH_TEXT)
  - `Notes link` (URL)
  - `Theme` (RICH_TEXT)
  - auto: `Extended by` (back-relation of `Substrate`)
  - auto: `Design Decisions` (back-relation of DD db's `Version introduced`)
  - auto: `Bugs` (back-relation of Bugs db's `Release`)
- views:
  - Table: `360010d4-6a70-8182-a0b8-000cb1715293` — sorted by Ship date DESC
  - Board by Status: `360010d4-6a70-8188-8dd5-000c54e0a235`
  - Timeline: `360010d4-6a70-8103-83f6-000c3b4782e7` — by Ship date
- notes: Self-relation `Substrate` was added via `update-data-source` after
  initial create (per tool docs requirement for self-relations).

## Design Decisions db (template)
- database_id: `0dad4e82-5aa5-48d3-b098-04bc47dcc0d5`
- data_source_id: `c51f4c92-120e-4c49-a43f-f333ea0b2a36`
- url: https://www.notion.so/0dad4e825aa548d3b09804bc47dcc0d5
- properties (6 user-defined + 1 auto back-relation):
  - `DD #` (TITLE)
  - `Title` (RICH_TEXT)
  - `Version introduced` (RELATION → Releases ds DUAL `Design Decisions`)
  - `Status` (SELECT: Active, Superseded, Retired, Deferred)
  - `Supersedes` (RELATION self DUAL `Superseded by`)
  - `Tags` (MULTI_SELECT: Architecture, Pipeline, Trust, Validation, State,
    Build/Release, Privacy, Security, UX/Commands, LLM, Telemetry,
    Distribution)
  - auto: `Superseded by` (back-relation of `Supersedes`; satisfies spec §5.2
    `Superseded by` rollup per agent question 1 resolution)
- views:
  - Table: `360010d4-6a70-8118-a824-000c63febb97` — sorted DD # ASC
  - By Version: `360010d4-6a70-8171-8846-000c3e0772bb` — board grouped by
    Version introduced
  - By Status: `360010d4-6a70-816b-a897-000c566885b0` — table grouped by Status
  - Active only: `360010d4-6a70-8159-aa82-000cfd8b44ef` — filter Status =
    Active, sort DD # ASC
- notes: `Supersedes` self-relation added in second pass via
  `update-data-source`. Body content lives in row body (no extra property).

## Bugs db (template)
- database_id: `1aca80c3-6182-46cf-abf4-a9a16fb8d7a7`
- data_source_id: `fa271e9e-0ec6-4f59-b1ba-2c4d3147f6fd`
- url: https://www.notion.so/1aca80c3618246cfabf4a9a16fb8d7a7
- properties (9):
  - `Fix #` (TITLE)
  - `Title` (RICH_TEXT)
  - `Bug class` (SELECT: Validation gate, Release pipeline, LLM transport,
    Privacy / .gitignore, Concurrency, Documentation, Render bug, Other)
  - `Severity` (SELECT: P0 - shipped broken, P1 - latent gap, P2 - polish)
  - `Commit SHA` (RICH_TEXT)
  - `Tests added` (NUMBER)
  - `Caught by` (SELECT: Pre-release tests, Post-tag audit, Downstream smoke,
    Field report, Manual review)
  - `Release` (RELATION → Releases ds DUAL `Bugs`)
  - `Status` (SELECT: Open, In progress, Fixed, Won't fix)
- views:
  - Table by Release: `360010d4-6a70-8119-b0d6-000c38be6356` — table grouped by
    Release
  - Open only: `360010d4-6a70-814b-a8b5-000cb9a3a99a` — filter Status = Open
  - By Caught by: `360010d4-6a70-8164-aa75-000cf89654b4` — board grouped by
    Caught by
- notes: Notes for each fix live in row body (no extra property).

## Docs db (template) — pre-existing
- database_id: `a1b010d4-6a70-8370-8e1d-0140bd0631c7`
- data_source_id: `e2a010d4-6a70-8246-8b49-07be53668c6e`
- url: https://www.notion.so/a1b010d46a7083708e1d0140bd0631c7
- properties (5, all pre-existing — schema unchanged per spec §5.4):
  - `Name` (TITLE)
  - `Category` (SELECT: Overview, Architecture, Specification, API Reference,
    Configuration, Integrations, Quality, CI/CD, Security, Operations,
    Diagrams, Planning, Decisions, Changelog)
  - `Status` (SELECT: Current, Draft, Needs Update, Outdated) — `Current`
    option present ✅
  - `Tags` (MULTI_SELECT: Reference, Runbook, ADR, Diagram, Auto-generated,
    Template)
  - `Last Updated` (LAST_EDITED_TIME)
- new view added in Phase 1.4:
  - Stale (>90d, Current): `360010d4-6a70-8156-9e05-000c9a3c5772` — table,
    `FILTER "Status" = "Current"; SORT BY "Last Updated" ASC`
- notes: The relative-date filter (`"Last Updated" < TODAY - 90 DAYS`) was
  rejected by the view DSL parser (`Unexpected character: -` at position 30).
  Per plan, fell back to the `Status = "Current"` filter only; the >90-day
  predicate must be applied manually or via UI filter overlay. Limitation
  recorded in `_capabilities.md`.

---

## Releases db (template) — extra IDs after Task 2.5

- `[Template]` row in Releases ds (carries the Ship-time checklist + Sequencing gates toggles in its body):
  - page_id: `360010d4-6a70-8173-9395-cb82259c8eca`
  - url: https://www.notion.so/360010d46a7081739395cb82259c8eca
  - notes: MCP cannot mark a row as a Notion default template. Treat this row
    as a copy-paste reference until the MCP exposes db-template ops; see
    `_capabilities.md` for the limitation. Phase 3.1 must continue to inject
    the toggle blocks into each new release row body individually.

---

## Coherence project (new) — Phase 2.5 duplicate

Created 2026-05-14 by `mcp_notion_notion-duplicate-page` from
`f2a010d4-6a70-83ee-903e-01b55b968b74`. Duplicate completed synchronously;
all 4 child pages, 4 child databases, schemas, options, views, and
inter-database relations were brought across. Relation properties
(`Substrate`, `Bugs`, `Design Decisions`, `Version introduced`, `Release`,
`Supersedes`/`Superseded by`) were rewritten by Notion to point at the new
data sources. Then renamed to `Coherence` and moved to workspace root via
`mcp_notion_notion-move-pages` `{type: "workspace"}`.

The OLD project (`93d010d4-6a70-8280-ba6c-013d97211fd6`) is untouched and
remains at its original location.

### Root page
- page_id: `360010d4-6a70-8151-aa9e-d80a12c63c88`
- url: https://www.notion.so/360010d46a708151aa9ed80a12c63c88
- title: `Coherence` (with `📋` icon)
- parent: workspace root (no ancestor)

### Child pages (parent: Coherence root)
- `📐 BRD`: `360010d4-6a70-811a-991d-d5d764389505` — https://www.notion.so/360010d46a70811a991dd5d764389505
- `🚀 Releases`: `360010d4-6a70-816e-8e1f-c988a857a3d7` — https://www.notion.so/360010d46a70816e8e1fc988a857a3d7
- `📑 Reference`: `360010d4-6a70-814e-9d0d-e77eae24026c` — https://www.notion.so/360010d46a70814e9d0de77eae24026c
- `📋 Implementation Plans (archive)`: `360010d4-6a70-81fb-9dfc-e63808370c87` — https://www.notion.so/360010d46a7081fb9dfce63808370c87
- `Glossary` (under `📑 Reference`): `360010d4-6a70-813f-881a-dfe592d1ba19` — https://www.notion.so/360010d46a70813f881adfe592d1ba19

### Releases db (new)
- database_id: `360010d4-6a70-81c3-bb44-cf268a586118`
- data_source_id: `360010d4-6a70-81f5-8e56-000b07460e78`
- url: https://www.notion.so/360010d46a7081c3bb44cf268a586118
- views (4 — duplicate has an extra `Default view` alongside the original three):
  - Default view: `360010d4-6a70-8150-903a-000c509bb790`
  - Table (sorted Ship date DESC): `360010d4-6a70-81a3-b716-000c31f3b44c`
  - Board by Status: `360010d4-6a70-816a-9b76-000c7f6760ac`
  - Timeline (by Ship date): `360010d4-6a70-8144-b814-000c09bbc701`
- linked-view block embedded in `🚀 Releases` page: db_url `360010d4-6a70-8150-84a5-dbda32f3181d`
  pointing at the new ds (`collection://360010d4-6a70-81f5-...`) ✓ rewritten correctly by Notion duplicate
- expected `[Template]` row carry-over: should be present (was created on the
  source template before the duplicate ran). Verify in Notion UI before Phase 3.1.

### Design Decisions db (new)
- database_id: `360010d4-6a70-8113-9fa0-db7a1179c4d0`
- data_source_id: `360010d4-6a70-819c-a22f-000b707a572b`
- url: https://www.notion.so/360010d46a7081139fa0db7a1179c4d0
- views (5 — duplicate gained an extra `Default view`):
  - Default view: `360010d4-6a70-8134-b4d5-000cec32e02c`
  - Table (DD # ASC): `360010d4-6a70-8135-8d98-000c7f029456`
  - By Version (board grouped by Version introduced): `360010d4-6a70-81f1-95d7-000c555beca7`
  - By Status (table grouped): `360010d4-6a70-8160-b67e-000c5c8acb58`
  - Active only (filter Status=Active, sort DD # ASC): `360010d4-6a70-8121-95d4-000ca8699660`
- linked-view block embedded in `📑 Reference` page: db_url `360010d4-6a70-8153-a493-f60e730c73c3`
  pointing at the new ds (`collection://360010d4-6a70-819c-...`) ✓
- self-relation (`Supersedes` ↔ `Superseded by`) preserved.

### Bugs db (new)
- database_id: `360010d4-6a70-8145-9096-cecebad8b011`
- data_source_id: `360010d4-6a70-8171-8439-000b8a412879`
- url: https://www.notion.so/360010d46a7081459096cecebad8b011
- views (4 — duplicate gained an extra `Default view`):
  - Default view: `360010d4-6a70-81ba-a091-000cf211a6d4`
  - Table by Release (grouped): `360010d4-6a70-8143-b86f-000cd0be6b54`
  - Open only (filter Status=Open): `360010d4-6a70-8105-886c-000c552c8518`
  - By Caught by (board grouped): `360010d4-6a70-81e7-8668-000c813735d0`
- linked-view block embedded in `📑 Reference` page: db_url `360010d4-6a70-8162-9cfe-f75cf19b89af`
  pointing at the new ds (`collection://360010d4-6a70-8171-...`) ✓
- relation `Release` → new Releases ds: ✓ rewritten.

### Docs db (new) — pre-existing on template, also carried across
- database_id: `360010d4-6a70-8104-aba5-d6eae91353a4`
- data_source_id: `360010d4-6a70-81c2-8e5a-000b843ab749`
- url: https://www.notion.so/360010d46a708104aba5d6eae91353a4
- views (4):
  - Default view: `360010d4-6a70-81eb-98fd-000ca8bd10c5`
  - By Category (board): `360010d4-6a70-816c-8a76-000ca5849bbd`
  - Gallery: `360010d4-6a70-81c6-afe1-000c07bdf81b`
  - Stale (>90d, Current) (filter Status=Current, sort Last Updated ASC): `360010d4-6a70-8168-acf5-000c0551348b`

### Cross-cutting verification (post-Phase-2.5)
- Page-body display quirk: child page titles render as `📐 📐 BRD`, `🚀 🚀 Releases`, `📑 📑 Reference`, `📋 📋 Implementation Plans (archive)` because the leaf icon is also embedded in the title string. Carried over from the template; harmless. Optional cleanup: rename titles to drop the leading emoji, leaving the page icon to display it.
- Linked-view blocks inside `🚀 Releases` and `📑 Reference` were re-pointed by Notion at the duplicated data sources (verified above).
- DO NOT touch the OLD project (`93d010d4-6a70-8280-ba6c-013d97211fd6`) until CHECKPOINT F sign-off.
