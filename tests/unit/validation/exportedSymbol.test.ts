/**
 * v1.0.1 Fix 8 — `symbol_exported` engine (LIM-1 closure).
 *
 * The existing `symbol_exists` engine returns true for any symbol that
 * appears textually in source — including in stale callers / tests that
 * still reference an already-renamed function. `symbol_exported` is
 * stricter: it returns true only when the symbol appears in an actual
 * `export ...` declaration.
 *
 * These tests cover:
 *   - The pure `extractExportedSymbols` regex helper across the full TS
 *     export grammar.
 *   - The end-to-end `symbol_exported` engine against a tmp project tree.
 *   - The renamed-symbol-with-stale-caller scenario (the LIM-1 fixture).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import {
  extractExportedSymbols,
  symbol_exported,
  resetExportIndexCache,
} from '../../../src/validation/assertions/exportedSymbol.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-exported-'));
  resetExportIndexCache();
});

afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  resetExportIndexCache();
});

function seed(rel: string, content: string): void {
  const full = path.join(tmp, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

const input = { content: '', sectionRef: 'x.md#s' };

describe('extractExportedSymbols — TypeScript grammar coverage', () => {
  it('captures `export function NAME`', () => {
    expect(extractExportedSymbols('export function foo(a: number) {}')).toEqual(new Set(['foo']));
  });

  it('captures `export async function NAME`', () => {
    expect(extractExportedSymbols('export async function fetchData() {}')).toEqual(new Set(['fetchData']));
  });

  it('captures `export const NAME =`', () => {
    expect(extractExportedSymbols('export const VERSION = "1.0";')).toEqual(new Set(['VERSION']));
  });

  it('captures `export let|var NAME`', () => {
    const r = extractExportedSymbols('export let counter = 0;\nexport var legacy = true;');
    expect(r).toEqual(new Set(['counter', 'legacy']));
  });

  it('captures `export class NAME`', () => {
    expect(extractExportedSymbols('export class StateStore {}')).toEqual(new Set(['StateStore']));
  });

  it('captures `export interface NAME`', () => {
    expect(extractExportedSymbols('export interface CalcOptions { precision?: number }'))
      .toEqual(new Set(['CalcOptions']));
  });

  it('captures `export type NAME`', () => {
    expect(extractExportedSymbols('export type Grade = "A" | "B" | "C"'))
      .toEqual(new Set(['Grade']));
  });

  it('captures `export enum NAME`', () => {
    expect(extractExportedSymbols('export enum Severity { Low, High }'))
      .toEqual(new Set(['Severity']));
  });

  it('captures `export default function NAME` (when named)', () => {
    expect(extractExportedSymbols('export default function defaultExport() {}'))
      .toEqual(new Set(['defaultExport']));
  });

  it('captures `export default class NAME` (when named)', () => {
    expect(extractExportedSymbols('export default class DefaultClass {}'))
      .toEqual(new Set(['DefaultClass']));
  });

  it('captures `export { A, B }` named-export blocks', () => {
    const r = extractExportedSymbols('export { add, subtract };');
    expect(r).toEqual(new Set(['add', 'subtract']));
  });

  it('captures aliased exports `export { internal as external }`', () => {
    const r = extractExportedSymbols('export { _internalThing as PublicThing };');
    expect(r).toEqual(new Set(['PublicThing']));
  });

  it('captures `export { A, B } from "./mod"` re-exports', () => {
    const r = extractExportedSymbols('export { add, subtract } from "./calc.js";');
    expect(r).toEqual(new Set(['add', 'subtract']));
  });

  it('captures `export { type Foo, Bar }` (TS type-only re-exports)', () => {
    const r = extractExportedSymbols('export { type CalcOptions, multiply };');
    expect(r).toEqual(new Set(['CalcOptions', 'multiply']));
  });

  it('handles multi-line export blocks', () => {
    const src = `export {
  add,
  subtract,
  multiply,
  divide,
} from './calc.js';`;
    expect(extractExportedSymbols(src)).toEqual(new Set(['add', 'subtract', 'multiply', 'divide']));
  });

  it('strips line comments — comments mentioning export-like text do not bleed into the set', () => {
    const src = `// example: export function ghostExport() {}\nexport function realExport() {}`;
    expect(extractExportedSymbols(src)).toEqual(new Set(['realExport']));
  });

  it('does NOT capture local declarations (no `export` keyword)', () => {
    expect(extractExportedSymbols('const onlyLocal = 1;\nfunction privateFn() {}'))
      .toEqual(new Set());
  });

  it('does NOT capture import statements', () => {
    expect(extractExportedSymbols('import { gradeBelow } from "./grade.js";'))
      .toEqual(new Set());
  });
});

describe('symbol_exported — engine wiring against a tmp project tree', () => {
  it('passes when the symbol IS exported from a local TS file', async () => {
    seed('tsconfig.json', '{}');
    seed('src/calc.ts', 'export function add(a: number, b: number) { return a + b; }');
    const r = await symbol_exported(input, 'add:typescript', { projectRoot: tmp });
    expect(r.passed).toBe(true);
  });

  it('FAILS when the symbol is only referenced (e.g., imported) but never exported', async () => {
    // mcp-sentry-style: `index.ts` imports `gradeBelow`, but `grade.ts`
    // has been renamed to `isBelowThreshold`. Stale caller text still
    // mentions `gradeBelow` — symbol_exists would pass, symbol_exported
    // must fail.
    seed('tsconfig.json', '{}');
    seed('src/grade.ts', 'export function isBelowThreshold(a: string, b: string) { return false; }');
    seed('src/index.ts', 'import { gradeBelow } from "./grade.js"; gradeBelow("D", "C");');
    seed('src/grade.test.ts', "import { gradeBelow } from './grade.js'; gradeBelow('D','C');");
    const r = await symbol_exported(input, 'gradeBelow:typescript', { projectRoot: tmp });
    expect(r.passed).toBe(false);
    expect(r.message).toMatch(/not found in any export declaration/);
    // Defensive: the message should hint at the symbol_exists distinction
    expect(r.message).toMatch(/symbol_exists/);
  });

  it('passes for the new name after a rename (the fix side)', async () => {
    seed('tsconfig.json', '{}');
    seed('src/grade.ts', 'export function isBelowThreshold(a: string, b: string) { return false; }');
    const r = await symbol_exported(input, 'isBelowThreshold:typescript', { projectRoot: tmp });
    expect(r.passed).toBe(true);
  });

  it('passes for a symbol re-exported via `export { X } from`', async () => {
    seed('tsconfig.json', '{}');
    seed('src/calc.ts', 'export function add() {}');
    seed('src/index.ts', "export { add } from './calc.js';");
    // Either file's export keeps the symbol in scope.
    const r = await symbol_exported(input, 'add:typescript', { projectRoot: tmp });
    expect(r.passed).toBe(true);
  });

  it('returns ignored=unsupported_lang for languages outside v1.0.1 scope', async () => {
    seed('tsconfig.json', '{}');
    const r = await symbol_exported(input, 'add:python', { projectRoot: tmp });
    expect(r.passed).toBe(true);
    expect(r.ignored).toBe('unsupported_lang');
  });

  it('fails fast when param is missing or empty', async () => {
    expect((await symbol_exported(input, undefined, { projectRoot: tmp })).passed).toBe(false);
    expect((await symbol_exported(input, '', { projectRoot: tmp })).passed).toBe(false);
  });

  it('defaults to typescript when no language suffix is given AND tsconfig.json is present', async () => {
    seed('tsconfig.json', '{}');
    seed('src/x.ts', 'export class Foo {}');
    const r = await symbol_exported(input, 'Foo', { projectRoot: tmp });
    expect(r.passed).toBe(true);
  });

  it('skips .d.ts declaration files (they are generated stubs)', async () => {
    seed('tsconfig.json', '{}');
    seed('src/decl.d.ts', 'export function ghostly(): void;');
    // .d.ts is in the IGNORE_GLOBS list; the engine should NOT pass on it.
    const r = await symbol_exported(input, 'ghostly:typescript', { projectRoot: tmp });
    expect(r.passed).toBe(false);
  });

  it('skips node_modules and dist when scanning', async () => {
    seed('tsconfig.json', '{}');
    seed('node_modules/somepkg/index.ts', 'export function pollutedSymbol() {}');
    seed('dist/x.ts', 'export function builtSymbol() {}');
    expect((await symbol_exported(input, 'pollutedSymbol:typescript', { projectRoot: tmp })).passed).toBe(false);
    expect((await symbol_exported(input, 'builtSymbol:typescript', { projectRoot: tmp })).passed).toBe(false);
  });
});

describe('symbol_exported — residual limitation (v1.1 work)', () => {
  it('CURRENTLY trusts a re-export at face value (broken re-exports slip through)', async () => {
    // Pathological case: `calc.ts` renames multiply → times, but
    // `index.ts` still has `export { multiply } from './calc.js'`.
    // At runtime the re-export is broken (tsc would warn), but
    // textually `multiply` appears inside an `export { ... }` block,
    // so the v1.0.1 engine returns passed=true.
    //
    // This test PINS the current behaviour so a future v1.1 patch
    // (transitive re-export resolution) is a deliberate change rather
    // than an accidental regression. When v1.1 closes this, flip the
    // assertion below.
    seed('tsconfig.json', '{}');
    seed('src/calc.ts', 'export function times(a: number, b: number) { return a * b; }');
    seed('src/index.ts', "export { add, subtract, multiply, divide } from './calc.js';");
    const r = await symbol_exported(input, 'multiply:typescript', { projectRoot: tmp });
    // v1.0.1 BEHAVIOUR: trusts the re-export. CHANGE THIS in v1.1 when
    // transitive resolution lands. Until then, the documentation /
    // release notes spell out the gap.
    expect(r.passed).toBe(true);
  });
});

describe('symbol_exported — LIM-1 fixture (the realistic rename drift)', () => {
  it('catches `gradeBelow` rename drift even though stale callers still text-mention it', async () => {
    // This mirrors mcp-sentry's test/coherence-v1-smoke branch exactly:
    //   - packages/cli/src/grade.ts:89 renamed gradeBelow → isBelowThreshold
    //   - packages/cli/src/index.ts still does `import { gradeBelow } from './grade.js'`
    //   - packages/cli/src/grade.test.ts still references gradeBelow
    seed('tsconfig.json', '{}');
    seed('packages/cli/src/grade.ts', `
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export function computeGrade(results: unknown[]): Grade { return 'A'; }
export function compareGrades(a: Grade, b: Grade): number { return 0; }
export function isBelowThreshold(actual: Grade, threshold: Grade): boolean { return false; }
`);
    seed('packages/cli/src/index.ts', `
import { computeGrade, gradeBelow } from './grade.js';
if (gradeBelow('D', 'C')) console.log('below');
`);
    seed('packages/cli/src/grade.test.ts', `
import { gradeBelow } from './grade.js';
test('gradeBelow', () => { gradeBelow('D', 'C'); });
`);

    // symbol_exists would PASS here (gradeBelow appears in 2 source files).
    // symbol_exported must FAIL — that's the whole point of this engine.
    const r = await symbol_exported(input, 'gradeBelow:typescript', { projectRoot: tmp });
    expect(r.passed).toBe(false);

    // And the new name passes.
    const r2 = await symbol_exported(input, 'isBelowThreshold:typescript', { projectRoot: tmp });
    expect(r2.passed).toBe(true);
  });
});
