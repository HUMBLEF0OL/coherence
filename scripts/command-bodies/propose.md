The user invoked `/coherence:propose` with: $ARGUMENTS

Dispatch via the coherence CLI shim:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs" propose $ARGUMENTS
```

The shim consults `routePropose` in [src/commands/proposeRouter.ts](src/commands/proposeRouter.ts)
and forwards to the matching handler in [src/commands/](src/commands/):

| Subcommand            | Handler                          | Source                                                                               |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `list`                | `runProposeList`                 | [src/commands/proposeList.ts](src/commands/proposeList.ts)                           |
| `show <id>`           | `runProposeShow`                 | [src/commands/proposeShow.ts](src/commands/proposeShow.ts)                           |
| `accept <id>`         | `runProposeAccept`               | [src/commands/proposeAccept.ts](src/commands/proposeAccept.ts) (supports `--rename`, `--overwrite <retyped-path>`) |
| `reject <id>`         | `runProposeReject`               | [src/commands/proposeReject.ts](src/commands/proposeReject.ts)                       |
| `revert-acceptance <id>` | `runProposeRevertAcceptance`  | [src/commands/proposeRevertAcceptance.ts](src/commands/proposeRevertAcceptance.ts)   |

Running `/coherence:propose` bare (no args) prints the subcommand
help and exits.

Show the shim's stdout to the user verbatim. If the handler reports
a non-fatal refusal (e.g. `name_collision`, `illegal_state`), preserve
the message — the user needs the suggested remediation (`--rename` /
`--overwrite`).
