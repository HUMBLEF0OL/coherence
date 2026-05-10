# v0.2 slash command surface (DG-2)

| Command | Purpose | DD |
|---------|---------|----|
| `/coherence:graduate <mode> [<scope>]` | Set per-scope or global mode (`observe`/`annotate`/`author`) | DD-074 |
| `/coherence:graduate --status` | Print effective mode for cwd | FR-MODES-5 |
| `/coherence:annotate <path>` | Generate an annotate proposal for an anchor-less doc | DD-069 |
| `/coherence:propose-list` | List queued/surfaced proposals; transitions queued → surfaced | FR-PROPOSE-7 |
| `/coherence:propose-show <id>` | Render a single proposal artifact + manifest; re-validates at read time | FR-PROPOSE-8, FR-PROPOSE-13 |
| `/coherence:propose-accept <id>` | Cross-the-boundary write; collision: refuse + suggest, `--rename`, or `--overwrite <retyped-path>` | DD-082 |
| `/coherence:propose-reject <id>` | Reject a surfaced/queued proposal | FR-PROPOSE-8 |
| `/coherence:propose-revert-acceptance <id>` | Revert an accepted proposal (file removed; `[coherence-revert]` audit row) | DD-083 |
| `/coherence:install-statusline` | Install the statusline into `~/.claude/settings.json` (with backup) | FR-STATUSLINE-2 |
| `/coherence:uninstall-statusline` | Restore the most recent statusline backup | FR-STATUSLINE-3 |

All v0.2 commands are read-only against the project tree except for
`propose-accept` and `install/uninstall-statusline`, which are the two
boundary-crossing operators (DD-065).
