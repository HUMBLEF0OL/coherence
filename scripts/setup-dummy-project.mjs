#!/usr/bin/env node
/**
 * Build a fresh dummy project at `E:/Projects and Learning/cohrence-dummy/`
 * that exercises every layer of the coherence pipeline:
 *
 *   - TypeScript source with extractable code symbols (`add`, `subtract`,
 *     `multiply`, `divide`).
 *   - `.claude/skills/calc-helper/SKILL.md` — 3 anchored sections, one
 *     with frontmatter `asserts:` so the asserts pipeline routes through
 *     codebase-linked engines.
 *   - `.claude/agents/calc-reviewer.md` — 2 anchored sections.
 *   - `docs/api/calc.md` — 2 anchored sections in the referring-doc layer.
 *   - Single-section file (`docs/intro.md#overview`) for the Stage 1
 *     short-circuit path.
 *
 * Idempotent: if the project already exists, it's wiped first.
 *
 * Usage:
 *   node scripts/setup-dummy-project.mjs               # seed initial commit only
 *   node scripts/setup-dummy-project.mjs --with-drift  # also commit the drift
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DUMMY_ROOT = 'E:/Projects and Learning/cohrence-dummy';
const args = new Set(process.argv.slice(2));
const withDrift = args.has('--with-drift');

console.log(`[setup-dummy] target: ${DUMMY_ROOT}`);
console.log(`[setup-dummy] withDrift: ${withDrift}`);

// 1. Wipe and recreate.
if (existsSync(DUMMY_ROOT)) {
  console.log('[setup-dummy] wiping existing tree');
  rmSync(DUMMY_ROOT, { recursive: true, force: true });
}
mkdirSync(DUMMY_ROOT, { recursive: true });

const w = (rel, content) => {
  const full = path.join(DUMMY_ROOT, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
};

// 2. Source: a tiny calculator module with 4 exported functions.
w('src/calc.ts', `/**
 * cohrence-dummy calculator — a minimal TS module for coherence's pipeline
 * to chew on. Symbol surface: add, subtract, multiply, divide.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

export interface CalcOptions {
  precision?: number;
}
`);

// Stale-caller pattern (mcp-sentry style): src/index.ts IMPORTS `multiply`
// from calc.ts and USES it in code, but does NOT re-export it. After the
// drift commit renames multiply → times, the import statement still
// text-mentions `multiply` — corpus grep would find it (so `symbol_exists`
// passes) but no `export ...` declaration anywhere mentions multiply,
// so Fix 8's `symbol_exported` correctly fails.
w('src/index.ts', `import { add, subtract, multiply, divide } from './calc.js';
import type { CalcOptions } from './calc.js';

// Public surface: only the still-valid names get re-exported.
export { add, subtract, divide };
export type { CalcOptions };

// Internal helper that uses multiply — this is the stale caller. After
// the drift commit this is broken at runtime.
export function area(width: number, height: number): number {
  return multiply(width, height);
}
`);

w('package.json', JSON.stringify({
  name: 'cohrence-dummy',
  version: '0.1.0',
  type: 'module',
  scripts: { build: 'tsc' },
  devDependencies: { typescript: '^5.6.0' },
}, null, 2) + '\n');

w('tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    rootDir: 'src',
    outDir: 'dist',
  },
  include: ['src/**/*'],
}, null, 2) + '\n');

// 3. SKILL.md with 3 anchored sections (one carries asserts: frontmatter).
w('.claude/skills/calc-helper/SKILL.md', `---
name: calc-helper
description: Skill that documents the calc module's surface.
asserts:
  - type: has_example
    policy: warn
  - type: symbol_exists
    param: add:typescript
    policy: block
  - type: file_exists
    param: src/calc.ts
    policy: block
  # v1.0.1 Fix 8 — stricter export-resolution checks. After the
  # multiply -> times rename, the multiply assertion WILL fail until
  # the docs catch up. Pre-Fix-8 symbol_exists would have passed
  # multiply (it still appears in src/index.ts's re-export block);
  # symbol_exported looks at real export declarations only.
  - type: symbol_exported
    param: add:typescript
    policy: block
  - type: symbol_exported
    param: multiply:typescript
    policy: block
---

# calc-helper

<!-- coherence:section id="basics" -->
## Basics

The \`calc\` module exports four pure functions:

- \`add(a, b)\` — addition
- \`subtract(a, b)\` — subtraction
- \`multiply(a, b)\` — multiplication
- \`divide(a, b)\` — division (throws on b = 0)

\`\`\`ts
import { add, multiply } from './calc.js';
console.log(add(2, multiply(3, 4))); // 14
\`\`\`
<!-- /coherence:section -->

<!-- coherence:section id="error-handling" -->
## Error handling

Only \`divide\` throws — it raises \`Error('Division by zero')\` when
\`b === 0\`. The other three functions are total.
<!-- /coherence:section -->

<!-- coherence:section id="options" -->
## Options

The \`CalcOptions\` interface exposes a \`precision\` field. Currently
unused at runtime — reserved for v0.2.
<!-- /coherence:section -->
`);

// 4. Agent file — different symbol surface partially overlapping with SKILL.
w('.claude/agents/calc-reviewer.md', `---
name: calc-reviewer
description: Agent that reviews calc-related PRs.
---

# calc-reviewer

<!-- coherence:section id="responsibilities" -->
## Responsibilities

Review changes to the calc module. Specifically:

- New exports from \`src/calc.ts\` must have a docstring.
- Changes to \`add\`, \`subtract\`, \`multiply\`, \`divide\` require
  matching test updates.
- \`CalcOptions\` should be evolved additively only.
<!-- /coherence:section -->

<!-- coherence:section id="symbol-surface" -->
## Symbol surface

This agent watches the following symbols:

- \`add\`, \`subtract\`, \`multiply\`, \`divide\` — the four pure functions.
- \`CalcOptions\` — config interface.
<!-- /coherence:section -->
`);

// 5. Docs that reference the SKILL — referring-doc layer.
w('docs/api/calc.md', `# Calc API

<!-- coherence:section id="overview" -->
## Overview

The \`calc\` package provides \`add\`, \`subtract\`, \`multiply\`, and
\`divide\`. See \`.claude/skills/calc-helper/SKILL.md\` for the full
contract.
<!-- /coherence:section -->

<!-- coherence:section id="examples" -->
## Examples

\`\`\`ts
import { add, multiply } from 'cohrence-dummy';

add(1, 2);            // 3
multiply(3, 4);       // 12
\`\`\`
<!-- /coherence:section -->
`);

// 6. Single-section file — Stage 1 should short-circuit (no LLM call).
w('docs/intro.md', `# cohrence-dummy

A toy project for exercising the coherence drift-detection pipeline.

<!-- coherence:section id="overview" -->
## Overview

Four-function calculator with TypeScript. Used only as a test fixture.
<!-- /coherence:section -->
`);

// 7. README so the project doesn't look weird in GitHub-like tools.
w('README.md', `# cohrence-dummy

Test fixture for the coherence Claude Code plugin. Not for distribution.
`);

w('.gitignore', `node_modules/
dist/
`);

// 8. git init + initial commit (idempotent).
const git = (args) => execFileSync('git', args, { cwd: DUMMY_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
git(['init', '--quiet']);
git(['-c', 'user.email=dummy@example.com', '-c', 'user.name=Dummy', 'add', '.']);
git(['-c', 'user.email=dummy@example.com', '-c', 'user.name=Dummy', 'commit', '-q', '-m', 'seed: initial calculator + skill + agent + docs']);
console.log('[setup-dummy] initial commit seeded');

if (withDrift) {
  // 9. The drift commit: rename `multiply` -> `times` in src/calc.ts only.
  //    Docs and skill still text-mention `multiply`. Build will break (the
  //    `index.ts` re-export still names `multiply`).
  const driftedCalc = `/**
 * cohrence-dummy calculator — a minimal TS module for coherence's pipeline
 * to chew on. Symbol surface: add, subtract, times, divide. (renamed
 * multiply → times to seed a drift fixture)
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function times(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

export interface CalcOptions {
  precision?: number;
}
`;
  w('src/calc.ts', driftedCalc);
  git(['-c', 'user.email=dummy@example.com', '-c', 'user.name=Dummy', 'add', 'src/calc.ts']);
  git(['-c', 'user.email=dummy@example.com', '-c', 'user.name=Dummy', 'commit', '-q', '-m', 'refactor: rename multiply → times (drift fixture)']);
  console.log('[setup-dummy] drift commit seeded (multiply → times)');
}

console.log('[setup-dummy] done.');
console.log(`[setup-dummy] head: ${git(['rev-parse', '--short', 'HEAD']).toString().trim()}`);
