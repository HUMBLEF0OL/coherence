<!-- url: https://www.notion.so/f2a010d46a7083ee903e01b55b968b74 -->
<!-- id: f2a010d4-6a70-83ee-903e-01b55b968b74 -->
<!-- intended new body for Task 2.1; sent verbatim as `new_str` -->

> **How to use:** Duplicate this database row to start a new project. Rename it. Update the sidebar properties. Then open each sub-page below and fill it in. The structure follows the [Notion project docs redesign spec](../../docs/superpowers/specs/2026-05-14-notion-project-docs-redesign-design.md) §4.
---
## Project Summary
*One paragraph. What does this project do, for whom, and why does it exist? What problem does it solve?*
---
## Quick Reference
<table header-row="true">
<tr>
<td>Key</td>
<td>Value</td>
</tr>
<tr>
<td>Repo</td>
<td></td>
</tr>
<tr>
<td>Docs</td>
<td></td>
</tr>
<tr>
<td>Live</td>
<td></td>
</tr>
<tr>
<td>Package</td>
<td></td>
</tr>
<tr>
<td>Version</td>
<td></td>
</tr>
<tr>
<td>Stack</td>
<td></td>
</tr>
<tr>
<td>Run locally</td>
<td>`<command>`</td>
</tr>
</table>
---
## Structure
This template follows the §4 target structure. Six evergreen pages (single source of truth, never branched per release), three databases under `📑 Reference`, one database under `🚀 Releases`, and an archive bucket for shipped working logs.
### Evergreen pages
- `📖 Read Me First` — entry point; current status, where to look first.
- `🏛 Architecture` — cumulative system architecture.
- `📐 BRD` — cumulative product requirements. Per-release deltas (`BRD-delta`) live as children of each Releases-db row and absorb on ship.
- `⚙️ Technical Spec` — cumulative architecture truth. Per-release deltas (`TSD-delta`) live as children of each Releases-db row and absorb on ship.
- `🗺️ Roadmap` — current sprint, milestones, backlog.
- `Glossary` — under `📑 Reference`.
### Databases
- `🚀 Releases` (parent page) wraps the **Releases** database. One row per release. Row body contains `Ship-time checklist` + `Sequencing gates` toggles. Sub-pages per row: `BRD-delta`, `TSD-delta`, `Open Questions`, embedded filtered DD view (`Version introduced = this release`), `Working Log`.
- `📑 Reference` wraps the cross-version **Design Decisions** database (canonical DD register), the **Bugs** database, and the `Glossary` evergreen page. DD bodies live in row bodies.
- `Docs` database (template-only) — schema unchanged; `Stale (>90d, Current)` view flags evergreen pages overdue for review.
### Archive
- `📋 Implementation Plans (archive)` — bucket for shipped artifacts. Each entry: archived `🔧 Working Log — vX.Y.Z` page (moved here when its release ships) plus a git permalink to the `docs/superpowers/plans/` markdown that produced it.
### Working Log lookup
The active release's working log is reached via the Releases db filtered to `Status ≠ Shipped`. There is no separate `Working Log (active)` pointer page.
### Naming
- `BRD` / `BRD-delta`, `Technical Spec` (TSD) / `TSD-delta`, `Working Log`, `DD-NNN` (zero-padded). Release pages titled `vX.Y[.Z]`. See spec §7.
---
## Sub-pages and databases
<page url="https://www.notion.so/360010d46a70810693e4e4f3057bc2a4">📐 BRD</page>
<page url="https://www.notion.so/360010d46a708152a947ca90f35b5213">🚀 Releases</page>
<page url="https://www.notion.so/360010d46a708197900bfc1988750ddb">📑 Reference</page>
<page url="https://www.notion.so/360010d46a7081dca703f4ff790e1f9f">📋 Implementation Plans (archive)</page>
<database url="https://www.notion.so/a1b010d46a7083708e1d0140bd0631c7" inline="false" data-source-url="collection://e2a010d4-6a70-8246-8b49-07be53668c6e">Docs</database>
<database url="https://www.notion.so/d0fb4b3ac9e74a3cbbf7955136ef3639" inline="false" data-source-url="collection://247ab3e1-148b-4854-83e0-6d4de00bb250">Releases</database>
<database url="https://www.notion.so/1aca80c3618246cfabf4a9a16fb8d7a7" inline="false" data-source-url="collection://fa271e9e-0ec6-4f59-b1ba-2c4d3147f6fd">Bugs</database>
<database url="https://www.notion.so/0dad4e825aa548d3b09804bc47dcc0d5" inline="false" data-source-url="collection://c51f4c92-120e-4c49-a43f-f333ea0b2a36">Design Decisions</database>
