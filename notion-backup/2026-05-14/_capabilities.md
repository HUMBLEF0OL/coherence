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
| `mcp_notion_notion-create-database` | untested | Plan does not depend on it |
| `mcp_notion_notion-update-data-source` (DDL) | untested | Plan does not depend on it |

## Effect on plan

- **Task 5.9 (Verify evergreen pages):** affected. Originally would call `update_verification` on Read Me First / Overview / similar evergreen pages so Notion's UI surfaces the green "Verified" badge. **Workaround:** drop the API call; instead add an explicit "Last reviewed: YYYY-MM-DD by @owner" markdown line to each evergreen page's body during the redesign. Owner sweeps refresh the date manually.
- No other Phase 1–6 task touches `update_verification`.

## Probe artifact cleanup
- Scratch page `Backup test (delete me)` (`360010d4-6a70-8192-ba69-cdf4c94111ff`) moved out of the Coherence subtree to workspace root via `mcp_notion_notion-move-pages` → `new_parent: {type: "workspace"}`. The MCP does not expose a page-trash command; manual trash via the Notion UI is required to fully delete. Page no longer affects Coherence project hierarchy.
- No real pages were verification-flagged; the probe only ever hit the scratch page.
