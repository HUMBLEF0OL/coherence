The user invoked `/coherence:feedback` with: $ARGUMENTS

Run the coherence CLI shim to capture a feedback bundle:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs" feedback $ARGUMENTS
```

The shim calls `captureFeedbackBundle` from [src/commands/feedback.ts](src/commands/feedback.ts)
which redacts non-project paths from `$ARGUMENTS`, reads the last ~10
events from `.claude/coherence/metrics.jsonl`, and returns a JSON
bundle with `pluginVersion`, `mode`, `capturedAt`, `userMessage`, and
`recentActivity`.

Show the JSON output to the user verbatim inside a fenced ```json
block, then tell them to paste it into the **Feedback bundle** field
of the tester-feedback issue at
https://github.com/HUMBLEF0OL/coherence/issues/new?template=feedback.yml
(add their handle in the **Tester** field).
