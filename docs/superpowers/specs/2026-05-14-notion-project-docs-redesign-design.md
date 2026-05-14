# Notion Project Docs Redesign — Design

**Status:** Draft (pending user review)
**Date:** 2026-05-14
**Owner:** Amit
**Scope:** Coherence project Notion hub + reusable `[Template] New Project`
**Approach:** B + C — Working Log tier + per-release template + databases for Releases / DDs / Bugs, with markdown contract committed to git

---

## 1. Problem

The Coherence Notion hub has accumulated three classes of drift across v0.1 → v1.0.1:

1. **Drift in evergreen pages.** The "Central BRD" and "Central Technical Spec" still read *"Active target release: v0.1 / Last shipped: none yet"* eight days after v1.0.0 shipped. The "absorb on ship" promise was never executed for any of the five shipped releases. Project landing page navigation is duplicated and inconsistent with itself. Roadmap leaks process commentary into prose ("Status update via MCP — heading still reads 'Planning kickoff'"). Releases table contradicts the landing page on v1.0 status.

2. **Discoverability.** Two pages titled "BRD" with different icons. Inconsistent naming (`Technical Spec` / `Technical Specification` / `TSD`). Reference → Design Decisions promises a consolidated DD-001..DD-147 register but only contains a per-version prose summary — clicking it does not produce a real cross-version index. v1.0.1 has decayed from a release page into a working notebook (bug tally, in-progress runbook, end-of-day update) — there is no separate place for working-log content to live, so it leaks into release pages and prevents them from being frozen.

3. **No reusable template for future projects.** A `📋 [Template] New Project` row exists in the Projects database but pre-dates Coherence's actual workflow: it assumes 13 flat "knowledge base" sections (API Reference, Configuration, Integrations, Quality, CI/CD, Dependencies, Runbook, etc.) and one ADR page. It has no notion of per-version freezing, no working-log tier, no DD or Bugs databases. Stamping it for the next project would reproduce the drift problems above.

The first two are symptoms of the same cause: the structure has no place for the working-log content that naturally accumulates during a release, so it leaks into release pages, which then can't be "frozen", so the central evergreen pages can't safely "absorb" them, so they stay empty stubs while per-release pages decay.

## 2. Goals

- **G1 — No more silent staleness.** Every evergreen page has a staleness signal visible in the hub view, not buried behind clicks. Primary mechanism: Notion `update_verification` (90-day expiry) where workspace tier permits; fallback: the Docs-db `Stale (>90d, Current)` filtered view applies to every workspace tier.
- **G2 — Frozen release pages stay frozen.** Working-log content (bug tallies, audits, in-session notes, runbooks) has its own home, separate from the release page. Release pages can be sealed on ship.
- **G3 — Cross-version queries work.** "All Trust-related DDs across versions", "all P1 bugs caught post-tag in 2026", "all Shipped releases sorted by date" — each is a saved view, not a grep across pages.
- **G4 — Reusable for the next project.** A new project = duplicate one Notion row + read one markdown contract. No reinvention.
- **G5 — Convention is auditable.** The structure and naming conventions live as a versioned markdown file in git, so divergence is visible in PRs.

## 3. Non-goals

- Migrating away from Notion or to a different tool.
- Building any custom Notion automation, scripts, or extensions beyond what the MCP supports.
- Adding properties for time-tracking, billing, or per-task ownership — this is documentation infrastructure, not project management.
- Cross-organisation reuse — the template targets one author's workspace.
- Automatic enforcement of the ship-time checklist — the checklist is a toggle block humans walk through, not a CI gate.

## 4. Target structure

```
📋 [Template] New Project   (a row in the Projects database — duplicated for each new project)
│
├── 📖 Read Me First                  ← evergreen, single source of truth
├── 🏛 Architecture                   ← evergreen
├── 📐 BRD                            ← evergreen (cumulative product truth)
├── ⚙️ Technical Spec                 ← evergreen (cumulative architecture truth)
├── 🗺️ Roadmap                        ← evergreen
├── 🚀 Releases                       ← parent page wrapping the Releases database
│   └── (Releases database, embedded)
│       └── per-release row → child sub-pages:
│           ├── BRD-delta             ← what this release adds/changes
│           ├── TSD-delta
│           ├── Open Questions        ← resolved at spec-freeze
│           ├── Design Decisions      ← embedded filtered view of Reference DD db (Version = this release)
│           └── Working Log           ← prose; archived on ship
├── 📑 Reference
│   ├── Design Decisions database     ← cross-version DD register; canonical source of truth for DD bodies
│   ├── Bugs database                 ← cross-version post-tag bug tally
│   └── Glossary                      ← evergreen
└── 📋 Implementation Plans (archive)  ← bucket for shipped artifacts: git-permalink links to plan markdowns + archived Working Log pages from past releases
```

Six evergreen pages (Read Me First, Architecture, BRD, Technical Spec, Roadmap, Glossary), three databases at Reference + one at Releases, one archive. The active release's working log is reached via the Releases db filtered to `Status ≠ Shipped` — no separate `Working Log (active)` pointer page.

**DD source of truth (resolves audit B4):** the Reference Design Decisions database is canonical. The per-release `Design Decisions` sub-page is an embedded filtered view of that database (`Version introduced = this release`), not a duplicate copy of the text. Authoring a new DD = creating a new row in the Reference db; it appears in the per-release view automatically.

**Conditional fallback:** if the Phase 3c + 3.4 fallback in §10 is taken (skip body backfill), the per-release prose `Design Decisions` pages remain canonical and the Reference db functions as a title-only index instead. The structure tolerates either outcome.

Compared to today's hub: BRD/TSD become the actual source of truth instead of empty "absorb later" stubs; Working Log becomes a first-class tier; DD / Bugs / Releases become databases instead of prose.

## 5. Database schemas

### 5.1 Releases database

| Property | Type | Options / Notes |
|---|---|---|
| Version | Title | e.g. `v1.0.1` |
| Status | Select | `Planning`, `Authoring`, `Implementing`, `Shipped`, `Superseded` |
| Ship date | Date | Set when Status = Shipped |
| Tag SHA | Text | git commit SHA the release tag points at |
| Substrate | Relation (self) | The prior release this one extends |
| BRD-delta | URL | Link to the per-release BRD page |
| TSD-delta | URL | Link to the per-release Technical Spec page |
| Working Log | URL | Notion page URL of the active working-log page; rewritten on archive to point at the archived location under Implementation Plans (archive) |
| DD range | Text | e.g. `DD-131..DD-147` |
| Rolled to next | Text | What was deferred out of this release |
| Notes link | URL | `RELEASE_NOTES_vX.Y.Z.md` permalink |
| Theme | Text | Optional one-liner |

**Views:** `Table` (sorted by Ship date desc), `Board by Status`, `Timeline` (Ship date axis).

**Sequencing gates** are *not* a database property. They live as a to-do list block inside each release row's body (alongside the ship-time checklist from §6). This avoids polluting a workspace-wide multi-select with per-release gate names that never recur (e.g. `Trust formula decided`, `Path C migration audit`).

### 5.2 Design Decisions database

| Property | Type | Options / Notes |
|---|---|---|
| DD # | Title | `DD-131` (zero-padded text) |
| Title | Text | Short imperative |
| Version introduced | Relation | → Releases db |
| Status | Select | `Active`, `Superseded`, `Retired`, `Deferred` |
| Supersedes | Relation (self) | Older DDs this one replaces |
| Superseded by | Rollup | Auto-derived inverse of Supersedes |
| Tags | Multi-select | `Architecture`, `Pipeline`, `Trust`, `Validation`, `State`, `Build/Release`, `Privacy`, `Security`, `UX/Commands`, `LLM`, `Telemetry`, `Distribution` |
| Body | Long text in row body | Full text — what / why / alternatives |

**Views:** `Table` (DD # asc), `By Version` (board), `By Status` (filtered table), `Active only` (canonical register).

### 5.3 Bugs database

| Property | Type | Options / Notes |
|---|---|---|
| Fix # | Title | e.g. `Fix 9` |
| Title | Text | Short |
| Bug class | Select | `Validation gate`, `Release pipeline`, `LLM transport`, `Privacy / .gitignore`, `Concurrency`, `Documentation`, `Render bug`, `Other` |
| Severity | Select | `P0 - shipped broken`, `P1 - latent gap`, `P2 - polish` |
| Commit SHA | Text | Single SHA or comma-list |
| Tests added | Number | Count of regression tests committed |
| Caught by | Select | `Pre-release tests`, `Post-tag audit`, `Downstream smoke`, `Field report`, `Manual review` |
| Release | Relation | → Releases db |
| Status | Select | `Open`, `In progress`, `Fixed`, `Won't fix` |
| Notes | Long text | Body |

**Views:** `Table by Release` (grouped), `Open only` (filtered), `By Caught by` (board).

### 5.4 Docs database (kept from existing template)

Schema unchanged. One added view: `Stale (>90d, Current)` filtered on `Last Updated < today − 90d AND Status = Current`. Pairs with Notion `update_verification` (90-day expiry) on the six evergreen pages — see §10 for the workspace-tier dependency.

The existing Docs db lives only inside `[Template] New Project` and was never copied into the Coherence project. Phase 5 adds a Docs db to Coherence as part of the migration (with the same schema).

### 5.5 Cross-database relations

```
Releases ──────┬────── Design Decisions  (Version introduced)
               │
               └────── Bugs             (Release)

Design Decisions ──── Design Decisions   (Supersedes / Superseded by)
```

Three relations total.

## 6. Ship-time checklist (toggle block in every Releases-db row)

```
☐ BRD absorbed delta → BRD page updated
☐ Technical Spec absorbed delta → TSD page updated
☐ Roadmap entry status flipped to ✅ shipped
☐ Read Me First "Current status" line updated
☐ Releases db row: Status, Ship date, Tag SHA, DD range filled
☐ Sequencing gates to-do list (in row body) all ticked
☐ Working Log archived → moved under Implementation Plans (archive)
☐ Bugs db rows for the release linked back via Release relation
☐ Notion verification renewed on the six evergreen pages (90-day expiry; skip if workspace tier lacks verification — Docs `Stale` view is the fallback)
```

## 7. Naming conventions

- **BRD** — the cumulative product requirements page. Icon: 📐. Per-release variants are titled `BRD-delta` and live as children of the release row.
- **Technical Spec** — the cumulative architecture page. Icon: ⚙️. Per-release: `TSD-delta`. Never `Technical Specification`. Shorthand: TSD.
- **Release pages** — titled `vX.Y[.Z]`. Optional leading number-emoji (e.g. `1️⃣ v0.1`) is allowed for visual ordering in the sidebar but is not required.
- **Working Log pages** — titled `🔧 Working Log — vX.Y.Z`.
- **DD identifiers** — `DD-NNN` zero-padded.
- **`📋` icon** — used by both `[Template] New Project` (the database row) and `Implementation Plans (archive)` (the archive page). Acceptable collision because they never appear at the same level of the tree.

## 8. Migration plan

### Phase 0 — Safety net
1. Recursively fetch every page reachable from the Coherence project landing page (`93d010d4-6a70-8280-ba6c-013d97211fd6`, titled **🧭 Coherence**) and from the template row (`f2a010d4-6a70-83ee-903e-01b55b968b74`, titled **📋 [Template] New Project**). Walk `<page>` and `<child-page>` references depth-first until no new IDs are discovered.
2. For each fetched page, write `notion-backup/2026-05-14/<slug>.md` with the page URL on line 1 and the raw `<content>` body below. Expected count: ~50 pages across both hubs. Done = no new IDs surface in a re-walk.
3. Confirm restore-from-backup procedure works on one throwaway page (create `Backup test`, write content, back it up, edit, restore via MCP `update_content`, verify).
4. Prefer `update_content` (search-and-replace) over `replace_content` (whole-page rewrite) for all subsequent writes — per the user-memory MCP gotcha.

### Phase 1 — Build the four databases (Track B-1)
Create Releases, Design Decisions, Bugs databases inside the `[Template] New Project` row, with the views from §5. Add the `Stale` view to the existing Docs db. Empty data.

### Phase 2 — Restructure the template (Track B-2)
1. Edit `[Template] New Project` body: replace the 13-row Knowledge Base table with the §4 structure. Preserve the existing top-of-page **Quick Reference** table (Repo / Docs / Live / Package / Version / Stack / Run locally) — it stays useful.
2. **Delete 9 sub-pages** that don't fit the new structure: `4. API/Interface Reference`, `5. Configuration`, `6. Integrations`, `7. Quality & Testing`, `8. CI/CD & Release`, `9. Dependencies`, `11. Decisions (ADRs)` (replaced by Reference DD db), `12. Runbook & Ops`, `13. Changelog` (replaced by Releases db).
3. **Rename 4 surviving sub-pages**: `1. Overview & Goals` → `📖 Read Me First`; `2. Architecture` → `🏛 Architecture`; `3. Technical Specification` → `⚙️ Technical Spec`; `10. Roadmap` → `🗺️ Roadmap`.
4. **Create 4 new evergreen pages** (empty stub bodies that the new-project author fills): `📐 BRD`, `🚀 Releases` (wraps the Releases db), `📑 Reference` (parent page; contains DD db, Bugs db, and a Glossary child page), `📋 Implementation Plans (archive)`.
5. Add the §6 ship-time checklist + the §5.1 Sequencing gates to-do list as toggle blocks in the Releases-db row body template.

### Phase 3 — Backfill Coherence project (Track A-1)
1. **Releases db:** create 6 rows (v0.1, v0.2, v0.3, v0.4, v1.0, v1.0.1) from existing per-version pages. Sequencing gates per release captured as the row-body to-do list (not as a property).
2. **Bugs db:** 10 rows from v1.0.1's Final fix tally.
3. **Design Decisions db:** 147 rows. Three sub-passes: (3a) stub creation with title + version + Active, scripted from existing per-release DD pages; (3b) tag pass; (3c) body copy from per-release pages into row bodies. The largest single cost in the migration.
4. **Per-release DD sub-page conversion** (resolves audit B4): once 3c is done, replace the body of each per-release `Design Decisions` sub-page (v0.1..v1.0.1) with an embedded filtered view of the Reference DD db where `Version introduced = this release`. Original prose is preserved in the Phase 0 backup; the canonical text now lives only in the db row bodies.

### Phase 4 — Working Log extraction (Track A-2)
Create `🔧 Working Log — v1.0.1` as a child of the v1.0.1 row. Move into it: End-of-day update, Path to 9/10 follow-ups, Cassette-recording runbook, Path C migration update, Final fix tally prose. The Bugs database supersedes the tally — leave a one-line pointer in the working log. v1.0.1 release page is left holding only: Status line, Theme, Problem statement, Goals, Milestones, Acceptance, Notes for implementers.

### Phase 5 — Drift cleanup (Track A-3)
1. Central BRD + Central Technical Spec absorb actual cumulative state (replace the "Active: v0.1 / Last shipped: none" stub).
2. Releases page: replace static markdown table with embedded Releases-db inline view.
3. Roadmap: strip "(Status update via MCP …)" parenthetical; flip v1.0 to ✅ shipped.
4. Project landing page: dedupe the duplicated navigation; add Implementation Plans (archive) to the prose list.
5. Reference → Design Decisions: convert from prose summary to embedded DD-database view.
6. **Naming pass — 12 page renames** (per §7): for each release v0.1..v1.0.1, rename `BRD` → `BRD-delta` and `Technical Specification` (or `Technical Specification (vX.Y)`) → `TSD-delta`. Also rename the icon-prefixed variants (`📘 BRD`, `🛠️ Technical Specification`) to match.
7. Add a Docs db to the Coherence project (same schema as `[Template] New Project`'s Docs db, including the `Stale (>90d, Current)` view from Phase 1) and seed it with one row per evergreen page (Status = Current, Last Updated auto-set).
8. Apply Notion `update_verification` (90-day expiry) to: Read Me First, Architecture, BRD, Technical Spec, Roadmap, Glossary. **Six pages.** Skip if the workspace tier doesn't expose verification — the Docs `Stale (>90d)` view is the fallback signal in that case (see §10).

### Phase 6 — Markdown contract committed (Track B-3)
Write `docs/notion-project-template.md` in the coherence repo. Contents: page tree (§4), database schemas (§5), naming conventions (§7), ship-time checklist (§6), "How to start a new project" 5-step procedure, and a versioning policy for the contract document itself. Commit message: `docs(notion): add reusable project-template contract`.

### Order and reversibility

```
Phase 0 (backup)            ← blocking
   │
   ├─ Phase 1 (build dbs)         ← Track B, no risk
   │     └─ Phase 2 (template)
   │           └─ Phase 6 (md contract)
   │
   └─ Phase 3 (db backfill: 3a → 3b → 3c)   ← Track A
         └─ Phase 4 (working log extraction)
               └─ Phase 5 (drift cleanup)
```

Phases 1, 2, 3a, 3b, 6 are reversible without backups. Phases 3c, 4, 5 are reversible only via Phase 0 backups.

## 9. Acceptance

- Coherence project landing page reflects v1.0.1 status accurately and has a single navigation.
- BRD and Technical Spec pages contain real cumulative content, not placeholder stubs.
- Releases page renders the Releases database (not a static table); v1.0 row shows Shipped.
- v1.0.1 release page is short and frozen; its working-log content lives in `🔧 Working Log — v1.0.1`.
- Reference → Design Decisions renders the DD database with all 147 rows present. Each per-release `Design Decisions` sub-page shows an embedded filtered view of the same database; no duplicated DD prose anywhere.
- Reference → Bugs renders the Bugs database with v1.0.1's 10 fix entries.
- The 12 per-release pages (6 releases × `BRD-delta` + `TSD-delta`) are renamed per §7.
- A Docs db exists inside the Coherence project (with the `Stale (>90d, Current)` view), seeded with at least one row per evergreen page; additional non-evergreen pages may be added as needed.
- The six evergreen pages have either a Notion `update_verification` (90-day expiry) **or** an entry in the Docs `Stale (>90d, Current)` view that resolves cleanly — whichever the workspace tier supports.
- `docs/notion-project-template.md` exists, is committed, and any new project can be started by duplicating the `[Template] New Project` row and following its procedure.

## 10. Risks

- **Notion plan-tier dependency.** `update_verification` requires Business or Enterprise tier (or pages inside a wiki). On Free/Plus tiers the verification mechanism is unavailable; G1 then collapses to the Docs `Stale (>90d, Current)` filtered view alone. Phase 5 step 8 and §6 checklist treat verification as best-effort. Confirm workspace tier before starting Phase 5; if verification is unavailable, the rest of the plan still ships and G1 is met by the Docs view alone.
- **MCP `replace_content` overwrite hazard.** Mitigated by Phase 0 backups + preferring `update_content`.
- **DD body backfill cost.** Phase 3c is ~3-5 hours of mechanical work and is the most likely point to bail. Fallback: collapse Phase 3c to title-only backfill — DDs keep their full text on per-release pages and Phase 3.4 (DD sub-page conversion) is skipped, leaving the per-release prose pages intact as the source of truth and the Reference db as a title-only index.
- **Template divergence from contract.** The Notion template can drift from `docs/notion-project-template.md` over time. Mitigation: the contract is the source of truth; re-stamp the template from the contract when conventions change. (Same problem Coherence solves for code docs.)
- **Verification expiry fatigue.** 90 days may be too aggressive on truly stable pages (Glossary). If it produces noise, raise to 180 days for low-churn pages.
- **Sequencing gates as in-body to-do.** Trades queryability (can't filter Releases db by gate-completion state) for a clean schema. Acceptable because gates only matter at one moment per release (spec-freeze) and the to-do list is visible the moment you open the row.

## 11. Open questions

None at design time. All Q1–Q6 in the brainstorming session resolved; audit findings B1–B5, G1–G5, M1–M5 resolved inline.
