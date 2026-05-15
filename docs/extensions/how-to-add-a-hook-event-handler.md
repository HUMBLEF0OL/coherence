# How to add a hook event handler

## What's a hook handler?

Claude Code fires lifecycle events at the plugin: `SessionStart`,
`PostToolUse`, `UserPromptSubmit`, `SubagentStop`, `Stop`, `SessionEnd`,
`PreCompact`. Each registered event invokes a small Node wrapper under
[bin/hooks/](../../bin/hooks/), which reads the JSON payload from stdin
and calls a compiled handler from
[src/hooks/](../../src/hooks/). Handlers are wrapped in
`withExceptionGuard()` so a thrown exception cannot blow up the user's
session — the third exception in a session writes the `auto-disabled`
sentinel and the rest of the session silently no-ops.

For the event surface, see Claude Code's official hooks docs:
<https://docs.claude.com/en/docs/claude-code/hooks>.

## Where handlers live

```
src/hooks/
├── index.ts            # re-exports every handler — single import surface
├── exceptionGuard.ts   # withExceptionGuard() + auto-disable counter
├── eventShape.ts       # normaliseHookEvent() — accept loose payloads
├── degradedMode.ts     # isDegraded() — sentinel + exception probe
├── sessionStart.ts
├── postToolUse.ts
├── userPromptSubmit.ts
├── subagentStop.ts
├── stop.ts
├── sessionEnd.ts
└── preCompact.ts
```

```
bin/hooks/
├── _runHook.mjs        # shared wrapper runtime — stdin / projectRoot / exit code
├── sessionStart.mjs    # one line: runHook('sessionStart', 'sessionStartHook')
├── postToolUse.mjs
├── userPromptSubmit.mjs
├── subagentStop.mjs
├── stop.mjs
├── sessionEnd.mjs
└── preCompact.mjs
```

```
hooks/hooks.json        # the manifest Claude Code reads at install time
```

## The interface

From [src/hooks/exceptionGuard.ts](../../src/hooks/exceptionGuard.ts):

```typescript
export interface HookResult {
  success: boolean;
  additionalContext?: string;
  refusedLegacy?: boolean;
}

export async function withExceptionGuard(
  sentinels: Sentinels,
  handler: () => Promise<HookResult>,
): Promise<HookResult>;
```

A handler has the signature

```typescript
export async function myHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult>;
```

It is `event: unknown` deliberately — the wrapper's stdin parse is
best-effort, and `normaliseHookEvent()` in
[src/hooks/eventShape.ts](../../src/hooks/eventShape.ts) is how every
existing handler reads `sessionId`, `cwd`, and the shapes it actually
cares about.

The return contract from `_runHook.mjs`:

- `result.additionalContext` -> written to stdout (Claude Code surfaces it
  as additional context for the model).
- `result.success === false` -> exit code 1 (failure surfaces to the user).
- Otherwise -> exit code 0 (success, silent).

Throwing is NOT the way to signal failure. The exception guard catches
everything and counts toward the 3-strike auto-disable. Return
`{ success: false }` if you actually need a non-zero exit.

## Worked example: a `Notification` handler

Suppose Claude Code adds (or you want to react to) a new `Notification`
event with payload `{ message: string, level: 'info' | 'warn' }`. We'll
have Coherence log every `warn`-level notification into the
`coherence-log.md` audit trail.

### Step 1 — Write the handler

Create [src/hooks/notification.ts](../../src/hooks/):

```typescript
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { nowIsoUtc } from '../util/time.js';
import { normaliseHookEvent } from './eventShape.js';

const SUCCESS: HookResult = { success: true };

interface NotificationEvent {
  message?: string;
  level?: 'info' | 'warn';
}

export async function notificationHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const evt = normaliseHookEvent(event) as NotificationEvent;
    if (evt.level !== 'warn' || !evt.message) return SUCCESS;

    const store = makeStateStore(projectRoot);
    await store.appendMarkdown(
      'coherence-log.md',
      `| ${nowIsoUtc()} | notification | ${evt.message} |  |`,
    );
    return SUCCESS;
  });
}
```

The shape is uniform: probe sentinel, normalise event, do the work,
return `SUCCESS`. The `withExceptionGuard()` wrap means **any** thrown
error counts toward auto-disable; do not try/catch around `await` calls
unless the failure is genuinely non-fatal — let the guard do its job.

### Step 2 — Re-export from `index.ts`

[src/hooks/index.ts](../../src/hooks/index.ts):

```typescript
export { notificationHook } from './notification.js';
```

### Step 3 — Add a wrapper script

[bin/hooks/notification.mjs](../../bin/hooks/):

```javascript
#!/usr/bin/env node
import { runHook } from './_runHook.mjs';
await runHook('notification', 'notificationHook');
```

The two strings must match: the file `dist/hooks/notification.js` (from
the TS source above) and the named export `notificationHook`.

### Step 4 — Register in `hooks/hooks.json`

[hooks/hooks.json](../../hooks/hooks.json):

```json
{
  "hooks": {
    "...": "existing entries omitted",
    "Notification": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks/notification.mjs\"" }
        ]
      }
    ]
  }
}
```

That's it for wiring. `npm run build` compiles
`src/hooks/notification.ts` -> `dist/hooks/notification.js`, and the
manifest now points Claude Code at the new wrapper.

### Step 5 — Tests

Two test layers, both expected:

- **Unit test** under
  [tests/unit/hooks/](../../tests/unit/hooks/). Mock `Sentinels` and
  `StateStore`; assert that a `warn`-level event triggers
  `appendMarkdown`, that an `info`-level event does not, and that an
  exception thrown deep in the handler does not propagate out of
  `notificationHook`.
- **Integration test** under
  [tests/integration/](../../tests/integration/). Run the real wrapper
  via `node bin/hooks/notification.mjs`, pipe a JSON event to stdin,
  assert that `.claude/coherence/coherence-log.md` contains the
  expected entry.

The integration test is the one that catches wiring regressions — a
typo in the export name, a missing entry in `hooks/hooks.json`, an
`import` from `dist/` that doesn't exist after a clean build.

## Gotchas

- **Always wrap with `withExceptionGuard`.** The 3-strike auto-disable is
  the only thing keeping a buggy hook from blocking the user's session
  permanently. There is no other catch-all.
- **Sentinel check first.** Every handler probes
  `sentinels.isDisabled()` and returns SUCCESS immediately if the
  `DISABLED` or `auto-disabled` sentinel is present. Skipping this
  bypasses the kill-switch.
- **`projectRoot` resolution.** `_runHook.mjs` resolves
  `process.env.CLAUDE_PROJECT_DIR` -> `event.cwd` -> `event.project_root` ->
  `process.cwd()`. Don't reimplement it in your handler — accept the
  argument and trust the wrapper.
- **Event shape is loose.** Use
  [normaliseHookEvent](../../src/hooks/eventShape.ts) to read
  `sessionId` etc., and cast to your own narrow interface afterward.
  Do NOT assume keys exist on `event`; `_runHook.mjs` falls through
  with `{}` on a stdin parse failure.
- **Auto-generated stubs.** If your hook also surfaces a slash command,
  the `npm run build` step regenerates command stubs from
  `.claude-plugin/plugin.json`. Hooks themselves do not need a stub —
  the manifest is `hooks/hooks.json`.
- **`additionalContext` is for the model.** Anything you write to
  `result.additionalContext` ends up in the model's context window.
  Don't dump JSON blobs there — write to `coherence-log.md` or
  `metrics.jsonl` instead and keep `additionalContext` to short,
  human-meaningful strings (or omit entirely).
- **Hook order.** Within a single event, the hooks in `hooks.json`
  run in declared order. Coherence ships one wrapper per event; if you
  add a second hook to the same event, decide whether it should
  precede or follow the existing coherence handler.
- **Degraded mode.** [src/hooks/degradedMode.ts](../../src/hooks/degradedMode.ts)
  exposes `isDegraded()` for handlers that want to short-circuit when
  the system is already in trouble. The existing handlers don't all
  call it — read the surrounding context before deciding whether yours
  should.
