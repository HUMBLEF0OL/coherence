# Phase 5 — Platform Moves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 5 of the S+ roadmap — six platform moves (S9, C2, S8, S7, S4, S5) on top of Phase 4's `dev`. This phase transforms Coherence from "comprehensive plugin" to "category-defining". Higher risk, structural payoff.

**Architecture:** S9 turns the asserts engine surface into a third-party extension point (npm-package auto-discovery). C2 uses more of Claude Code's plugin surface (skill, agent, output-style, monitor). S8 ships a `npx coherence init` bootstrapper. S7 is a read-only VS Code companion extension. S4 + S5 are coordination (writeup + outreach) — code-light.

**Tech Stack:** TypeScript, npm package discovery, VS Code Extension API, conventional-commits.

**Spec:** [docs/superpowers/specs/2026-05-14-s-plus-roadmap-design.md](../specs/2026-05-14-s-plus-roadmap-design.md) (§ Phase 5 — Platform moves)

**Depends on:** Phases 1–4 landed on `dev`. S9 specifically depends on X2's extension tutorial (Phase 3) being in place — third parties need docs to build engines against.

**Caveat:** S7 (VS Code companion) is High-effort and structurally separate from the main repo. If time runs short, S7 can be deferred to a v1.2.x patch without breaking the v1.1.0 cut — its presence isn't a hard prerequisite for the S+ score.

---

## File Structure

**New files:**
- `src/validation/assertions/loader.ts` — auto-discover `coherence-engine-*` npm packages (S9)
- `tests/unit/validation/assertions/loader.test.ts` (S9)
- `skills/coherence-explain/SKILL.md` — interpret bundle output (C2)
- `agents/coherence-reviewer.md` — subagent for deep review (C2)
- `output-styles/coherence.md` — terse drift-focused output style (C2)
- `monitors/monitors.json` — proposals-watch monitor (C2)
- `packages/coherence-cli/` — separate package for `npx coherence init` (S8)
  - `packages/coherence-cli/package.json`
  - `packages/coherence-cli/bin/coherence.mjs`
  - `packages/coherence-cli/templates/` — anchor + asserts examples
- `packages/vscode-coherence/` — VS Code extension (S7) — separate workspace
  - `packages/vscode-coherence/package.json`
  - `packages/vscode-coherence/src/extension.ts`
- `docs/blog/multi-mode-ux.md` — S4 writeup draft (not published yet)
- `docs/outreach/anthropic-pilot-proposal.md` — S5 outreach draft (private/local)

**Modified files:**
- `src/validation/assertions/index.ts` — call the loader at startup; merge built-in + discovered engines (S9)
- `package.json` (root) — declare workspace if going monorepo for the CLI + VS Code packages
- `.claude-plugin/plugin.json` — declare new `agents`, `skills`, `outputStyles`, `experimental.monitors` paths (C2)

---

## Task 1: C2 — Use more of Claude Code's plugin surface

Lower-effort than S9/S7, sets up the new components first.

### Step 1.1 — Add the `coherence-explain` skill

- [ ] **Step 1: Create `skills/coherence-explain/SKILL.md`**

```markdown
---
description: Read a Coherence bundle (proposals/bundle-*.json) and explain what changed, which sections were touched, and why each patch was deemed safe or quarantined.
disable-model-invocation: false
---

Read the most recent bundle file under `coherence/proposals/`. For each
section in the bundle, summarize:
- The doc file and section ID
- The change class (modifying / destructive / frontmatter)
- The trust score and whether it gated auto-apply
- The asserts engines that fired and their verdicts
- If quarantined, the specific rejection reason

Format the output as a markdown table followed by per-section detail
blocks. Don't repeat the raw JSON — synthesize it.
```

- [ ] **Step 2: Register the skill in `.claude-plugin/plugin.json`**

The default location `skills/` is auto-discovered. No manifest change needed unless we want custom paths.

### Step 1.2 — Add the `coherence-reviewer` agent

- [ ] **Step 3: Create `agents/coherence-reviewer.md`**

```markdown
---
name: coherence-reviewer
description: Specialized reviewer for documentation drift proposals. Reads the bundle, walks the validation chain output, and recommends accept / reject / revise per section based on the asserts engine results and the section's trust history. Use when /coherence:review surfaces ≥3 sections needing a judgment call.
model: sonnet
effort: medium
maxTurns: 30
disallowedTools: Write, Edit
---

You are a documentation-drift reviewer. Your job: read a Coherence
bundle and recommend a disposition per section. You have read-only
access (no Write/Edit) — your output is advice, not action.

For each section in the bundle:

1. Open the affected doc file and read the section in context.
2. Read the proposed patch.
3. Walk the validation chain output (hallucination, asserts, line-ratio,
   etc.). Note any soft-warnings.
4. Read the section's trust history (recent accept/edit/revert events).
5. Recommend one of:
   - ACCEPT (high confidence, low risk)
   - REJECT (asserts failed or content is wrong)
   - REVISE (good direction but the patch needs adjustment — say what)
   - ESCALATE (you can't decide — flag for human review with a reason)

Output: a structured markdown table + per-section justification. No
file edits.
```

### Step 1.3 — Add the `coherence` output style

- [ ] **Step 4: Create `output-styles/coherence.md`**

```markdown
---
description: Terse drift-focused output style. Suppresses preamble, summarizes proposals as bulleted diffs, omits raw JSON unless asked.
---

When responding to coherence-related queries:
- Omit "I'll help you with..." preambles.
- For bundle summaries: one line per section in the format `[STATUS] section-id — file:line — reason`.
- For proposals: show the diff inline, not the JSON envelope.
- For status: a single block of `key: value` lines.
- For errors: state the failed validation hop and the specific reason. No suggestions unless asked.
```

### Step 1.4 — Add the proposals-watch monitor

- [ ] **Step 5: Create `monitors/monitors.json`**

```json
[
  {
    "name": "proposals-watch",
    "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/monitors/proposals-watch.mjs\"",
    "description": "Coherence proposal queue updates",
    "when": "on-skill-invoke:coherence-explain"
  }
]
```

- [ ] **Step 6: Create the monitor implementation**

Create `bin/monitors/proposals-watch.mjs`:

```javascript
#!/usr/bin/env node
/**
 * Tail coherence/proposals/ for new bundle files. Emit one line per
 * arrival so Claude Code surfaces it as a notification.
 */
import { watch } from 'node:fs';
import path from 'node:path';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const proposalsDir = path.join(projectDir, 'coherence', 'proposals');

try {
  watch(proposalsDir, (event, filename) => {
    if (event === 'rename' && filename?.startsWith('bundle-')) {
      console.log(`[proposals-watch] new bundle: ${filename}`);
    }
  });
} catch (err) {
  // proposals dir may not exist yet — exit quietly
  process.exit(0);
}

// Keep alive
setInterval(() => {}, 1 << 30);
```

### Step 1.5 — Update plugin.json to declare experimental.monitors

- [ ] **Step 7: Edit `.claude-plugin/plugin.json`**

Add (or merge into existing):

```json
"experimental": {
  "monitors": "./monitors/monitors.json"
}
```

Skills, agents, and output styles use default discovery — no manifest entry needed unless paths are non-standard.

### Step 1.6 — Verify + commit

- [ ] **Step 8: Validate the plugin**

Run: `claude plugin validate .`
Expected: `✔ Validation passed` (possibly with informational warnings about experimental.monitors — those are OK).

- [ ] **Step 9: Smoke-test discovery**

Run: `claude plugin marketplace add ./ && claude plugin install coherence@coherence --scope local`
Then: `claude plugin details coherence@coherence`
Expected: Inventory shows Skills (1), Agents (1), Hooks (the existing count), MCP (0), output-styles (1).

Clean up:

Run: `claude plugin uninstall coherence@coherence --scope local --yes && claude plugin marketplace remove coherence`

- [ ] **Step 10: Commit C2**

```bash
git add skills/ agents/ output-styles/ monitors/ bin/monitors/ .claude-plugin/plugin.json
git commit -m "feat(plugin-surface): skill + agent + output style + monitor (C2)

Uses more of Claude Code's plugin surface beyond hooks+commands:

  - skills/coherence-explain — interpret a Coherence bundle
  - agents/coherence-reviewer — specialized read-only reviewer for
    multi-section bundles
  - output-styles/coherence — terse drift-focused responses
  - monitors/proposals-watch — notifies when a new bundle lands
    (lazy: starts on first /coherence-explain invocation)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: S9 — Pluggable asserts engines

The asserts engine surface becomes a third-party extension point. Coherence auto-discovers `coherence-engine-*` packages in the project's `node_modules` and merges them with the in-tree engines.

### Step 2.1 — Test-drive the loader

- [ ] **Step 1: Create `tests/unit/validation/assertions/loader.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverEngines } from '../../../../src/validation/assertions/loader.js';

describe('discoverEngines', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'coherence-loader-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('discovers a package whose name matches coherence-engine-*', async () => {
    const pkgDir = path.join(tmp, 'node_modules', 'coherence-engine-spdx');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
      name: 'coherence-engine-spdx',
      main: 'index.mjs',
      version: '1.0.0',
    }));
    writeFileSync(path.join(pkgDir, 'index.mjs'), `
      export const engine = {
        name: 'spdx',
        validate: async () => ({ pass: true }),
      };
    `);

    const engines = await discoverEngines(tmp);
    expect(engines).toHaveLength(1);
    expect(engines[0].name).toBe('spdx');
  });

  it('skips packages whose name does NOT match the prefix', async () => {
    const pkgDir = path.join(tmp, 'node_modules', 'random-package');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'random-package', main: 'index.mjs' }));
    writeFileSync(path.join(pkgDir, 'index.mjs'), `export const engine = { name: 'sneaky', validate: () => ({ pass: true }) };`);

    const engines = await discoverEngines(tmp);
    expect(engines).toEqual([]);
  });

  it('rejects packages with conflicting in-tree engine names', async () => {
    const pkgDir = path.join(tmp, 'node_modules', 'coherence-engine-textpatterns');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'coherence-engine-textpatterns', main: 'index.mjs' }));
    writeFileSync(path.join(pkgDir, 'index.mjs'), `export const engine = { name: 'textPatterns', validate: () => ({ pass: true }) };`);

    const engines = await discoverEngines(tmp);
    // The loader should either error or skip with a warning — pick one and assert it
    expect(engines.find((e) => e.name === 'textPatterns')).toBeUndefined();
  });

  it('returns [] when node_modules is missing', async () => {
    const engines = await discoverEngines(tmp);
    expect(engines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `npx vitest run tests/unit/validation/assertions/loader.test.ts`
Expected: FAIL (module not found).

### Step 2.2 — Implement the loader

- [ ] **Step 3: Create `src/validation/assertions/loader.ts`**

```typescript
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REGISTRY as BUILTIN } from './index.js';

const PREFIX = 'coherence-engine-';

export interface DiscoveredEngine {
  name: string;
  validate: (...args: unknown[]) => Promise<{ pass: boolean; reason?: string }> | { pass: boolean; reason?: string };
  origin: string; // package name
}

export async function discoverEngines(projectRoot: string): Promise<DiscoveredEngine[]> {
  const nodeModules = path.join(projectRoot, 'node_modules');
  if (!existsSync(nodeModules)) return [];

  const candidates = readdirSync(nodeModules).filter((d) => d.startsWith(PREFIX));
  const discovered: DiscoveredEngine[] = [];
  const builtinNames = new Set(Object.keys(BUILTIN));

  for (const pkgName of candidates) {
    const pkgDir = path.join(nodeModules, pkgName);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const entry = pkg.main ?? 'index.js';
    const entryPath = path.join(pkgDir, entry);
    if (!existsSync(entryPath)) continue;

    try {
      const mod = await import(pathToFileURL(entryPath).href);
      const engine = mod.engine;
      if (!engine || typeof engine.validate !== 'function' || typeof engine.name !== 'string') continue;
      if (builtinNames.has(engine.name)) {
        console.warn(`[coherence] skipping ${pkgName}: engine name "${engine.name}" conflicts with built-in`);
        continue;
      }
      discovered.push({ name: engine.name, validate: engine.validate, origin: pkgName });
    } catch (err) {
      console.warn(`[coherence] failed to load ${pkgName}:`, (err as Error).message);
    }
  }

  return discovered;
}
```

- [ ] **Step 4: Tests pass**

Run: `npx vitest run tests/unit/validation/assertions/loader.test.ts`
Expected: PASS (4 tests).

### Step 2.3 — Wire the loader into the validation chain

- [ ] **Step 5: Call `discoverEngines` from the validation entry point**

Edit `src/validation/assertions/applyToPatch.ts` (or wherever the engine registry is consumed). At startup (lazily, once per process), call `discoverEngines(projectRoot)` and merge the result with the in-tree REGISTRY.

- [ ] **Step 6: Update the existing assertions tests if needed**

If any test enumerated the engine count, the new discovery path may add engines depending on the dev environment. Make those tests tolerant or stub out discovery.

- [ ] **Step 7: Document third-party engines**

Update `docs/extensions/how-to-add-an-asserts-engine.md` (created in Phase 3) with a section "Publishing as a npm package":

- Name your package `coherence-engine-<X>`
- Export an `engine` object: `{ name, validate }`
- Publish to npm; users `npm install --save-dev coherence-engine-<X>` in their project
- Coherence auto-discovers on next session

- [ ] **Step 8: Commit S9**

```bash
git add src/validation/assertions/loader.ts tests/unit/validation/assertions/loader.test.ts \
        src/validation/assertions/applyToPatch.ts docs/extensions/how-to-add-an-asserts-engine.md
git commit -m "feat(assertions): pluggable engines via coherence-engine-* npm packages (S9)

Loader walks node_modules for coherence-engine-<X>, loads each via
dynamic import, registers (engine.name, engine.validate). Rejects
packages that conflict with in-tree engine names.

Plugin -> ecosystem. The extension tutorial (X2) gains a 'Publishing
as an npm package' section pointing at this mechanism.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: S8 — `npx coherence init` standalone CLI

Lowers the "how do I start" friction from "install plugin, read 27 commands" to a single command.

### Step 3.1 — Set up a packages/ workspace

- [ ] **Step 1: Decide on monorepo or separate repo**

Recommended: a `packages/coherence-cli/` subdirectory in this repo, wired in via npm workspaces. Keeps everything in one place.

Edit root `package.json` to declare workspaces:

```json
"workspaces": ["packages/*"]
```

(Skip this if Step 1 chose separate repo — that's a separate plan entirely.)

### Step 3.2 — Build the CLI package

- [ ] **Step 2: Scaffold `packages/coherence-cli/`**

```bash
mkdir -p packages/coherence-cli/bin packages/coherence-cli/templates
```

- [ ] **Step 3: Create `packages/coherence-cli/package.json`**

```json
{
  "name": "coherence-init",
  "version": "1.1.0",
  "description": "Bootstrap a fresh repository for Coherence — anchors, asserts examples, .claude-plugin/ install hint.",
  "bin": {
    "coherence-init": "bin/init.mjs"
  },
  "files": ["bin/", "templates/", "README.md"],
  "type": "module",
  "engines": { "node": ">=20" },
  "license": "MIT"
}
```

(The bin name `coherence-init` avoids colliding with the `coherence` plugin slash command; `npx coherence-init` is unambiguous.)

- [ ] **Step 4: Create `packages/coherence-cli/bin/init.mjs`**

```javascript
#!/usr/bin/env node
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(__dirname, '..', 'templates');
const cwd = process.cwd();

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dst, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else if (!existsSync(d)) copyFileSync(s, d);
  }
}

console.log('[coherence-init] bootstrapping in:', cwd);

copyDir(TEMPLATES, cwd);

console.log('\n[coherence-init] done. Next steps:');
console.log('  1. Install the plugin in your Claude Code session:');
console.log('     claude plugin marketplace add HUMBLEF0OL/coherence@v1.1.0');
console.log('     claude plugin install coherence@coherence');
console.log('  2. Open this project in Claude Code and run /coherence:doctor');
console.log('  3. See docs/anchors-quickstart.md for how to mark sections.\n');
```

- [ ] **Step 5: Create templates**

Put these under `packages/coherence-cli/templates/`:

- `docs/anchors-quickstart.md` — minimal doc with a worked anchor example
- `docs/asserts-example.md` — minimal doc with a frontmatter `asserts:` block
- `.gitattributes` — same as the root project's gitattributes
- `coherence/.gitkeep` — empty file so the state dir exists

Keep templates minimal — the goal is "users see a working example", not "users get a Coherence-full repo".

- [ ] **Step 6: Test locally**

```bash
cd packages/coherence-cli
mkdir /tmp/coherence-init-smoke
cd /tmp/coherence-init-smoke
node /path/to/packages/coherence-cli/bin/init.mjs
ls -la
```

Expected: the templates copied into the smoke directory; init.mjs prints the next-steps block.

(Windows equivalent: use `%TEMP%\coherence-init-smoke`.)

- [ ] **Step 7: Commit S8**

```bash
git add packages/coherence-cli/ package.json package-lock.json
git commit -m "feat(cli): \`npx coherence-init\` bootstrapper (S8)

Single-command project bootstrap. Drops anchored doc templates, a
worked asserts: example, .gitattributes, and an empty coherence/ state
directory into the current cwd. Prints the plugin-install commands as
the next step.

Workspace package under packages/coherence-cli/. Published separately
from the main plugin (or together via npm workspaces — open in v1.1.0
plan, decide at publish time).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: S7 — VS Code companion (defer if time-constrained)

The VS Code extension is **structurally separate** from the plugin and lives at `packages/vscode-coherence/`. It's read-only: squiggly lines on stale doc sections, hover tooltips with the drift bundle. No write access.

**Defer if needed**: this is High-effort. If Phases 1–4 + the other Phase 5 moves chew up the time budget, S7 ships in a v1.2.0 patch without breaking the v1.1.0 cut.

### Step 4.1 — Decide whether to ship in v1.1.0

- [ ] **Step 1: Check remaining time budget**

If the maintainer judges S7 won't fit cleanly in the v1.1.0 window, mark it as deferred:

```bash
# Add a stub commit to indicate intent
mkdir -p packages/vscode-coherence
cat > packages/vscode-coherence/README.md <<'EOF'
# vscode-coherence (planned, deferred from v1.1.0)

A read-only VS Code companion for Coherence. Surfaces drift bundle
content inline in the editor: squiggly lines on stale sections, hover
tooltips with the proposal diff.

Deferred from v1.1.0; tracked for a v1.2.x patch. See
[docs/superpowers/specs/2026-05-14-s-plus-roadmap-design.md](../../docs/superpowers/specs/2026-05-14-s-plus-roadmap-design.md)
§ Phase 5 S7.
EOF
git add packages/vscode-coherence/README.md
git commit -m "chore(deferred): scaffold packages/vscode-coherence as a v1.2.x target (S7)

S7 (VS Code companion) judged out of scope for v1.1.0. Stub package
directory + README clarifies intent so it's visible but doesn't block
the v1.1.0 release.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Skip the remaining S7 steps if deferred.

### Step 4.2 — Build the extension (if going ahead in v1.1.0)

- [ ] **Step 2: Scaffold `packages/vscode-coherence/`**

Use `yo code` (Yeoman + VS Code generator), or hand-write the boilerplate. The package needs:
- `package.json` with `engines.vscode`, `contributes.languages`/`contributes.activationEvents`
- `src/extension.ts` with `activate()`
- A diagnostic collection that consumes `coherence/proposals/bundle-*.json` and adds squiggles to the affected source lines
- A hover provider that shows the proposal diff when the cursor is on a stale section

This is genuinely a week+ of work and not productively decomposed into 5-minute steps here. If executing inline, refer to the VS Code Extension API docs and use the [code-server / Continue.dev architecture] as a reference. The output is one PR's worth of code under `packages/vscode-coherence/`.

- [ ] **Step 3: Smoke-test the extension**

`F5` from VS Code in `packages/vscode-coherence/` opens an Extension Development Host. Open a project with a `coherence/proposals/bundle-*.json` present; verify squiggles appear on stale sections, hover shows the proposal diff.

- [ ] **Step 4: Commit S7 (full implementation)**

```bash
git add packages/vscode-coherence/
git commit -m "feat(vscode): read-only Coherence companion extension (S7)

[...detailed body about what the extension does, what API it uses, and
limits — only read-only, no write access...]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: S4 — Multi-mode UX writeup

Code-light: write a blog-post-shaped doc explaining the observe / graduated / annotate / author mode progression.

### Step 5.1 — Draft the writeup

- [ ] **Step 1: Create `docs/blog/multi-mode-ux.md`**

Structure:

```markdown
# A trust gradient for LLM-mediated file edits

## The problem

Most LLM-touching tools are binary: on (it edits your files) or off
(it suggests in chat). Both fail. Off is unhelpful. On is terrifying
on day one of any new tool — you haven't built a trust model, and
neither has the tool.

## The mode progression

Coherence has four modes per directory, plus a global default:

1. **observe** — read-only. Detects drift, never proposes.
2. **graduated** — proposes patches; auto-applies only when the
   per-section trust score is high enough (≥ 0.85).
3. **annotate** — drops `coherence:section` anchors as you edit;
   builds the corpus for the other modes to work against.
4. **author** — signal detectors fire actively, including via
   user-prompt boundaries (not just edits).

You can mix them per directory. Your /docs may be in graduated while
/legacy stays in observe forever.

## Why a gradient beats a switch

[walk through the per-section trust score, how it climbs with accepts
and decays with reverts, how this means the *tool* learns where it's
trustworthy *per piece of content* not just globally]

## Lessons

[what we learned. honest caveats. when to push graduate higher in the gradient earlier than the default]
```

- [ ] **Step 2: Commit S4 draft (not published yet)**

```bash
git add docs/blog/multi-mode-ux.md
git commit -m "docs(blog): draft multi-mode UX writeup (S4)

Draft lives in docs/blog/ — not announced publicly until v1.1.0 ships
and the maintainer has time to polish + cross-post. The repo copy is
the source of truth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: S5 — Anthropic pilot outreach draft

Private/local doc that captures the pitch. Not for the public repo unless the maintainer decides to.

### Step 6.1 — Draft the proposal

- [ ] **Step 1: Create `docs/outreach/anthropic-pilot-proposal.md`**

Structure:

```markdown
# Coherence — pilot proposal for Anthropic-internal docs

> Audience: whoever owns the Claude Code documentation corpus inside
> Anthropic. Goal: a 4-week pilot of Coherence on their own docs
> repository (the same way `vale` / `markdownlint` are typically piloted).

## Why this is mutually beneficial

For Anthropic: zero-cost evaluation of a Claude Code plugin against
their own corpus. Real failure modes surface — better evidence than
synthetic benchmarks.

For Coherence: highest-credibility user. The strongest social proof
the project could earn.

## The pilot

- 4 weeks
- Coherence runs in observe + graduated modes against the Claude Code
  docs repo
- A weekly summary report from the maintainer: bundles generated, P1
  issues encountered, false-positive rate
- No commit access requested. All proposals go to a PR queue Anthropic
  controls.

## What I'm asking for

- A point of contact on the docs team
- Read access to the docs repository (or a fork)
- 30 min of feedback at week 2 and week 4

## What I'm NOT asking for

- Funding
- Endorsement
- Anything that locks Anthropic into a future commitment

## Risks

- The pilot reveals Coherence isn't ready for that scale. Outcome:
  great signal — I fix it.
- Anthropic finds the integration noisy. Outcome: I tune defaults.
- Pilot is rejected. Outcome: no harm; I cite the offer as evidence of
  willingness when pitching elsewhere.

## Next step

Send this proposal via the marketplace submission flow (separate from
the regular plugin review) and via a parallel email to a docs-team
contact if one exists.
```

- [ ] **Step 2: Commit S5 draft**

```bash
git add docs/outreach/anthropic-pilot-proposal.md
git commit -m "docs(outreach): draft Anthropic pilot proposal (S5)

Local-only draft. Sent (or not) at the maintainer's discretion after
v1.1.0 lands. The repo carries the artifact so it's not lost in a chat
buffer; not advertised publicly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 exit

All six Phase 5 moves landed on `dev` (S7 possibly deferred per Task 4 Step 1). No version bump, no tag, no push to master.

Verify:

Run: `npm test && npm run gates`
Expected: All pass. The new asserts loader test, the plugin-validate gate, the autogen-stubs gate all green.

Run: `claude plugin validate .`
Expected: `✔ Validation passed`.

Run: `git status --short`
Expected: Clean.

---

## Self-review

Mapping:
- S9 → Task 2 (loader + wiring + docs update)
- C2 → Task 1 (skill + agent + output-style + monitor)
- S8 → Task 3 (`npx coherence-init` package)
- S7 → Task 4 (full impl or deferred stub)
- S4 → Task 5 (multi-mode UX writeup draft)
- S5 → Task 6 (Anthropic pilot proposal draft)

Ordering: C2 first (lower-effort plugin-surface additions; sets up the agent/skill that other content can reference). S9 second (depends on X2 docs from Phase 3 to be useful). S8 third (CLI bootstrapper; no deps). S7 fourth (gate on time budget). S4 + S5 last (writeups; parallel-safe).

No placeholders for the moves that ship. S7's "full impl" steps are intentionally less granular than the rest because the work is genuinely a separate-plan-shaped effort; the gate decision (defer vs ship) is the part that matters in this plan.
