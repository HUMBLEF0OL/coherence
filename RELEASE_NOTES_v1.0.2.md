# Coherence v1.0.2

Plugin-manifest schema migration. The v1.0.1 manifest was rejected by
`claude plugin validate` against the modern published schema; v1.0.2
rewrites the manifest, hooks wiring, and command stubs to match what
the Anthropic plugin registry and marketplace pipeline expect. This is
a prerequisite for **M3 — marketplace listing** (the submission
forms run `claude plugin validate` on the source). No runtime
behaviour changes; the existing two-stage pipeline, trust ladder,
asserts engines, and cosign signing are all untouched.

## Highlights

- **`claude plugin validate` passes cleanly** against the v1.0.2
  manifest (only one cosmetic warning about `CLAUDE.md` being a
  repo-contributor file rather than plugin context — that's
  intentional).
- **`.claude-plugin/marketplace.json` ships in-tree**, pinned to the
  `v1.0.2` tag via a `github` source. Users can register the
  marketplace at project or user scope with
  `claude plugin marketplace add HUMBLEF0OL/coherence`.
- **All 27 slash-command stubs now have YAML frontmatter** with
  validator-clean `description` fields (always double-quoted to avoid
  `: ` plain-scalar ambiguity).
- **Hooks migrated to the shell-command shape.** Each of the 7 hooks
  now runs `node ${CLAUDE_PLUGIN_ROOT}/bin/hooks/<name>.mjs`, which
  reads the event payload from stdin, calls the compiled handler,
  and writes any `additionalContext` to stdout. The handler bodies
  in `src/hooks/*.ts` are unchanged.
- **Stage 1 / Stage 2 / trust ladder / asserts / bundle assembly:**
  all unchanged. The 35-case `scripts/test-dummy-thorough.mjs`
  harness still passes 35/35 against the cohrence-dummy fixture.

## Manifest schema changes — before and after

### Before (v1.0.1, rejected by validator)

```json
{
  "author": "HUMBLEF0OL <123amitrana0123@gmail.com>",
  "repository": "github.com/HUMBLEF0OL/coherence",
  "min_claude_code_version": "2.0.0",
  "main": "./dist/index.js",
  "hooks": {
    "SessionStart": { "handler": "hooks/sessionStart" },
    "PostToolUse":  { "handler": "hooks/postToolUse" },
    ...
  },
  "slashCommands": [
    { "name": "coherence:status", "description": "...", "handler": "commands/status" },
    ...
  ]
}
```

Validator output:

```
✘ Found 3 errors:
  ❯ author: Invalid input: expected object, received string
  ❯ hooks: Invalid input
  ❯ root: Unrecognized keys: "min_claude_code_version", "main", "slashCommands"
```

### After (v1.0.2, validator-clean)

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "cohrence",
  "version": "1.0.2",
  "description": "Detects documentation-vs-code drift and proposes surgical patches",
  "author": { "name": "HUMBLEF0OL", "email": "..." },
  "homepage": "https://github.com/HUMBLEF0OL/coherence",
  "repository": "https://github.com/HUMBLEF0OL/coherence",
  "license": "MIT",
  "keywords": ["claude-code", "plugin", "documentation", "drift-detection", "coherence"],
  "hooks": "./hooks/hooks.json"
}
```

The dropped fields (`min_claude_code_version`, `main`, `slashCommands`)
were holdovers from an older plugin API and are not in the current
schema. The dispatch path doesn't need them:

- `slashCommands` → command list moved to
  `scripts/commands.config.json`. The generator reads from that, the
  validator never sees it, and runtime dispatch keys off the
  `<!-- coherence-command: <name> -->` sentinel inside each stub.
- `main` → no plugin runtime ever read this; cohrence is loaded as a
  config bundle plus hook scripts, not as a JS library.
- `min_claude_code_version` → no equivalent in the schema. Compatibility
  is documented in the README + release notes instead.

## Hooks: from JS handler paths to shell commands

The plugin contract changed from "Claude Code imports your JS module
and calls your function" to "Claude Code spawns a shell command and
pipes the event JSON to stdin."

Each hook now has a thin wrapper at `bin/hooks/<name>.mjs` that:

1. Reads stdin (the event payload).
2. Imports the compiled handler from `dist/hooks/<name>.js`.
3. Resolves the project root from `CLAUDE_PROJECT_DIR` or `cwd`.
4. Calls the handler.
5. Writes `additionalContext` (if any) to stdout.
6. Exits 0 on success, 1 on failure.

```
hooks/hooks.json
├── SessionStart      -> node "${CLAUDE_PLUGIN_ROOT}/bin/hooks/sessionStart.mjs"
├── PostToolUse       -> node "${CLAUDE_PLUGIN_ROOT}/bin/hooks/postToolUse.mjs"
├── UserPromptSubmit  -> node "${CLAUDE_PLUGIN_ROOT}/bin/hooks/userPromptSubmit.mjs"
├── SubagentStop      -> node "${CLAUDE_PLUGIN_ROOT}/bin/hooks/subagentStop.mjs"
├── Stop              -> node "${CLAUDE_PLUGIN_ROOT}/bin/hooks/stop.mjs"
├── SessionEnd        -> node "${CLAUDE_PLUGIN_ROOT}/bin/hooks/sessionEnd.mjs"
└── PreCompact        -> node "${CLAUDE_PLUGIN_ROOT}/bin/hooks/preCompact.mjs"
```

All seven wrappers share `bin/hooks/_runHook.mjs`, which is the only
piece of new logic. The handler bodies in `src/hooks/*.ts` and their
exports are unchanged.

## Command stubs: YAML frontmatter

`scripts/generate-command-stubs.mjs` now emits stubs in the form:

```markdown
---
description: "Show current coherence state: buffer, recent activity, subagent stats, velocity, cost"
---

<!-- coherence-command: coherence:status -->
```

Descriptions are always double-quoted because many of them contain
`: ` (which a plain YAML scalar would mis-parse as a nested
key/value).

The generator's source of truth moved from
`.claude-plugin/plugin.json#slashCommands` (now rejected) to
`scripts/commands.config.json`. Adding a new command in v1.0.2+:

1. Add entry to `scripts/commands.config.json#commands`.
2. Implement the handler in `src/commands/<name>.ts`.
3. Wire dispatch in `src/hooks/commandDispatch.ts`.
4. `npm run build` regenerates the stub.

## Marketplace registration

`.claude-plugin/marketplace.json` is now in the repo, pinned to the
v1.0.2 tag:

```json
{
  "name": "cohrence",
  "owner": { "name": "HUMBLEF0OL", "email": "..." },
  "plugins": [
    {
      "name": "cohrence",
      "source": {
        "source": "github",
        "repo": "HUMBLEF0OL/coherence",
        "ref": "v1.0.2"
      },
      "version": "1.0.2",
      ...
    }
  ]
}
```

This unblocks two install paths:

- **Local register, then install:**
  ```bash
  claude plugin marketplace add HUMBLEF0OL/coherence
  claude plugin install cohrence@cohrence
  ```
- **Submit to the official Anthropic marketplace** via the
  in-app forms (Claude.ai → Settings → Plugins → Submit, or
  Console → Plugins → Submit). Source review reads the same
  marketplace.json.

The release-pipeline's `assertVersionSync` was extended to verify
`marketplace.plugins[0].version` and `.source.ref` track the tag too.

## Documentation cleanup

- README "Seven engines" → "Eight engines" (Fix 8's `symbol_exported`
  was added in v1.0.1 but the count never got updated).

## State file additions

None. v1.0.2 is source-only; no `.claude/coherence/` schema changes.

## Test coverage

- `tests/static-analysis/autogen-stubs.test.ts` gained a new test
  asserting every stub has YAML frontmatter with a `description`
  field (the structural guard against regression on the validator's
  required input). Suite count: 33/33 gates (was 32) · 1101/1101
  vitest (was 1100).
- The cohrence-dummy harness (`scripts/test-dummy-thorough.mjs`)
  still passes 35/35 cases — no runtime regressions.
- E2E-11 vitest (in-process rename-drift fixture): 2/2.

## Acceptance

- **Tests:** suite + dummy harness + E2E-11 all green.
- **TypeScript:** clean (`tsc --noEmit`).
- **Gates:** 33/33 (`npm run gates`).
- **Plugin validate:** passes with 1 cosmetic warning (`CLAUDE.md` is
  for repo contributors, not plugin context — intentional).
- **Marketplace validate:** passes (validation of the in-tree
  `marketplace.json` is now part of `npm run validate-plugin`).

## Install

```bash
claude plugin install cohrence    # once the marketplace listing is approved
```

Local development:

```bash
git clone https://github.com/HUMBLEF0OL/coherence.git
cd coherence
npm install
npm run build
claude --plugin-dir .
```

Or register the in-tree marketplace and install via the official path:

```bash
claude plugin marketplace add HUMBLEF0OL/coherence
claude plugin install cohrence@cohrence
```

## Upgrade from v1.0.1

In-place patch — no migration required:

```bash
claude plugin update cohrence
```

For users who registered cohrence as a local plugin via `--plugin-dir`,
nothing changes — the new manifest still loads. Users who registered
via a project-scope marketplace from a pre-v1.0.2 commit should run
`claude plugin marketplace update cohrence` to pick up the new
manifest.

`.claude/coherence/` per-project state is preserved across the bump
(DD-118 carry).

## Verification

See the [Verification block](README.md#verification) in the top-level
README for the cosign verify-blob command. Tag-bound regex still
matches `^https://github.com/HUMBLEF0OL/coherence/\.github/workflows/release\.yml@refs/tags/v.*$`.

## What's next

- **M3 follow-through:** submit to the official Anthropic marketplace
  via [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit)
  or [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit).
  v1.0.2 is the first version that should pass automated review.
- **M2:** record real Stage 1 + Stage 2 cassettes against the
  mcp-sentry fixture. Unblocked since v1.0.1 Path C; not yet executed.
- Investigate the mid-session `tests/unit/scripts/render-readme-verification.test.ts`
  load failure (pre-existing, not caused by v1.0.2; needs a
  fresh-clone reproduction).
- Bump `.github/workflows/release.yml` to `actions/checkout@v5` +
  `actions/setup-node@v5` ahead of the Node 20 runner deprecation
  (2026-06-02).
