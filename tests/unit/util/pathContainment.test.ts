/**
 * v0.3 audit-4 I — shared path-containment helper.
 *
 * Replaces the two duplicate `isInside` / `isPathInside` implementations
 * in `src/commands/deAnnotate.ts` + `src/commands/exportMetrics.ts`.
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { isPathInside } from '../../../src/util/pathContainment.js';

describe('isPathInside (audit-4 I)', () => {
  const root = process.platform === 'win32' ? 'C:\\proj' : '/proj';
  const child = path.join(root, 'src', 'x.ts');
  const sibling = process.platform === 'win32' ? 'C:\\other\\y.ts' : '/other/y.ts';

  it('true when candidate is a descendant', () => {
    expect(isPathInside(root, child)).toBe(true);
  });

  it('true when candidate IS the boundary', () => {
    expect(isPathInside(root, root)).toBe(true);
  });

  it('false for a parent-relative escape', () => {
    expect(isPathInside(root, path.join(root, '..', 'leak.ts'))).toBe(false);
  });

  it('false when boundary and candidate are on different roots (Windows-style absolute paths)', () => {
    expect(isPathInside(root, sibling)).toBe(false);
  });
});
