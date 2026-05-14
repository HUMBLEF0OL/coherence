<!-- url: https://www.notion.so/35b010d46a708123b9f6f9c022be58e5 -->
<!-- id: 35b010d4-6a70-8123-b9f6-f9c022be58e5 -->
<!-- title: 🔒 TS-6 — Permission, Security & Privacy -->
**Parent:** [🛠️ Technical Specification (v0.2)](https://www.notion.so/35b010d46a708175a4f1d6e4e2c3e614) · **Status:** Draft 1 · 2026-05-09
> Additive to v0.1 [TS-6](https://www.notion.so/35b010d46a7081a2813fdbf8138c8fb2). v0.1's permission model, kill-switch, prompt-injection defense, secret handling, and ignore semantics hold unchanged.
---
## 1. The DD-065 quarantine boundary (load-bearing)
The single load-bearing trust constraint of v0.2:
> **The plugin MUST NOT write any file under ****`.claude/skills/`****, ****`.claude/agents/`****, ****`.claude/commands/`****, ****`~/.claude/settings.json`****, or any user-owned config directory unless triggered by an explicit user-typed ****`/coherence:propose-accept <id>`**** (or, for statusline only, ****`/coherence:install-statusline`**** / ****`/coherence:uninstall-statusline`****).**
Enforcement (FR-PERMISSION-N1..N3):
- Author + Annotate + Trickle + signal detectors ALL write only to `.claude/coherence/proposals/<kind>/<id>/` and `.claude/coherence/*` state files.
- The `propose-accept` command is the ONLY code path with a write capability outside `.claude/coherence/`.
- E2E gate SG-3 (BRD-4 §5) verifies via fixture that no write under `.claude/skills/`, `.claude/agents/`, `~/.claude/settings.json` happens without a typed slash command.
## 2. Proposal-accept gate
`/coherence:propose-accept <id> [--rename <new>] [--overwrite <retyped-path>]` is the bottleneck (FR-PROPOSE-6, FR-PROPOSE-10, DD-082):
```javascript
on /coherence:propose-accept <id>:
  load proposal-cache entry; assert state == 'surfaced'
  re-validate proposal.schema.json on read (FR-PROPOSE-13)
  resolve target_path = proposed_path (or --rename target)
  if exists(target_path):
    if --overwrite <retyped-path>:
      assert retyped-path == target_path  # user typed it again
      quarantineFile(target_path)         # move existing aside
    else:
      emit proposal_acceptance_blocked { reason: 'name_collision', existing_path_hash }
      return error listing --rename and --overwrite flags
  atomic-write target_path
  git commit -m "[coherence] accept proposal <id>"  (FR-PERMISSION-N3, NFR-OBS-N1)
  proposalStore.transition(id, 'accepted')
```
**The plugin never silently overwrites**, including against plugin-managed sidecars. `existing_path_hash` (not the raw path) is used in `--anonymized` `share-metrics` output (FR-PRIVACY-N1).
## 3. Revert path
`/coherence:propose-revert-acceptance <id>` (FR-PROPOSE-8, DD-083):
```javascript
resolve original-accept commit by id
git revert --no-commit <accept-sha>                       # apply inverse diff, no auto-commit
git commit -m "[coherence-revert] revert proposal <id>"   # explicit message with required prefix
proposalStore.transition(id, 'reverted')
# v0.1 revertDetect picks the [coherence-revert] commit up automatically (no code change in v0.1)
```
Note: `git revert -m <n>` (mainline parent index) is **only** for reverting merge commits; the regular accept commit is not a merge, so the `--no-commit` + `git commit -m` flow is used.
## 4. `coherence/ignore` is the single privacy boundary
- `PathFilter` (`src/detection/pathFilter.ts`) is the canonical gate. (NFR-PRIVACY-N2, FR-PERMISSION-N4)
- Every signal detector, the trickle scanner, the Annotate proposer, the Author pipeline pre-check, and `/coherence:annotate <path>` route through it.
- `/coherence:annotate <ignored-path>` MUST refuse with `path is in coherence/ignore — remove the entry to annotate` and emit `annotate_blocked { reason: 'ignored' }` (FR-ANNOTATE-8).
- No per-feature opt-out list shall bypass this gate.
## 5. Privacy-safe telemetry
### 5.1 Hashing
- All v0.2 telemetry uses SHA-256, first 12 hex chars (48 bits) via `src/util/signatureHash.ts` (DD-068, FR-OBS-N1). **Status note:** the canonical module is scheduled to land in v0.1.1 per BRD; v0.2 implementation PRs MUST verify it exists before extending its callers, and create it if not.
- Birthday-bound collision probability \< 1.8 × 10⁻⁷ on a 10 000-entry corpus (NFR-PRIVACY-N1, gate SG-1).
- Determinism: identical normalised input produces identical hash across runs and OS matrix cells (gate SG-1a).
### 5.2 Normalisation contracts
- **Bash** (FR-OBS-N1a): split on whitespace honouring single/double quotes (no shell interpretation); replace volatile tokens with placeholders — `<PATH>`, `<UUID>`, `<TS>`, `<NUM>` (integer ≥ 4 digits, preserving short flag values), `<HEX>` (≥ 8 chars). Pipes / sub-shells / heredocs are NOT parsed; they hash with their literal content.
- **Edit/Write** (FR-OBS-N1b): `<DIR:n>/<basename|*.ext>`. Basename preserved verbatim when ≤ 16 chars; otherwise globbed.
### 5.3 Cross-session leak prevention
- `responseCorrelation` cache cleared at SessionStart and SessionEnd (FR-OBS-N2).
- First `user_prompt_signature` after SessionStart MUST emit `prior_response_id: null` even when a prior session published one (gate FG-12).
### 5.4 `share-metrics` redaction
`anonymizeRecord()` (`src/commands/shareMetrics.ts`) is extended for the three DD-068 events end-to-end (FR-PRIVACY-N1):
- `tool_invocation_signature` and `user_prompt_signature` pass through (already privacy-safe by construction); `prior_response_id` defensively re-hashed.
- `agent_response_id` defensively hashes `response_id`.
- `proposal_acceptance_blocked` MUST emit `existing_path_hash`, never raw path.
Fixture-driven test `tests/unit/commands/shareMetrics.dd068.test.ts` asserts no raw command/path/prompt content appears in `--anonymized` output for any v0.2 event (FR-PRIVACY-N2, gate SG-2).
User-confirmation gate (`requiresConfirmation: true` on the `share-metrics` command spec) is unchanged; egress remains a v0.3 concern (FR-PRIVACY-N3).
## 6. Statusline install / uninstall safety
`/coherence:install-statusline` (FR-STATUSLINE-3..4, DD-070):
```javascript
locate target settings.json (per host-capabilities.statusline_install_path or default)
backup target -> <target>.coherence-bak.<iso-ts>.json
prompt user for explicit confirmation (slash-command flow)
write statusLine field; preserve all other fields
emit statusline_install { path, backup }
```
`/coherence:uninstall-statusline` reverses the change by restoring from the most recent backup. Workspace-trust prompt is inherited from Claude Code (NFR-COMPAT-N3).
## 7. OSC 8 / OSC 52 / plain degradation
3-tier degradation in `bin/coherence-statusline.*` driven by `host-capabilities.url_scheme_handler` (FR-STATUSLINE-5, DD-071, DD-090):
<table header-row="true">
<tr>
<td>Tier</td>
<td>Probe value</td>
<td>Output</td>
</tr>
<tr>
<td>1</td>
<td>`'osc8'`</td>
<td>OSC 8 wrap with `claude://run/coherence:propose-skill` URI scheme</td>
</tr>
<tr>
<td>2</td>
<td>`'osc52'`</td>
<td>OSC 52 copy-to-clipboard of `/coherence:propose-skill`</td>
</tr>
<tr>
<td>3</td>
<td>`'plain'`</td>
<td>Plain text `[2 proposals → /coherence:propose-skill]`</td>
</tr>
</table>
When tier 3 is selected, `/coherence:doctor` MUST instruct the user that setting `FORCE_HYPERLINK=1` in the environment forces tier-1 emission (FR-STATUSLINE-9).
## 8. Prompt-injection defense
v0.1 defenses hold unchanged. v0.2 adds:
- The Author pipeline NEVER receives raw command / file content; only hashed signatures and bucketed metadata (signal-cache entries; TS-5 §2.1).
- Annotate input includes only the doc's text under analysis (already user-trusted; v0.1 prompt-injection precedent applies).
- Generated `body` content is run through hallucination grep (TS-5 §5) before persisting.
## 9. Section traceability
<table header-row="true">
<tr>
<td>This section</td>
<td>FRs</td>
<td>NFRs</td>
<td>DDs</td>
</tr>
<tr>
<td>§1 Quarantine</td>
<td>FR-PERMISSION-N1..N3</td>
<td>NFR-PRIVACY (inherited)</td>
<td>DD-065</td>
</tr>
<tr>
<td>§2 Accept gate</td>
<td>FR-PROPOSE-6, FR-PROPOSE-10, FR-PROPOSE-13, FR-PRIVACY-N1</td>
<td>NFR-OBS-N1, NFR-RELIABILITY-N2</td>
<td>DD-082, DD-087, DD-088</td>
</tr>
<tr>
<td>§3 Revert</td>
<td>FR-PROPOSE-8</td>
<td>NFR-OBS-N1</td>
<td>DD-083</td>
</tr>
<tr>
<td>§4 Ignore</td>
<td>FR-PERMISSION-N4, FR-ANNOTATE-8</td>
<td>NFR-PRIVACY-N2</td>
<td>DD-073</td>
</tr>
<tr>
<td>§5 Telemetry privacy</td>
<td>FR-OBS-N1..N5, FR-PRIVACY-N1..N4</td>
<td>NFR-PRIVACY-N1, N3, N4</td>
<td>DD-068, DD-086</td>
</tr>
<tr>
<td>§6 Statusline install</td>
<td>FR-STATUSLINE-3..4, FR-PERMISSION-N2</td>
<td>NFR-COMPAT-N3</td>
<td>DD-070</td>
</tr>
<tr>
<td>§7 OSC tiers</td>
<td>FR-STATUSLINE-5, FR-STATUSLINE-9</td>
<td>NFR-COMPAT-N2</td>
<td>DD-071, DD-090</td>
</tr>
</table>
