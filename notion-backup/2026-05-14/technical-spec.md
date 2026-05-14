<!-- url: https://www.notion.so/35b010d46a70819da60fe8948e2b36e2 -->
<!-- id: 35b010d4-6a70-819d-a60f-e8948e2b36e2 -->
<!-- title: ⚙️ Technical Spec -->
> **Living architecture document.** This is the central, evergreen description of *how Coherence is built today*. It evolves as releases ship. Per-release architecture deltas and contracts live under [Releases](https://www.notion.so/35b010d46a7081688d3fe27c531626b6) and are frozen at ship time.
## Current state
**Active target release:** [v0.1](https://www.notion.so/35b010d46a7081e08b50cba68bbf55ba) (spec frozen, implementation in progress)  
**Last shipped release:** none yet
Until v0.1 ships, the authoritative current architecture is the [v0.1 Technical Specification](https://www.notion.so/35b010d46a70815285cef48ffce741d4). Once v0.1 ships, this page absorbs it as the new baseline; future releases append/amend here while their per-release TSDs capture the delta.
## What lives here vs. per-release TSDs
<table header-row="true">
<tr>
<td>This page (Central TSD)</td>
<td>Per-release TSD</td>
</tr>
<tr>
<td>Cumulative architecture truth</td>
<td>Architecture changes for one release</td>
</tr>
<tr>
<td>Updated when a release ships</td>
<td>Frozen the day the release ships</td>
</tr>
<tr>
<td>Module map, data model, contracts in current code</td>
<td>What this release adds/changes/removes</td>
</tr>
<tr>
<td>Cross-version compatibility & migration policy</td>
<td>Version-specific migration steps</td>
</tr>
</table>
## Sections (to populate when v0.1 ships)
- System overview & deployment model
- Component architecture (current)
- Data model & on-disk layout (current)
- Hook pipeline (current)
- LLM pipeline (current)
- Security, performance, observability invariants
- Migration & compatibility policy across versions
