/**
 * v1.0.1 survey finding — `runAssertionsForSection` is the central
 * router for the v1.0 asserts pipeline. It dispatches each `RawAssertion`
 * to the right SYNC_ENGINES / ASYNC_ENGINES entry, enforces the
 * MAX_ASSERTIONS_PER_SECTION cap, marks unknown types as `ignored`,
 * and emits exactly one combined stderr warning per (section, session).
 *
 * Pre-this-test: 0 direct test imports. Indirect coverage exists via
 * the `applyAssertions` wrapper (the `asserts-pipeline.test.ts` integ
 * tests), but those tests go through frontmatter parsing first and
 * don't exercise the router's edge cases (cap enforcement, ignored-type
 * routing, per-session warn-once cache).
 *
 * This file targets the router directly with synthetic input.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAssertionsForSection,
  resetAssertionWarnings,
  knownAssertionTypes,
  parseAsserts,
  verdict,
  MAX_ASSERTIONS_PER_SECTION,
  DEFAULT_POLICY,
} from '../../../src/validation/assertions/index.js';

beforeEach(() => {
  resetAssertionWarnings();
});

describe('runAssertionsForSection — engine routing', () => {
  it('routes a known sync engine (has_example) and returns its outcome', async () => {
    const r = await runAssertionsForSection(
      'docs/x.md#s',
      'No code block in here.',
      [{ type: 'has_example' }],
      { projectRoot: process.cwd() },
    );
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('has_example');
    expect(r[0].passed).toBe(false);
    expect(r[0].policy).toBe(DEFAULT_POLICY);
    expect(r[0].ignored).toBeUndefined();
  });

  it('routes an async engine (file_exists) and awaits its result', async () => {
    const r = await runAssertionsForSection(
      'docs/x.md#s',
      'irrelevant body',
      [{ type: 'file_exists', param: 'package.json' }],
      { projectRoot: process.cwd() },
    );
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('file_exists');
    expect(r[0].param).toBe('package.json');
    // package.json definitely exists at the coherence root
    expect(r[0].passed).toBe(true);
  });

  it('marks unknown assertion types as ignored without crashing', async () => {
    const r = await runAssertionsForSection(
      'docs/x.md#s',
      'body',
      [{ type: 'this_engine_does_not_exist' }],
      { projectRoot: process.cwd(), emitWarning: () => { /* swallow */ } },
    );
    expect(r).toHaveLength(1);
    expect(r[0].passed).toBe(true); // unknown types don't fail the section
    expect(r[0].ignored).toBe('unknown_type');
    expect(r[0].message).toMatch(/unknown assertion type/);
  });

  it('preserves user-supplied policy override (block vs warn)', async () => {
    const r = await runAssertionsForSection(
      'docs/x.md#s',
      'Empty.',
      [
        { type: 'has_example', policy: 'block' },
        { type: 'has_example', policy: 'warn' },
      ],
      { projectRoot: process.cwd() },
    );
    expect(r[0].policy).toBe('block');
    expect(r[1].policy).toBe('warn');
  });
});

describe('runAssertionsForSection — cap enforcement', () => {
  it('processes the first MAX_ASSERTIONS_PER_SECTION assertions normally', async () => {
    const asserts = Array.from({ length: MAX_ASSERTIONS_PER_SECTION }, () => ({ type: 'has_example' }));
    const r = await runAssertionsForSection(
      'docs/x.md#s',
      'No example.',
      asserts,
      { projectRoot: process.cwd(), emitWarning: () => { /* swallow */ } },
    );
    expect(r).toHaveLength(MAX_ASSERTIONS_PER_SECTION);
    for (const entry of r) expect(entry.ignored).toBeUndefined();
  });

  it('marks assertions over the cap as ignored=cap_exceeded', async () => {
    const N = MAX_ASSERTIONS_PER_SECTION + 5;
    const asserts = Array.from({ length: N }, () => ({ type: 'has_example' }));
    const r = await runAssertionsForSection(
      'docs/x.md#s',
      'No example.',
      asserts,
      { projectRoot: process.cwd(), emitWarning: () => { /* swallow */ } },
    );
    expect(r).toHaveLength(N);
    const overCap = r.slice(MAX_ASSERTIONS_PER_SECTION);
    expect(overCap).toHaveLength(5);
    for (const entry of overCap) {
      expect(entry.ignored).toBe('cap_exceeded');
      expect(entry.passed).toBe(true);
      expect(entry.message).toMatch(new RegExp(`over ${MAX_ASSERTIONS_PER_SECTION}-assertion cap`));
    }
  });
});

describe('runAssertionsForSection — warn-once cache (FR-ASSERTS-1)', () => {
  it('emits exactly one combined stderr warning per section', async () => {
    const warnings: string[] = [];
    const emitWarning = (m: string): void => { warnings.push(m); };

    await runAssertionsForSection(
      'docs/once.md#s',
      'body',
      [{ type: 'unknown_a' }, { type: 'unknown_b' }],
      { projectRoot: process.cwd(), emitWarning },
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/2 assertion\(s\) in section docs\/once\.md#s ignored/);

    // Second invocation against the same sectionRef must NOT emit again.
    await runAssertionsForSection(
      'docs/once.md#s',
      'body',
      [{ type: 'unknown_c' }],
      { projectRoot: process.cwd(), emitWarning },
    );
    expect(warnings).toHaveLength(1);
  });

  it('emits a separate warning for a different section in the same session', async () => {
    const warnings: string[] = [];
    const emitWarning = (m: string): void => { warnings.push(m); };

    await runAssertionsForSection('docs/a.md#s', '', [{ type: 'unknown' }], { projectRoot: process.cwd(), emitWarning });
    await runAssertionsForSection('docs/b.md#s', '', [{ type: 'unknown' }], { projectRoot: process.cwd(), emitWarning });
    expect(warnings).toHaveLength(2);
  });

  it('resetAssertionWarnings() clears the per-session cache', async () => {
    const warnings: string[] = [];
    const emitWarning = (m: string): void => { warnings.push(m); };
    await runAssertionsForSection('docs/r.md#s', '', [{ type: 'unknown' }], { projectRoot: process.cwd(), emitWarning });
    expect(warnings).toHaveLength(1);
    resetAssertionWarnings();
    await runAssertionsForSection('docs/r.md#s', '', [{ type: 'unknown' }], { projectRoot: process.cwd(), emitWarning });
    expect(warnings).toHaveLength(2);
  });

  it('does not emit any warning when there are no ignored assertions', async () => {
    const warnings: string[] = [];
    const emitWarning = (m: string): void => { warnings.push(m); };
    await runAssertionsForSection(
      'docs/clean.md#s',
      'body has no example',
      [{ type: 'has_example', policy: 'warn' }],
      { projectRoot: process.cwd(), emitWarning },
    );
    expect(warnings).toHaveLength(0);
  });
});

describe('knownAssertionTypes — registry surface (v1.0.1 survey: 0 prior callers)', () => {
  it('returns a non-empty array', () => {
    const types = knownAssertionTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  it('includes the documented v1.0 M2 engines (has_example, no_placeholder_links, max_words, min_words, no_todo_comments, symbol_exists, file_exists)', () => {
    const types = new Set(knownAssertionTypes());
    expect(types.has('has_example')).toBe(true);
    expect(types.has('no_placeholder_links')).toBe(true);
    expect(types.has('max_words')).toBe(true);
    expect(types.has('min_words')).toBe(true);
    expect(types.has('no_todo_comments')).toBe(true);
    expect(types.has('symbol_exists')).toBe(true);
    expect(types.has('file_exists')).toBe(true);
  });
});

describe('parseAsserts + verdict — survey-adjacent helpers', () => {
  it('parseAsserts handles string-form "type:param"', () => {
    const r = parseAsserts(['has_example', 'max_words:300']);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ type: 'has_example' });
    expect(r[1]).toEqual({ type: 'max_words', param: '300' });
  });

  it('parseAsserts handles object-form with policy', () => {
    const r = parseAsserts([{ type: 'has_example', policy: 'block' }]);
    expect(r[0].policy).toBe('block');
  });

  it('verdict aggregates blocks vs warns vs ok', () => {
    const v = verdict([
      { passed: true, type: 'has_example', policy: 'warn' },
      { passed: false, type: 'max_words', policy: 'warn' },
      { passed: false, type: 'no_placeholder_links', policy: 'block' },
    ]);
    expect(v.ok).toBe(false);
    expect(v.blocks).toHaveLength(1);
    expect(v.warns).toHaveLength(1);
  });
});
