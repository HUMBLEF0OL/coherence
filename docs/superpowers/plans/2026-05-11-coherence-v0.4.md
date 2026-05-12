# Coherence v0.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the official Anthropic marketplace listing structural requirements, first-impressions ergonomics polish, telemetry-gated trigger contracts, and the `parseMajor` correctness fix — all as v0.4.0.

**Architecture:** Six sequential milestones (M0→M5) on the v0.3.0 substrate. M0 relocates the plugin manifest to satisfy the official plugin schema; M1 fixes the `parseMajor` formula and adds the layout-refusal guard; M2 wires telemetry-gated trigger contracts into SessionStart; M3 ships `/coherence:consent` and `/coherence:audit` commands with the `--out` path sandbox fix; M4 autogenerates slash-command stubs and wires sentinel dispatch in UserPromptSubmit; M5 extends static-analysis gates and rewires the release pipeline.

**Tech Stack:** TypeScript, Node.js, Vitest, Zod (schema validation), Claude Code plugin manifest v0.4 (`.claude-plugin/plugin.json`). Zero new LLM calls — all v0.4 work is build-time scripts, hook amendments, and file-local commands.

**Source corpus:** [TS-1](https://www.notion.so/35d010d46a7081f3a174efe4913bfaf2) · [TS-2](https://www.notion.so/35d010d46a70811b96e8c195af1ef7c6) · [TS-3](https://www.notion.so/35d010d46a7081ae9273c6c6f8d63e74) · [TS-5](https://www.notion.so/35d010d46a708193abc8e76bd0a78c19) · [TS-6](https://www.notion.so/35d010d46a70813e886ee082e0e10710) · [TS-7](https://www.notion.so/35d010d46a7081279cd4ed3b199947e0) · [TS-8](https://www.notion.so/35d010d46a70813384d4c3500ca82116) · [v0.4 Overview](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · DD-119..DD-130

---

## File structure

**New files:**
- `.claude-plugin/plugin.json` — relocated manifest (was `plugin.json` at plugin root)
- `scripts/validate-plugin.mjs` — thin wrapper: `claude plugin validate`
- `scripts/generate-command-stubs.mjs` — autogen `commands/<name>.md` stubs from manifest
- `src/state/triggerContracts.ts` — TC-1/TC-2 one-time hint evaluation (DD-129)
- `src/commands/consent.ts` — `/coherence:consent` read/write (DD-127)
- `src/commands/audit.ts` — `/coherence:audit` bundling-only report (DD-125)
- `src/hooks/commandDispatch.ts` — sentinel-based command routing (DD-130)
- `tests/unit/state/refuse-layout.test.ts` — M-LAYOUT-1 unit tests
- `tests/unit/commands/recover-parse-major.test.ts` — M-PARSEMAJOR-1 unit tests
- `tests/unit/state/trigger-contracts.test.ts` — M-TRIGGER-1 unit tests
- `tests/integration/consent.test.ts` — M-CONSENT-1 integration tests
- `tests/integration/audit.test.ts` — M-AUDIT-1 integration tests
- `tests/ship/validate-gate-trip.test.ts` — M-VALIDATE-1 meta-test
- `tests/static-analysis/autogen-stubs.test.ts` — M-AUTOGEN-1 static-analysis test

**Modified files:**
- `plugin.json` — **deleted** after move to `.claude-plugin/plugin.json`
- `src/state/refuseLegacy.ts` — add `refuse_layout` discriminant + `refuseLayout()` function
- `src/hooks/sessionStart.ts` — insert Step 1b (refuseLayout) + Step 2b (trigger contracts)
- `src/commands/recover.ts` — fix `parseMajor()` to use major digit only
- `src/commands/exportMetrics.ts` — harden `--out` path sandboxing (always-on, not just on mkdirSync)
- `src/state/consent.ts` — inline `promptInteractive` body at its call site then delete the function definition
- `src/state/firstRun.ts` — add `${CLAUDE_PLUGIN_DATA}` directory creation
- `src/hooks/userPromptSubmit.ts` — insert sentinel detection block
- `package.json` — add `validate-plugin` script, amend `build` script, bump version to `0.4.0`
- `.gitignore` — add `commands/` and `.coherence-stub-hash`
- `scripts/release-ga.mjs` — add `assertVersionSync` + `validate-plugin` step before `gates`
- `tests/static-analysis/no-cross-dev-leak.test.ts` — add tri-partition tier enforcement (M-TRIPLEX-1)
- `tests/ship/tarball-shape.test.ts` — assert `.claude-plugin/plugin.json` present, root `plugin.json` absent

---

## Task 1: M0 — Manifest relocation + validate gate

**Goal:** Move `plugin.json` to `.claude-plugin/plugin.json`, populate FR-MANIFEST-4 fields, add the `claude plugin validate` script, add `assertVersionSync` to the release pipeline, and ship the validate-gate meta-test.

**Gates closed:** M-VALIDATE-1 (stub), M-SEMVER-1 (stub in release script)

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `scripts/validate-plugin.mjs`
- Create: `tests/ship/validate-gate-trip.test.ts`
- Delete: `plugin.json` (root)
- Modify: `package.json`
- Modify: `scripts/release-ga.mjs`
- Modify: `tests/ship/tarball-shape.test.ts`

---

- [ ] **Step 1: Search for any `src/` code that loads `plugin.json` by path**

```bash
grep -r "plugin.json" src/ --include="*.ts" -l
```

Expected: a list of files (possibly empty). Open each hit and note the exact path string used. You will update these in Step 4. If the list is empty, proceed; no source patches needed.

- [ ] **Step 2: Write the failing validate-gate meta-test**

Create `tests/ship/validate-gate-trip.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import path from 'path';

const PLUGIN_DIR = path.resolve(process.cwd(), '.claude-plugin');

describe('M-VALIDATE-1 meta-test', () => {
  it('exits non-zero when .claude-plugin/plugin.json has a missing required field', async () => {
    const manifestPath = path.join(PLUGIN_DIR, 'plugin.json');
    const backup = manifestPath + '.bak';

    // The .claude-plugin/ dir does not exist until M0 creates it.
    if (!existsSync(PLUGIN_DIR)) {
      throw new Error('.claude-plugin/ not found — complete M0 (manifest relocation) before running this test');
    }

    const original = readFileSync(manifestPath, 'utf8');
    writeFileSync(backup, original);

    try {
      // Write a broken manifest (missing required "name" field)
      writeFileSync(manifestPath, JSON.stringify({ version: '0.4.0' }, null, 2));
      const result = spawnSync('npm', ['run', 'validate-plugin'], {
        stdio: 'pipe',
        shell: true,
      });
      expect(result.status).not.toBe(0); // gate must trip on missing required field
    } finally {
      writeFileSync(manifestPath, original);
      rmSync(backup, { force: true });
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails (expected)**

```bash
npx vitest run tests/ship/validate-gate-trip.test.ts
```

Expected: **FAIL** — `.claude-plugin/` doesn't exist yet, test logs `existsSync` failure.

- [ ] **Step 4: Create `.claude-plugin/` and move `plugin.json`**

Create the directory, then write `.claude-plugin/plugin.json` with all FR-MANIFEST-4 fields. Do **not** include a `bin` field. Remove the `bin/` field that `plugin.json` may have had:

```json
{
  "name": "cohrence",
  "version": "0.3.0",
  "description": "Detects documentation-vs-code drift and proposes surgical patches",
  "author": "HUMBLEF0OL <123amitrana0123@gmail.com>",
  "license": "MIT",
  "repository": "github.com/HUMBLEF0OL/coherence",
  "keywords": ["claude-code", "plugin", "documentation", "drift-detection", "coherence"],
  "min_claude_code_version": "2.0.0",
  "main": "./dist/index.js",
  "hooks": {
    "SessionStart":      { "handler": "hooks/sessionStart" },
    "PostToolUse":       { "handler": "hooks/postToolUse" },
    "UserPromptSubmit":  { "handler": "hooks/userPromptSubmit" },
    "SubagentStop":      { "handler": "hooks/subagentStop" },
    "Stop":              { "handler": "hooks/stop" },
    "SessionEnd":        { "handler": "hooks/sessionEnd" },
    "PreCompact":        { "handler": "hooks/preCompact" }
  },
  "slashCommands": [
    { "name": "coherence:status",                "description": "Show current coherence state: buffer, recent activity, subagent stats, velocity, cost",                   "handler": "commands/status" },
    { "name": "coherence:review",                "description": "Run the coherence pipeline mid-session against the current buffer",                                        "handler": "commands/review" },
    { "name": "coherence:repair",                "description": "Fix anchor collisions, schema drift, buffer corruption, pending.md mismatches",                           "handler": "commands/repair" },
    { "name": "coherence:recover",               "description": "Clear quarantine, reset locks, drop progress files, remove auto-disable sentinel",                        "handler": "commands/recover" },
    { "name": "coherence:doctor",                "description": "Probe host capabilities and write host-capabilities.json",                                                "handler": "commands/doctor" },
    { "name": "coherence:graduate",              "description": "Toggle between Observe and Graduated mode",                                                               "handler": "commands/graduate" },
    { "name": "coherence:enable-sidecars",       "description": "Provision sidecar YAML files for skills/agents when host strips unknown frontmatter",                    "handler": "commands/enableSidecars" },
    { "name": "coherence:share-metrics",         "description": "Write anonymized metrics to a user-chosen file path",                                                    "handler": "commands/shareMetrics" },
    { "name": "coherence:propose-list",          "description": "List queued and surfaced v0.2 proposals (DD-081)",                                                        "handler": "commands/proposeList" },
    { "name": "coherence:propose-show",          "description": "Show a single proposal by id (DD-081)",                                                                   "handler": "commands/proposeShow" },
    { "name": "coherence:propose-accept",        "description": "Accept a proposal and materialise it under .claude/ (DD-082)",                                           "handler": "commands/proposeAccept" },
    { "name": "coherence:propose-reject",        "description": "Reject a surfaced proposal (DD-088)",                                                                    "handler": "commands/proposeReject" },
    { "name": "coherence:propose-revert-acceptance", "description": "Revert an accepted proposal (DD-083)",                                                               "handler": "commands/proposeRevertAcceptance" },
    { "name": "coherence:install-statusline",    "description": "Install the coherence statusline into ~/.claude/settings.json (FR-STATUSLINE-2)",                        "handler": "commands/installStatusline" },
    { "name": "coherence:uninstall-statusline",  "description": "Restore the statusline backup created by install-statusline (FR-STATUSLINE-3)",                          "handler": "commands/uninstallStatusline" },
    { "name": "coherence:annotate",              "description": "Generate an annotation proposal for an anchor-less doc (DD-069)",                                         "handler": "commands/annotate" },
    { "name": "coherence:scope-debug",           "description": "Print walked CLAUDE.md/coherence/scope.json ancestors and resolved scope for a path (DD-097)",           "handler": "commands/scopeDebug" },
    { "name": "coherence:ignore-split",          "description": "Set up the two-file additive ignore model: coherence/ignore (committed) + coherence/ignore.local (gitignored) (DD-096)", "handler": "commands/ignoreSplit" },
    { "name": "coherence:export-metrics",        "description": "Write redacted metrics.jsonl to a user-supplied path; prints copy-paste curl only with upload consent (DD-115)", "handler": "commands/exportMetrics" },
    { "name": "coherence:de-annotate",           "description": "Strip auto-annotations or graduate them to user-owned anchors (DD-102/DD-110)",                          "handler": "commands/deAnnotate" },
    { "name": "coherence:plan-create",           "description": "Create a cross-team plan file under coherence/plans/<branch-sha>/<plan-id>.json (DD-099 amended)",       "handler": "commands/planCreate" },
    { "name": "coherence:plan-accept",           "description": "Accept a cross-team plan and append an audit-log entry (DD-099 amended)",                                "handler": "commands/planAccept" },
    { "name": "coherence:plan-reject",           "description": "Reject a cross-team plan with a reason (stale | superseded | rejected_explicit)",                        "handler": "commands/planReject" }
  ]
}
```

- [ ] **Step 5: Patch any source files found in Step 1 that load `plugin.json` by path**

For each file returned by Step 1 grep, replace the path string `'plugin.json'` or `"plugin.json"` (when used as a path relative to the plugin install root) with `'.claude-plugin/plugin.json'`. If no files were found, skip this step.

- [ ] **Step 6: Delete `plugin.json` from the plugin root**

```bash
git rm plugin.json
```

Expected: `rm 'plugin.json'`

- [ ] **Step 7: Extend `tests/ship/tarball-shape.test.ts` with manifest location assertions**

Open the file. The existing test has no assertion about `plugin.json` — it only checks `prompts/v1/`, `v1_to_v2`, tarball size, and schema files. Add two new `it` blocks inside the existing `describe` block (after the existing tests, before the closing `}`):

```typescript
  it('tarball includes .claude-plugin/plugin.json (v0.4 manifest location)', () => {
    if (!parsed) return;
    expect(
      entries.some(e => e.path.includes('.claude-plugin/plugin.json')),
      'Expected .claude-plugin/plugin.json in tarball — run M0 manifest relocation first',
    ).toBe(true);
  });

  it('tarball excludes root-level plugin.json (old v0.3 location)', () => {
    if (!parsed) return;
    const rootManifest = entries.filter(e => /^plugin\.json$/.test(e.path));
    expect(rootManifest.map(e => e.path)).toEqual([]);
  });
```

Do NOT remove any existing `it` blocks — this is an additive extension.

- [ ] **Step 8: Write `scripts/validate-plugin.mjs`**

```javascript
import { spawnSync } from 'child_process';

const result = spawnSync('claude', ['plugin', 'validate'], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
```

- [ ] **Step 9: Add `validate-plugin` script to `package.json`**

In `package.json#scripts`, add:

```json
"validate-plugin": "node scripts/validate-plugin.mjs"
```

- [ ] **Step 10: Add `assertVersionSync` to `scripts/release-ga.mjs`**

Open `scripts/release-ga.mjs`. Make the following changes:

**a) Update imports at the top of the file:**
- Change `import { execSync } from 'node:child_process'` → `import { execSync, spawnSync } from 'node:child_process'`
- Add `import { readFileSync, appendFileSync } from 'node:fs'`

**b) Update the hardcoded TAG and MSG constants:**
```javascript
const TAG = 'v0.4.0';
const MSG = 'v0.4.0 GA';
```

**c) Add `assertVersionSync` and `runValidatePlugin` functions before the first `run()` call:**

```javascript
function assertVersionSync(tag) {
  const pkg      = JSON.parse(readFileSync('package.json', 'utf8'));
  const manifest = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf8'));
  const initSrc  = readFileSync('src/state/init.ts', 'utf8');
  const m        = /PLUGIN_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(initSrc);
  const initVer  = m?.[1];

  const mismatches = [];
  if (pkg.version      !== tag) mismatches.push(`package.json=${pkg.version}`);
  if (manifest.version !== tag) mismatches.push(`.claude-plugin/plugin.json=${manifest.version}`);
  if (initVer          !== tag) mismatches.push(`PLUGIN_VERSION=${initVer ?? '(not found)'}`);

  if (mismatches.length > 0) {
    throw new Error(`Version mismatch for tag ${tag}: ${mismatches.join(', ')}`);
  }
  console.log(`✅  Version sync OK — all sources = ${tag}`);
}
```

**d) Also add `runValidatePlugin` function** (`spawnSync` is now imported, so this compiles):

```javascript
function runValidatePlugin() {
  const result = spawnSync('npm', ['run', 'validate-plugin'], { stdio: 'pipe', shell: true });
  const out = (result.stdout?.toString() ?? '') + (result.stderr?.toString() ?? '');

  if (out.toLowerCase().includes('warning')) {
    appendFileSync('ci-validate-warnings.txt', `=== validate run ===\n${out}\n`);
    console.log('⚠️  Warnings logged to ci-validate-warnings.txt');
  }

  if (result.status !== 0) {
    throw new Error(`claude plugin validate FAILED (exit ${result.status}):\n${out}`);
  }
  console.log('✅  claude plugin validate passed');
}
```

The v0.4 release pipeline order is now:
```
npm run build → assertVersionSync(tag) → runValidatePlugin() → npm run gates → npm test → git tag
```

Wire this order in the main release sequence in `scripts/release-ga.mjs`.

- [ ] **Step 11: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 813+/813+ pass (all existing tests pass; validate-gate-trip test now passes since `.claude-plugin/plugin.json` exists).

- [ ] **Step 12: Commit**

```bash
git add .claude-plugin/plugin.json scripts/validate-plugin.mjs scripts/release-ga.mjs tests/ship/validate-gate-trip.test.ts tests/ship/tarball-shape.test.ts package.json
git commit -m "feat(M0): relocate manifest to .claude-plugin/ + validate gate + semver sync (DD-119, DD-121, DD-123)"
```

---

## Task 2: M1 — `parseMajor` fix + `refuseLayout`

**Goal:** Fix the `parseMajor` formula in `recover.ts` to use the major digit only. Add the `refuse_layout` discriminant + `refuseLayout()` to `refuseLegacy.ts`. Wire `refuseLayout` as Step 1b in `sessionStart.ts`.

**Gates closed:** M-LAYOUT-1, M-PARSEMAJOR-1

**Files:**
- Create: `tests/unit/state/refuse-layout.test.ts`
- Create: `tests/unit/commands/recover-parse-major.test.ts`
- Modify: `src/commands/recover.ts`
- Modify: `src/state/refuseLegacy.ts`
- Modify: `src/hooks/sessionStart.ts`
- Modify: existing recover test that asserts cross-major refusal between 0.x versions (find with grep below)

---

- [ ] **Step 1: Find existing recover tests that assert cross-major refusal between 0.x versions**

```bash
grep -r "refusedCrossMajor" tests/ --include="*.ts" -n
```

Note every file and line. The v0.3 M0 test (`recover-major-version-refusal.test.ts`) asserts `refusedCrossMajor: true` for targets like `v0.2.0` and `v0.1.5`. After the fix, `parseMajor('0.2.0') === parseMajor('0.4.0') === 0`, so those refusals no longer fire. Any `expect(result.refusedCrossMajor).toBe(true)` for a 0.x target from a 0.x install must be flipped to `toBe(false)` (or the `refusedCrossMajor` key will simply be absent). Cross-major refusal still fires when targeting `v1.0.0` from `v0.4.0` — do not touch those assertions.

- [ ] **Step 2: Write failing tests for `parseMajor` fix**

Create `tests/unit/commands/recover-parse-major.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// Re-export parseMajor for testing by making it exported in recover.ts (Step 5).
// For now write the test; it will fail until the export is added.
import { parseMajorForTest } from '../../src/commands/recover.js';

describe('parseMajor formula (M-PARSEMAJOR-1)', () => {
  it('same major bucket for 1.0.0 and 1.0.99', () => {
    expect(parseMajorForTest('1.0.0')).toBe(parseMajorForTest('1.0.99'));
  });
  it('different buckets for 1.x and 2.x', () => {
    expect(parseMajorForTest('1.0.0')).not.toBe(parseMajorForTest('2.0.0'));
  });
  it('0.3.x and 0.4.x are same bucket (both pre-1.0)', () => {
    expect(parseMajorForTest('0.3.0')).toBe(parseMajorForTest('0.4.0'));
  });
  it('0.x and 1.x are different buckets', () => {
    expect(parseMajorForTest('0.3.0')).not.toBe(parseMajorForTest('1.0.0'));
  });
  it('returns null for non-semver strings', () => {
    expect(parseMajorForTest('not-a-version')).toBeNull();
  });
});
```

- [ ] **Step 3: Write failing tests for `refuseLayout`**

Create `tests/unit/state/refuse-layout.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { refuseLayout, REFUSE_LAYOUT_MESSAGE, type RefuseLayoutResult } from '../../src/state/refuseLegacy.js';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(path.join(os.tmpdir(), 'refuse-layout-')); });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

describe('refuseLayout (M-LAYOUT-1)', () => {
  it('returns null when pluginRoot is empty string', () => {
    expect(refuseLayout('')).toBeNull();
  });

  it('returns null when plugin.json absent at root', () => {
    expect(refuseLayout(tmpDir)).toBeNull();
  });

  it('returns refuse_layout when plugin.json present at root (old v0.3 layout)', () => {
    writeFileSync(path.join(tmpDir, 'plugin.json'), '{}');
    const result = refuseLayout(tmpDir);
    expect(result).not.toBeNull();
    // result is RefuseLayoutResult | null — safe to access .status and .message directly after null check
    expect(result!.status).toBe('refuse_layout');
    expect(result!.message).toContain(REFUSE_LAYOUT_MESSAGE.slice(0, 20));
  });

  it('returns null when only .claude-plugin/plugin.json present (correct v0.4 layout)', () => {
    mkdirSync(path.join(tmpDir, '.claude-plugin'));
    writeFileSync(path.join(tmpDir, '.claude-plugin', 'plugin.json'), '{}');
    // No plugin.json at root
    expect(refuseLayout(tmpDir)).toBeNull();
  });
});
```

- [ ] **Step 4: Run both new tests to confirm they fail**

```bash
npx vitest run tests/unit/commands/recover-parse-major.test.ts tests/unit/state/refuse-layout.test.ts
```

Expected: **FAIL** — `parseMajorForTest` not exported yet; `refuseLayout` and `REFUSE_LAYOUT_MESSAGE` not exported yet.

- [ ] **Step 5: Fix `parseMajor` in `src/commands/recover.ts` and export a test alias**

Open `src/commands/recover.ts`. Find the `parseMajor` function. Replace the body:

```typescript
// Before (broken — minor conflated with major for ≥1.0.0):
function parseMajor(version: string): number | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.replace(/^v/, '').trim());
  if (!m) return null;
  return Number(m[1]) * 1000 + Number(m[2]);
}

// After (correct — major digit only):
function parseMajor(version: string): number | null {
  const m = /^(\d+)/.exec(version.replace(/^v/, '').trim());
  if (!m) return null;
  return parseInt(m[1], 10);
}

// Export for unit tests only (tree-shaken in production build):
export { parseMajor as parseMajorForTest };
```

- [ ] **Step 6: Update any existing recover tests from Step 1**

For each test that called `runRecover` with a `0.3.x` target while running as `0.4.x` and expected `refusedCrossMajor: true`: change the expected value to `false`. Both are major bucket 0; cross-major refusal does not trigger between 0.x versions.

Example change:
```typescript
// Old (now wrong with fixed parseMajor):
expect(result.refusedCrossMajor).toBe(true);

// New (correct with fixed parseMajor):
expect(result.refusedCrossMajor).toBe(false);
```

Cross-major refusal still fires when targeting e.g. `v1.0.0` from a `0.4.x` install. Do NOT remove those test cases.

- [ ] **Step 7: Add `refuse_layout` discriminant + `refuseLayout()` to `src/state/refuseLegacy.ts`**

Open `src/state/refuseLegacy.ts`. Add to the union type `RefuseLegacyOutcome`:

```typescript
| { status: 'refuse_layout'; message: string }  // NEW v0.4 — DD-122
```

Then add the constant and function at the bottom of the file (before the closing of the module):

```typescript
import { existsSync } from 'fs';
import path from 'path';

export const REFUSE_LAYOUT_MESSAGE =
  'cohrence found plugin.json at the plugin root (v0.3 layout); ' +
  're-install via `claude plugin install cohrence` to use the v0.4 layout — ' +
  'do NOT delete `.claude/coherence/` (your per-project state is intact)';

// Specific return type — NOT the full RefuseLegacyOutcome union, because this
// function only ever returns one discriminant. Using the narrow type lets
// callers access `.message` without an exhaustive narrowing check.
export interface RefuseLayoutResult {
  status: 'refuse_layout';
  message: string;
}

/**
 * v0.4 DD-122: detect old-layout plugin.json at the plugin installation root.
 * Returns refuse_layout if found; null if the layout is correct or unknown.
 * Called from SessionStart BEFORE refuseLegacy.
 *
 * IMPORTANT: `pluginRoot` is CLAUDE_PLUGIN_ROOT (plugin install dir), NOT projectRoot.
 */
export function refuseLayout(pluginRoot: string): RefuseLayoutResult | null {
  if (!pluginRoot) return null;
  const oldPath = path.join(pluginRoot, 'plugin.json');
  if (!existsSync(oldPath)) return null;
  return { status: 'refuse_layout', message: REFUSE_LAYOUT_MESSAGE };
}
```

Note: `path` and `existsSync` are already imported in `refuseLegacy.ts` — add only what is missing. The `refuse_layout` discriminant added to `RefuseLegacyOutcome` in the previous step is kept for schema documentation, but `refuseLayout()` uses the narrower `RefuseLayoutResult | null` so callers can access `.message` directly without TypeScript complaining.

- [ ] **Step 8: Wire `refuseLayout` into `src/hooks/sessionStart.ts` as Step 1b**

Open `src/hooks/sessionStart.ts`. Find Step 1 (or the first meaningful step after env setup). Insert Step 1b immediately after Step 1, before the existing `refuseLegacy` call:

```typescript
// Step 1b: v0.4 DD-122 — refuse old manifest layout (plugin.json at plugin root).
// CLAUDE_PLUGIN_ROOT is set by Claude Code when running a plugin's hooks.
// It points to the plugin's installation directory, NOT the user's projectRoot.
const pluginInstallRoot = process.env.CLAUDE_PLUGIN_ROOT ?? '';
const layoutDecision = refuseLayout(pluginInstallRoot);
if (layoutDecision) {
  console.error(`[coherence] ${layoutDecision.message}`);
  return { success: true, refusedLegacy: true };
}
```

Add `refuseLayout` to the import from `'../state/refuseLegacy.js'`. (`RefuseLayoutResult` does not need to be imported — it's inferred from the return type.)

- [ ] **Step 9: Run both new test files to verify they pass**

```bash
npx vitest run tests/unit/commands/recover-parse-major.test.ts tests/unit/state/refuse-layout.test.ts
```

Expected: **PASS** (5 parseMajor tests + 4 refuseLayout tests = 9 new tests).

- [ ] **Step 10: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: 822+/822+ pass (813 existing + 9 new).

- [ ] **Step 11: Commit**

```bash
git add src/commands/recover.ts src/state/refuseLegacy.ts src/hooks/sessionStart.ts tests/unit/state/refuse-layout.test.ts tests/unit/commands/recover-parse-major.test.ts
git commit -m "feat(M1): fix parseMajor formula + add refuseLayout discriminant + wire Step 1b (DD-122, DD-124)"
```

---

## Task 3: M2 — Trigger contracts

**Goal:** Ship `src/state/triggerContracts.ts` with TC-1 (author-planner promotion hint) and TC-2 (calibration re-tune hint). Wire it as Step 2b in SessionStart (non-fatal). Update `firstRun.ts` to create the `${CLAUDE_PLUGIN_DATA}` directory.

**Gates closed:** M-TRIGGER-1 (partial — full assertion needs field data; unit test covers synthetic threshold crossing)

**Files:**
- Create: `src/state/triggerContracts.ts`
- Create: `tests/unit/state/trigger-contracts.test.ts`
- Modify: `src/hooks/sessionStart.ts`
- Modify: `src/state/firstRun.ts`

---

- [ ] **Step 1: Write failing tests for `evaluateTriggerContracts`**

Create `tests/unit/state/trigger-contracts.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

let tmpDir: string;
let coherenceDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'trigger-contracts-'));
  coherenceDir = path.join(tmpDir, '.claude', 'coherence');
  mkdirSync(coherenceDir, { recursive: true });
});
afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

// Import lazily so the module is not loaded before tmp dirs are created
async function getEvaluate() {
  const { evaluateTriggerContracts } = await import('../../src/state/triggerContracts.js');
  return evaluateTriggerContracts;
}

describe('evaluateTriggerContracts (M-TRIGGER-1)', () => {
  it('returns empty array when metrics.jsonl absent (fresh install)', async () => {
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(tmpDir);
    const evaluate = await getEvaluate();
    const hints = await evaluate(store, coherenceDir);
    expect(hints).toEqual([]);
  });

  it('returns TC-1 hint when cross-kind rate exceeds 25% over 30 days and not yet emitted', async () => {
    // Write synthetic metrics.jsonl with >25% cross-kind proposals
    const now = new Date();
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      const ts = new Date(now.getTime() - i * 60_000 * 60).toISOString(); // spread over ~4 days
      const kind = i < 30 ? 'code_to_doc' : 'doc_to_doc'; // 30% cross-kind
      lines.push(JSON.stringify({ event: 'proposal_proposed', kind, ts }));
    }
    writeFileSync(path.join(coherenceDir, 'metrics.jsonl'), lines.join('\n'));

    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(tmpDir);
    const evaluate = await getEvaluate();
    const hints = await evaluate(store, coherenceDir);
    expect(hints.some(h => h.includes('Author-planner readiness'))).toBe(true);
  });

  it('does not emit TC-1 hint again once tc1_hint_emitted_at is set', async () => {
    writeFileSync(path.join(coherenceDir, 'metrics.jsonl'), ''); // empty, no threshold
    const triggerStatePath = path.join(coherenceDir, 'trigger-state.json');
    writeFileSync(triggerStatePath, JSON.stringify({ tc1_hint_emitted_at: new Date().toISOString() }));

    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(tmpDir);
    const evaluate = await getEvaluate();
    const hints = await evaluate(store, coherenceDir);
    expect(hints.some(h => h.includes('Author-planner'))).toBe(false);
  });

  it('returns TC-2 hint when session count >= 50 and day span >= 30', async () => {
    const now = new Date();
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      const daysAgo = Math.floor(i * 0.6); // spread 60 sessions over ~36 days
      const ts = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
      lines.push(JSON.stringify({ event: 'session_start', session_id: `sid-${i}`, ts }));
    }
    writeFileSync(path.join(coherenceDir, 'metrics.jsonl'), lines.join('\n'));

    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(tmpDir);
    const evaluate = await getEvaluate();
    const hints = await evaluate(store, coherenceDir);
    expect(hints.some(h => h.includes('Field calibration threshold'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/unit/state/trigger-contracts.test.ts
```

Expected: **FAIL** — `../../src/state/triggerContracts.js` does not exist.

- [ ] **Step 3: Create `src/state/triggerContracts.ts`**

The project uses ESM throughout (`import`/`export`). All `fs` functions must be top-level imports — `require()` is not available in ESM and will throw `ReferenceError` at runtime.

```typescript
import { existsSync, openSync, readSync, closeSync, statSync } from 'fs';
import path from 'path';
import type { StateStore } from './stateStore.js';
import { nowIsoUtc } from '../util/time.js';

interface TriggerState {
  tc1_hint_emitted_at?: string;
  tc2_hint_emitted_at?: string;
}

const MAX_METRICS_BYTES = 5 * 1024 * 1024; // 5 MB P8 cap
const TC1_CROSS_KIND_THRESHOLD = 0.25;
const TC1_WINDOW_DAYS = 30;
const TC2_SESSION_COUNT = 50;
const TC2_DAY_SPAN = 30;

function readMetricsLines(metricsPath: string): string[] {
  let st: ReturnType<typeof statSync>;
  try { st = statSync(metricsPath); } catch { return []; }
  const size = st.size;
  const start = Math.max(0, size - MAX_METRICS_BYTES);
  const fd = openSync(metricsPath, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const raw = buf.toString('utf8');
    // Drop first line when we started mid-file (may be a partial record).
    const lines = raw.split('\n');
    return start === 0 ? lines : lines.slice(1);
  } finally {
    closeSync(fd);
  }
}

function parseJsonlLines(lines: string[]): Record<string, unknown>[] {
  return lines.flatMap(l => {
    try { return [JSON.parse(l) as Record<string, unknown>]; } catch { return []; }
  });
}

function crossKindRateExceeds(metricsPath: string, threshold: number, windowDays: number): boolean {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const events = parseJsonlLines(readMetricsLines(metricsPath))
    .filter(e => e['event'] === 'proposal_proposed' && typeof e['ts'] === 'string')
    .filter(e => Date.parse(e['ts'] as string) >= cutoff);
  if (events.length === 0) return false;
  const crossKind = events.filter(e => {
    const kind = e['kind'] as string | undefined;
    return kind === 'code_to_doc' || kind === 'doc_to_code';
  });
  return crossKind.length / events.length > threshold;
}

function sessionStats(metricsPath: string): { sessionCount: number; daySpan: number } {
  const events = parseJsonlLines(readMetricsLines(metricsPath))
    .filter(e => typeof e['session_id'] === 'string' && typeof e['ts'] === 'string');
  const ids = new Set(events.map(e => e['session_id'] as string));
  const timestamps = events.map(e => Date.parse(e['ts'] as string)).filter(t => !isNaN(t));
  if (timestamps.length < 2) return { sessionCount: ids.size, daySpan: 0 };
  const span = (Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000;
  return { sessionCount: ids.size, daySpan: span };
}

export async function evaluateTriggerContracts(
  store: StateStore,
  coherenceDir: string,
): Promise<string[]> {
  const metricsPath = path.join(coherenceDir, 'metrics.jsonl');
  if (!existsSync(metricsPath)) return [];

  const state = (await store.read<TriggerState>('trigger-state.json')) ?? {};
  const hints: string[] = [];

  if (!state.tc1_hint_emitted_at) {
    if (crossKindRateExceeds(metricsPath, TC1_CROSS_KIND_THRESHOLD, TC1_WINDOW_DAYS)) {
      hints.push(
        'Author-planner readiness threshold met. ' +
        'Set COHERENCE_AUTHOR_PLANNER=1 to enable.',
      );
      state.tc1_hint_emitted_at = nowIsoUtc();
    }
  }

  if (!state.tc2_hint_emitted_at) {
    const { sessionCount, daySpan } = sessionStats(metricsPath);
    if (sessionCount >= TC2_SESSION_COUNT && daySpan >= TC2_DAY_SPAN) {
      hints.push(
        'Field calibration threshold met. ' +
        'Run /coherence:calibrate to re-tune thresholds.',
      );
      state.tc2_hint_emitted_at = nowIsoUtc();
    }
  }

  if (hints.length > 0) {
    await store.write('trigger-state.json', state);
  }
  return hints;
}

- [ ] **Step 4: Run the trigger-contracts tests to verify they pass**

```bash
npx vitest run tests/unit/state/trigger-contracts.test.ts
```

Expected: **PASS** (4 tests).

- [ ] **Step 5: Wire `evaluateTriggerContracts` into `src/hooks/sessionStart.ts` as Step 2b**

Open `src/hooks/sessionStart.ts`. Find the point after Step 2 (`refuseLegacy` + `runFreshInstall` chain). Insert Step 2b before Step 3 (`buildSectionIndex` or the first I/O-heavy pipeline step):

```typescript
// Step 2b: v0.4 G-3 — telemetry-gated trigger contracts (DD-129, FR-TRIGGER-1).
// Reads metrics.jsonl via P8 bounded-read; emits one-time CLI hints when
// thresholds are met. Non-fatal; never blocks startup.
try {
  const hints = await evaluateTriggerContracts(store, coherenceDir);
  for (const hint of hints) {
    console.log(`[coherence] 💡 ${hint}`);
  }
} catch {
  /* trigger-contract evaluation is non-fatal */
}
```

Add `evaluateTriggerContracts` to the import from `'../state/triggerContracts.js'`.

**`store` pull-up (required):** In v0.3, `const store = makeStateStore(projectRoot)` lives at what was Step 7 (after `detectReverts`, line 84 of `sessionStart.ts`). Move that declaration to immediately after the closing `}` of the refuseLegacy `withCacheLock` block (the comment reads `// 'proceed' / 'fresh' (already laid) — fall through.`), and delete the duplicate declaration that was at Step 7. The surrounding code should read:

```typescript
    // 'proceed' / 'fresh' (already laid) — fall through.

    // Pulled up from Step 7: needed for Step 2b trigger-contract evaluation.
    const store = makeStateStore(projectRoot);

    // Step 2b: v0.4 G-3 — telemetry-gated trigger contracts (DD-129, FR-TRIGGER-1).
    try {
      const hints = await evaluateTriggerContracts(store, coherenceDir);
      for (const hint of hints) {
        console.log(`[coherence] 💡 ${hint}`);
      }
    } catch {
      /* trigger-contract evaluation is non-fatal */
    }

    // Step 3: anchor integrity sweep
    buildSectionIndex(projectRoot);
```

- [ ] **Step 6: Update `src/state/firstRun.ts` to create `${CLAUDE_PLUGIN_DATA}` directory**

Open `src/state/firstRun.ts`. Find `runFreshInstall()`. Add directory creation for the per-installation tier immediately before the `recordTelemetryConsent` call.

**Import changes required** (check existing imports first):
- `path` is already imported — do NOT add it again
- `os` is not yet imported — add `import os from 'os'`
- `mkdirSync` is not yet in the `'fs'` import — add it: change `import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'fs'` → `import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs'`

**Code to add inside `runFreshInstall()`**, after `patchGitignore(projectRoot)` and before `recordTelemetryConsent`:

```typescript
// v0.4 TS-3 §1 (DD-120): establish the per-installation CLAUDE_PLUGIN_DATA tier.
// Claude Code sets CLAUDE_PLUGIN_DATA when executing a plugin's hooks.
// On dev checkouts (no env var), fall back to the XDG-style path.
const pluginDataDir =
  process.env['CLAUDE_PLUGIN_DATA'] ??
  path.join(os.homedir(), '.claude', 'plugins', 'data', 'cohrence');
mkdirSync(pluginDataDir, { recursive: true });
```

No files are written there in v0.4 — directory creation only.

- [ ] **Step 7: Run the full test suite**

```bash
npx vitest run
```

Expected: 826+/826+ pass (822 from M1 + 4 new trigger-contract tests).

- [ ] **Step 8: Commit**

```bash
git add src/state/triggerContracts.ts src/hooks/sessionStart.ts src/state/firstRun.ts tests/unit/state/trigger-contracts.test.ts
git commit -m "feat(M2): trigger contracts TC-1/TC-2 + CLAUDE_PLUGIN_DATA dir creation (DD-129, DD-120)"
```

---

## Task 4: M3 — Consent command + export sandboxing + audit command

**Goal:** Ship `/coherence:consent` (read/write telemetry consent without a TTY), harden `--out` path sandboxing in `/coherence:export-metrics` to apply always (not just on mkdir), ship `/coherence:audit` bundling-only report, and register both new commands in the manifest.

**Gates closed:** M-CONSENT-1, M-SANDBOX-1, M-AUDIT-1

**Files:**
- Create: `src/commands/consent.ts`
- Create: `src/commands/audit.ts`
- Create: `tests/integration/consent.test.ts`
- Create: `tests/integration/audit.test.ts`
- Modify: `src/commands/exportMetrics.ts`
- Modify: `src/state/consent.ts`
- Modify: `.claude-plugin/plugin.json`

---

- [ ] **Step 1: Write failing tests for `/coherence:consent`**

Create `tests/integration/consent.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(path.join(os.tmpdir(), 'consent-test-'));
  mkdirSync(path.join(projectRoot, '.claude', 'coherence'), { recursive: true });
});
afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

async function getRunConsent() {
  const { runConsent } = await import('../../src/commands/consent.js');
  return runConsent;
}

describe('/coherence:consent (M-CONSENT-1)', () => {
  it('shows defaults (local=on, upload=off) on fresh state', async () => {
    const runConsent = await getRunConsent();
    const out = await runConsent(projectRoot);
    expect(out).toContain('local:  on');
    expect(out).toContain('upload: off');
  });

  it('sets local=off and persists it', async () => {
    const runConsent = await getRunConsent();
    await runConsent(projectRoot, { local: 'off' });
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    // Field names match the existing TelemetryConsent interface in src/state/consent.ts
    expect((cfg?.['telemetry'] as Record<string, unknown>)?.['local_collection']).toBe(false);
    expect(typeof (cfg?.['telemetry'] as Record<string, unknown>)?.['recorded_at']).toBe('string');
  });

  it('sets upload=on and persists it', async () => {
    const runConsent = await getRunConsent();
    await runConsent(projectRoot, { upload: 'on' });
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    expect((cfg?.['telemetry'] as Record<string, unknown>)?.['upload_consent']).toBe(true);
  });

  it('reset removes the telemetry key entirely', async () => {
    const runConsent = await getRunConsent();
    await runConsent(projectRoot, { local: 'off' });
    await runConsent(projectRoot, { reset: true });
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    expect(cfg?.['telemetry']).toBeUndefined();
  });

  it('read-only call does not write config.json when state is default', async () => {
    const runConsent = await getRunConsent();
    const out = await runConsent(projectRoot);
    expect(out).toContain('Consent state');
    // config.json should not have been created (fresh install = no telemetry key)
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    expect(cfg?.['telemetry']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write failing tests for `--out` path sandboxing**

Extend `tests/integration/export-metrics.test.ts` (open the existing file and append):

```typescript
describe('--out path sandboxing (M-SANDBOX-1)', () => {
  // runExportMetrics takes a single options object: { store, projectRoot, sessionId, out?, ... }
  it('accepts output path inside projectRoot without flag', async () => {
    const { runExportMetrics } = await import('../../src/commands/exportMetrics.js');
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    await expect(
      runExportMetrics({ store, projectRoot, sessionId: 'test', out: path.join(projectRoot, 'out.jsonl') })
    ).resolves.not.toThrow();
  });

  it('rejects output path outside projectRoot without --allow-out-of-tree', async () => {
    const { runExportMetrics } = await import('../../src/commands/exportMetrics.js');
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    await expect(
      runExportMetrics({ store, projectRoot, sessionId: 'test', out: path.join(os.tmpdir(), 'evil.jsonl') })
    ).rejects.toThrow('outside the project root');
  });

  it('accepts output path outside projectRoot with allowOutOfTree=true (warns on stderr)', async () => {
    const { runExportMetrics } = await import('../../src/commands/exportMetrics.js');
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    await expect(
      runExportMetrics({
        store,
        projectRoot,
        sessionId: 'test',
        out: path.join(os.tmpdir(), `coherence-test-${Date.now()}.jsonl`),
        allowOutOfTree: true,
      })
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Write failing tests for `/coherence:audit`**

Create `tests/integration/audit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
  mkdirSync(path.join(projectRoot, '.claude', 'coherence'), { recursive: true });
});
afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

describe('/coherence:audit (M-AUDIT-1)', () => {
  it('returns a markdown report containing all four section headers', async () => {
    const { runAudit } = await import('../../src/commands/audit.js');
    const out = await runAudit(projectRoot);
    expect(out).toContain('v0.4 audit is a bundling-only summary');
    expect(out).toContain('## Doctor');
    expect(out).toContain('## Scope Debug');
    expect(out).toContain('## Status');
    expect(out).toContain('## Metrics Export');
  });

  it('does not throw if individual handlers fail — wraps in [error: ...]', async () => {
    const { runAudit } = await import('../../src/commands/audit.js');
    // Minimal project root without necessary state — some handlers will fail gracefully
    await expect(runAudit(projectRoot)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 4: Run all three new test files to confirm they fail**

```bash
npx vitest run tests/integration/consent.test.ts tests/integration/audit.test.ts
```

Expected: **FAIL** — `consent.js` and `audit.js` don't exist yet.

- [ ] **Step 5: Create `src/commands/consent.ts`**

Use the existing `setTelemetryConsent` / `readTelemetryConsent` from `src/state/consent.ts` — they own the `config.json#telemetry` sub-object and use the correct field names (`local_collection`, `upload_consent`, `recorded_at`). Do **not** define a local `TelemetryConsent` type with different field names; that would silently write keys that the rest of the codebase never reads.

```typescript
import { makeStateStore } from '../state/init.js';
import { setTelemetryConsent, readTelemetryConsent } from '../state/consent.js';

export interface ConsentOptions {
  local?: 'on' | 'off';
  upload?: 'on' | 'off';
  reset?: boolean;
}

export async function runConsent(
  projectRoot: string,
  options: ConsentOptions = {},
): Promise<string> {
  const store = makeStateStore(projectRoot);

  if (options.reset) {
    const config = (await store.read<Record<string, unknown>>('config.json')) ?? {};
    delete config['telemetry'];
    await store.write('config.json', config);
    return 'Consent reset to defaults: local=on, upload=off.';
  }

  if (options.local !== undefined || options.upload !== undefined) {
    const existing = await readTelemetryConsent(store);
    await setTelemetryConsent(store, {
      local_collection: options.local !== undefined
        ? (options.local === 'on')
        : (existing?.local_collection ?? true),
      upload_consent: options.upload !== undefined
        ? (options.upload === 'on')
        : (existing?.upload_consent ?? false),
    });
    const updated = await readTelemetryConsent(store);
    return `Consent updated: local=${updated?.local_collection !== false ? 'on' : 'off'}, upload=${updated?.upload_consent === true ? 'on' : 'off'}.`;
  }

  // Read-only display
  const tel = await readTelemetryConsent(store);
  const lines = [
    'Consent state:',
    `  local:  ${tel?.local_collection !== false ? 'on' : 'off'}`,
    `  upload: ${tel?.upload_consent === true ? 'on' : 'off'}`,
  ];
  if (tel?.recorded_at) lines.push(`  Last changed: ${tel.recorded_at}`);
  return lines.join('\n');
}
```

- [ ] **Step 6: Inline `promptInteractive` into its call site in `src/state/consent.ts`**

`promptInteractive` is a private function (not exported) but it IS called within `recordTelemetryConsent`. Simply deleting it would produce a `ReferenceError` at runtime. Instead, inline its body at the call site and then delete the function definition.

Find the call in `recordTelemetryConsent` (around line 78-80):
```typescript
// Before:
const chosen: TelemetryConsentDecision = decision ?? (interactive
  ? promptInteractive(silent)
  : DEFAULT_DECISION);
```

Replace with:
```typescript
// After — promptInteractive always returned DEFAULT_DECISION anyway (v0.4 removes the no-op placeholder):
const chosen: TelemetryConsentDecision = decision ?? DEFAULT_DECISION;
```

Then delete the `promptInteractive` function definition (lines ~115-120). The `_silent` parameter it received was unused.

Do NOT remove `recordTelemetryConsent`, `setTelemetryConsent`, or `readTelemetryConsent` — all three are used by other modules.

- [ ] **Step 7: Harden `--out` path sandboxing in `src/commands/exportMetrics.ts`**

Open `src/commands/exportMetrics.ts`. Add `allowOutOfTree?: boolean` to the `ExportMetricsOptions` interface.

Find the existing directory-creation guard (introduced in Audit-3 S3, guards only `mkdirSync`). Replace the conditional check with an always-on output path check:

```typescript
// In the ExportMetricsOptions interface, add:
allowOutOfTree?: boolean;

// REPLACE the existing partial guard block with:
const outResolved = path.resolve(outPath);
const rootResolved = path.resolve(projectRoot);
if (!isPathInside(rootResolved, outResolved) && outResolved !== rootResolved) {
  if (!options.allowOutOfTree) {
    throw new Error(
      `export-metrics: output path is outside the project root.\n` +
      `  Path: ${outResolved}\n` +
      `  Pass --allow-out-of-tree to override.`
    );
  }
  process.stderr.write(
    `[coherence] WARNING: writing metrics outside project root.\n` +
    `  Path: ${outResolved}\n` +
    `  Explicitly requested via --allow-out-of-tree.\n`
  );
}
// Directory creation only when needed (follows the check):
const outDir = path.dirname(outResolved);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
```

Use the existing `isPathInside` helper already in the file (imported from `src/util/pathContainment.ts` per Audit-4). Do NOT re-implement it with `startsWith`.

- [ ] **Step 8: Create `src/commands/audit.ts`**

Every command module uses `run*(options: XxxOptions)` with `store: StateStore` in options, and returns a structured result type (not a plain string). Use the existing `format*` companions (`formatDoctor`, `formatScopeDebug`, `formatStatus`, `formatExportMetrics`) to convert each result to a string. Actual signatures verified against source:
- `runDoctor(store, opts?)` → `Promise<DoctorResult>` → `formatDoctor(r)`
- `runScopeDebug({ store, projectRoot, filePath, sessionId })` → `Promise<ScopeDebugResult>` → `formatScopeDebug(r)`
- `runStatus(store, coherenceDir)` → `Promise<StatusOutput>` → `formatStatus(r)`
- `runExportMetrics({ store, projectRoot, sessionId, out? })` → `Promise<ExportMetricsResult>` → `formatExportMetrics(r)`

```typescript
import { runDoctor, formatDoctor } from './doctor.js';
import { runScopeDebug, formatScopeDebug } from './scopeDebug.js';
import { runStatus, formatStatus } from './status.js';
import { runExportMetrics, formatExportMetrics } from './exportMetrics.js';
import { makeStateStore, getCoherenceDir } from '../state/init.js';
import path from 'path';

export async function runAudit(projectRoot: string): Promise<string> {
  const store = makeStateStore(projectRoot);
  const coherenceDir = getCoherenceDir(projectRoot);
  const sessionId = `audit-${Date.now()}`;

  const header = [
    '# /coherence:audit',
    '> v0.4 audit is a bundling-only summary; deep audit ships in v1.0.',
    '',
  ];

  const handlers: Array<[string, () => Promise<string>]> = [
    ['Doctor',
      async () => formatDoctor(await runDoctor(store, { projectRoot }))],
    ['Scope Debug',
      async () => formatScopeDebug(await runScopeDebug({ store, projectRoot, filePath: '.', sessionId }))],
    ['Status',
      async () => formatStatus(await runStatus(store, coherenceDir))],
    ['Metrics Export',
      async () => formatExportMetrics(
        await runExportMetrics({
          store, projectRoot, sessionId,
          out: path.join('.claude', 'coherence', 'audit-metrics.jsonl'),
        })
      )],
  ];

  const results: string[] = [];
  for (const [label, fn] of handlers) {
    results.push(`## ${label}`);
    try { results.push(await fn()); }
    catch (e) { results.push(`[error: ${String(e)}]`); }
    results.push('');
  }

  return [...header, ...results].join('\n');
}
```

The in-tree `out` path (`.claude/coherence/audit-metrics.jsonl`) always passes the sandbox check without `allowOutOfTree`.

- [ ] **Step 9: Add `coherence:consent` and `coherence:audit` to `.claude-plugin/plugin.json`**

In `.claude-plugin/plugin.json`, append two entries to the `slashCommands` array:

```json
{
  "name": "coherence:consent",
  "description": "View or update telemetry consent. Flags: --local on|off, --upload on|off, --reset.",
  "handler": "commands/consent"
},
{
  "name": "coherence:audit",
  "description": "Bundling-only audit report: runs doctor + scope-debug + status + metrics export.",
  "handler": "commands/audit"
}
```

- [ ] **Step 10: Run all three test groups to verify they pass**

```bash
npx vitest run tests/integration/consent.test.ts tests/integration/audit.test.ts
```

Expected: **PASS**. Then run the sandbox tests:

```bash
npx vitest run tests/integration/export-metrics.test.ts
```

Expected: **PASS** (existing + 3 new sandbox cases).

- [ ] **Step 11: Run the full test suite**

```bash
npx vitest run
```

Expected: 843+/843+ pass (826 from M2 + 5 consent + 2 audit + 3 sandbox = +10 new, ~11 total with edge cases).

- [ ] **Step 12: Commit**

```bash
git add src/commands/consent.ts src/commands/audit.ts src/commands/exportMetrics.ts src/state/consent.ts .claude-plugin/plugin.json tests/integration/consent.test.ts tests/integration/audit.test.ts tests/integration/export-metrics.test.ts
git commit -m "feat(M3): /coherence:consent + /coherence:audit + --out sandbox hardening (DD-125, DD-127, DD-128)"
```

---

## Task 5: M4 — Autogen stubs + sentinel dispatch

**Goal:** Generate `commands/<name>.md` stubs from the manifest at build time. Wire a sentinel-pattern detector in `UserPromptSubmit` to dispatch the two new stub-backed commands. Add the M-AUTOGEN-1 static-analysis test.

**Gates closed:** M-AUTOGEN-1

**Files:**
- Create: `scripts/generate-command-stubs.mjs`
- Create: `src/hooks/commandDispatch.ts`
- Create: `tests/static-analysis/autogen-stubs.test.ts`
- Modify: `package.json` (amend `build` script)
- Modify: `.gitignore` (add `commands/` and `.coherence-stub-hash`)
- Modify: `src/hooks/userPromptSubmit.ts`

---

- [ ] **Step 1: Write the failing M-AUTOGEN-1 static-analysis test**

Create `tests/static-analysis/autogen-stubs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';  // ESM import — no require()
import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';

const MANIFEST_PATH = path.resolve(process.cwd(), '.claude-plugin', 'plugin.json');
const COMMANDS_DIR  = path.resolve(process.cwd(), 'commands');

describe('M-AUTOGEN-1 — stub autogen', () => {
  it('commands/ directory exists after npm run build', () => {
    expect(existsSync(COMMANDS_DIR)).toBe(true);
  });

  it('1:1 mapping between plugin.json slashCommands and commands/<name>.md files', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const commandNames: string[] = manifest.slashCommands.map((c: { name: string }) => c.name);

    for (const name of commandNames) {
      const filename = name.replace(/:/g, '-') + '.md';
      const filePath = path.join(COMMANDS_DIR, filename);
      expect(existsSync(filePath), `Missing stub: commands/${filename}`).toBe(true);
    }
  });

  it('each stub contains the coherence-command sentinel with the original colon name', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const commandNames: string[] = manifest.slashCommands.map((c: { name: string }) => c.name);

    for (const name of commandNames) {
      const filename = name.replace(/:/g, '-') + '.md';
      const content = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
      expect(content, `Stub ${filename} missing sentinel`).toContain(
        `<!-- coherence-command: ${name} -->`
      );
    }
  });

  it('second run on unchanged manifest produces identical stub files (idempotent)', () => {
    // Read current stub for first command
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const firstName = manifest.slashCommands[0].name;
    const filename = firstName.replace(/:/g, '-') + '.md';
    const before = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');

    // Re-run stub generation (uses the hash check for idempotency).
    // spawnSync imported at top of file — no require() in ESM modules.
    spawnSync('node', ['scripts/generate-command-stubs.mjs'], { stdio: 'inherit' });

    const after = readFileSync(path.join(COMMANDS_DIR, filename), 'utf8');
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/static-analysis/autogen-stubs.test.ts
```

Expected: **FAIL** — `commands/` directory does not exist.

- [ ] **Step 3: Create `scripts/generate-command-stubs.mjs`**

```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';  // createHash is from 'crypto', NOT 'fs'
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir   = path.resolve(__dirname, '..');

const manifestPath  = path.join(rootDir, '.claude-plugin', 'plugin.json');
const commandsDir   = path.join(rootDir, 'commands');
const hashFile      = path.join(rootDir, '.coherence-stub-hash');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const commands = manifest.slashCommands ?? [];

// Idempotency check
const hashInput = JSON.stringify(commands);
const hash = createHash('sha256').update(hashInput).digest('hex').slice(0, 8);

if (existsSync(hashFile) && readFileSync(hashFile, 'utf8').trim() === hash) {
  console.log(`generate-command-stubs: unchanged (hash=${hash}), skipping.`);
  process.exit(0);
}

mkdirSync(commandsDir, { recursive: true });

for (const cmd of commands) {
  const safeName = cmd.name.replace(/:/g, '-');
  const stubPath = path.join(commandsDir, `${safeName}.md`);
  const content = [
    `# /${cmd.name}`,
    '',
    cmd.description ?? '',
    '',
    `<!-- coherence-command: ${cmd.name} -->`,
  ].join('\n');
  writeFileSync(stubPath, content, 'utf8');
}

writeFileSync(hashFile, hash, 'utf8');
console.log(`generate-command-stubs: wrote ${commands.length} stubs (hash=${hash}).`);
```

- [ ] **Step 4: Add `commands/` and `.coherence-stub-hash` to `.gitignore`**

Open `.gitignore`. Add (if not already present):

```
# coherence stub generation (build artifacts)
commands/
.coherence-stub-hash
```

- [ ] **Step 5: Amend `package.json#scripts.build` to run stub generation**

Open `package.json`. Find the `build` script. Append the stub generation call:

```json
"build": "<existing build command> && node scripts/generate-command-stubs.mjs"
```

If the build script already ends with `&&`, chain accordingly. Example:

```json
"build": "tsc && node scripts/copy-schemas.mjs && node scripts/generate-command-stubs.mjs"
```

- [ ] **Step 6: Run `npm run build` to generate stubs, then re-run the autogen test**

```bash
npm run build
npx vitest run tests/static-analysis/autogen-stubs.test.ts
```

Expected: **PASS** (4 tests).

- [ ] **Step 7: Write failing test for sentinel dispatch**

There is no dedicated unit test for `commandDispatch` yet — the integration test in Task 4 (consent) covers the command logic; the dispatch wiring is tested implicitly. Write a minimal unit test:

Create `tests/unit/hooks/command-dispatch.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dispatchCoherenceCommand } from '../../../src/hooks/commandDispatch.js';

describe('dispatchCoherenceCommand (DD-130)', () => {
  it('returns null for unrecognised command names', async () => {
    const result = await dispatchCoherenceCommand(
      'coherence:unknown',
      'some prompt <!-- coherence-command: coherence:unknown -->',
      {} as never,
      '/tmp',
      'sess-1',
    );
    expect(result).toBeNull();
  });
});
```

Run to confirm failure:

```bash
npx vitest run tests/unit/hooks/command-dispatch.test.ts
```

Expected: **FAIL** — `commandDispatch.js` does not exist.

- [ ] **Step 8: Create `src/hooks/commandDispatch.ts`**

```typescript
import type { StateStore } from '../state/stateStore.js';
// HookResult lives in exceptionGuard.ts, NOT eventShape.ts
// (eventShape.ts exports NormalisedHookEvent — a different type)
import type { HookResult } from './exceptionGuard.js';
import { runConsent } from '../commands/consent.js';
import { runAudit } from '../commands/audit.js';

function parseConsentArgs(rawPrompt: string): import('../commands/consent.js').ConsentOptions {
  const opts: import('../commands/consent.js').ConsentOptions = {};
  if (/--local\s+on/i.test(rawPrompt))   opts.local  = 'on';
  if (/--local\s+off/i.test(rawPrompt))  opts.local  = 'off';
  if (/--upload\s+on/i.test(rawPrompt))  opts.upload = 'on';
  if (/--upload\s+off/i.test(rawPrompt)) opts.upload = 'off';
  if (/--reset/i.test(rawPrompt))         opts.reset  = true;
  return opts;
}

export async function dispatchCoherenceCommand(
  name: string,
  rawPrompt: string,
  store: StateStore,
  projectRoot: string,
  _sessionId: string,
): Promise<HookResult | null> {
  const local = name.replace(/^coherence:/, '');
  switch (local) {
    case 'consent': {
      const result = await runConsent(projectRoot, parseConsentArgs(rawPrompt));
      return { success: true, additionalContext: result };
    }
    case 'audit': {
      const result = await runAudit(projectRoot);
      return { success: true, additionalContext: result };
    }
    default:
      return null;
  }
}
```

Note: `HookResult` is exported from `src/hooks/exceptionGuard.ts` (verified). It has `{ success: boolean; additionalContext?: string; refusedLegacy?: boolean }` — `additionalContext` is the correct field for returning command output.

- [ ] **Step 9: Wire sentinel detection into `src/hooks/userPromptSubmit.ts`**

Open `src/hooks/userPromptSubmit.ts`. Find the DD-068 signature emission block (or the long-turn boundary check). Insert the sentinel detection immediately after the signature block, before the long-turn check:

```typescript
// v0.4 G-1 — slash-command sentinel dispatch (DD-130, FR-AUTOGEN-1).
// commands/<name>.md stubs contain: <!-- coherence-command: <name> -->
// When a /coherence: command is invoked, Claude Code routes the rendered stub
// content here via UserPromptSubmit.
if (typeof evt?.prompt === 'string') {
  const sentinelRe = /<!--\s*coherence-command:\s*(\S+)\s*-->/;
  const match = sentinelRe.exec(evt.prompt);
  if (match) {
    const cmdName = match[1];
    const result = await dispatchCoherenceCommand(
      cmdName, evt.prompt, store, projectRoot, sessionId,
    );
    if (result !== null) return result;
  }
}
```

Import `dispatchCoherenceCommand` from `'./commandDispatch.js'`.

Ensure `store`, `projectRoot`, and `sessionId` are available at this insertion point (they should be from the existing v0.3 handler setup).

- [ ] **Step 10: Run all new tests**

```bash
npx vitest run tests/unit/hooks/command-dispatch.test.ts tests/static-analysis/autogen-stubs.test.ts
```

Expected: **PASS**.

- [ ] **Step 11: Run the full test suite**

```bash
npx vitest run
```

Expected: ~848+/848+ pass.

- [ ] **Step 12: Commit**

```bash
git add scripts/generate-command-stubs.mjs src/hooks/commandDispatch.ts src/hooks/userPromptSubmit.ts package.json .gitignore tests/static-analysis/autogen-stubs.test.ts tests/unit/hooks/command-dispatch.test.ts
git commit -m "feat(M4): autogen command stubs + sentinel dispatch in UserPromptSubmit (DD-130)"
```

---

## Task 6: M5 — Tri-partition enforcement + release pipeline + version bumps + docs

**Goal:** Extend `no-cross-dev-leak.test.ts` with the tri-partition tier assertion. Update the release pipeline step order in `scripts/release-ga.mjs`. Bump all version strings to `0.4.0`. Cut the `docs/v0.4/` documentation set.

**Gates closed:** M-TRIPLEX-1 (storage tier enforcement), M-VALIDATE-1 (from release pipeline), M-SEMVER-1 (from release pipeline)

**Files:**
- Modify: `tests/static-analysis/no-cross-dev-leak.test.ts`
- Modify: `scripts/release-ga.mjs` (full step order)
- Modify: `package.json` (version → `0.4.0`)
- Modify: `.claude-plugin/plugin.json` (version → `0.4.0`)
- Modify: `src/state/init.ts` (`PLUGIN_VERSION` → `'0.4.0'`)
- Create: `docs/v0.4/CHANGELOG.md`
- Create: `docs/v0.4/commands.md`
- Create: `docs/v0.4/state-files.md`
- Create: `docs/v0.4/privacy.md`
- Create: `docs/v0.4/rollback.md`

---

- [ ] **Step 1: Extend `tests/static-analysis/no-cross-dev-leak.test.ts` with tri-partition assertion**

Open the file. It already has a `walk(SRC)` helper function and all needed imports (`readFileSync`, `readdirSync`, `statSync`, `path`, `ROOT`, `SRC`, `describe`, `it`, `expect`). **Do NOT add duplicate imports or a second `describe` block for existing tests.**

Append to the end of the file — add the constants and the new `describe` block only:

```typescript
// ---- M-TRIPLEX-1 addition (v0.4) ----

// Complete set of filenames written via store.write() in src/ — verified by grepping
// all store.write() calls. All are per-developer (.claude/coherence/) tier.
// plan.json writes go via coherence/plans/<sha>/<id>.json (per-team tier) — covered by PER_TEAM_PREFIXES.
// Source: grep -rn "store\.write(" src/ + FILE_TO_SCHEMA in stateStore.ts.
// Some writes use string constants (e.g. SCOPE_CACHE_FILE) and won't be caught
// by the literal-string regex, but including them here is harmless.
const PER_DEV_FILES = new Set([
  // v0.3 carry-over — all per-project per-developer (.claude/coherence/) tier
  'config.json',
  'version.json',
  'host-capabilities.json',
  'drift-buffer.json',
  'velocity.json',
  'stop-progress.json',
  'cost-ledger.json',
  'subagent-stats.json',
  'section-index.json',
  'graduation.json',
  'proposal-cache.json',
  'signal-cache.json',
  'state-snapshot.json',
  'scan-cache/state.json',
  'scan-cache/tombstones.json',
  'scope-cache.json',
  // v0.4 addition
  'trigger-state.json',
]);

// appendJsonl targets — also per-developer
const PER_DEV_JSONL = new Set(['metrics.jsonl', 'coherence-log.jsonl']);

const PER_TEAM_PREFIXES = ['coherence/plans/', 'coherence/ignore', 'coherence/scope.json'];

describe('M-TRIPLEX-1 — storage tier enforcement', () => {
  it('every store.write() call uses a filename in the correct tier', () => {
    // Reuse the walk() helper already defined in this file.
    const srcFiles = walk(SRC);
    const violations: string[] = [];

    for (const file of srcFiles) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      const content = readFileSync(file, 'utf8');

      const writeRe = /store\.write\(\s*['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = writeRe.exec(content)) !== null) {
        const filename = m[1];
        const isPerDev  = PER_DEV_FILES.has(filename);
        const isPerTeam = PER_TEAM_PREFIXES.some(p => filename.startsWith(p));
        if (!isPerDev && !isPerTeam) {
          violations.push(`${rel}: store.write('${filename}') — not in any known tier`);
        }
      }

      const appendRe = /store\.appendJsonl\(\s*['"]([^'"]+)['"]/g;
      while ((m = appendRe.exec(content)) !== null) {
        const filename = m[1];
        if (!PER_DEV_JSONL.has(filename) && !PER_DEV_FILES.has(filename)) {
          violations.push(`${rel}: store.appendJsonl('${filename}') — not in any known tier`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(`Tier violations found:\n${violations.join('\n')}`);
    }
  });
});
```

If the test fails reporting a file not in any tier, add it to `PER_DEV_FILES` (if it's per-developer) or `PER_TEAM_PREFIXES` (if it's per-team). Do not ignore violations — they represent real architectural drift.

- [ ] **Step 2: Run the extended gate to confirm it passes (no tier violations)**

```bash
npx vitest run tests/static-analysis/no-cross-dev-leak.test.ts
```

Expected: **PASS**. If violations are reported, fix the offending `store.write()` call to use the correct tier filename before proceeding.

- [ ] **Step 3: Verify the full gates suite is green**

```bash
npm run gates
```

Expected: all three static-analysis tests + ship tests pass. Fix any failures before continuing.

- [ ] **Step 4: Bump version to `0.4.0` in all three sources**

In `package.json`:
```json
"version": "0.4.0"
```

In `.claude-plugin/plugin.json`:
```json
"version": "0.4.0"
```

In `src/state/init.ts`, find and update:
```typescript
export const PLUGIN_VERSION = '0.4.0';
```

Also update `src/state/consent.ts#DEFAULT_PLUGIN_VERSION` if it exists:
```typescript
const DEFAULT_PLUGIN_VERSION = '0.4.0';
```

- [ ] **Step 5: Run `assertVersionSync` check manually to confirm all sources match**

```bash
node -e "
const pkg = JSON.parse(require('fs').readFileSync('package.json','utf8'));
const manifest = JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8'));
const initSrc = require('fs').readFileSync('src/state/init.ts','utf8');
const m = /PLUGIN_VERSION\s*=\s*['\"]([\d.]+)['\"]/.exec(initSrc);
console.log('package.json:', pkg.version);
console.log('plugin.json:', manifest.version);
console.log('PLUGIN_VERSION:', m?.[1]);
console.log('Match:', pkg.version === manifest.version && pkg.version === m?.[1]);
"
```

Expected output:
```
package.json: 0.4.0
plugin.json: 0.4.0
PLUGIN_VERSION: 0.4.0
Match: true
```

- [ ] **Step 6: Run the full test suite one final time**

```bash
npx vitest run
```

Expected: ~848+/848+ pass. Zero failures.

- [ ] **Step 7: Create `docs/v0.4/` documentation set**

Create `docs/v0.4/CHANGELOG.md` with at minimum the following structure (fill in with actual delta summaries from each milestone):

```markdown
# Coherence v0.4 — CHANGELOG

> v0.4 polishes for first impressions: official plugin manifest layout, consent command,
> audit bundling, path sandboxing, trigger contracts, and parseMajor correctness.

## M0 — Manifest relocation + validate gate (DD-119, DD-121, DD-123)
- `plugin.json` relocated to `.claude-plugin/plugin.json` per official plugin schema.
- FR-MANIFEST-4 fields populated: `author`, `license`, `repository`, `keywords`.
- `scripts/validate-plugin.mjs` added; `npm run validate-plugin` runs `claude plugin validate`.
- `assertVersionSync(tag)` in release pipeline ensures all three version sources match.

## M1 — parseMajor fix + refuseLayout (DD-122, DD-124)
- `parseMajor()` fixed to use semantic major digit only (was conflating minor into major for ≥1.0.0).
- `refuseLayout()` + `refuse_layout` discriminant added to `refuseLegacy.ts`.
- SessionStart Step 1b: refuses install if old `plugin.json` layout detected at plugin root.

## M2 — Trigger contracts (DD-129, DD-120)
- `src/state/triggerContracts.ts`: TC-1 (author-planner promotion hint at ≥25% cross-kind, 30-day window) and TC-2 (calibration re-tune hint at ≥50 sessions × ≥30 days).
- `trigger-state.json` — new per-developer state file; one-time hint guard.
- `firstRun.ts` creates `${CLAUDE_PLUGIN_DATA}` directory on fresh install.

## M3 — Consent + sandbox + audit (DD-125, DD-127, DD-128)
- `/coherence:consent` — read/write telemetry consent without a TTY.
- `--out` path sandboxing in `/coherence:export-metrics` now applies always (not just on mkdir).
- `/coherence:audit` — bundling-only report: doctor + scope-debug + status + metrics export.
- `promptInteractive` placeholder removed from `src/state/consent.ts`.

## M4 — Autogen stubs + sentinel dispatch (DD-130)
- `scripts/generate-command-stubs.mjs` generates `commands/<name>.md` at build time.
- `commands/` and `.coherence-stub-hash` gitignored (build artifacts).
- UserPromptSubmit detects `<!-- coherence-command: <name> -->` sentinel and dispatches to JS handler.
- `src/hooks/commandDispatch.ts` routes `coherence:consent` and `coherence:audit`.

## M5 — Tri-partition enforcement + release pipeline
- `no-cross-dev-leak.test.ts` extended with M-TRIPLEX-1 tier assertions.
- Release pipeline: `build → assertVersionSync → validate-plugin → gates → test → tag`.
- Version bumped to `0.4.0` across `package.json`, `.claude-plugin/plugin.json`, `PLUGIN_VERSION`.
```

Create `docs/v0.4/commands.md` — copy `docs/v0.3/commands.md` verbatim, then add entries for the two new commands:

```markdown
## /coherence:consent

View or update telemetry consent without needing a TTY (DD-127, FR-CONSENT-1).

Usage: `/coherence:consent [--local on|off] [--upload on|off] [--reset]`

- No flags: print current consent state.
- `--local on|off`: enable/disable local hashed event collection (default: on).
- `--upload on|off`: enable/disable the copy-paste curl hint in `/coherence:export-metrics` (default: off).
- `--reset`: delete the `config.json#telemetry` key entirely, restoring silent defaults.

## /coherence:audit

Bundling-only audit report (DD-125, FR-AUDIT-1). Runs four existing commands in sequence and renders a single Markdown report. Deep audit ships in v1.0.

Output sections: `## Doctor`, `## Scope Debug`, `## Status`, `## Metrics Export`

Each section wraps its command's output; failures are captured as `[error: ...]` rather than aborting the report.
```

Create `docs/v0.4/state-files.md` with the full tri-partition map:

```markdown
# Coherence v0.4 — State Files

v0.4 establishes three storage tiers with distinct semantics.

## Tier 1: Per-installation (`${CLAUDE_PLUGIN_DATA}`)

Path: `~/.claude/plugins/data/cohrence/` (or `$CLAUDE_PLUGIN_DATA/` if set by Claude Code)

Survives plugin updates. In v0.4 the directory is created on fresh install but no files are written here yet — reserved for v0.4.1+.

## Tier 2: Per-project per-developer (`.claude/coherence/`)

Gitignored. All existing v0.3 files plus:

| File | Owner | Description |
|---|---|---|
| `trigger-state.json` | Plugin | One-time hint guard for TC-1 / TC-2 trigger contracts (DD-129). Absent on fresh install. Written atomically when a threshold is first crossed. Never cleared. |

Full file list (unchanged from v0.3 except the addition above):
`version.json`, `config.json`, `trigger-state.json`, `metrics.jsonl`, `coherence-log.jsonl`, `proposal-cache.json`, `scope-cache.json`, `signal-cache.json`, `session-map.json`, `velocity.json`, `graduation.json`, `state-snapshot.json`.

## Tier 3: Per-team (`coherence/`)

Committed to the repository. Unchanged from v0.3: `plans/<branch-sha>/`, `ignore`, `ignore.local` (gitignored), `scope.json`.

## `trigger-state.json` schema

```json
{
  "tc1_hint_emitted_at": "<ISO8601 or absent>",
  "tc2_hint_emitted_at": "<ISO8601 or absent>"
}
```

`tc1_hint_emitted_at`: set when the author-planner readiness hint (TC-1) has been emitted. Once set, never cleared.
`tc2_hint_emitted_at`: set when the calibration re-tune hint (TC-2) has been emitted. Once set, never cleared.
```

Create `docs/v0.4/privacy.md` — copy `docs/v0.3/privacy.md`, then add:

```markdown
## v0.4 additions

No new telemetry events are introduced in v0.4. The trigger-contract evaluation (`evaluateTriggerContracts`) reads `metrics.jsonl` locally and writes only to `trigger-state.json` — no events are emitted for threshold crossing itself. The one-time hint is printed to stdout only.

`/coherence:consent` writes to `config.json#telemetry` only. No new event is emitted on consent change.
```

Create `docs/v0.4/rollback.md` — copy `docs/v0.3/rollback.md`, then add:

```markdown
## v0.4 note on parseMajor (DD-124)

Prior to v0.4, `parseMajor` used `major * 1000 + minor` as the breaking-change key, treating v0.3 → v0.4 as a cross-major bump. This was corrected: the key is now the semantic major digit only. All `0.x.y` versions are the same major bucket. Cross-major recovery refusal fires only when the semantic major digit differs (e.g. targeting `v1.0.0` from a `v0.4.x` install).

Within-major-version recovery is unchanged.
```

- [ ] **Step 8: Final commit — version bumps + documentation**

```bash
git add package.json .claude-plugin/plugin.json src/state/init.ts src/state/consent.ts tests/static-analysis/no-cross-dev-leak.test.ts scripts/release-ga.mjs docs/v0.4/
git commit -m "feat(M5): version 0.4.0 + tri-partition gate + release pipeline + docs/v0.4/ (DD-120, M-TRIPLEX-1)"
```

- [ ] **Step 9: Run the full release-gate preflight dry-run**

```bash
node scripts/release-ga.mjs --dry-run 0.4.0
```

(Add `--dry-run` support to `scripts/release-ga.mjs` if not already present, so the preflight runs without cutting a tag.) Expected: all gates pass, no version mismatches, `claude plugin validate` exits 0.

---

## Acceptance summary

v0.4 GA when all of the following are green on master:

| Gate | Verified by |
|---|---|
| M-VALIDATE-1 — `claude plugin validate` exits 0 | `npm run validate-plugin` + `tests/ship/validate-gate-trip.test.ts` |
| M-SEMVER-1 — version sources match tag | `assertVersionSync()` in release pipeline |
| M-LAYOUT-1 — `refuseLayout` unit tests pass | `tests/unit/state/refuse-layout.test.ts` |
| M-PARSEMAJOR-1 — `parseMajor` unit tests pass | `tests/unit/commands/recover-parse-major.test.ts` |
| M-TRIGGER-1 — trigger contracts unit tests pass | `tests/unit/state/trigger-contracts.test.ts` |
| M-CONSENT-1 — consent integration tests pass | `tests/integration/consent.test.ts` |
| M-SANDBOX-1 — sandbox integration tests pass | `tests/integration/export-metrics.test.ts` (extended) |
| M-AUDIT-1 — audit integration tests pass | `tests/integration/audit.test.ts` |
| M-AUTOGEN-1 — 1:1 stub mapping static-analysis | `tests/static-analysis/autogen-stubs.test.ts` |
| M-TRIPLEX-1 — storage tier enforcement | `tests/static-analysis/no-cross-dev-leak.test.ts` (extended) |
| M-COST-1 — zero new LLM calls (carry) | TS-4 confirmation; no new cassette fixtures added |

Post-GA (informational, not blockers): M-ADOPT-1, M-IGNORE-1, M-SCOPE-1, M-PLANS-1 carry from v0.3.

---

## Cross-references

- [v0.4 Overview](https://www.notion.so/35d010d46a7081d687d8f32f4a25f500) · [TSD index](https://www.notion.so/35d010d46a7081858d6ff32edcce2e2b)
- [TS-1 Packaging](https://www.notion.so/35d010d46a7081f3a174efe4913bfaf2) · [TS-2 Hooks](https://www.notion.so/35d010d46a70811b96e8c195af1ef7c6) · [TS-3 Schemas](https://www.notion.so/35d010d46a7081ae9273c6c6f8d63e74) · [TS-5 Compat](https://www.notion.so/35d010d46a708193abc8e76bd0a78c19) · [TS-6 Security](https://www.notion.so/35d010d46a70813e886ee082e0e10710) · [TS-7 Commands](https://www.notion.so/35d010d46a7081279cd4ed3b199947e0) · [TS-8 Release](https://www.notion.so/35d010d46a70813384d4c3500ca82116)
- **v0.3 plan:** `docs/superpowers/plans/2026-05-10-coherence-v0.3.md`
- **DD register:** DD-119..DD-130 in Notion v0.4 Design Decisions sub-page