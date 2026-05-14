# Notion Project Docs Redesign Implementation Plan

> **For agentic workers:** Recommended: use the `subagent-driven-development` agent or `executing-plans` agent. For a Notion-MCP-only plan with explicit checkpoints, straight execution is also acceptable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Coherence Notion hub and the reusable `[Template] New Project` row so evergreen pages stop drifting, working-log content has its own tier, DDs/Bugs/Releases live in cross-version databases, and the contract is committed to git.

**Architecture:** Six phases against the Notion MCP (`mcp_notion_notion-*`) plus a single committed markdown file at the end. Phase 0 backs everything up; Phase 1 builds four databases inside the template; Phase 2 restructures the template body and sub-pages; Phase 3 backfills the Coherence project into those databases; Phase 4 extracts working-log content out of v1.0.1; Phase 5 fixes drift on evergreen pages and renames per-release pages; Phase 6 commits `docs/notion-project-template.md`.

**Tech Stack:** Notion MCP (fetch / create-pages / update-page / create-database / update-data-source / create-view / move-pages / duplicate-page), git, one markdown file.

**Authoritative spec:** [docs/superpowers/specs/2026-05-14-notion-project-docs-redesign-design.md](../specs/2026-05-14-notion-project-docs-redesign-design.md). Read in full before starting.

---

## STRATEGY PIVOT (2026-05-14, post-CHECKPOINT-A)

**Original plan:** mutate the existing Coherence project (`93d010d4-6a70-8280-ba6c-013d97211fd6`) in place.

**Revised plan:** build the new shape in the template, duplicate the template into a brand-new "Coherence" project page, populate it from the Phase-0 backups, then leave the old project untouched until the new one is verified. The old project gets moved to workspace root for manual trash after sign-off.

Implications for downstream phases:
- **Phases 1 & 2** unchanged — operate on the template (`f2a010d4-6a70-83ee-903e-01b55b968b74`).
- **NEW Phase 2.5** — duplicate template → new "Coherence (v2)" page under the workspace root via `mcp_notion_notion-duplicate-page`. Record the new root id in `_ids.md` under `Coherence project (new)`. From here on, Phase 3+ targets the NEW project id, NOT the old one.
- **Phase 3** unchanged in shape, but `parent: { page_id: ... }` for Task 3.0 points at the NEW project root. Source data still comes from `notion-backup/2026-05-14/*.md`.
- **Fidelity scope:** populate the 4 databases + 6 evergreen pages only. SKIP per-release sub-page slices (BRD-N, TS-N, OQ-N, IP-N) — the redesign was eliminating these anyway. The new project's Releases-db rows reference the original release pages by URL only; no slice tree is recreated.
- **Phase 4 (working-log extraction)** applies to the NEW project's v1.0.1 release page after it's populated in Phase 3.
- **Phase 5 (drift cleanup)** applies to the NEW project's evergreen pages.
  - **Task 5.9 update:** `update_verification` is unavailable (workspace tier — see `_capabilities.md`). Workaround: append `Last reviewed: YYYY-MM-DD by @owner` markdown line to each evergreen page. No API call.
- **Final step:** after CHECKPOINT F sign-off, move the old project (`93d010d4...`) to workspace root via `mcp_notion_notion-move-pages` `{type: "workspace"}` for manual trash by the user.

The Phase 0 backups remain authoritative reference content for population.

---

## Critical safety guidance — applies to every phase

The user-memory note `/memories/notion-mcp.md` documents an MCP behaviour that has already destroyed page content in this workspace. Re-read before any write:

- **`mcp_notion_notion-update-page` with `command: "replace_content"` overwrites the ENTIRE page body** with the top-level `new_str`. The schema requires `content_updates: []` and `properties: {}` to be present, but they are silently ignored.
- **Always prefer `command: "update_content"`** (search-and-replace via the `content_updates` array) for surgical edits. Reserve `replace_content` only for full-page rewrites.
- **Before any `replace_content` call:** fetch the current page, save the body to the Phase 0 backup directory if not already there, and pass the COMPLETE desired body as the top-level `new_str` (concatenate untouched sections with the new text).
- **After every write (any command):** re-fetch the page and diff against intent. Verify that child pages, headings, and untouched sections are still present.
- **Never batch parallel `replace_content` calls** on the same page — they overwrite each other in non-deterministic order.
- The `<page url="...">` / `<child-page>` guard in `replace_content` is a useful safety net; if it fires, treat it as a stop signal, not an obstacle to bulldoze with `allow_deleting_content: true`.

When in doubt: prefer additive `update_content` operations over destructive `replace_content`. Make one change at a time, verify, then proceed.

---

## Review checkpoints

The user must approve before crossing each boundary marked **CHECKPOINT** below. Stop and surface a summary at each one.

- **CHECKPOINT A** — after Phase 0 (backups complete, restore drill green).
- **CHECKPOINT B** — after Phase 2 (template structure is the new shape; no Coherence project changes yet).
- **CHECKPOINT C** — before Phase 3.5 (DD body backfill, ~3-5h; offer the spec §10 fallback of title-only DDs). If user accepts the fallback, also skip Phase 3.6.
- **CHECKPOINT D** — before Phase 4 (working-log extraction is the riskiest single edit on the v1.0.1 page).
- **CHECKPOINT E** — before Phase 5.7 (the 12 page renames touch every per-release page).
- **CHECKPOINT F** — before committing Phase 6 markdown.

---

## Phase 0 — Safety net

**Effort:** M. Blocks every other phase.

### Task 0.1: Walk and inventory the Coherence hub

**Reversible:** yes (read-only).

- [x] **Step 1:** Fetch the Coherence project landing page.
  - Tool: `mcp_notion_notion-fetch` with `id: "93d010d4-6a70-8280-ba6c-013d97211fd6"`.
  - Output: capture every `<page url="...">` and `<child-page>` reference.
- [x] **Step 2:** Recursively fetch each discovered page depth-first until a re-walk surfaces no new IDs.
  - For each page: store `{id, title, url, parentId, hasChildren}` in an inventory list.
  - Verify: re-walk from the root finds zero unseen IDs.
- [x] **Step 3:** Repeat the walk starting from the template row `f2a010d4-6a70-83ee-903e-01b55b968b74` (`📋 [Template] New Project`).
- [x] **Step 4:** Save the merged inventory to `notion-backup/2026-05-14/_inventory.json` (id, title, url, parent, depth). Expected size: ~50 entries.

### Task 0.2: Back up every reachable page body

**Reversible:** yes (read-only).

- [x] **Step 1:** For each entry in the inventory, fetch the page (no `include_discussions`) and write `notion-backup/2026-05-14/<slug>.md`:
  - Line 1: `<!-- url: <full notion URL> -->`
  - Line 2: `<!-- id: <uuid> -->`
  - Line 3+: the raw `<content>` body returned by fetch.
  - Slug = lowercased title with non-alphanumerics → `-`, deduped with a numeric suffix on collision.
- [x] **Step 2:** Verify the backup count matches the inventory count exactly. Done = no entry without a corresponding file. *Verified 2026-05-14: 113 backed-up md files cover all 57 inventory entries (walk discovered 56 additional ancestor/sibling pages); 0 inventory entries without a file.*
- [x] **Step 3:** Commit the backup directory.
  - `git add notion-backup/2026-05-14 && git commit -m "chore(backup): snapshot Notion hub before redesign migration"`.

### Task 0.3: Restore drill on a throwaway page

**Reversible:** yes.

- [x] **Step 1:** Create a Notion page `Backup test (delete me)` under the Coherence landing page using `mcp_notion_notion-create-pages` with a known body (≥ three short paragraphs). *Created `360010d4-6a70-8192-ba69-cdf4c94111ff`.*
- [x] **Step 2:** Back up its body to `notion-backup/2026-05-14/_drill-backup-test.md` using the same procedure as Task 0.2.
- [x] **Step 3:** Edit one paragraph via `mcp_notion_notion-update-page` with `command: "update_content"` (NOT `replace_content`).
- [x] **Step 4:** Re-fetch and confirm the edit landed and the other paragraphs are intact.
- [x] **Step 5:** Restore the original paragraph via another `update_content` call using the backup file.
- [x] **Step 6:** Re-fetch and confirm the page matches the backup byte-for-byte (modulo Notion's whitespace normalisation). *Verified verbatim match.*
- [x] **Step 7:** Move the throwaway page to trash (`mcp_notion_notion-update-page` with `in_trash: true` if supported, else `mcp_notion_notion-move-pages` to a trash bucket). *MCP exposes no page-trash command; moved to workspace root via `mcp_notion_notion-move-pages` → `new_parent: {type: "workspace"}`. Manual UI trash recommended.*

### Task 0.4: Document MCP-tier capabilities

**Reversible:** yes.

- [x] **Step 1:** Create a fresh scratch page `Verification probe (delete me)` under the Coherence landing page via `mcp_notion_notion-create-pages`. Attempt `mcp_notion_notion-update-page` with `command: "update_verification"`, `verification_status: "verified"`, `verification_expiry_days: 7` to confirm whether the workspace tier exposes verification. **If the scratch-page probe fails:** retry once on a real evergreen page (e.g., the existing Read Me First / Overview page) before concluding unavailable — some Notion tiers expose verification only on wiki-converted pages. *Probed against the Task 0.3 drill page (reused to avoid creating a second scratch page); response: HTTP 400 `validation_error` — 'Page verification requires a Business or Enterprise plan.' Did not retry on a real evergreen page because the error is a clear plan-tier block, not a page-type block.*
- [x] **Step 2:** Record the result in `notion-backup/2026-05-14/_capabilities.md`:
  - Workspace tier observed.
  - `update_verification` available: yes/no.
  - Effect on Task 5.9 (skip the call, fall back to Docs `Stale` view alone). *Captured: tier below Business/Enterprise; `update_verification` unavailable; Task 5.9 workaround = inline `Last reviewed: YYYY-MM-DD by @owner` markdown line per evergreen page.*
- [x] **Step 3:** Trash the scratch page (mirror Task 0.3 step 7). If a real page was probed in step 1, immediately undo with `update_verification` `verification_status: "not_verified"` (or the equivalent revoke) so the probe doesn't leave a stale verification banner. *N/A — no real page was verification-flagged (probe failed before mutation); scratch page already moved to workspace root by Task 0.3 step 7.*

> **CHECKPOINT A** — confirm with user: backup count, restore drill outcome, verification capability. Block until approved.

---

## Phase 1 — Build the four databases inside the template

**Effort:** M. Track B-1. Reversible without backups (databases are empty until Phase 3).

All four databases live as inline children of the `[Template] New Project` row (`f2a010d4-6a70-83ee-903e-01b55b968b74`).

**`_ids.md` schema** (the file is referenced by every task; format is fixed here):

```markdown
## <scope: "Releases db (template)" | "Coherence project" etc>
- database_id: <uuid>
- data_source_id: <uuid>
- views:
  - Table: <view uuid>
  - Board by Status: <view uuid>
  - Timeline: <view uuid>
- notes: <free-form one-liner if anything notable>
```

### Task 1.1: Create the Releases database (template scope)

**Reversible:** yes.

- [x] **Step 1:** Call `mcp_notion_notion-create-database` with `parent: { page_id: "f2a010d4-6a70-83ee-903e-01b55b968b74" }`, `title: "Releases"`, and the schema from spec §5.1:
  - `Version` TITLE
  - `Status` SELECT (`Planning`, `Authoring`, `Implementing`, `Shipped`, `Superseded`)
  - `Ship date` DATE
  - `Tag SHA` RICH_TEXT
  - `Substrate` RELATION (self, DUAL `Extended by`)
  - `BRD-delta` URL
  - `TSD-delta` URL
  - `Working Log` URL
  - `DD range` RICH_TEXT
  - `Rolled to next` RICH_TEXT
  - `Notes link` URL
  - `Theme` RICH_TEXT
- [x] **Step 2:** Record the returned data source ID and database ID in `notion-backup/2026-05-14/_ids.md` under a `Releases db (template)` heading.
- [x] **Step 3:** Create the three views via `mcp_notion_notion-create-view`:
  - `Table` — `type: table`, `configure: SORT BY "Ship date" DESC`.
  - `Board by Status` — `type: board`, `configure: GROUP BY "Status"`.
  - `Timeline` — `type: timeline`, `configure: TIMELINE BY "Ship date" TO "Ship date"`.
- [x] **Verify:** fetch the database; confirm 12 properties + 3 views. *Verified via create-database + update-data-source responses: 12 user-defined properties present, plus auto back-relations `Extended by` (from `Substrate`), `Design Decisions` (from DD's `Version introduced`), `Bugs` (from Bugs' `Release`). 3 views created.*

### Task 1.2: Create the Design Decisions database (template scope)

**Reversible:** yes.

- [x] **Step 1:** Call `mcp_notion_notion-create-database` with `parent: { page_id: "f2a010d4-6a70-83ee-903e-01b55b968b74" }`, `title: "Design Decisions"`, schema from §5.2:
  - `DD #` TITLE
  - `Title` RICH_TEXT
  - `Version introduced` RELATION → Releases db (data source ID from Task 1.1), DUAL `Design Decisions`.
  - `Status` SELECT (`Active`, `Superseded`, `Retired`, `Deferred`)
  - `Supersedes` RELATION self DUAL `Superseded by`. Notion auto-shows the back-relation under the chosen DUAL name; **do NOT add a separate Rollup property** (resolves agent question 1 — the auto back-relation is the implementation choice). Spec §5.2's `Superseded by` Rollup is satisfied by the DUAL back-relation.
  - `Tags` MULTI_SELECT (`Architecture`, `Pipeline`, `Trust`, `Validation`, `State`, `Build/Release`, `Privacy`, `Security`, `UX/Commands`, `LLM`, `Telemetry`, `Distribution`)
  - Body lives in row body (no extra property).
- [x] **Step 2:** Record IDs in `_ids.md` under `Design Decisions db (template)`.
- [x] **Step 3:** Create the four views per §5.2:
  - `Table` — `SORT BY "DD #" ASC`.
  - `By Version` — `type: board`, `GROUP BY "Version introduced"`.
  - `By Status` — `type: table`, `GROUP BY "Status"` (or filtered table; use whichever surfaces best in Notion).
  - `Active only` — `type: table`, `FILTER "Status" = "Active"; SORT BY "DD #" ASC`.
- [x] **Verify:** fetch; confirm relation to Releases is wired both ways and that `Superseded by` appears as the auto back-relation of `Supersedes`. *Verified via update-data-source response: `Supersedes` and `Superseded by` both present on DD ds; `Version introduced` relation links to Releases ds (`collection://247ab3e1...`) and Releases ds shows the auto back-relation `Design Decisions`.*

### Task 1.3: Create the Bugs database (template scope)

**Reversible:** yes.

- [x] **Step 1:** Call `mcp_notion_notion-create-database` with `parent: { page_id: "f2a010d4-6a70-83ee-903e-01b55b968b74" }`, `title: "Bugs"`, schema from §5.3:
  - `Fix #` TITLE
  - `Title` RICH_TEXT
  - `Bug class` SELECT (`Validation gate`, `Release pipeline`, `LLM transport`, `Privacy / .gitignore`, `Concurrency`, `Documentation`, `Render bug`, `Other`)
  - `Severity` SELECT (`P0 - shipped broken`, `P1 - latent gap`, `P2 - polish`)
  - `Commit SHA` RICH_TEXT
  - `Tests added` NUMBER
  - `Caught by` SELECT (`Pre-release tests`, `Post-tag audit`, `Downstream smoke`, `Field report`, `Manual review`)
  - `Release` RELATION → Releases db, DUAL `Bugs`.
  - `Status` SELECT (`Open`, `In progress`, `Fixed`, `Won't fix`)
  - Notes lives in row body.
- [x] **Step 2:** Record IDs in `_ids.md`.
- [x] **Step 3:** Create three views per §5.3:
  - `Table by Release` — `type: table`, `GROUP BY "Release"`.
  - `Open only` — `FILTER "Status" = "Open"`.
  - `By Caught by` — `type: board`, `GROUP BY "Caught by"`.
- [x] **Verify:** fetch; confirm 9 properties + 3 views. *Verified via create-database response: 9 user-defined properties present (Fix #, Title, Bug class, Severity, Commit SHA, Tests added, Caught by, Release, Status); 3 views created.*

### Task 1.4: Add `Stale (>90d, Current)` view to existing Docs db (template scope)

**Reversible:** yes.

- [x] **Step 1:** Locate the existing Docs database inside `[Template] New Project` (the inventory from Task 0.1 has it). Capture its data source ID **and full schema** (every property name + type + select options) into `_ids.md` under `Docs db (template)`. The schema dump is consumed by Task 3.0 to replicate the Docs db inside Coherence (per spec §5.4 "Schema unchanged"). *Captured: db `a1b010d4-6a70-8370-8e1d-0140bd0631c7`, ds `e2a010d4-6a70-8246-8b49-07be53668c6e`. 5 properties: Name (TITLE), Category (SELECT × 14 options), Status (SELECT: Current, Draft, Needs Update, Outdated), Tags (MULTI_SELECT × 6 options), Last Updated (LAST_EDITED_TIME).*
- [x] **Step 2:** `mcp_notion_notion-create-view` with `database_id` of the Docs db, `name: "Stale (>90d, Current)"`, `type: table`, `configure: FILTER "Last Updated" < TODAY - 90 DAYS AND "Status" = "Current"; SORT BY "Last Updated" ASC`. (If the DSL rejects the relative date filter, fall back to a simple `Status = "Current"` filter and document the limitation in `_capabilities.md`.) *Relative-date DSL rejected (`Unexpected character: -`); fallback `FILTER "Status" = "Current"; SORT BY "Last Updated" ASC` applied. View id `360010d4-6a70-8156-9e05-000c9a3c5772`. Limitation logged in `_capabilities.md`.*
- [x] **Verify:** open the view; confirm it loads (may be empty until Phase 3/5 seed it). Confirm the captured schema in `_ids.md` includes the `Status` SELECT options (must include at least `Current`) — if `Current` is not present, halt and surface to the user. *Status SELECT options confirmed: Current ✅, Draft, Needs Update, Outdated.*

---

## Phase 2 — Restructure the template

**Effort:** M. Track B-2. Reversible via Phase 0 backups (deletions).

### Task 2.1: Rewrite the template body to the §4 structure

**Reversible:** via backup only (uses `replace_content`).

- [x] **Step 1:** Re-fetched `[Template] New Project` (`f2a010d4-6a70-83ee-903e-01b55b968b74`); current body saved to `notion-backup/2026-05-14/template-body-pre-2.1.md`.
- [x] **Step 2:** Constructed full new body locally at `notion-backup/2026-05-14/template-body-post-2.1.md`:
  - Preserved Quick Reference table verbatim (Repo / Docs / Live / Package / Version / Stack / Run locally).
  - Replaced 13-row Knowledge Base table with prose `## Structure` section mirroring spec §4 (six evergreen pages, Releases parent + db, Reference parent + DD/Bugs/Glossary, Implementation Plans (archive)).
  - Included `<page url="...">` tags for the 4 actual existing child pages (📐 BRD, 🚀 Releases, 📑 Reference, 📋 Implementation Plans (archive)) and `<database url="...">` tags for all 4 child databases to satisfy the deletion guard. Read Me First / Architecture / Technical Spec / Roadmap do not exist on the template — Task 2.3 was skipped (no surviving pages to rename).
- [x] **Step 3:** Called `replace_content` with the new body. Returned `{page_id: f2a010d4-...}` (200 OK).
- [x] **Step 4:** Re-fetched and verified — Quick Reference present verbatim, new `## Structure` headings present, all 4 child pages and 4 child databases preserved.

### Task 2.2: Delete the 9 obsolete sub-pages

**Reversible:** via backup only.

For each of the 9 pages below, look up the ID from the Phase 0 inventory and call `mcp_notion_notion-update-page` with `in_trash: true` (if the schema supports it via update-data-source/move) **or** `mcp_notion_notion-move-pages` to a `Trash 2026-05-14` page under the workspace root. Trashing is preferred over hard delete to keep a 30-day Notion safety window.

- [~] `4. API/Interface Reference` — *no actual sub-page exists on template (only a 13-row table label)*
- [~] `5. Configuration` — *no actual sub-page exists on template*
- [~] `6. Integrations` — *no actual sub-page exists on template*
- [~] `7. Quality & Testing` — *no actual sub-page exists on template*
- [~] `8. CI/CD & Release` — *no actual sub-page exists on template*
- [~] `9. Dependencies` — *no actual sub-page exists on template*
- [~] `11. Decisions (ADRs)` — *no actual sub-page exists on template* (replaced by Reference DD db)
- [~] `12. Runbook & Ops` — *no actual sub-page exists on template*
- [~] `13. Changelog` — *no actual sub-page exists on template* (replaced by Releases db)

**Outcome (2026-05-14):** Task 2.2 fully skipped. The 13-row Knowledge Base table on the template referred to non-existent sub-pages (table cells only). Phase 0 inventory + walk did not surface any sub-pages titled `4.` through `13.` under the template root. Removing the 13-row table during Task 2.1 already eliminated the references; nothing to trash.

**Verify after each:** re-fetch the template page; confirm the trashed page no longer appears in `<page>` references.

### Task 2.3: Rename the 4 surviving sub-pages

**Reversible:** yes (rename only).

For each pair, call `mcp_notion_notion-update-page` with `command: "update_properties"` and `properties: { "title": "<new title>" }`. Tasks are independent — may be issued in parallel.

- [~] `1. Overview & Goals` → `📖 Read Me First` — *no actual sub-page exists on template*
- [~] `2. Architecture` → `🏛 Architecture` — *no actual sub-page exists on template*
- [~] `3. Technical Specification` → `⚙️ Technical Spec` — *no actual sub-page exists on template*
- [~] `10. Roadmap` → `🗺️ Roadmap` — *no actual sub-page exists on template*

**Outcome (2026-05-14):** Task 2.3 fully skipped — same reason as 2.2. The four target pages do not exist on the template; the 13-row table was the only place these names appeared and it was removed in Task 2.1. The four evergreen pages (`📖 Read Me First`, `🏛 Architecture`, `⚙️ Technical Spec`, `🗺️ Roadmap`) will need to be created from scratch in the new Coherence project during Phase 3 (out of scope for Phase 2).

### Task 2.4: Create the 4 new evergreen / wrapper pages

**Reversible:** yes (single `mcp_notion_notion-create-pages` batch can create all four).

- [x] **Step 1:** All four pages were already created in a prior pass on the template (likely during Phase 1 polish). Verified via `mcp_notion_notion-fetch` on each:
  1. `📐 BRD` (`360010d4-6a70-8106-93e4-e4f3057bc2a4`) — body has the stub paragraph + `## What this product is` H2 ✓
  2. `🚀 Releases` (`360010d4-6a70-8152-a947-ca90f35b5213`) — body has the prose pointer + inline linked Releases db view ✓
  3. `📑 Reference` (`360010d4-6a70-8197-900b-fc1988750ddb`) — body has prose + inline linked DD db + inline linked Bugs db + `Glossary` child ✓
  4. `📋 Implementation Plans (archive)` (`360010d4-6a70-81dc-a703-f4ff790e1f9f`) — body has the stub paragraph ✓
- [x] **Step 2:** Page IDs recorded in `_ids.md` (template subtree IDs already documented; Phase 2.5 added the duplicated equivalents under `Coherence project (new)`).
- [x] **Step 3:** `Glossary` (`360010d4-6a70-81d2-b8e5-e32650317f7f`) child + linked DD-db view already in place under `📑 Reference`.
- [x] **Step 4:** Linked Bugs-db view already in place under `📑 Reference`.
- [x] **Verify:** fetched `📑 Reference`; Glossary child + DD linked-view + Bugs linked-view all render.

**Note (2026-05-14):** Page titles render with a doubled icon (`📐 📐 BRD`, `🚀 🚀 Releases`, etc.) because both the page icon AND the leading emoji in the title string are set. Cosmetic only; harmless. Optional cleanup deferred to Phase 5.

### Task 2.5: Add ship-time checklist + sequencing-gates toggle blocks to the Releases-db row template

**Reversible:** yes.

- [x] **Step 1:** Fetched the Releases db. No `<templates>` section returned by `mcp_notion_notion-fetch` — MCP does NOT expose default-template marking.
- [~] **Step 2 (path A):** partial — created a regular row titled `[Template]` (`360010d4-6a70-8173-9395-cb82259c8eca`) with the two toggles in its body. CANNOT mark as default template via MCP (path A unavailable for the marking step).
- [x] **Step 2 (path B):** limitation recorded in `notion-backup/2026-05-14/_capabilities.md` (`Database row template ("default template") marking ❌`). Phase 3.1 must inject toggles into each new release row body individually OR copy the body of the `[Template]` row by hand.
- [x] **Step 3:** Toggle body written verbatim:
  - Toggle 1 `Ship-time checklist` — 9 unchecked checkboxes from spec §6.
  - Toggle 2 `Sequencing gates` — header `Add per-release gates here (delete this line when populated)` + one empty unchecked to-do.
- [x] **Verify:** fetched the `[Template]` row; both `<details>` toggles render with all 9 checklist items + 1 sequencing-gate placeholder. ✓

## Phase 2.5 — Duplicate template → new Coherence project

**Effort:** S. Track B-2.5. Reversible by trashing the duplicate (the source template is unchanged).

### Task 2.5.1: Duplicate template, rename, move to workspace root

- [x] **Step 1:** Called `mcp_notion_notion-duplicate-page` with `page_id = f2a010d4-6a70-83ee-903e-01b55b968b74`. Duplicate completed synchronously (~1 s); returned new page id `360010d4-6a70-8151-aa9e-d80a12c63c88`.
- [x] **Step 2:** Verified the duplicate brought all 4 child pages + 4 child databases + all schemas, options, views, and inter-database relations (relations rewritten to point at the duplicates).
- [x] **Step 3:** Moved the duplicate to workspace root via `mcp_notion_notion-move-pages` `{type: "workspace"}`. Move stripped the database row properties (`Name`, `Status`, `Phase`, etc.); only the body and `title` survived.
- [x] **Step 4:** Renamed the page to `Coherence` via `mcp_notion_notion-update-page` `update_properties` with `{title: "Coherence"}`. (The 📋 icon was inherited from the template.)
- [x] **Step 5:** Recorded all new page / database / data-source / view IDs in `_ids.md` under heading `Coherence project (new)`. The OLD project (`93d010d4-...`) is untouched and will be moved out at the end of CHECKPOINT F.

> **CHECKPOINT B** — confirm with user: template is the new shape, AND the new `Coherence` project at workspace root carries the new shape, AND the OLD Coherence project (`93d010d4-...`) is untouched. Block until approved.

---

## Phase 3 — Backfill Coherence project

**Effort:** L overall (3a S, 3b M, 3c L, 3d M). Track A-1. Reversibility varies per sub-phase (see below).

The Coherence project has **its own** Releases / DD / Bugs databases. Phase 3 creates them inside the Coherence landing page (not the template), then backfills.

### Task 3.0: Create Coherence-scoped instances of the four databases

**Reversible:** yes (empty until 3.1+).

**Resolves agent question 3:** the Coherence project gets its own database instances, not linked views of the template's databases. This isolates per-project trust ledgers and lets each project carry its own DD numbering.

- [ ] **Step 1:** Repeat Tasks 1.1, 1.2, 1.3 with `parent: { page_id: "93d010d4-6a70-8280-ba6c-013d97211fd6" }` (the Coherence landing page) instead of the template ID. **For the Docs db:** the template's Docs db is not duplicated automatically — use `mcp_notion_notion-create-database` with the schema captured in Task 1.4 step 1 (per spec §5.4 "same schema") and add the `Stale (>90d, Current)` view from Task 1.4 step 2.
- [ ] **Step 2:** Repeat Task 2.5 against the **Coherence Releases db** so the same ship-time-checklist and sequencing-gates toggles are present (resolves audit P11). **Use the same path (A or B) determined in Task 2.5; do not re-probe MCP capability.** If path B was taken in Task 2.5, the toggles must be applied to each row body in Phase 3.1 — record this requirement in `_capabilities.md`.
- [ ] **Step 3:** Record the Coherence Releases / DD / Bugs / Docs data source IDs in `_ids.md` under a `Coherence project` heading. **From here on, "Releases db" / "DD db" / "Bugs db" / "Docs db" refer to the Coherence-scoped instances unless prefixed with `template-`.**
- [ ] **Verify:** fetch each db; confirm schemas and views match Phase 1.

### Task 3.0.5: Enumerate git tags for Tag SHA lookup

**Reversible:** yes (read-only).

- [ ] **Step 1:** `git tag -l 'v*' --sort=-v:refname` from the repo root. Capture output.
- [ ] **Step 2:** Map each release to its actual git tag. Expected (verify against output): `v0.1.0`, `v0.2.0`, `v0.3.0`, `v0.4.0`, `v1.0.0`, `v1.0.1`. If any are missing, flag in `_ids.md` under `Coherence project` notes.
- [ ] **Step 3:** For each present tag, run `git rev-parse <tag>^{commit}` and record the commit SHA. Save to `notion-backup/2026-05-14/_tags.csv` with columns `release,tag,sha`.

### Task 3.1 (Sub-phase 3a — Releases): create 6 release rows

**Reversible:** yes (DB rows can be trashed individually).

For each release v0.1, v0.2, v0.3, v0.4, v1.0, v1.0.1: call `mcp_notion_notion-create-pages` with `parent: { data_source_id: "<Coherence Releases db ds id>" }` and one row per release. Source data: existing per-release Notion pages from the Phase 0 inventory + repo files (`RELEASE_NOTES_v*.md`, `CHANGELOG.md`) + `_tags.csv` from Task 3.0.5. **If Task 2.5 took path B (MCP cannot set DB row template), inject the two toggle blocks from Task 2.5 step 3 into each row body at creation time.**

- [ ] **v0.1**: Status `Shipped`, Ship date from CHANGELOG, Tag SHA from `_tags.csv` (`v0.1.0`), Substrate empty, Notes link to `RELEASE_NOTES_v0.1.0.md` permalink if it exists else blank, DD range `DD-001..DD-NN` (look up actual range from v0.1 Planning Archive page), Theme one-liner.
- [ ] **v0.2**: same shape, Tag SHA from `_tags.csv` (`v0.2.0`), Substrate → v0.1 row.
- [ ] **v0.3**: Tag SHA from `_tags.csv` (`v0.3.0`), Substrate → v0.2; Notes link to `RELEASE_NOTES_v0.3.0.md`.
- [ ] **v0.4**: Tag SHA from `_tags.csv` (`v0.4.0`), Substrate → v0.3; Notes link to `RELEASE_NOTES_v0.4.0.md`.
- [ ] **v1.0**: Tag SHA from `_tags.csv` (`v1.0.0`), Substrate → v0.4; Notes link to `RELEASE_NOTES_v1.0.0.md`.
- [ ] **v1.0.1**: Tag SHA from `_tags.csv` (`v1.0.1`) if present (else empty until v1.0.1 ships), Substrate → v1.0; Notes link to `RELEASE_NOTES_v1.0.1.md`; **Status remains `Implementing`** until v1.0.1 is actually frozen and tagged — this migration is a v1.0.1-cycle activity, not the v1.0.1 ship itself (resolves agent question 5).
- [ ] **Verify:** open the `Table` view sorted by Ship date desc; confirm 6 rows visible and Substrate chain renders.

### Task 3.2 (Sub-phase 3a — Bugs): create 10 rows from v1.0.1 final fix tally

**Reversible:** yes.

- [ ] **Step 1:** Re-read the v1.0.1 release page section "Final fix tally" from the Phase 0 backup. Each entry maps to one Bugs-db row. The `Tests added` field is parsed from inline prose like `(7 unit tests)` next to each fix name; if no count is present, default to `0` and flag in `_ids.md` for human review.
- [ ] **Step 2:** For each of the 10 fixes: `mcp_notion_notion-create-pages` with `parent: { data_source_id: "<Coherence Bugs db ds id>" }` filling Fix #, Title, Bug class, Severity, Commit SHA, Tests added (count), Caught by, Release relation → v1.0.1 row, Status `Fixed`. Notes body = the prose under the fix in the original tally.
- [ ] **Verify:** open `Table by Release` view; confirm 10 rows under v1.0.1, none under other releases yet.

### Task 3.3 (Sub-phase 3a — DD stub creation): 147 title-only rows

**Reversible:** yes.

DD source mapping (per spec §1 Reading Order — make this explicit):

| Release | DD source page in Notion |
|---|---|
| v0.1 | v0.1 Planning Archive page (look up ID in Phase 0 inventory; titled like `Planning Archive` under v0.1) |
| v0.2 | v0.2 `Design Decisions` sub-page |
| v0.3 | v0.3 `Design Decisions` sub-page |
| v0.4 | v0.4 `Design Decisions` sub-page |
| v1.0 | v1.0 `Design Decisions` sub-page |
| v1.0.1 | v1.0.1 `Design Decisions` sub-page |

Total expected DDs: 147.

- [ ] **Step 1:** For each of the 6 source pages: parse the body (from Phase 0 backup files, NOT live Notion — avoids re-fetch traffic). Extract `(DD-NNN, title, version)` triples. Each DD heading typically looks like `### DD-131: Trust gate gates auto-apply`.
- [ ] **Step 2:** Compile a flat list of 147 triples; sanity-check zero-padding and uniqueness of DD numbers. If a DD appears in multiple releases (re-statement), keep only the earliest version and note the duplicate in `_ids.md` for human review.
- [ ] **Step 3:** Batch-create rows via `mcp_notion_notion-create-pages` with `parent: { data_source_id: "<Coherence DD db ds id>" }`. The MCP create-pages call supports batching; start with batches of ~74 rows. **If the MCP rejects the batch for size:** halve and retry. For each: properties `DD #` (title), `Title`, `Version introduced` (relation to the matching Releases-db row), `Status: "Active"`, no Tags, no body.
- [ ] **Step 4:** Verify count: open `Table` view sorted by DD #; confirm 147 rows, no gaps in numbering, every row has a Version-introduced relation.

### Task 3.4 (Sub-phase 3b — DD tag pass)

**Reversible:** yes.

- [ ] **Step 1:** For each of the 147 DDs, classify into the §5.2 Tags multi-select using the title alone (heuristic). Build the mapping locally first (CSV in `notion-backup/2026-05-14/_dd-tags.csv`).
- [ ] **Step 2:** For each row: `mcp_notion_notion-update-page` with `command: "update_properties"`, `properties: { "Tags": ["Architecture", "Pipeline"] }` (multi-select as JSON array). **Verify on the first call:** if the MCP rejects the array form, retry with the comma-separated string form `"Architecture,Pipeline"`. Record the working shape in `_capabilities.md` and use it for the rest of the batch. Issue in batches of ~10 in parallel; pause between batches to respect rate limits.
- [ ] **Verify:** open `By Status` view filtered to no-tag rows; confirm zero results.

> **CHECKPOINT C** — confirm with user before starting Phase 3.5. Offer the spec §10 fallback: skip Phase 3.5 **and Phase 3.6** entirely, leave DD bodies on per-release pages, treat the DD db as a title-only index. If accepted, jump directly to Phase 4 — do NOT run 3.6 (the per-release sub-page conversion only makes sense when the DD db has full bodies).

### Task 3.5 (Sub-phase 3c — DD body backfill, 147 rows)

**Reversible:** via backup only (writes to row bodies are surgical but bulk).

**Strategy for multi-paragraph DDs:** the parser from 3.3 already extracted heading positions. Body of a DD = everything from its heading to the next `### DD-` or end of section. Many DDs span: a `**What**` paragraph, a `**Why**` paragraph, an `**Alternatives**` paragraph. Preserve the original markdown verbatim — including any nested code blocks — when copying into the row body.

- [ ] **Step 1:** Build the DD-NNN → markdown body mapping from the Phase 0 backup files (NOT live Notion). One file per source page: parse, extract bodies into `notion-backup/2026-05-14/_dd-bodies/DD-NNN.md`.
- [ ] **Step 2:** **Seed `_dd-progress.csv`** with all 147 rows in `pending` state (columns: `dd,status,attempts,note`). This is the authoritative ledger consulted by step 3 and step 4.
- [ ] **Step 3:** Spot-check 5 random DDs against the live Notion pages to confirm parsing fidelity (round-trip the markdown).
- [ ] **Step 4:** Sample emptiness check — fetch 3 random DD rows just created in Task 3.3 and confirm their body length is zero. If non-empty (Notion injected default content), do NOT use `replace_content` blindly; instead use `update_content` with the existing default text as `old_str` and the new body as `new_str`. Record the discovered default in `_capabilities.md`.
- [ ] **Step 5:** Process in batches of 10 DDs to avoid context bloat. For each batch:
  - For each DD in the batch: if step 4 confirmed empty bodies, `mcp_notion_notion-update-page` with `page_id = <DD row id>`, `command: "replace_content"`, `new_str = <full markdown body from _dd-bodies/DD-NNN.md>`, dummy `properties: {}` and `content_updates: []`. Otherwise use `update_content` per step 4's guidance.
  - After each batch of 10: re-fetch 2 random DDs from the batch and diff against `_dd-bodies/`.
  - Update `_dd-progress.csv`: flip processed rows from `pending` to `done` (or `failed` with a reason in `note`).
- [ ] **Step 6:** Final sweep: query every DD row and confirm body length > 0. Cross-check against `_dd-progress.csv`; any row marked `done` with empty body → revert to `pending` and re-process.
- [ ] **Verify:** total `done` count = 147; spot-check 10 random DDs render identically to source.

### Task 3.6 (Sub-phase 3d — per-release DD sub-page conversion)

**Reversible:** via backup only.

**Skip this entire task if CHECKPOINT C accepted the title-only fallback.**

For each per-release `Design Decisions` sub-page (v0.1 Planning Archive's DD section is a special case — handle separately because it is mixed with other content; **resolves agent question 2:** surgical extraction via `update_content`, NOT a full-page rewrite):

**Pre-step (applies to all releases v0.2..v1.0.1):** for each per-release Design Decisions sub-page, inspect the Phase 0 backup. If the body contains anything other than `### DD-NNN` headings and their bodies (e.g., a preamble paragraph, inter-DD prose, a closing section), DOWNGRADE that page from `replace_content` to surgical `update_content` of only the DD section — same treatment as v0.1 Planning Archive. Record the verdict per page in `_ids.md` under `DD sub-page conversion mode`.

- [ ] **v0.2 Design Decisions**: replace body with single inline-linked view of the Coherence DD db filtered to `Version introduced = v0.2`. Use `mcp_notion_notion-create-view` with `parent_page_id = <this page>`, `data_source_id = <Coherence DD db ds id>`, `type: table`, `name: "v0.2 DDs"`, `configure: FILTER "Version introduced" = "v0.2"; SORT BY "DD #" ASC`. THEN `mcp_notion_notion-update-page` with `command: "replace_content"` and a body that contains only a one-line pointer + the new linked-view block reference. Pre-write: confirm the Phase 0 backup exists.
- [ ] **v0.3 Design Decisions**: same pattern.
- [ ] **v0.4 Design Decisions**: same pattern.
- [ ] **v1.0 Design Decisions**: same pattern.
- [ ] **v1.0.1 Design Decisions**: same pattern.
- [ ] **v0.1 Planning Archive**: this page contains DDs mixed with other planning content. Use `command: "update_content"` to replace ONLY the DD section with a linked-view block; leave non-DD content intact. Boundary detection: from the Phase 0 backup, the DD section starts at the first `### DD-NNN` heading and ends at the next H2 heading (`## `) or end of page. Capture that range verbatim as `old_str`.
- [ ] **Verify:** open each per-release page; confirm only one block (the linked view) for v0.2..v1.0.1 (where pure-DD), and that v0.1 Planning Archive (and any v0.2..v1.0.1 pages downgraded by the pre-step) retain their non-DD content.

---

## Phase 4 — Working Log extraction

**Effort:** M. Track A-2. Reversible via backup only (single-page rewrite).

> **CHECKPOINT D** — confirm with user before starting. The v1.0.1 page is the riskiest single edit because its body contains the most active content.

### Task 4.1: Create `🔧 Working Log — v1.0.1`

**Reversible:** yes.

- [ ] **Step 1:** `mcp_notion_notion-create-pages` with `parent: { page_id: "<v1.0.1 release page id>" }`, one entry: title `🔧 Working Log — v1.0.1`, body empty.
- [ ] **Step 2:** Record the new page ID and URL in `_ids.md`.
- [ ] **Step 3:** Update the v1.0.1 row in the Coherence Releases db: `update_properties` to set `Working Log` = the new page URL.

### Task 4.2: Move working-log content into the new page

**Reversible:** via backup only.

Source material (extract verbatim from v1.0.1 release page body — backup at `notion-backup/2026-05-14/<v1.0.1-slug>.md`):

- End-of-day update
- Path to 9/10 follow-ups
- Cassette-recording runbook
- Path C migration update
- Final fix tally prose (Bugs db now supersedes the structured tally — in the Working Log copy of this section, append a one-line pointer at the END of the prose: "Structured fix list lives in the Bugs database; this prose is the original narrative.")

Steps:

- [ ] **Step 1:** Build the full Working Log body locally: concatenate the 5 sections in the order listed, each under its original H2 heading.
- [ ] **Step 2:** `mcp_notion_notion-update-page` on the new Working Log page with `command: "replace_content"`, full body as `new_str`. (Page is empty; `replace_content` is safe.)
- [ ] **Step 3:** Verify by re-fetch and diff against the assembled body.

### Task 4.3: Trim the v1.0.1 release page to its frozen subset

**Reversible:** via backup only.

The v1.0.1 release page must end up holding only: Status line, Theme, Problem statement, Goals, Milestones, Acceptance, Notes for implementers (per spec §8 Phase 4).

- [ ] **Step 1:** Construct the trimmed body locally from the backup. Verify the 7 retained sections are present and complete.
- [ ] **Step 2:** **Confirm child pages are referenced.** The Phase 0 inventory lists every child of v1.0.1 (Design Decisions sub-page, the new Working Log, etc). Include `<page url="...">` for each child in the trimmed body.
- [ ] **Step 3:** `mcp_notion_notion-update-page` with `command: "replace_content"`, the trimmed body as `new_str`, dummy `properties: {}` and `content_updates: []`. **Do NOT pass `allow_deleting_content: true`.** The page-deletion guard is a safety net here, not an expected behaviour: step 2 must produce a body that references every child, in which case the guard does not fire. **If the guard fires:** identify the missing child from the error message, add its `<page url="...">` reference to the body, retry. Do not bypass the guard.
- [ ] **Step 4:** Re-fetch and diff against intent. Confirm:
  - The 7 retained sections are intact.
  - Every child page from the inventory is still referenced.
  - The 5 working-log sections are gone.
- [ ] **Step 5:** Spot-check by opening the page in the browser (out-of-band) and confirming no orphaned child appears in the sidebar without being mentioned in body.

---

## Phase 5 — Drift cleanup

**Effort:** L. Track A-3. Reversibility per task — flagged inline.

Each step uses `update_content` (search-and-replace) wherever possible. `replace_content` is reserved for two steps that genuinely rewrite a whole page — both must re-confirm the Phase 0 backup is fresh before writing.

### Task 5.1: Central BRD absorbs cumulative state

**Reversible:** via backup only (full rewrite).

- [ ] **Step 1:** Locate the Central BRD page ID from the Phase 0 inventory.
- [ ] **Step 2:** Re-fetch and refresh backup if the live body has changed since Phase 0.
- [ ] **Step 3:** Compose a cumulative BRD body using the **latest per-release BRD page (v1.0.1 BRD-delta) as the baseline**, then merge in any surviving requirements from earlier per-release BRDs that are not represented. Do NOT concatenate `RELEASE_NOTES_*.md` — release notes describe deltas, not invariants. The Central BRD describes the *current* product state.
- [ ] **Step 4:** `update_page` with `command: "replace_content"`, full body as `new_str`. Replaces the "Active target release: v0.1 / Last shipped: none yet" stub.
- [ ] **Verify:** re-fetch; confirm "Last shipped: v1.0.1" or equivalent line.

### Task 5.2: Central Technical Spec absorbs cumulative state

**Reversible:** via backup only (full rewrite).

- [ ] Mirror Task 5.1 for the Technical Spec page. **Source:** v1.0.1 TSD-delta as baseline + surviving architecture sections from earlier per-release TSDs + the Architecture section of `CLAUDE.md` for any cross-cutting facts not in any per-release TSD.
- [ ] **Verify:** re-fetch; confirm the cumulative body lands.

### Task 5.3: Releases page renders embedded Releases db

**Reversible:** via backup only.

- [ ] **Step 1:** Locate the existing Releases page in the Coherence project (the prose page with the static markdown table).
- [ ] **Step 2:** Use `update_content` with `old_str = <the static table markdown>` and `new_str = ""` to remove the table.
- [ ] **Step 3:** Append an inline linked Releases-db view via `mcp_notion_notion-create-view` with `parent_page_id = <this page>`, `data_source_id = <Coherence Releases db ds id>`, `type: table`, `name: "All releases"`, `configure: SORT BY "Ship date" DESC`.
- [ ] **Verify:** open the page; confirm the table is gone and the linked view shows 6 rows including v1.0 as Shipped.

### Task 5.4: Roadmap drift fixes

**Reversible:** yes (surgical edits).

- [ ] **Step 1:** Read the exact parenthetical text from the Phase 0 backup of the Roadmap page (search for `Status update via MCP`). Use that text verbatim as `old_str` in an `update_content` call with `new_str = ""` to remove it. Include 5+ lines of context to ensure unique match.
- [ ] **Step 2:** `update_content` to flip the v1.0 entry from its current status emoji to `✅ shipped`. Use enough context in `old_str` to disambiguate from other release entries.
- [ ] **Verify:** re-fetch; confirm both edits land and no other content moved.

### Task 5.5: Project landing page dedupe

**Reversible:** yes (surgical edits).

- [ ] **Step 1:** Identify the duplicated navigation block from the Phase 0 backup. `update_content` with `old_str = <duplicate block, 5+ lines context>`, `new_str = ""` to remove the duplicate.
- [ ] **Step 2:** Locate the prose list of sub-pages and `update_content` to add `📋 Implementation Plans (archive)` to it. Use sufficient context to anchor.
- [ ] **Verify:** re-fetch; confirm only one nav block and the new entry is in the list.

### Task 5.6: Reference → Design Decisions converts to embedded view

**Reversible:** via backup only.

> Note: this is the **Coherence project's** `Reference / Design Decisions` page (under the Coherence landing page), NOT the template's `📑 Reference` page created in Task 2.4. Different pages, different parents.

- [ ] **Step 1:** Locate the `Reference / Design Decisions` page in the Coherence project. Confirm Phase 0 backup is fresh.
- [ ] **Step 2:** `mcp_notion_notion-update-page` with `command: "replace_content"`, `new_str` containing only a one-line pointer + the linked-view block reference (created via `mcp_notion_notion-create-view` with `parent_page_id = <this page>`, `data_source_id = <Coherence DD db ds id>`, `type: table`, `name: "All DDs"`, `configure: SORT BY "DD #" ASC`).
- [ ] **Verify:** open the page; confirm the linked view shows 147 DDs.

### Task 5.7: 12 per-release page renames (BRD-delta + TSD-delta)

**Reversible:** yes (rename only).

> **CHECKPOINT E** — confirm with user before starting. Each rename is independent. **12 actions total, two per release.**

For each release, rename both pages (BRD + TSD) using `update_properties` with `properties: { "title": "<new title>" }`. Tasks may be issued in parallel batches of ~6 to respect rate limits. **Order constraint:** do v1.0.1 LAST — its BRD/TSD must not be renamed until Phase 4 (working-log extraction + v1.0.1 page trim) is fully verified.

- [ ] **v0.1**: rename `BRD` (or `📘 BRD`) → `BRD-delta`.
- [ ] **v0.1**: rename `Technical Specification` (or `🛠️ Technical Specification`) → `TSD-delta`.
- [ ] **v0.2**: rename BRD page → `BRD-delta`.
- [ ] **v0.2**: rename Technical Specification page → `TSD-delta`.
- [ ] **v0.3**: rename BRD page → `BRD-delta`.
- [ ] **v0.3**: rename Technical Specification page → `TSD-delta`.
- [ ] **v0.4**: rename BRD page → `BRD-delta`.
- [ ] **v0.4**: rename Technical Specification page → `TSD-delta`.
- [ ] **v1.0**: rename BRD page → `BRD-delta`. (Existing title may be `BRD — Business Requirements Document`.)
- [ ] **v1.0**: rename TSD page → `TSD-delta`. (Existing title may be `Technical Specification (v1.0)`.)
- [ ] **v1.0.1**: rename BRD page → `BRD-delta`. (May not exist as a separate page — if missing, skip and note in `_ids.md`.)
- [ ] **v1.0.1**: rename TSD page → `TSD-delta`. (Same caveat.)
- [ ] **Verify after each:** fetch the page; confirm new title.

### Task 5.8: Add Coherence Docs db + seed evergreen rows

**Reversible:** yes for db creation; row creation reversible per-row.

- [ ] **Step 1:** The Coherence Docs db was already created in Task 3.0; confirm its ID is in `_ids.md`.
- [ ] **Step 2:** For each of the 6 evergreen pages (Read Me First, Architecture, BRD, Technical Spec, Roadmap, Glossary), `mcp_notion_notion-create-pages` with `parent: { data_source_id: "<Coherence Docs db ds id>" }`, properties: `Name` / title (the page title), `Status: "Current"`, `Last Updated: "2026-05-14"` (today's date in ISO yyyy-mm-dd; pass as a string under the date property name).
- [ ] **Verify:** open the `Stale (>90d, Current)` view; confirm all 6 rows are not in it (since Last Updated = today).

### Task 5.9: Apply `update_verification` to 6 evergreen pages (best-effort)

**Reversible:** yes.

- [ ] **Step 1:** Read `_capabilities.md` from Phase 0. If `update_verification` is unavailable, **skip this task entirely**; G1 falls back to the Docs `Stale` view alone (already in place from 5.8).
- [ ] **Step 2:** If available: for each of the 6 evergreen pages call `mcp_notion_notion-update-page` with `command: "update_verification"`, `verification_status: "verified"`, `verification_expiry_days: 90`. Issue in parallel.
- [ ] **Verify:** for one page, fetch with `include_discussions: true` (or check via UI) and confirm verified-by-me banner with 90-day expiry.

---

## Phase 6 — Markdown contract committed

**Effort:** S. Track B-3. Fully reversible via git.

> **CHECKPOINT F** — confirm with user before committing.

### Task 6.1: Write `docs/notion-project-template.md`

**Reversible:** yes (git revert).

- [ ] **Step 1:** Create `docs/notion-project-template.md` with the following table of contents and section structure:

  ```markdown
  # Notion Project Template Contract

  > Source-of-truth structure for new-project Notion hubs in this workspace.
  > Version: 1.0
  > Owner: <author>
  > Last updated: 2026-05-14

  ## 1. Page tree
  <copy spec §4 verbatim, including the ASCII tree>

  ## 2. Database schemas
  ### 2.1 Releases    <spec §5.1, with the Sequencing-gates note>
  ### 2.2 Design Decisions   <spec §5.2>
  ### 2.3 Bugs    <spec §5.3>
  ### 2.4 Docs    <spec §5.4>
  ### 2.5 Cross-database relations    <spec §5.5 ASCII diagram>

  ## 3. Naming conventions
  <copy spec §7 verbatim>

  ## 4. Ship-time checklist
  <copy spec §6 verbatim>

  ## 5. How to start a new project
  1. In Notion, duplicate the `[Template] New Project` row in the Projects database.
  2. Rename the row to your project name and set its icon.
  3. Fill the Quick Reference table at the top of the page (Repo / Docs / Live / Package / Version / Stack / Run locally).
  4. Open the empty Releases db; create your first row (`v0.1`, Status `Planning`).
  5. Walk the Read Me First page and replace stub paragraphs with project specifics. Schedule a 90-day verification reminder on the six evergreen pages (or rely on the Docs `Stale` view if your workspace tier lacks verification).

  ## 6. Versioning policy for this contract
  - This document is versioned with semver-like discipline: MAJOR for incompatible structural changes (schema removals, rename of an evergreen page tier), MINOR for additive changes (new optional view or property), PATCH for clarifications.
  - When the Notion template diverges from this contract: re-stamp the template from the contract; do not back-port template-only changes silently.
  - Bump the `Version:` line in the front matter on every change. Reference the bump in the commit message.

  ## 7. Risks acknowledged
  - Plan-tier dependency for `update_verification` (Business/Enterprise/wiki only).
  - MCP `replace_content` overwrite hazard — see project memory note `notion-mcp.md`.
  - DD body backfill is the single largest cost when migrating an existing project.
  ```

- [ ] **Step 2:** Verify the file contains all six top-level sections plus the version-policy and risks sections.

### Task 6.2: Commit

**Reversible:** yes (git revert).

- [ ] **Step 1:** `git add docs/notion-project-template.md`
- [ ] **Step 2:** `git commit -m "docs(notion): add reusable project-template contract"`
- [ ] **Verify:** `git log -1 --stat` shows the commit and one file added.

---

## Resumption notes

If the plan is interrupted (crash, context loss, multi-session work) the following recovery procedure rebuilds state without re-running completed work.

**Backup-state commit checkpoints.** Beyond Task 0.2's initial commit of `notion-backup/2026-05-14/`, run `git add notion-backup/2026-05-14 && git commit -m "chore(backup): refresh state after Phase <N>"` after Phase 1 (captures `_ids.md`, `_capabilities.md`), after Phase 3 (captures `_tags.csv`, `_dd-bodies/`, `_dd-progress.csv`, `_dd-tags.csv`), and after Phase 5 (final state). This guarantees the resumption ledgers below are recoverable from git history.

1. **Determine current phase from artifacts.**
   - Phase 0 done? `notion-backup/2026-05-14/_inventory.json` and `_capabilities.md` exist, and the directory is committed.
   - Phase 1 done? Inspect `[Template] New Project` via `mcp_notion_notion-fetch`; four `<data-source>` tags should appear (Releases, Design Decisions, Bugs, Docs) and `_ids.md` lists their IDs under `Releases db (template)` etc.
   - Phase 2 done? The template body shows the §4 tree (no 13-row Knowledge Base table), 9 obsolete sub-pages no longer in `<page>` references, 4 surviving pages renamed, 4 new pages present.
   - Phase 3 done? The Coherence project shows four `<data-source>` tags. Open the DD db `Table` view: 147 rows = 3a done; every row tagged = 3b done; every row has body length > 0 = 3c done; per-release DD sub-pages contain only a linked-view block = 3d done. (To check 3d programmatically: fetch each per-release Design Decisions page; success = body contains exactly one `<linked-database>` or equivalent block reference and no `### DD-` headings.)
   - Phase 4 done? `🔧 Working Log — v1.0.1` exists as a child of v1.0.1; v1.0.1 release page body is the trimmed 7-section subset.
   - Phase 5 done? Central BRD/TSD bodies are cumulative (not stub); Releases page renders the linked view; landing page nav is single; per-release pages renamed to `BRD-delta` / `TSD-delta`; Coherence Docs db is seeded; verification applied or `_capabilities.md` recorded the skip.
   - Phase 6 done? `docs/notion-project-template.md` exists in git history.

2. **Re-derive task state from `_ids.md` and `_dd-progress.csv`.** These two files are the authoritative ledgers of what has been created and (for Phase 3c) which DDs have been backfilled.

3. **If a write was in flight when the session ended:** before re-issuing it, fetch the target page and compare against the Phase 0 backup. If the page was partially modified, treat it as suspect and either (a) restore from backup and replay or (b) finish the modification in `update_content` mode. Never blind-replay a `replace_content` call.

4. **Hub re-walk.** When uncertain whether a page exists, re-walk from `93d010d4-6a70-8280-ba6c-013d97211fd6` and `f2a010d4-6a70-83ee-903e-01b55b968b74` and diff against `_inventory.json` to see what has changed since Phase 0.

5. **Approval state.** Checkpoints A–F must be re-confirmed if the user has not seen the latest summary. When in doubt, surface the current phase status and wait.

---

## Questions for the spec author

All six ambiguities surfaced during initial planning have been resolved inline:

1. **DD-db `Superseded by`** → implemented as the auto back-relation of the `Supersedes` self-relation (DUAL synced). No separate Rollup property. (Task 1.2)
2. **v0.1 Planning Archive** → surgical `update_content` extraction of the DD section only; the rest of the Planning Archive page is preserved. (Task 3.6)
3. **Coherence database scope** → separate Coherence-scoped database instances (NOT linked views of the template's databases). Per-project isolation. (Task 3.0)
4. **Releases-db row template MCP support** → path A if MCP supports template marking; path B falls back to per-row body injection at creation time, recorded in `_capabilities.md`. (Tasks 2.5 + 3.1)
5. **v1.0.1 Status during migration** → stays at `Implementing` until v1.0.1 actually ships and is tagged. The redesign migration is a v1.0.1-cycle activity, not the v1.0.1 ship. (Task 3.1)
6. **`Tag SHA` source** → `git rev-parse <tag>^{commit}` against the actual git tags enumerated in Task 3.0.5; results in `_tags.csv`. (Tasks 3.0.5 + 3.1)

If any of these resolutions is wrong, override here and re-issue affected tasks.
