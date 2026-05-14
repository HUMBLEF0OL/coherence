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
