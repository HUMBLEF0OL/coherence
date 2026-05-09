# Coherence Slash Commands Reference (DG-2)

All commands are invoked via the Claude Code chat prompt as `/coherence:<command>`.

---

## `/coherence:status`

Show plugin status in canonical fixed-order output (DD-055).

**Output sections (in order):**
1. Header — plugin version, mode
2. Capabilities — host probes (if available)
3. Sentinels — kill-switch state (if active)
4. Buffer — pending section count + entries
5. Recent activity — last 3 coherence-log entries
6. Subagent stats — accepted/edited/discarded/rejected
7. Velocity — revert count, auto-ignored sections
8. Cost — last stop cost, session total
9. `[limitation]` DD-044 footer (always present)

**Performance:** < 250 ms p95 (NFR-PERF-7).

---

## `/coherence:review`

Run the Stop pipeline mid-session against the current buffer.

```
/coherence:review
/coherence:review --estimate
```

- Without `--estimate`: runs the full Stop pipeline (Stage 1 + Stage 2, applies in Graduated mode).
- `--estimate`: runs Stage 1 only, reports estimated group/section count, records Stage 1 cost.

---

## `/coherence:repair`

Fix state inconsistencies: anchor collisions, schema drift, buffer corruption, pending.md mismatches.

```
/coherence:repair
```

Actions taken:
- Clears corrupt `drift-buffer.json` (schema mismatch)
- Removes orphaned `stop-progress.json` (buffer empty but progress present)
- Reports `pending.md` marker mismatches

---

## `/coherence:recover`

Clear recovery state: auto-disable sentinel, stale locks, orphaned progress files, quarantine.

```
/coherence:recover
```

Clears:
- `auto-disabled` sentinel (NOT `DISABLED` — manual kill-switch requires manual removal)
- Stale lock manager state
- `stop-progress.json`
- Quarantine directory contents

---

## `/coherence:doctor`

Probe host capabilities and write `host-capabilities.json`.

```
/coherence:doctor
```

Probes:
- `subagent_attribution`
- `frontmatter_preserves_unknown_keys`
- `hook_event_shapes`
- `token_count_in_posttooluse`

Run after host upgrades. Coherence auto-probes on first SessionStart per project (FR-INSTALL-3).

---

## `/coherence:graduate`

Toggle between Observe and Graduated modes.

```
/coherence:graduate           # → Graduated (additive patches auto-apply)
/coherence:graduate --revert  # → Observe (all patches need review)
```

In Graduated mode, additive patches are auto-applied and committed as `[coherence] <summary>`. Modifying, destructive, and frontmatter patches always require confirmation.

---

## `/coherence:enable-sidecars`

Provision `.claude/coherence/sidecars/<name>.yaml` for skills/agents when the host strips unknown frontmatter keys (DD-043).

```
/coherence:enable-sidecars
```

Scans `.claude/skills/`, `.claude/agents/`, `.claude/commands/` for skill/agent directories and creates sidecar YAML files that preserve `coherence:section` keys.

---

## `/coherence:share-metrics`

Export anonymized metrics to a local file (no network egress in v0.1).

```
/coherence:share-metrics --anonymized --output /tmp/metrics.jsonl
```

Options:
- `--anonymized`: redact project paths, hash section refs (DD-060)
- Output is written locally — no HTTPS POST in v0.1

Requires user confirmation before writing.
