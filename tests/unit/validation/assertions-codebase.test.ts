/**
 * v1.0 M2 — codebase-linked assertion unit tests (FR-ASSERTS-3).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { symbol_exists, file_exists, resetFileListCache } from '../../../src/validation/assertions/codebaseLinked.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-cb-'));
  resetFileListCache();
});
afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

describe('symbol_exists', () => {
  it('finds a symbol in a synthetic TS fixture', async () => {
    writeFileSync(path.join(tmp, 'tsconfig.json'), '{}');
    mkdirSync(path.join(tmp, 'src'));
    writeFileSync(path.join(tmp, 'src', 'a.ts'), 'export function myFunc() { return 1; }', 'utf8');
    const r = await symbol_exists({ sectionRef: 'r#s', content: '' }, 'myFunc', { projectRoot: tmp });
    expect(r.passed).toBe(true);
  });

  it('fails when symbol absent', async () => {
    writeFileSync(path.join(tmp, 'tsconfig.json'), '{}');
    writeFileSync(path.join(tmp, 'a.ts'), 'export function other() {}', 'utf8');
    const r = await symbol_exists({ sectionRef: 'r#s', content: '' }, 'myFunc', { projectRoot: tmp });
    expect(r.passed).toBe(false);
    expect(r.message).toContain('myFunc');
  });

  it('parses symbol:language suffix (split on last colon)', async () => {
    writeFileSync(path.join(tmp, 'pyproject.toml'), '');
    writeFileSync(path.join(tmp, 'a.py'), 'def my_py_func():\n    pass\n', 'utf8');
    // .ts file with the symbol should NOT count when lang is python
    writeFileSync(path.join(tmp, 'a.ts'), 'export const my_py_func = 1;', 'utf8');
    const r = await symbol_exists({ sectionRef: 'r#s', content: '' }, 'my_py_func:python', { projectRoot: tmp });
    expect(r.passed).toBe(true);
  });

  it('empty symbol param fails fast', async () => {
    const r = await symbol_exists({ sectionRef: 'r#s', content: '' }, '', { projectRoot: tmp });
    expect(r.passed).toBe(false);
  });
});

describe('file_exists', () => {
  it('passes when file exists', async () => {
    writeFileSync(path.join(tmp, 'README.md'), 'hi', 'utf8');
    const r = await file_exists({ sectionRef: 'r#s', content: '' }, 'README.md', { projectRoot: tmp });
    expect(r.passed).toBe(true);
  });
  it('fails on ENOENT', async () => {
    const r = await file_exists({ sectionRef: 'r#s', content: '' }, 'nope.txt', { projectRoot: tmp });
    expect(r.passed).toBe(false);
  });
  it('refuses paths escaping project root', async () => {
    const r = await file_exists({ sectionRef: 'r#s', content: '' }, '../etc/passwd', { projectRoot: tmp });
    expect(r.passed).toBe(false);
    expect(r.message).toContain('escapes');
  });
});
