/**
 * v1.0 M2 — asserts pipeline integration (M-ASSERTS-1..4).
 *
 * Verifies registry dispatch, policy semantics, max-10 cap, and
 * unknown-type ignore behaviour through the `applyAssertions()` bridge.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { applyAssertions } from '../../src/validation/assertions/applyToPatch.js';
import { resetAssertionWarnings, parseAsserts } from '../../src/validation/assertions/index.js';

let tmp: string;
let warnings: string[];

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-asserts-'));
  warnings = [];
  resetAssertionWarnings();
});
afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ } });

function writeReadme(content: string): void {
  writeFileSync(path.join(tmp, 'README.md'), content, 'utf8');
}

describe('asserts pipeline integration', () => {
  it('block + warn mixed — block escalates verdict (M-ASSERTS-1)', async () => {
    const result = await applyAssertions({
      sectionRef: 'README.md#install',
      sectionContent: 'short prose',
      projectRoot: tmp,
      precomputedAsserts: [
        { type: 'has_example', policy: 'block' },
        { type: 'min_words', param: '100', policy: 'warn' },
      ],
      emitWarning: (m) => warnings.push(m),
    });
    expect(result.ok).toBe(false);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].type).toBe('has_example');
    expect(result.warns).toHaveLength(1);
  });

  it('warn-only violation — verdict ok with warns attached (M-ASSERTS-2)', async () => {
    const result = await applyAssertions({
      sectionRef: 'README.md#install',
      sectionContent: 'has\n```ts\nok()\n```',
      projectRoot: tmp,
      precomputedAsserts: [
        { type: 'min_words', param: '100', policy: 'warn' },
      ],
      emitWarning: (m) => warnings.push(m),
    });
    expect(result.ok).toBe(true);
    expect(result.warns).toHaveLength(1);
    expect(result.warns[0].type).toBe('min_words');
  });

  it('max-10 cap enforced (M-ASSERTS-3) — 11th assertion ignored + one stderr warning', async () => {
    const asserts = Array.from({ length: 11 }, (_, i) => ({ type: 'has_example' as const, policy: 'block' as const, param: `${i}` }));
    await applyAssertions({
      sectionRef: 'README.md#install',
      sectionContent: 'no example here',
      projectRoot: tmp,
      precomputedAsserts: asserts,
      emitWarning: (m) => warnings.push(m),
    });
    // 10 of them fail with block; the 11th is ignored
    expect(warnings.some((w) => w.includes('cap_exceeded'))).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  it('unknown assertion type ignored with one combined warning (M-ASSERTS-4)', async () => {
    await applyAssertions({
      sectionRef: 'README.md#x',
      sectionContent: '```\ncode\n```',
      projectRoot: tmp,
      precomputedAsserts: [
        { type: 'has_example', policy: 'block' },
        { type: 'invented_assertion', policy: 'block' },
      ],
      emitWarning: (m) => warnings.push(m),
    });
    expect(warnings.some((w) => w.includes('unknown_type'))).toBe(true);
  });

  it('reads file frontmatter when precomputedAsserts not provided', async () => {
    writeReadme([
      '---',
      'asserts:',
      '  - type: has_example',
      '    policy: block',
      '---',
      '# install',
      '',
      'just prose',
    ].join('\n'));
    const result = await applyAssertions({
      sectionRef: 'README.md#install',
      sectionContent: 'just prose',
      projectRoot: tmp,
      emitWarning: (m) => warnings.push(m),
    });
    expect(result.ok).toBe(false);
    expect(result.blocks[0].type).toBe('has_example');
  });

  it('no asserts → verdict.ok with no entries', async () => {
    const result = await applyAssertions({
      sectionRef: 'unknown.md#x',
      sectionContent: 'whatever',
      projectRoot: tmp,
    });
    expect(result.ok).toBe(true);
    expect(result.blocks).toEqual([]);
    expect(result.warns).toEqual([]);
  });
});

describe('parseAsserts', () => {
  it('accepts string-form "type" entries', () => {
    expect(parseAsserts(['has_example', 'no_todo_comments'])).toEqual([
      { type: 'has_example', param: undefined },
      { type: 'no_todo_comments', param: undefined },
    ]);
  });
  it('accepts "type:param" string-form entries', () => {
    expect(parseAsserts(['max_words:50'])).toEqual([
      { type: 'max_words', param: '50' },
    ]);
  });
  it('accepts object-form with policy', () => {
    expect(parseAsserts([{ type: 'has_example', policy: 'block' }])).toEqual([
      { type: 'has_example', param: undefined, policy: 'block' },
    ]);
  });
  it('rejects non-array input', () => {
    expect(parseAsserts({ type: 'x' })).toEqual([]);
    expect(parseAsserts('has_example')).toEqual([]);
  });
});
