<!-- url: https://www.notion.so/35b010d46a70813fb222ef8715828c20 -->
<!-- id: 35b010d4-6a70-813f-b222-ef8715828c20 -->
<!-- title: 🔍 TS-1 — System Overview & Context -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-1](https://www.notion.so/35b010d46a708125a059f71afef0d07e). The plugin shape, deployment model, and runtime context are inherited unchanged; this slice documents the v0.2 surface area on top.
---
## 1. Plugin shape (recap + delta)
Coherence v0.2 ships as the same in-process Claude Code plugin sandbox as v0.1 (BRD-1 §1.8, D-1, D-2). No daemons, no external services beyond the Anthropic API at Stop time and during the new Author / Annotate post-Stop pipeline. The only external write surfaces v0.2 introduces are:
- `~/.claude/settings.json` (or project equivalent) — only via `/coherence:install-statusline` / `/coherence:uninstall-statusline` after explicit confirmation, with automatic backup. (DD-070, FR-PERMISSION-N2)
- `bin/coherence-statusline.{sh,ps1}` and `bin/coherence-subagent-statusline.sh` registered through the plugin's auto-`PATH`-extended `bin/`. (DD-070, FR-STATUSLINE-2)
Nothing else writes outside `.claude/coherence/` without a typed `/coherence:propose-accept`.
## 2. Runtime modes
Three modes coexist; **Observe** remains the global default at install (FR-MODES-1):
<table header-row="true">
<tr>
<td>Mode</td>
<td>What runs</td>
<td>Write surface</td>
</tr>
<tr>
<td>**Observe** (v0.1 carry-forward)</td>
<td>v0.1 detection + Stop healing pipeline only</td>
<td>v0.1 surface unchanged</td>
</tr>
<tr>
<td>**Annotate**</td>
<td>  • Annotate proposer (anchor-less doc detection → frontmatter / anchor candidates)</td>
<td>`.claude/coherence/proposals/annotations/<id>/` only</td>
</tr>
<tr>
<td>**Author**</td>
<td>  • Annotate + DD-076 / DD-077 / DD-078 signal detectors + Author proposer pipeline (post-Stop)</td>
<td>`.claude/coherence/proposals/{skills,agents,commands}/<id>/` only</td>
</tr>
</table>
Mode is a per-scope property (global → per-dir → per-doc, most-specific wins), persisted in `.claude/coherence/graduation.json` and flipped via `/coherence:graduate <mode> [<path>]`. (FR-MODES-2..4, DD-074)
## 3. Top-level component map
```javascript
+-------------------------------------------------------------------+
|                    Claude Code v2.x host                          |
|  +-------------------------------------------------------------+  |
|  |              Coherence v0.2 plugin (in-process)              |  |
|  |                                                              |  |
|  |  v0.1 surface (inherited, unchanged)                         |  |
|  |   │  detection │ buffer │ git │ Stop pipeline (Stage 1/2)     |  |
|  |   │  permissions │ cost-ledger │ lock-manager │ quarantine    |  |
|  |                                                              |  |
|  |  v0.2 additive surface                                       |  |
|  |   ├─ mode-resolver         (graduation.json scope lookup)    |  |
|  |   ├─ signal-detectors                                       |  |
|  |   │    ├─ bash-repetition  (PostToolUse, ring buffer)       |  |
|  |   │    ├─ file-creation    (PostToolUse Write/Edit)         |  |
|  |   │    └─ agent-correction (SessionEnd sweep, OQ-v2-24)      |  |
|  |   ├─ trickle-scanner       (idle-gated PostToolUse)          |  |
|  |   ├─ annotate-proposer     (anchor-less doc detection)       |  |
|  |   ├─ author-pipeline       (post-Stop, prompts/v2)           |  |
|  |   ├─ proposal-store        (proposal-cache.json + dirs)      |  |
|  |   ├─ snapshot-writer       (debounced state-snapshot.json)   |  |
|  |   ├─ statusline-scripts    (bin/, OSC 8/52/plain)            |  |
|  |   └─ propose-* commands    (list/show/accept/reject/revert)  |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
        │                                              │
        ▼ Stop / SubagentStop                         ▼ /coherence:share-metrics
   Anthropic Messages API                         (file-write only in v0.2)
```
Detailed boundaries and dependency graph live in TS-2.
## 4. Hook surface (no new hooks)
v0.2 reuses the v0.1 hook surface; only handler bodies change. (BRD-2 §2)
<table header-row="true">
<tr>
<td>Hook</td>
<td>v0.2 additions</td>
</tr>
<tr>
<td>SessionStart</td>
<td>Migration sweep (v1→v2 once); proposal expiry sweep (DD-075); `responseCorrelation` cache cleared (FR-OBS-N2); mode-resolver primes per-scope cache.</td>
</tr>
<tr>
<td>UserPromptSubmit</td>
<td>Emits `user_prompt_signature { signature_hash, length_bucket, refers_to_prior, prior_response_id? }` (DD-068).</td>
</tr>
<tr>
<td>PostToolUse (Bash/Edit/Write only)</td>
<td>Emits `tool_invocation_signature` (DD-068); feeds bash-repetition + file-creation signal detectors; sets `state-snapshot` dirty bit; idle gate may invoke trickle-scanner (FR-TRICKLE-5).</td>
</tr>
<tr>
<td>Stop / SubagentStop</td>
<td>v0.1 healing pipeline runs first and unchanged; on completion the Author pipeline runs (post-Stop) within its own 5 s p95 budget; emits `agent_response_id` (DD-068); forced snapshot flush.</td>
</tr>
<tr>
<td>SessionEnd</td>
<td>v0.1 work + agent-correction sweep (FR-AUTHOR-12); signal-cache prune (FR-AUTHOR-14); `responseCorrelation` cache cleared; forced snapshot flush.</td>
</tr>
</table>
## 5. External interfaces
- **Anthropic API.** Stage 1 / Stage 2 (v0.1, unchanged). Author + Annotate calls share the v0.1 model `claude-sonnet-4-5-20251022` with `temperature: 0`, but use the new `prompts/v2/author/*` and `prompts/v2/annotate/*` prompts. (DD-091, FR-COST-N5)
- **Statusline scripts.** Read-only consumers of `state-snapshot.json`. Scripts run cancellation-safe (single atomic file read, no multi-step computation — FR-STATUSLINE-6).
- **Subagent statusline.** Plugin-shipped renderer for Coherence-spawned subagent rows (FR-STATUSLINE-1.b).
## 6. Out-of-scope at this layer
- Auto-apply / graduated trust for accepted proposals (→ v1.0 candidate, DD-065).
- Egress / opt-in HTTPS upload of anonymised metrics (→ v0.3, DD-086 file-write surface only in v0.2).
- Plugin marketplace packaging, team-shared `coherence-ignore`, monorepo `scope:` (→ v0.3).
- `/coherence:audit`, `/coherence:de-annotate` (→ v0.3 / v1.0).
## 7. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>BRD anchor</td>
<td>DDs</td>
</tr>
<tr>
<td>§1 Plugin shape</td>
<td>BRD-1, FR-PERMISSION-N1..N2, FR-STATUSLINE-2</td>
<td>DD-065, DD-070</td>
</tr>
<tr>
<td>§2 Runtime modes</td>
<td>FR-MODES-1..7</td>
<td>DD-074, DD-065</td>
</tr>
<tr>
<td>§3 Component map</td>
<td>BRD-2 §1..§12</td>
<td>DD-066..091</td>
</tr>
<tr>
<td>§4 Hook surface</td>
<td>FR-OBS-N1..N5, FR-AUTHOR-12, FR-TRICKLE-5</td>
<td>DD-068, DD-066, DD-078, DD-084</td>
</tr>
<tr>
<td>§5 External interfaces</td>
<td>FR-COST-N5, FR-STATUSLINE-1, FR-STATUSLINE-6</td>
<td>DD-091, DD-070</td>
</tr>
</table>
