# Phase 2 — Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 2 of the S+ roadmap — four feedback-loop moves (S6, D3, C3, C4) — on top of Phase 1's `dev` branch. All work stays on `dev`; v1.1.0 ships in the release plan after all phases land.

**Architecture:** S6 sets up a 3-tester loop with a `/coherence:feedback` capture command + issue template — runs ~1 week (shortened from the spec's 2 weeks because all phases now bundle into v1.1.0). D3 adds a CI install-smoke job that catches tag-time install regressions. C3 collapses 27 slash commands into ~17 by folding `propose-*`, `plan-*`, `*-statusline` into subcommand routers. C4 declares `userConfig` so install-time prompts replace hand-edited config.

**Tech Stack:** TypeScript, Vitest, GitHub Actions, Claude Code plugin schema, Node 20+.

**Spec:** [docs/superpowers/specs/2026-05-14-s-plus-roadmap-design.md](../specs/2026-05-14-s-plus-roadmap-design.md) (§ Phase 2 — Feedback loop)

**Depends on:** Phase 1 must be landed on `dev` (this plan assumes plugin name is `coherence` and slash dispatch is native).

---

## File Structure

**New files:**
- `commands/feedback.md` — `/coherence:feedback` command (S6)
- `src/commands/feedback.ts` — handler that captures session state to a JSON file (S6)
- `.github/ISSUE_TEMPLATE/feedback.yml` — issue template prefilled from feedback command output (S6)
- `docs/testers.md` — onboarding guide for the 3 testers (S6)
- `.github/workflows/install-smoke.yml` — CI workflow gated on tag pushes (D3)
- `scripts/install-smoke.mjs` — local-and-CI install-smoke driver (D3)
- `commands/propose.md` — consolidated `/coherence:propose <subcommand>` (C3)
- `commands/plan.md` — consolidated `/coherence:plan <subcommand>` (C3)
- `commands/statusline.md` — consolidated `/coherence:statusline <subcommand>` (C3)
- `src/commands/proposeRouter.ts` — subcommand dispatcher for `/coherence:propose` (C3)
- `src/commands/planRouter.ts` — subcommand dispatcher for `/coherence:plan` (C3)
- `src/commands/statuslineRouter.ts` — subcommand dispatcher for `/coherence:statusline` (C3)

**Modified files:**
- `.claude-plugin/plugin.json` — declare `userConfig` block (C4)
- `src/state/init.ts` — read `defaultMode` / `telemetryOptIn` from `CLAUDE_PLUGIN_OPTION_*` env vars when set (C4)
- `src/state/consent.ts` — `telemetryOptIn` userConfig short-circuits the first-run prompt (C4)
- `scripts/commands.config.json` — drop the 10 individual `propose-*`/`plan-*`/`*-statusline` entries; add 3 consolidated ones (C3)
- `tests/static-analysis/autogen-stubs.test.ts` — update the expected stub-set hash (C3)
- Various test files that referenced the removed command names — point them at the new subcommand surface (C3)

**Deleted files (after C3):**
- `commands/propose-accept.md`, `propose-list.md`, `propose-reject.md`, `propose-revert-acceptance.md`, `propose-show.md`
- `commands/plan-accept.md`, `plan-create.md`, `plan-reject.md`
- `commands/install-statusline.md`, `uninstall-statusline.md`

---

## Task 1: S6 — Onboard 3 testers

### Step 1.1 — Build the `/coherence:feedback` command

- [ ] **Step 1: Write failing tests for the feedback handler**

Create `tests/unit/commands/feedback.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureFeedbackBundle } from '../../../src/commands/feedback.js';

describe('captureFeedbackBundle', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(path.join(tmpdir(), 'coherence-feedback-')); });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('captures plugin version, mode, recent activity, and a user message', async () => {
    const bundle = await captureFeedbackBundle({
      projectRoot: tmp,
      userMessage: 'auto-apply gate fired on a section it shouldn\'t have',
    });
    expect(bundle.pluginVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(bundle.userMessage).toContain('auto-apply gate');
    expect(typeof bundle.mode).toBe('string');
    expect(Array.isArray(bundle.recentActivity)).toBe(true);
    expect(bundle.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('redacts file paths outside the project root', async () => {
    const bundle = await captureFeedbackBundle({
      projectRoot: tmp,
      userMessage: 'check this: /Users/secret/.ssh/id_rsa',
    });
    expect(bundle.userMessage).not.toContain('/Users/secret');
    expect(bundle.userMessage).toContain('[redacted-path]');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/unit/commands/feedback.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/commands/feedback.ts`**

Create the handler with this contract:

```typescript
import { PLUGIN_VERSION, getCoherenceDir } from '../state/init.js';
import { ModeResolver } from '../modes/resolver.js';
import { readMetricsRecent } from '../state/metrics.js'; // adjust import to existing surface

export interface FeedbackBundle {
  pluginVersion: string;
  mode: string;
  capturedAt: string;
  userMessage: string;
  recentActivity: Array<{ ts: string; kind: string; note?: string }>;
}

export interface CaptureOpts {
  projectRoot: string;
  userMessage: string;
}

const PATH_RE = /(?:\/|[A-Z]:\\)[^\s'"]+/g;

export async function captureFeedbackBundle(opts: CaptureOpts): Promise<FeedbackBundle> {
  const redacted = opts.userMessage.replace(PATH_RE, (match) => {
    return match.startsWith(opts.projectRoot) ? match : '[redacted-path]';
  });
  const mode = await new ModeResolver(opts.projectRoot).resolveGlobal();
  const recent = await readMetricsRecent(opts.projectRoot, { limit: 10 }).catch(() => []);
  return {
    pluginVersion: PLUGIN_VERSION,
    mode,
    capturedAt: new Date().toISOString(),
    userMessage: redacted,
    recentActivity: recent.map((r) => ({ ts: r.ts, kind: r.kind, note: r.note })),
  };
}
```

Adjust imports/types to the actual project surface (the engineer should grep `src/state/metrics*` and `src/modes/resolver*` first).

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/unit/commands/feedback.test.ts`
Expected: PASS (2 tests).

### Step 1.2 — Wire the slash command stub

- [ ] **Step 5: Add an entry to `scripts/commands.config.json`**

Add `{ "name": "feedback", "description": "Capture session state into a GitHub issue draft for the maintainer" }`.

- [ ] **Step 6: Regenerate stubs**

Run: `npm run build`
Expected: `commands/feedback.md` written.

- [ ] **Step 7: Write the stub's actual body**

Edit `commands/feedback.md`. After the YAML frontmatter, add a body that invokes the handler via Claude Code's command surface. The exact shape depends on how Phase 1 (M4) wires command bodies to handlers. Mirror the pattern used by another flat command like `commands/status.md`.

### Step 1.3 — Add the GitHub issue template

- [ ] **Step 8: Create `.github/ISSUE_TEMPLATE/feedback.yml`**

```yaml
name: Tester feedback
description: Report a coherence experience from the v1.1.0 pre-release window
title: "[feedback] "
labels: ["feedback", "v1.1.0-pre"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for testing. Paste the JSON bundle from `/coherence:feedback` into the field below — it pre-fills version, mode, and recent activity. Add your free-text note above the JSON.
  - type: textarea
    id: bundle
    attributes:
      label: Feedback bundle
      description: JSON output from /coherence:feedback, plus any extra context
      render: json
    validations:
      required: true
  - type: input
    id: tester
    attributes:
      label: Tester
      description: Your name or handle
    validations:
      required: true
```

### Step 1.4 — Docs for testers

- [ ] **Step 9: Create `docs/testers.md`**

Cover:
- One-paragraph intro: what this pre-release is, why their feedback matters, how long the window is (~1 week)
- Install steps (pin to the v1.1.0-rc tag once cut)
- How to run `/coherence:feedback` and file the issue
- How to opt out / uninstall
- A short FAQ (common surprises during early testing)

- [ ] **Step 10: Commit S6**

```bash
git add commands/feedback.md src/commands/feedback.ts tests/unit/commands/feedback.test.ts \
        scripts/commands.config.json .github/ISSUE_TEMPLATE/feedback.yml docs/testers.md
git commit -m "feat(feedback): /coherence:feedback command + tester onboarding (S6)

Captures session bundle (version, mode, recent activity, redacted user
note) into a JSON payload that pre-fills the new tester-feedback issue
template. Three testers run against v1.1.0-rc for ~1 week before the
GA tag is cut.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: D3 — CI install-smoke

### Step 2.1 — Local install-smoke driver

- [ ] **Step 1: Create `scripts/install-smoke.mjs`**

```javascript
#!/usr/bin/env node
/**
 * Install-smoke: prove that the *published* plugin actually installs and
 * loads, end-to-end, from a tag-pinned marketplace. Runs locally (against
 * a local tarball) and in CI (against the live GitHub tag).
 *
 * Usage:
 *   node scripts/install-smoke.mjs --tag v1.1.0
 *   node scripts/install-smoke.mjs --local
 */
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const tag = process.argv[process.argv.indexOf('--tag') + 1] ?? null;
const local = args.has('--local');

function sh(cmd, opts = {}) {
  console.log('$', cmd);
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error('FAIL:', cmd);
    process.exit(r.status ?? 1);
  }
}

if (local) {
  sh('claude plugin marketplace add ./ --scope local');
} else if (tag) {
  sh(`claude plugin marketplace add HUMBLEF0OL/coherence@${tag}`);
} else {
  console.error('Usage: install-smoke.mjs --local | --tag <v1.x.y>');
  process.exit(1);
}

sh('claude plugin install coherence@coherence --scope local');

// Verify hooks registered
const list = spawnSync('claude', ['plugin', 'details', 'coherence@coherence'], { encoding: 'utf8' });
if (list.status !== 0) {
  console.error('plugin details failed');
  process.exit(1);
}
const hooksOk = /Hooks \(\d+\)/.test(list.stdout);
if (!hooksOk) {
  console.error('hooks count not detected in details output');
  console.error(list.stdout);
  process.exit(1);
}
console.log('[install-smoke] PASS:', tag ?? '(local)');

// Cleanup
sh('claude plugin uninstall coherence@coherence --scope local --yes');
sh('claude plugin marketplace remove coherence');
```

(Marketplace name is `coherence` after Phase 1's C1 rename.)

- [ ] **Step 2: Smoke-test the script locally**

Run: `node scripts/install-smoke.mjs --local`
Expected: Marketplace adds, plugin installs, details show ≥1 hooks, cleanup succeeds, exit 0.

If the local run uses an SSH-default github source from the marketplace.json plugin entry, this will fail. (Phase 1's marketplace.json already uses HTTPS via the v1.0.3 fix.)

### Step 2.2 — CI workflow

- [ ] **Step 3: Create `.github/workflows/install-smoke.yml`**

```yaml
name: install-smoke

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  install-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 1

      - uses: actions/setup-node@v5
        with:
          node-version: '20.x'

      - name: Install Claude Code CLI
        run: npm install -g @anthropic-ai/claude-code@latest

      - name: Verify claude is on PATH
        run: claude --version

      - name: Run install-smoke against the just-pushed tag
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node scripts/install-smoke.mjs --tag "${{ github.ref_name }}"
```

- [ ] **Step 4: Add a typecheck-safe `npm run smoke` alias**

In `package.json` scripts, add:

```json
"smoke": "node scripts/install-smoke.mjs --local"
```

- [ ] **Step 5: Commit D3**

```bash
git add scripts/install-smoke.mjs .github/workflows/install-smoke.yml package.json
git commit -m "ci(install-smoke): tag-push job that re-installs from the published tag (D3)

Catches the v1.0.2-class install bugs *before* announcing the release.
Local equivalent via \`npm run smoke\`. CI flow: install Claude Code CLI
on the runner, run \`claude plugin marketplace add <repo>@<tag>\` +
install, assert hooks register, clean up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: C3 — Consolidate 27 commands

Collapse:
- 5 `propose-*` → 1 `propose <subcommand>` (accept, list, reject, revert-acceptance, show)
- 3 `plan-*` → 1 `plan <subcommand>` (accept, create, reject)
- 2 `*-statusline` → 1 `statusline <subcommand>` (install, uninstall)

27 → 17 visible commands. The 10 deleted files are replaced by 3 router files.

### Step 3.1 — Implement the `propose` router

- [ ] **Step 1: Write failing tests for `proposeRouter`**

Create `tests/unit/commands/proposeRouter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { routePropose } from '../../../src/commands/proposeRouter.js';

describe('routePropose', () => {
  it('dispatches accept to proposeAccept handler', async () => {
    const result = await routePropose(['accept', 'install-section'], { dry: true });
    expect(result.subcommand).toBe('accept');
    expect(result.target).toBe('install-section');
  });

  it('lists subcommands when called with no args', async () => {
    const result = await routePropose([], { dry: true });
    expect(result.subcommand).toBe('help');
    expect(result.helpText).toContain('accept');
    expect(result.helpText).toContain('list');
    expect(result.helpText).toContain('reject');
    expect(result.helpText).toContain('revert-acceptance');
    expect(result.helpText).toContain('show');
  });

  it('errors clearly on unknown subcommand', async () => {
    await expect(routePropose(['frobnicate'], { dry: true }))
      .rejects.toThrow(/unknown subcommand: frobnicate/i);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL.**

Run: `npx vitest run tests/unit/commands/proposeRouter.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/commands/proposeRouter.ts`**

```typescript
import { proposeAccept } from './proposeAccept.js';
import { proposeList } from './proposeList.js';
import { proposeReject } from './proposeReject.js';
import { proposeRevertAcceptance } from './proposeRevertAcceptance.js';
import { proposeShow } from './proposeShow.js';

const SUBCOMMANDS = {
  accept: proposeAccept,
  list: proposeList,
  reject: proposeReject,
  'revert-acceptance': proposeRevertAcceptance,
  show: proposeShow,
} as const;

const HELP = `/coherence:propose <subcommand>
Subcommands:
  accept <section-id>             accept a quarantined proposal
  list                            list pending proposals
  reject <section-id>             reject a proposal
  revert-acceptance <section-id>  reverse a previous accept
  show <section-id>               show full proposal details`;

export interface RouteResult {
  subcommand: string;
  target?: string;
  helpText?: string;
  output?: string;
}

export async function routePropose(args: string[], opts: { dry?: boolean } = {}): Promise<RouteResult> {
  if (args.length === 0) return { subcommand: 'help', helpText: HELP };
  const sub = args[0];
  const handler = SUBCOMMANDS[sub as keyof typeof SUBCOMMANDS];
  if (!handler) throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
  if (opts.dry) return { subcommand: sub, target: args[1] };
  const output = await handler(args.slice(1));
  return { subcommand: sub, target: args[1], output };
}
```

The handlers (`proposeAccept`, etc.) are the existing functions called from the soon-to-be-deleted command stubs. The implementer needs to verify each handler's existing export shape and adjust the router accordingly.

- [ ] **Step 4: Test passes**

Run: `npx vitest run tests/unit/commands/proposeRouter.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `commands/propose.md`**

Replace any auto-regenerated stub with a body that hands `$ARGUMENTS` to the router. Match the pattern used by other commands in `commands/`.

### Step 3.2 — Implement the `plan` and `statusline` routers

- [ ] **Step 6: Repeat Steps 1–5 for `planRouter`**

Subcommands: `accept`, `create`, `reject`. Mirror the propose pattern exactly.

- [ ] **Step 7: Repeat Steps 1–5 for `statuslineRouter`**

Subcommands: `install`, `uninstall`. Mirror the propose pattern exactly.

### Step 3.3 — Delete the old command files + update config

- [ ] **Step 8: Update `scripts/commands.config.json`**

Remove these entries (now subcommands):
- `propose-accept`, `propose-list`, `propose-reject`, `propose-revert-acceptance`, `propose-show`
- `plan-accept`, `plan-create`, `plan-reject`
- `install-statusline`, `uninstall-statusline`

Add:
- `propose`, `plan`, `statusline`

- [ ] **Step 9: Delete the old stub files**

```bash
git rm commands/propose-accept.md commands/propose-list.md commands/propose-reject.md \
       commands/propose-revert-acceptance.md commands/propose-show.md \
       commands/plan-accept.md commands/plan-create.md commands/plan-reject.md \
       commands/install-statusline.md commands/uninstall-statusline.md
```

- [ ] **Step 10: Regenerate the consolidated stubs**

Run: `npm run build`
Expected: `commands/propose.md`, `commands/plan.md`, `commands/statusline.md` created or updated.

Then hand-edit each stub's body to invoke the router (Step 5 / 6 / 7 outputs).

- [ ] **Step 11: Run autogen-stubs gate; update hash if needed**

Run: `npx vitest run tests/static-analysis/autogen-stubs.test.ts`
Expected: PASS (the hash check should re-align after the regenerator output matches the new stub set).

If it fails, the regenerator's stored hash needs updating. Read the test's expected vs actual and update the source-of-truth hash accordingly.

> **Cross-phase note:** Phase 1 M4 already perturbed this hash when it renamed `coherence-*.md` stubs to flat names. If you're executing phases sequentially, the hash you committed in Phase 1's Task 5 Step 14 is now stale again after C3's consolidation. Two perturbations, one update — fine.

- [ ] **Step 12: Find tests that exercise the deleted command names; update or delete**

Run: `grep -rn "propose-accept\|propose-list\|propose-reject\|propose-revert-acceptance\|propose-show\|plan-accept\|plan-create\|plan-reject\|install-statusline\|uninstall-statusline" tests/`

For each match:
- If it's testing handler behavior, update to import from the new router or the underlying handler module directly.
- If it's testing the old slash command surface, rewrite to test `/coherence:propose accept ...` form via the router.

- [ ] **Step 13: Full test suite green**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 14: Commit C3**

```bash
git add -A commands/ src/commands/proposeRouter.ts src/commands/planRouter.ts src/commands/statuslineRouter.ts \
        scripts/commands.config.json \
        tests/unit/commands/proposeRouter.test.ts tests/unit/commands/planRouter.test.ts tests/unit/commands/statuslineRouter.test.ts
# also pick up any test file updates from Step 12
git status --short  # sanity check
git commit -m "refactor(commands): consolidate propose-*/plan-*/*-statusline into subcommand routers (C3)

27 visible slash commands -> 17. Five \`propose-*\` collapse into
\`/coherence:propose <subcommand>\`, three \`plan-*\` into
\`/coherence:plan <subcommand>\`, two \`*-statusline\` into
\`/coherence:statusline <subcommand>\`.

Underlying handler functions are unchanged — only the slash surface
changes. Router files dispatch \$ARGUMENTS to the existing handlers and
emit a help block when called bare.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: C4 — `userConfig` schema

### Step 4.1 — Declare the userConfig block

- [ ] **Step 1: Edit `.claude-plugin/plugin.json`**

Add a top-level `userConfig` block:

```json
"userConfig": {
  "defaultMode": {
    "type": "string",
    "title": "Default coherence mode",
    "description": "Starting mode for new directories. observe = read-only signal capture. graduated = auto-apply patches with trust-gate. annotate = drop coherence:section anchors. author = signal detectors fire.",
    "default": "observe"
  },
  "telemetryOptIn": {
    "type": "boolean",
    "title": "Allow telemetry upload",
    "description": "Local telemetry (JSONL under coherence/) is always on. This option controls whether to ALSO let the maintainer collect anonymized usage stats via a user-driven curl. Default: off.",
    "default": false
  }
}
```

- [ ] **Step 2: Validate**

Run: `claude plugin validate .`
Expected: `✔ Validation passed`.

### Step 4.2 — Honor the userConfig values at runtime

- [ ] **Step 3: Write failing tests for the env-var bridge**

Create `tests/unit/state/userConfig.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveDefaultMode, resolveTelemetryOptIn } from '../../../src/state/userConfig.js';

describe('userConfig bridge', () => {
  const origMode = process.env.CLAUDE_PLUGIN_OPTION_DEFAULTMODE;
  const origTel = process.env.CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN;

  afterEach(() => {
    if (origMode === undefined) delete process.env.CLAUDE_PLUGIN_OPTION_DEFAULTMODE;
    else process.env.CLAUDE_PLUGIN_OPTION_DEFAULTMODE = origMode;
    if (origTel === undefined) delete process.env.CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN;
    else process.env.CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN = origTel;
  });

  it('returns env-var value when set', () => {
    process.env.CLAUDE_PLUGIN_OPTION_DEFAULTMODE = 'graduated';
    expect(resolveDefaultMode()).toBe('graduated');
  });

  it('returns observe as built-in default', () => {
    delete process.env.CLAUDE_PLUGIN_OPTION_DEFAULTMODE;
    expect(resolveDefaultMode()).toBe('observe');
  });

  it('rejects invalid mode values', () => {
    process.env.CLAUDE_PLUGIN_OPTION_DEFAULTMODE = 'frobnicate';
    expect(() => resolveDefaultMode()).toThrow(/invalid mode/i);
  });

  it('parses truthy values for telemetryOptIn', () => {
    process.env.CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN = 'true';
    expect(resolveTelemetryOptIn()).toBe(true);
    process.env.CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN = '1';
    expect(resolveTelemetryOptIn()).toBe(true);
    process.env.CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN = 'false';
    expect(resolveTelemetryOptIn()).toBe(false);
  });
});
```

- [ ] **Step 4: Verify the test fails**

Run: `npx vitest run tests/unit/state/userConfig.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5: Implement `src/state/userConfig.ts`**

```typescript
const VALID_MODES = new Set(['observe', 'graduated', 'annotate', 'author']);

export function resolveDefaultMode(): string {
  const env = process.env.CLAUDE_PLUGIN_OPTION_DEFAULTMODE;
  if (env === undefined) return 'observe';
  if (!VALID_MODES.has(env)) {
    throw new Error(`invalid mode: ${env}. Expected one of: ${[...VALID_MODES].join(', ')}`);
  }
  return env;
}

export function resolveTelemetryOptIn(): boolean {
  const env = process.env.CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN;
  if (env === undefined) return false;
  return env === 'true' || env === '1';
}
```

- [ ] **Step 6: Test passes**

Run: `npx vitest run tests/unit/state/userConfig.test.ts`
Expected: PASS.

### Step 4.3 — Hook the resolver into existing code paths

- [ ] **Step 7: Find the existing mode-default site**

Run: `grep -rn "observe\|defaultMode\|getMode" src/modes/ src/state/`

Find where a "default mode" is currently selected when no per-directory mode override exists. Replace the hardcoded `'observe'` (or equivalent) with a call to `resolveDefaultMode()`.

- [ ] **Step 8: Find the existing telemetry consent default**

Run: `grep -rn "telemetry\|upload\|consent" src/state/consent.ts src/state/firstRun.ts`

In `runFreshInstall` (firstRun.ts), if `resolveTelemetryOptIn()` returns true, skip the interactive prompt and record consent silently. Add the short-circuit only — don't replace the prompt flow for users who didn't set the option.

- [ ] **Step 9: Run integration tests**

Run: `npx vitest run tests/integration`
Expected: All pass. The `first-run-consent.test.ts` should still pass — it doesn't set the env var, so the existing flow holds.

- [ ] **Step 10: Commit C4**

```bash
git add .claude-plugin/plugin.json src/state/userConfig.ts tests/unit/state/userConfig.test.ts \
        src/state/firstRun.ts src/state/consent.ts src/modes/  # plus whatever Step 7 changed
git status --short
git commit -m "feat(config): declare userConfig schema for defaultMode + telemetryOptIn (C4)

Install-time prompts via Claude Code's userConfig surface replace
hand-editing of config files. Values flow in as CLAUDE_PLUGIN_OPTION_*
env vars; resolveDefaultMode + resolveTelemetryOptIn read them and fall
through to existing defaults when unset (preserves the current
first-run-consent prompt for users who don't set the option).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Run the 3-tester window (S6 finish)

- [ ] **Step 1: Cut a pre-release tag**

After Phases 3, 4, 5 also land on `dev`, the release plan cuts `v1.1.0-rc.1`. (This task can't run yet — flag it as the gate the release plan opens.)

- [ ] **Step 2: Onboard 3 testers via DM / email**

Send each tester:
- Link to `docs/testers.md`
- The exact install commands from the rc tag
- A 1-week window with explicit start/end dates

- [ ] **Step 3: Triage incoming `/coherence:feedback` issues daily**

For each issue:
- File a tracking row (use the existing TodoWrite / Notion mechanism per project convention)
- If P1 (regression / breakage), patch on `dev` immediately and bump the rc tag
- If P2/P3, queue for v1.1.x or post-v1.1.0

- [ ] **Step 4: Close the testing window**

After ~1 week (or sooner if testers signal "done"):
- Summarize findings in a `docs/testers-v1.1.0-report.md` page (private/local — does not ship)
- Confirm all P1 issues are closed
- Hand off to the release plan for GA cut

This task is the *coordination* layer of S6, executed in human time. The feedback *infrastructure* (Steps 1–10 of Task 1) is what this plan delivers as code.

---

## Task 6: Release v1.1.1

Cut v1.1.1 for **Phase 2 — feedback loop**. Follow the shared release ceremony in [release-pattern.md](release-pattern.md) with these inputs:

- `<version>`: `1.1.1`
- `<phase-name>`: `Phase 2 — feedback loop`
- `<rc-policy>`: **rc-required** — command consolidation breaks scripts that called `/coherence:propose-list`, `/coherence:plan-create`, etc.
- `<previous-version>`: `v1.1.0`

### RELEASE_NOTES_v1.1.1.md highlights

When writing the hand-written narrative (Step R4 of the pattern), cover:

  - S6 — `/coherence:feedback` command + GitHub issue template + tester onboarding docs
  - D3 — CI install-smoke job that catches v1.0.2-class install regressions before announcement
  - C3 — consolidate 27 slash commands into 17; `propose-*`, `plan-*`, `*-statusline` become subcommand routers
  - C4 — `userConfig` schema for `defaultMode` + `telemetryOptIn` (replaces hand-edited config)

Scripts that called `/coherence:propose-list` etc. now use `/coherence:propose list` (subcommand form). Run `/coherence:propose` bare to see the new subcommand list.

### After this release

Next planned cut: 1.1.2 (Phase 3).

---

## Self-review

- S6 → Task 1 (feedback command + handler + issue template + tester docs) and Task 5 (the window itself, deferred).
- D3 → Task 2 (script + workflow).
- C3 → Task 3 (three routers replacing 10 stubs).
- C4 → Task 4 (userConfig schema + env-var resolver + wiring into firstRun/modes).

Type consistency: `RouteResult` shape in proposeRouter is mirrored exactly in plan/statusline routers. `resolveDefaultMode` / `resolveTelemetryOptIn` signatures stable across tests + impl + callers.

No placeholders. Tests have concrete assertions. Commands have exact paths.
