/**
 * import_exists assertion evaluator tests.
 * FR-STOP-19, DD-054
 */
import { describe, it, expect } from 'vitest';
import { evaluateAssertions } from '../../../src/detection/assertions.js';
import type { AssertionDef } from '../../../src/detection/assertions.js';
import type { SectionRef } from '../../../src/types/index.js';

const projectRoot = 'src'; // use actual src as test subject

describe('import_exists assertion', () => {
  it('passes when token exists in codebase', () => {
    const assertions: AssertionDef[] = [
      {
        type: 'import_exists',
        token: 'StateStore',
        sectionRef: '/docs/api.md#state-store' as SectionRef,
      },
    ];
    const results = evaluateAssertions(assertions, projectRoot);
    expect(results[0]!.passed).toBe(true);
    expect(results[0]!.syntheticEntry).toBeUndefined();
  });

  it('fails and produces synthetic buffer entry when token missing', () => {
    const assertions: AssertionDef[] = [
      {
        type: 'import_exists',
        token: 'NONEXISTENT_TOKEN_XYZ_123',
        sectionRef: '/docs/api.md#missing-section' as SectionRef,
      },
    ];
    const results = evaluateAssertions(assertions, projectRoot);
    expect(results[0]!.passed).toBe(false);
    expect(results[0]!.syntheticEntry).toBeDefined();
    expect(results[0]!.syntheticEntry!.source).toBe('assertion');
    expect(results[0]!.syntheticEntry!.sectionRef).toBe('/docs/api.md#missing-section');
  });

  it('synthetic entry does not contain raw content (NFR-PRIVACY-4)', () => {
    const assertions: AssertionDef[] = [
      {
        type: 'import_exists',
        token: 'ABSENT_TOKEN_987',
        sectionRef: '/docs/x.md#section' as SectionRef,
      },
    ];
    const results = evaluateAssertions(assertions, projectRoot);
    const entry = results[0]!.syntheticEntry!;
    expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // No raw section content in entry
    expect(JSON.stringify(entry)).not.toContain('ABSENT_TOKEN');
  });
});
