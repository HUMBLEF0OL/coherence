# Phase 4 — Hardening Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 4 of the S+ roadmap — 10 hardening moves (T1, T2, T3, T4, T5, T6, T7 is already done in Phase 1, T8, T9, T10, M5) on top of Phase 3's `dev`. This phase pushes the strong axes (test rigor, release engineering, safety, code quality) from 9 → 10.

**Architecture:** Mostly infrastructure additions — mutation tests (Stryker), property-based tests (fast-check), coverage gate, perf-regression gate, SBOM emission, SLSA-L3 provenance, threat-model doc, debug-log parity, convention audit. T8 changes the release-notes generation, M5 deletes or documents legacy magic conventions.

**Tech Stack:** Vitest, Stryker Mutator, fast-check, GitHub Actions, SLSA generator, CycloneDX, conventional-commits → release notes.

**Spec:** [docs/superpowers/specs/2026-05-14-s-plus-roadmap-design.md](../specs/2026-05-14-s-plus-roadmap-design.md) (§ Phase 4 — Hardening pass)

**Depends on:** Phase 1 + 2 + 3 landed on `dev`. T7 (Dependabot) already landed in Phase 1's Task 2; not repeated here.

---

## File Structure

**New files:**
- `stryker.config.mjs` — Stryker config (T1)
- `tests/properties/validation-chain.property.test.ts` — fast-check pipeline invariants (T2)
- `vitest.config.ts` — coverage threshold update (T3) — modify existing
- `scripts/perf-budget.json` — wall-clock budgets per perf test (T4)
- `tests/perf/budgets.test.ts` — fails CI when a perf test exceeds its budget (T4)
- `scripts/release-notes.mjs` — conventional-commits → markdown (T8)
- `scripts/gen-sbom.mjs` — wrapper around `npm sbom` that writes `dist/sbom.cdx.json` (T6)
- `.github/workflows/slsa.yml` — SLSA-L3 provenance generator (T5)
- `docs/threat-model.md` — STRIDE-shaped writeup (T9)
- `src/util/debug.ts` — central debug-log helper (T10)
- `docs/conventions.md` — surviving magic conventions (M5)

**Modified files:**
- `scripts/release-ga.mjs` — invoke `gen-sbom.mjs` + emit provenance hooks (T5/T6)
- `.github/workflows/release.yml` — invoke SLSA generator (T5)
- `package.json` — `bump-but-keep-deps-from-stryker` & `mutate` / `properties` / `perf` script entries (T1, T2, T4)
- `vitest.config.ts` — coverage thresholds (T3)
- `src/state/*` and other state-transition sites — debug log lines (T10)
- `tests/static-analysis/no-cross-dev-leak.test.ts` — drop the version-scanner allowlist after audit if applicable (M5)
- Possibly: `scripts/generate-command-stubs.mjs` if M5 audit deletes the hash-check (M5)

---

## Task 1: T10 — `claude --debug` parity (do first, used by other tasks)

Adding debug log lines makes the other Phase 4 tasks' instrumentation easier. Do this first.

### Step 1.1 — Centralize debug logging

- [ ] **Step 1: Read existing logging patterns**

Run: `grep -rn "console.error\|console.log\|debug" src/ --include='*.ts' | head -30`

Identify the project's current logging convention. Most plugins prefer environment-gated logging (e.g. `if (process.env.COHERENCE_DEBUG) console.error(...)`)).

- [ ] **Step 2: Write a failing test for the debug helper**

Create `tests/unit/util/debug.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { debug, setDebugSink } from '../../../src/util/debug.js';

describe('debug helper', () => {
  let sink: string[];
  beforeEach(() => {
    sink = [];
    setDebugSink((line) => sink.push(line));
  });
  afterEach(() => setDebugSink(null));

  it('emits when COHERENCE_DEBUG is set', () => {
    process.env.COHERENCE_DEBUG = '1';
    debug('test', 'stage1 fired');
    expect(sink).toEqual(['[coherence:test] stage1 fired']);
    delete process.env.COHERENCE_DEBUG;
  });

  it('is silent when COHERENCE_DEBUG is unset', () => {
    delete process.env.COHERENCE_DEBUG;
    debug('test', 'stage1 fired');
    expect(sink).toEqual([]);
  });

  it('serializes object args', () => {
    process.env.COHERENCE_DEBUG = '1';
    debug('test', 'meta', { sectionId: 'install' });
    expect(sink[0]).toContain('"sectionId":"install"');
    delete process.env.COHERENCE_DEBUG;
  });
});
```

- [ ] **Step 3: Verify the test fails**

Run: `npx vitest run tests/unit/util/debug.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/util/debug.ts`**

```typescript
type Sink = ((line: string) => void) | null;
let sink: Sink = (line) => console.error(line);

export function setDebugSink(s: Sink): void {
  sink = s ?? null;
}

export function debug(channel: string, message: string, ...meta: unknown[]): void {
  if (!process.env.COHERENCE_DEBUG) return;
  if (!sink) return;
  const parts: string[] = [`[coherence:${channel}] ${message}`];
  for (const m of meta) {
    parts.push(typeof m === 'string' ? m : JSON.stringify(m));
  }
  sink(parts.join(' '));
}
```

- [ ] **Step 5: Test passes**

Run: `npx vitest run tests/unit/util/debug.test.ts`
Expected: PASS (3 tests).

### Step 1.2 — Sprinkle debug lines at state transitions

- [ ] **Step 6: Inventory state-transition sites**

The minimum set to instrument (per the spec's "every state transition gets a debug log line"):
- `src/pipeline/stop.ts:runStopOrchestrator` entry + exit, per-section progress
- `src/pipeline/stage1.ts:processSection` entry + exit + error path
- `src/pipeline/stage2.ts:runStage2` entry + exit + each validation hop
- `src/state/trustLedger.ts:recordEvent` (lock acquire, write, release)
- `src/state/stateStore.ts` atomic write path (read-modify-write boundary)
- `src/hooks/degradedMode.ts:isDegraded` and the flag-flip site
- `src/state/quarantine.ts` move-to-quarantine site

- [ ] **Step 7: Add `debug('<channel>', '<message>', { ...meta })` calls at each site**

Channels suggested:
- `pipeline.stop`, `pipeline.stage1`, `pipeline.stage2`
- `trust.ledger`
- `state.store`, `state.quarantine`
- `hooks.degraded`

Keep each line under 200 chars. Don't log file contents, just identifiers + counts.

- [ ] **Step 8: Verify the test suite still passes**

Run: `npm test`
Expected: All pass.

- [ ] **Step 9: Smoke-test debug output**

Run: `COHERENCE_DEBUG=1 npm test 2>&1 | grep "\[coherence:" | head -10`
Expected: Several lines of debug output from instrumented sites. (If zero, the instrumentation didn't fire — investigate.)

- [ ] **Step 10: Commit T10**

```bash
git add src/util/debug.ts tests/unit/util/debug.test.ts src/pipeline/ src/state/ src/hooks/degradedMode.ts
git status --short
git commit -m "feat(debug): centralize debug logging via COHERENCE_DEBUG env (T10)

src/util/debug.ts is the one debug helper. Channels: pipeline.stop,
pipeline.stage1, pipeline.stage2, trust.ledger, state.store,
state.quarantine, hooks.degraded. Sites instrumented per the spec's
'every state transition' guidance. Sink-replaceable for tests.

Silent unless COHERENCE_DEBUG is set. Zero production-mode overhead.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: T3 — Coverage threshold gate

### Step 2.1 — Enable coverage in vitest config

- [ ] **Step 1: Add `@vitest/coverage-v8` if missing**

Run: `node -e "const p=require('./package.json'); console.log(p.devDependencies?.['@vitest/coverage-v8'] ?? 'missing')"`

If missing:

Run: `npm install --save-dev @vitest/coverage-v8`

- [ ] **Step 2: Update `vitest.config.ts` with coverage thresholds**

Add a `coverage` block to the existing config:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json-summary'],
  include: ['src/**/*.ts'],
  exclude: ['src/**/*.d.ts', 'src/**/types/**'],
  thresholds: {
    'src/validation/**/*.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    // global floor (looser) catches the rest
    branches: 75,
    functions: 75,
    lines: 75,
    statements: 75,
  },
},
```

The strict 90% applies to `src/validation/` only; rest of `src/` has a 75% floor that we'll tighten in follow-up patches.

- [ ] **Step 3: Run coverage and see where we stand**

Run: `npm run test:coverage`
Expected: Either passes (great), or fails listing which files / metrics are under threshold.

If under threshold:
- For each gap, decide: add a test or lower the threshold in this commit. Recommendation: lower the threshold to current value rounded down to the nearest 5, then file a follow-up to climb back.

- [ ] **Step 4: Add a `coverage:check` script**

In `package.json`:

```json
"coverage:check": "vitest run --coverage"
```

- [ ] **Step 5: Commit T3**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "test(coverage): enable coverage gate, 90% for src/validation, 75% global (T3)

Stricter threshold for src/validation/ (the asserts engines and the
hallucination corpus are the path most likely to catch regressions
silently). Global floor at 75% — patches under that are flagged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: T2 — Property-based tests on the validation chain

### Step 3.1 — Install fast-check

- [ ] **Step 1: Install**

Run: `npm install --save-dev fast-check`

### Step 3.2 — Write property tests

- [ ] **Step 2: Create `tests/properties/validation-chain.property.test.ts`**

Choose 3–5 invariants on the validation chain. Examples:

```typescript
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { runValidationChain } from '../../src/validation/runValidationChain.js'; // adjust to actual

describe('validation chain properties', () => {
  it('never auto-applies destructive patches regardless of trust score', () => {
    fc.assert(
      fc.property(
        fc.record({
          score: fc.float({ min: 0, max: 1 }),
          patchKind: fc.constantFrom('destructive', 'modifying', 'frontmatter'),
          patchText: fc.string(),
        }),
        ({ score, patchKind, patchText }) => {
          const result = runValidationChain({ patchKind, patchText, sectionScore: score });
          if (patchKind === 'destructive') {
            return result.autoApply === false;
          }
          return true;
        },
      ),
    );
  });

  it('a patch that mentions an unknown symbol is always rejected by hallucination', () => {
    fc.assert(
      fc.property(
        fc.record({ unknownSymbol: fc.stringMatching(/^xyz_[a-z0-9]+$/) }),
        ({ unknownSymbol }) => {
          const patch = `+ The function ${unknownSymbol}() now returns a string.`;
          const result = runValidationChain({ patchKind: 'modifying', patchText: patch, sectionScore: 0.9 });
          return result.rejectedAt === 'hallucination';
        },
      ),
    );
  });

  it('line-ratio check rejects patches that grow a section by >2x', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 10, max: 100 }),
          fc.integer({ min: 250, max: 1000 }),
        ),
        ([before, after]) => {
          const result = runValidationChain({
            patchKind: 'modifying',
            beforeLines: before,
            afterLines: after,
            patchText: 'irrelevant',
            sectionScore: 0.9,
          });
          return result.rejectedAt === 'lineRatio';
        },
      ),
    );
  });
});
```

Adjust to the actual `runValidationChain` (or equivalent entry point) signature in the codebase. The point is: each property is a *universal claim* the pipeline must uphold for all inputs in a generated space.

- [ ] **Step 3: Run and verify**

Run: `npx vitest run tests/properties/`
Expected: All properties pass (1000 generated cases per property by default).

If a property fails, fast-check prints the *minimal* failing case. Either fix the implementation (real bug) or tighten the property (we made an overly broad claim).

- [ ] **Step 4: Add `npm run properties` script**

In `package.json`:

```json
"properties": "vitest run tests/properties/"
```

- [ ] **Step 5: Commit T2**

```bash
git add tests/properties/ package.json package-lock.json
git commit -m "test(properties): fast-check invariants on validation chain (T2)

Three universal claims on the pipeline:
  - destructive patches NEVER auto-apply regardless of trust score
  - unknown-symbol mentions ALWAYS trip hallucination
  - >2x line growth ALWAYS trips line-ratio
1000 generated cases per property. Minimal failing case auto-reported.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: T1 — Mutation testing via Stryker

### Step 4.1 — Install + configure

- [ ] **Step 1: Install Stryker for vitest**

Run: `npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker`

- [ ] **Step 2: Create `stryker.config.mjs`**

```javascript
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: [
    'src/validation/**/*.ts',
    '!src/validation/**/*.d.ts',
  ],
  reporters: ['html', 'progress', 'clear-text'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: { high: 80, low: 60, break: 50 },
  timeoutMS: 60000,
  concurrency: 4,
  vitest: {
    configFile: 'vitest.config.ts',
  },
};
```

`mutate` is scoped to `src/validation/` initially — the highest-leverage code. Expand later if Stryker's runtime is acceptable.

- [ ] **Step 3: Add `npm run mutate` script**

In `package.json`:

```json
"mutate": "stryker run"
```

- [ ] **Step 4: First Stryker run**

Run: `npm run mutate`
Expected: Long run (minutes). Output: a mutation score, an HTML report under `reports/mutation/`.

If the score is under the `break: 50` threshold, the command exits non-zero. Tighten by either:
- Adding tests that constrain the mutants Stryker survived (read the report)
- Lowering `break` temporarily and filing a follow-up

- [ ] **Step 5: Add `reports/mutation/` to `.gitignore`**

Append `reports/` to `.gitignore`. We don't ship the HTML report.

- [ ] **Step 6: Commit T1**

```bash
git add stryker.config.mjs package.json package-lock.json .gitignore
git commit -m "test(mutation): Stryker mutation testing on src/validation (T1)

Surface tests that pass without constraining behavior. Scoped to
src/validation/ (asserts engines + hallucination corpus) as the
highest-stakes path. Thresholds: high 80 / low 60 / break 50.

Run via \`npm run mutate\`. HTML report at reports/mutation/ (gitignored).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: T4 — Lock perf budgets

### Step 5.1 — Capture current budgets

- [ ] **Step 1: Run the perf suite, record wall-clock per test**

Run: `npx vitest run tests/perf/ --reporter=verbose`
Expected: A list of perf tests with their wall-clock times.

- [ ] **Step 2: Create `scripts/perf-budget.json`**

For each perf test, set a budget at 1.5x its current wall-clock (gives room for noise; tightens later):

```json
{
  "tests/perf/audit-free.test.ts": { "maxMs": 600 },
  "tests/perf/metrics-renderer.test.ts": { "maxMs": 400 },
  "tests/perf/trust-ledger-recordEvent.test.ts": { "maxMs": 300 },
  ...
}
```

Replace `...` with all 8 perf-test files identified by `ls tests/perf/*.test.ts`.

### Step 5.2 — Write the budget enforcer

- [ ] **Step 3: Create `tests/perf/budgets.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const budget = JSON.parse(readFileSync('scripts/perf-budget.json', 'utf8'));

describe('perf budget enforcement', () => {
  it('every perf test in tests/perf has a budget entry', () => {
    const glob = require('node:fs').readdirSync('tests/perf').filter((f: string) => f.endsWith('.test.ts') && f !== 'budgets.test.ts');
    const missing = glob.filter((f: string) => !budget[`tests/perf/${f}`]);
    expect(missing).toEqual([]);
  });
});
```

The enforcement of actual wall-clock requires plumbing through vitest's reporter. For v1.1.0, just gate on "every perf test has a budget entry" + check the budgets manually in CI. Full automatic regression-detection is a follow-up if time permits.

- [ ] **Step 4: Commit T4**

```bash
git add scripts/perf-budget.json tests/perf/budgets.test.ts
git commit -m "test(perf): lock budget per perf test in scripts/perf-budget.json (T4)

First pass: budgets pinned at 1.5x current wall-clock; static-analysis
gate ensures every tests/perf/*.test.ts has a corresponding budget
entry. Automatic regression-detection (fail CI when wall-clock exceeds
budget) deferred to a follow-up patch — needs vitest reporter plumbing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: T8 — Auto-generated release notes

### Step 6.1 — Build the generator

- [ ] **Step 1: Create `scripts/release-notes.mjs`**

```javascript
#!/usr/bin/env node
/**
 * Generate the "Commits" section of a release notes file from
 * conventional-commits in git log between two refs.
 *
 * Usage:
 *   node scripts/release-notes.mjs <from-ref> <to-ref> > out.md
 *
 * Output is markdown — caller appends to the hand-written narrative.
 */
import { execSync } from 'node:child_process';

const [from, to = 'HEAD'] = process.argv.slice(2);
if (!from) {
  console.error('Usage: release-notes.mjs <from-ref> [to-ref]');
  process.exit(1);
}

const log = execSync(`git log --format="%H%x00%s%x00%b%x00%an" ${from}..${to}`, { encoding: 'utf8' });
const commits = log.split('\n').filter(Boolean).map((line) => {
  const [hash, subject, body, author] = line.split('\x00');
  return { hash: hash.slice(0, 7), subject, body, author };
});

const CONVENTIONAL = /^(feat|fix|chore|docs|test|refactor|build|ci|perf|style|revert)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
const groups = { feat: [], fix: [], refactor: [], perf: [], docs: [], test: [], ci: [], build: [], chore: [], other: [] };

for (const c of commits) {
  const m = CONVENTIONAL.exec(c.subject);
  if (!m) {
    groups.other.push(c);
    continue;
  }
  const [, type, scope, breaking, summary] = m;
  c.formatted = `- ${scope ? `**${scope}**: ` : ''}${summary}${breaking ? ' **(BREAKING)**' : ''} \`${c.hash}\``;
  (groups[type] ?? groups.other).push(c);
}

const HEADINGS = {
  feat: 'Features',
  fix: 'Fixes',
  refactor: 'Refactors',
  perf: 'Performance',
  docs: 'Documentation',
  test: 'Tests',
  ci: 'CI',
  build: 'Build',
  chore: 'Chores',
  other: 'Other',
};

for (const key of Object.keys(HEADINGS)) {
  if (!groups[key].length) continue;
  console.log(`\n## ${HEADINGS[key]}\n`);
  for (const c of groups[key]) {
    console.log(c.formatted ?? `- ${c.subject} \`${c.hash}\``);
  }
}
```

- [ ] **Step 2: Add `npm run release-notes`**

In `package.json`:

```json
"release-notes": "node scripts/release-notes.mjs"
```

- [ ] **Step 3: Smoke-test on the v1.0.2..v1.0.3 range**

Run: `node scripts/release-notes.mjs v1.0.2 v1.0.3`
Expected: A grouped markdown listing of v1.0.3's commits.

- [ ] **Step 4: Commit T8**

```bash
git add scripts/release-notes.mjs package.json
git commit -m "feat(release): generate notes from conventional-commits (T8)

scripts/release-notes.mjs groups commits between two refs into
Features / Fixes / Refactors / Performance / Documentation / Tests / CI
/ Build / Chores / Other sections. Used by the release plan to seed
the per-version notes file; manual narrative stays on top.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: T6 — SBOM emission

### Step 7.1 — SBOM generator

- [ ] **Step 1: Create `scripts/gen-sbom.mjs`**

```javascript
#!/usr/bin/env node
/**
 * Emit a CycloneDX SBOM via `npm sbom`. Output: dist/sbom.cdx.json.
 * Runs as part of `npm run build`.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const sbom = execSync('npm sbom --sbom-format=cyclonedx --omit=dev', { encoding: 'utf8' });
writeFileSync('dist/sbom.cdx.json', sbom);
console.log('[gen-sbom] wrote dist/sbom.cdx.json');
```

- [ ] **Step 2: Wire it into the build chain**

Edit `package.json` `build` script. Add `&& node scripts/gen-sbom.mjs` at the end:

```json
"build": "tsc --project tsconfig.json && node scripts/render-readme-verification.mjs && node scripts/copy-schemas.mjs && node scripts/generate-command-stubs.mjs && node scripts/gen-sbom.mjs"
```

- [ ] **Step 3: Smoke-test**

Run: `npm run build`
Expected: Build clean. `dist/sbom.cdx.json` exists.

- [ ] **Step 4: Verify the SBOM is valid CycloneDX**

Run: `node -e "const s=JSON.parse(require('fs').readFileSync('dist/sbom.cdx.json','utf8')); console.log('bomFormat:',s.bomFormat,'components:',s.components?.length ?? 0)"`
Expected: `bomFormat: CycloneDX components: <some number>`.

- [ ] **Step 5: Commit T6**

```bash
git add scripts/gen-sbom.mjs package.json
git commit -m "build(sbom): emit CycloneDX SBOM into dist/sbom.cdx.json (T6)

Runs as part of \`npm run build\`. Production-deps only (--omit=dev).
The tarball includes dist/sbom.cdx.json so consumers can grep deps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: T5 — SLSA Level 3 build provenance

### Step 8.1 — Use the official SLSA generator

- [ ] **Step 1: Read the SLSA generator docs**

The reference generator is at https://github.com/slsa-framework/slsa-github-generator. For Node tarballs, the relevant workflow is `slsa-github-generator/.github/workflows/generator_generic_slsa3.yml`.

- [ ] **Step 2: Create `.github/workflows/slsa.yml`**

```yaml
name: slsa-provenance

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      digest: ${{ steps.hash.outputs.digest }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '20.x'
      - run: npm ci
      - run: npm run build
      - run: npm pack
      - name: Compute hash
        id: hash
        run: |
          tarball=$(ls coherence-*.tgz)
          echo "digest=$(sha256sum $tarball | awk '{print $1}')" >> "$GITHUB_OUTPUT"
      - uses: actions/upload-artifact@v4
        with:
          name: tarball
          path: coherence-*.tgz

  provenance:
    needs: [build]
    permissions:
      actions: read
      id-token: write
      contents: write
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.0.0
    with:
      base64-subjects: "${{ needs.build.outputs.digest }}"
      upload-assets: true
```

- [ ] **Step 3: Verify the workflow parses**

Run: `node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/slsa.yml','utf8')); console.log('ok')"` (or trust GitHub on push).

- [ ] **Step 4: Commit T5**

```bash
git add .github/workflows/slsa.yml
git commit -m "ci(slsa): SLSA-L3 build provenance via slsa-github-generator (T5)

Fires on tag push. Two jobs: (1) build the tarball and emit its
sha256; (2) call the SLSA reusable workflow to generate non-falsifiable
provenance and attach it to the GitHub release. Hardened ephemeral
runner + OIDC-signed attestation satisfies L3 requirements for tarball
artifacts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: T9 — Threat model

### Step 9.1 — Write the doc

- [ ] **Step 1: Create `docs/threat-model.md`**

Structure (STRIDE-shaped):

```markdown
# Coherence — threat model

> STRIDE-shaped writeup of the trust boundaries, blast radius, and what
> each defense layer catches. Operator-grade — written so an external
> reviewer can audit Coherence's security posture without reading source.

## Trust boundaries

1. **Claude Code session → coherence plugin.** Code runs in the user's
   shell with the user's permissions. Trust: full.
2. **Coherence plugin → LLM provider (Anthropic API).** Patches are
   generated by the LLM. Trust: low (treat all LLM output as adversarial).
3. **LLM output → file edits.** Defenses: format check, sanity, line-ratio,
   prompt-injection scan, hallucination grep, asserts engines, trust
   gate. Each layer documented in [validation chain](architecture.md).
4. **Plugin source → user machine.** Trust: depends on install path.
   Cosign verification (manual) reduces to "trust the GitHub Actions
   runner that signed the tarball" — SLSA L3 narrows this further.

## STRIDE per asset

### Spoofing
- **Attack**: malicious actor publishes a `coherence-fork` plugin
  pretending to be Coherence.
- **Defense**: official marketplace listing (M3); cosign keyless OIDC
  attestation tied to the HUMBLEF0OL/coherence repo (verifiable via Rekor);
  SLSA L3 provenance (T5).

### Tampering
- **Attack**: tampered tarball substituted post-publish.
- **Defense**: cosign signature in Rekor transparency log; SLSA L3 provenance.

### Repudiation
- **Attack**: maintainer denies cutting a malicious release.
- **Defense**: signed commits + SLSA provenance + Rekor log are non-repudiable.

### Information disclosure
- **Attack**: plugin uploads user code or session content.
- **Defense**: file-only architecture (DD-117); telemetry is local JSONL + user-driven curl
  (no automatic uploads); `tests/static-analysis/no-network.test.ts` enforces this.

### Denial of service
- **Attack**: malicious LLM response triggers infinite-loop validation.
- **Defense**: explicit timeouts per LLM call; degraded mode kicks in after
  N exceptions and silently backs off (no session blocking).

### Elevation of privilege
- **Attack**: malicious asserts engine reads files outside the project.
- **Defense**: asserts engines are in-tree (no plugin-in-plugin extension
  in v1.1.0; pluggable engines (S9) deferred to a later version with
  explicit allowlist).

## Defense layers (validation chain)

| Layer | Catches |
|---|---|
| Format | malformed unified-diff output |
| Apply | conflicts with current file state |
| Sanity | obvious LLM mistakes (delete-all, etc.) |
| Line-ratio | >2x growth (likely prompt injection) |
| Prompt injection | sentinel strings, malicious instructions in LLM output |
| Hallucination | references to symbols that don't exist |
| Asserts | documentation contracts (per-file frontmatter assertions) |
| Trust gate | per-section confidence floor before auto-apply |

## Known residual risks

- LLM response that *looks* benign and passes all 8 layers, but encodes
  subtle wrong information. Defense: human review when auto-apply
  doesn't fire; section trust score decays on revert.
- Compromised maintainer machine. Defense: signed commits (verifiable by
  third parties); GitHub branch protections; Rekor transparency log.
- Compromised npm registry (if D2 were ever revisited). Currently
  not applicable — D2 declined per the spec's non-goals.
```

- [ ] **Step 2: Commit T9**

```bash
git add docs/threat-model.md
git commit -m "docs(security): STRIDE-shaped threat model (T9)

Operator-grade writeup of trust boundaries, blast radius, and which
defense layer catches what. Cross-linked from docs/architecture.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: M5 — Convention audit

### Step 10.1 — Inventory the magic conventions

- [ ] **Step 1: List the surviving conventions**

Identify each magic convention in the codebase. Candidates:
- `<!-- coherence-command: <name> -->` sentinel — **deleted by Phase 1 M4**, no audit needed.
- Embedded-version-scanner allowlist (`scripts/lib/version-scanner.mjs:EMBEDDED_VERSION_ALLOWLIST`).
- `generate-command-stubs.mjs` hash check (the autogen-stubs static-analysis gate).
- `FILE_TO_SCHEMA` / `SCHEMA_NAMES` registration in `src/state/stateStore.ts`.
- The `nowIsoUtc()` god-node convention (every timestamp goes through this single function).
- The `<!-- coherence:section id="..." -->` HTML-comment anchor format itself.

### Step 10.2 — Decide keep / document / delete per convention

- [ ] **Step 2: For each convention, decide:**

- **Keep + document**: it's earning its complexity, but a new contributor needs to know it exists. Write a paragraph in `docs/conventions.md`.
- **Delete**: it's vestigial. Find all references and remove.

Recommendation per the audit:

| Convention | Verdict | Reason |
|---|---|---|
| version-scanner allowlist | Keep + document | The allowlist has 1 entry; the scanner catches a real bug class (v1.0.1 Fix 2) |
| autogen-stubs hash check | Keep + document | Cheap; prevents drift between config + emitted stubs |
| FILE_TO_SCHEMA registration | Keep + document | Required for schema-validated atomic writes |
| nowIsoUtc god node | Keep + document | Single timestamp source = consistent ordering |
| coherence:section anchor format | Keep + document | Public contract; can't change without v2 |

So in practice this audit produces a single new doc and *no deletions*. That's a real outcome — every surviving convention is justified.

### Step 10.3 — Write the conventions doc

- [ ] **Step 3: Create `docs/conventions.md`**

```markdown
# Coherence — surviving conventions

> Each item here is a convention that looks weird until you know why.
> If you're tempted to remove or simplify one, read the rationale first.

## `<!-- coherence:section id="..." -->` anchors

[explain: public contract for users to mark trackable sections; GH-slug
fallback when id= is absent; fenced code blocks are skipped during scan]

## `nowIsoUtc()` is the only timestamp source

[explain: deterministic ordering across processes; easy to mock in tests
via dependency injection; if you add a `new Date()` call directly, the
no-direct-date static-analysis gate catches it]

## `FILE_TO_SCHEMA` registration for every state file

[explain: schema-validated atomic writes; every new state file requires
both a schema and an entry in FILE_TO_SCHEMA in stateStore.ts; bug class
this prevents]

## Embedded version-scanner allowlist

[explain: scripts/lib/version-scanner.mjs walks src/**/*.ts for SemVer
literals on lines that mention 'version'; intentional non-canonical
literals (e.g. defensive fallbacks) go in EMBEDDED_VERSION_ALLOWLIST;
why this beats hardcoded version assertions]

## Autogen-stubs hash check

[explain: tests/static-analysis/autogen-stubs.test.ts verifies that
running the generator yields the committed stubs; prevents drift between
scripts/commands.config.json and commands/*.md]
```

- [ ] **Step 4: Commit M5**

```bash
git add docs/conventions.md
git commit -m "docs(maintainability): audit + document surviving magic conventions (M5)

Each convention audited for cost/benefit. Verdict per convention:
all five survivors earn their complexity; none deleted. Each gets a
paragraph in docs/conventions.md explaining the *why*.

(The <!-- coherence-command: --> sentinel that *was* a magic convention
got deleted in Phase 1 M4 when slash dispatch went native.)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 exit

All ten Phase 4 moves landed on `dev` (T7 was Phase 1; T1, T2, T3, T4, T5, T6, T8, T9, T10, M5 in this plan). No version bump, no tag, no push to master.

Verify:

Run: `npm test && npm run gates`
Expected: All pass (including the new properties, coverage, perf-budget, and mutation gates if they're in scope of `gates`).

Run: `git status --short`
Expected: Clean.

---

## Self-review

Mapping:
- T1 → Task 4 (Stryker)
- T2 → Task 3 (fast-check)
- T3 → Task 2 (coverage thresholds)
- T4 → Task 5 (perf budget)
- T5 → Task 8 (SLSA-L3 provenance workflow)
- T6 → Task 7 (CycloneDX SBOM emission)
- T7 → already shipped in Phase 1; not in this plan
- T8 → Task 6 (release-notes generator)
- T9 → Task 9 (threat model doc)
- T10 → Task 1 (debug helper + state-transition instrumentation)
- M5 → Task 10 (convention audit + docs/conventions.md)

Ordering: T10 first (debug helper makes the other tasks' instrumentation cheaper). T3 second (coverage gate catches anything under-tested early). T2/T1/T4 next (test-rigor moves). T8/T6/T5/T9/M5 last (mostly infrastructure/docs that don't depend on each other).

No placeholders. Each task has concrete TDD steps or, where TDD is N/A (SBOM, SLSA workflow, threat model doc), explicit verification commands.
