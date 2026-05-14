# Notion workspace capabilities probe — 2026-05-14

## Plan tier
- **Tier:** Personal / Plus / Team (not Business or Enterprise)
- **Probed via:** `mcp_notion_notion-update-page` `command: "update_verification"` on scratch page `360010d4-6a70-8192-ba69-cdf4c94111ff` (Backup test (delete me))
- **Response:** HTTP 400 `validation_error`, body: `"Page verification requires a Business or Enterprise plan."` (request_id `d120aefc-9728-486e-a10f-159c37ce4142`)

## Capability matrix

| Capability | Available | Notes |
|---|---|---|
| `mcp_notion_notion-fetch` | ✅ | Used throughout Phase 0 backup |
| `mcp_notion_notion-create-pages` | ✅ | Used to create restore-drill scratch page |
| `mcp_notion_notion-update-page` `update_content` | ✅ | Surgical edit + restore validated end-to-end |
| `mcp_notion_notion-update-page` `replace_content` | ✅ (with caveat) | See `~/.claude/memories/notion-mcp.md` — silently rewrites entire body |
| `mcp_notion_notion-update-page` `update_verification` | ❌ | **Blocked at workspace plan tier** |
| `mcp_notion_notion-create-database` | ✅ | Used in Phase 1 to create Releases / DD / Bugs inside the template |
| `mcp_notion_notion-update-data-source` (DDL) | ✅ | Used in Phase 1 to add self-relations (`Substrate` on Releases, `Supersedes` on DD); self-relations cannot be declared inline at create time |
| `mcp_notion_notion-create-view` | ✅ (with caveat) | See "View DSL — relative dates" below |
| `mcp_notion_notion-duplicate-page` | ✅ | Used in Phase 2.5; runs synchronously for the database row + 4 child pages + 4 child databases case (~1s). All schemas, options, views, and inter-database relations are rewritten to point at the duplicates. Linked-view blocks inside child pages are also rewritten. |
| `mcp_notion_notion-move-pages` to `{type: "workspace"}` | ✅ | Used in Phase 2.5 to move the duplicated row out of the Projects database to workspace root. Row converts to a regular page; database properties (Name, Status, Phase, etc.) are dropped, only `title` survives. |
| Database row template ("default template") marking | ❌ | The `mcp_notion_notion-fetch` on a database does NOT return any `<templates>` section (Releases db probed). `create-pages` with `parent: data_source_id` creates a regular row, not a template. There is no documented way to mark a row as the database's default new-row template. **Workaround:** Phase 2.5 / 3.1 inject the toggle blocks into each new release row body individually, OR copy the body of the `[Template]` row (`360010d4-6a70-8173-9395-cb82259c8eca`) by hand. |

## Effect on plan

- **Task 5.9 (Verify evergreen pages):** affected. Originally would call `update_verification` on Read Me First / Overview / similar evergreen pages so Notion's UI surfaces the green "Verified" badge. **Workaround:** drop the API call; instead add an explicit "Last reviewed: YYYY-MM-DD by @owner" markdown line to each evergreen page's body during the redesign. Owner sweeps refresh the date manually.
- **Task 1.4 (Stale view on Docs db):** affected. The relative-date filter expression `"Last Updated" < TODAY - 90 DAYS` was rejected by the view DSL parser with `Unexpected character: -` at position 30. Per plan fallback, the view was created with `FILTER "Status" = "Current"; SORT BY "Last Updated" ASC`. The >90-day predicate is missing — owners must either (a) overlay an additional filter in the Notion UI, or (b) the future Phase 5 sweep can identify stale rows by sorting Last Updated ASC and reading the dates manually. Re-investigate DSL syntax (e.g. `BEFORE ago(90, 'days')`) before Phase 5 if needed.
- No other Phase 1–6 task touches `update_verification`.

## View DSL — relative dates

The MCP `create-view` DSL appears to accept `FILTER`, `SORT BY`, `GROUP BY`, etc. with literal string and select-option values, but rejects arithmetic on date literals (`TODAY - 90 DAYS`). Documented MCP examples only show static comparisons (`= "value"`). Until the DSL grammar is documented or extended, relative-date views must fall back to a static filter and rely on UI-side overlays.

## Probe artifact cleanup
- Scratch page `Backup test (delete me)` (`360010d4-6a70-8192-ba69-cdf4c94111ff`) moved out of the Coherence subtree to workspace root via `mcp_notion_notion-move-pages` → `new_parent: {type: "workspace"}`. The MCP does not expose a page-trash command; manual trash via the Notion UI is required to fully delete. Page no longer affects Coherence project hierarchy.
- No real pages were verification-flagged; the probe only ever hit the scratch page.
