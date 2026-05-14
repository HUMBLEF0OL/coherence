<!-- url: https://www.notion.so/35f010d46a708182b310d85efdafad71 -->
<!-- id: 35f010d4-6a70-8182-b310-d85efdafad71 -->
<!-- title: TS-8 — Telemetry, Repair, Manifest -->
TS-8 — TELEMETRY, REPAIR, MANIFEST. Maps to FR-TELEMETRY-1, FR-REPAIR-1, FR-MANIFEST-5, NFR-OBS-2, DD-130 carry, DD-144.
Telemetry events (FR-TELEMETRY-1 pass3): three new metrics.jsonl events from trustLedger.recordEvent(): proposal_accept_recorded, proposal_revert_recorded, proposal_edit_recorded.
Event schema: _ts, event_type, section_ref_hash (12-hex SHA-256 of sectionRef) OR section_ref (full plain) per consent, weight (raw +1.0/0.0/-1.0 per pass3), author_hash (12-hex SHA-256 of git config user.email).
Redaction (DD-068 carry, NFR-OBS-2): if config.json#telemetry.upload_consent === true → full section_ref; if false (default) → section_ref_hash only. No clear-text email/IP/machine.
Rolling 90-day retention (NFR-OBS-2 v0.1 carry): metrics.jsonl truncates > 90 days; counts aggregate into metrics-summary.json.
coherence-log.md trust events: trust promotion (FR-TRUST-3 --promote) → 'Trust promoted: auto-land kinds = [<kinds>]'. Trust reassociation (FR-REPAIR-1 --reassociate) → 'Trust ledger reassociated: <old> → <new>'. Trust prune (--prune-stale) → 'Trust pruned: <count> stale developer file(s) removed'. Sync NOT logged (high-frequency).
/coherence:repair extensions (FR-REPAIR-1, DD-144): default repair adds list of orphaned trust-ledger keys (numbered).
--reassociate <oldRef> --to <newRef>: Audit#13 — sectionRefs may contain colons, so SEPARATE flags via existing argParse. Error if --reassociate without --to or vice versa. Atomic write. Append coherence-log.md.
--expire-orphans / --auto-expire alias: bulk delete in single atomic write. Print count. Append coherence-log.md.
plugin.json amendments (FR-MANIFEST-5): add slashCommands {coherence:trust, description: 'View/manage trust state...'} and {coherence:metrics, description: 'Render quality metrics report...'}. version → '1.0.0'. min_claude_code_version unchanged.
scripts/generate-command-stubs.mjs regenerates commands/trust.md and commands/metrics.md (DD-130 carry). Stubs include <!-- coherence-command: <name> --> sentinel + description. M-AUTOGEN-1 asserts 1:1 mapping.
Hook integration: src/hooks/userPromptSubmit.ts detects sentinels; src/hooks/commandDispatch.ts routes to handleTrustCommand() / handleMetricsCommand(). argv via src/util/argParse.ts.
Audit#12: --auto-expire / --expire-orphans events logged: 'Trust orphans expired: <count> sectionRef(s) removed: <list>' so audit log shows what was lost.
Audit minor: slashCommands appended at end (consistent v0.4). FR-TELEMETRY-1 has no dedicated module by design — side effect of trustLedger.recordEvent() via existing src/llm/metrics.ts.
Pass2 minor#4: bulk-delete log entries cap inline ref-list at top 20 alphabetical. > 20 → '… and <count-20> more'. Full list via /coherence:trust --status.
