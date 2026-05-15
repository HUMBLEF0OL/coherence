The user invoked `/coherence:statusline` with: $ARGUMENTS

Dispatch via the coherence CLI shim:

```
node dist/cli.js statusline $ARGUMENTS
```

The shim consults `routeStatusline` in [src/commands/statuslineRouter.ts](src/commands/statuslineRouter.ts)
and forwards to:

| Subcommand   | Handler              | Source                                                                |
| ------------ | -------------------- | --------------------------------------------------------------------- |
| `install`    | `installStatusline`  | [src/commands/installStatusline.ts](src/commands/installStatusline.ts) |
| `uninstall`  | `uninstallStatusline`| [src/commands/uninstallStatusline.ts](src/commands/uninstallStatusline.ts) |

`install` is **cross-the-boundary** (FR-PERMISSION-N2): it writes
`~/.claude/settings.json` only after creating a backup, and refuses
when the live statusline has drifted from the last backup (manual
edit detection). The shim resolves the shell script path to
`<plugin-root>/bin/coherence-statusline.sh` (or `.ps1` on Windows).

`uninstall` restores the most recent
`~/.claude/settings.json.coherence-backup-<ts>`.

Running `/coherence:statusline` bare prints the subcommand help.

Show the shim's stdout to the user verbatim — the rendered string
already names backup paths and refusal reasons.
