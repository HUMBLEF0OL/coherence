The user invoked `/coherence:plan` with: $ARGUMENTS

Dispatch via the coherence CLI shim:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs" plan $ARGUMENTS
```

The shim consults `routePlan` in [src/commands/planRouter.ts](src/commands/planRouter.ts)
and forwards to the matching handler in [src/commands/](src/commands/):

| Subcommand                                          | Handler         | Source                                                       |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| `create <kind> <title> [--body <text>]`             | `runPlanCreate` | [src/commands/planCreate.ts](src/commands/planCreate.ts)     |
| `accept <branch-sha> <plan-id>`                     | `runPlanAccept` | [src/commands/planAccept.ts](src/commands/planAccept.ts)     |
| `reject <branch-sha> <plan-id> <reason>`            | `runPlanReject` | [src/commands/planReject.ts](src/commands/planReject.ts)     |

`reason` is one of `stale | superseded | rejected_explicit`. `kind` is
one of `proposal | decision | directive | alignment | ad_hoc` (see
`VALID_KINDS` in `planCreate.ts`).

Running `/coherence:plan` bare prints the subcommand help.

Plans live as committed JSON under `coherence/plans/<branch-sha-12>/<plan-id>.json`
(DD-099 amended; DD-117 file-only — no backend).

Show the shim's stdout to the user verbatim. Argument-parser errors
already cite the subcommand surface (`/coherence:plan accept` etc.),
so don't rewrite them.
