<!-- url: https://www.notion.so/35f010d46a70815eae12ffb05cf14a9a -->
<!-- id: 35f010d4-6a70-815e-ae12-ffb05cf14a9a -->
<!-- title: TS-5 — Command Surface -->
TS-5 — COMMAND SURFACE. Maps to FR-TRUST-3, FR-TRUST-5, FR-METRICS-1..3, FR-MANIFEST-5, DD-130 carry.
/coherence:trust dispatcher (src/commands/trust.ts): subcommands via flag inspection: --status (default), sync, --promote, --prune-stale.
--status: read personal ledger + team aggregate, render 5-section Markdown: (a) current state (promoted_at, auto_land_kinds, hint_emitted); (b) top 5 highest personal; (c) top 5 lowest personal; (d) team summary (active developer count, contested-section count); (e) promote eligibility (3 conditions met/pending).
sync: invokes teamAggregate.writeOwnFile(personalLedger). Prints confirmation with file path + timestamp.
--promote --auto-land <kinds>: checks eligibility; if conditions met, atomically writes promoted_at + auto_land_kinds to personal ledger. --auto-land omitted defaults to ['annotate'] (DD-146).
--prune-stale: invokes listStaleFiles then pruneStale after --yes. Prints count + paths.
Perf bound (NFR-PERF-N6 pass3): --status < 200 ms p95.
/coherence:metrics renderer (src/commands/metrics.ts) — 5 Markdown sections (FR-METRICS-1):
(1) Summary — count accept/revert/edit/discard all-time + last 30 days. 2-col table.
(2) Top drifting sections — group coherence-log.md by sectionRef; count applications; sort desc; top 10. Contested marked ⚠ (FR-LEDGER-4 pass3).
(3) Trust scores — sort by score; top 10 highest with personal+team side-by-side; top 10 lowest. Empty: 'No trust data yet — run more sessions to accumulate metrics.'
(4) Cost trend — bucket cost-ledger.json by day, last 30 days. Unicode sparkline ▁▂▃▄▅▆▇█. Linear scale. Empty: '< 3 sessions — no trend yet.'
(5) Revert hotspots — sections with ≥ 5 events; revert rate = reverts/(accepts+reverts+edits) per FR-METRICS-3. Filter > threshold (default 0.20). Sort desc.
Flags: --since <ISO> (reuses src/util/dateFilter.ts); --out <path> (DD-128 sandbox NFR-PATH-SANDBOX); --revert-threshold <pct> integer 0-100 default 20.
Perf bound (NFR-PERF-N6): < 200 ms p95.
Sentinel dispatch (DD-130 carry from v0.4): scripts/generate-command-stubs.mjs auto-generates commands/trust.md and commands/metrics.md at build time. Each stub contains <!-- coherence-command: <name> --> sentinel + brief description. userPromptSubmit detects sentinel; commandDispatch routes to JS handler.
plugin.json (FR-MANIFEST-5): add slashCommands {coherence:trust} and {coherence:metrics}. Version → 1.0.0. assertVersionSync verifies package.json + plugin.json + PLUGIN_VERSION lockstep.
Audit#14: --revert-threshold PERCENT integer [0,100] default 20. rate*100 >= threshold. Invalid rejected.
Audit minor: dispatch — argv[0]==='sync' → sync; else --promote → promote; else --prune-stale → prune; else --status default. Sparkline edge cases: all-zero → flat ▁; single point → █; max==min → ▄. --out same Markdown.
