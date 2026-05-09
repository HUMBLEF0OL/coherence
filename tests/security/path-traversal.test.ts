/**
 * SG-2: Path traversal, symlinks outside project root, ignore globs.
 * NFR-SECURITY-2/4, NFR-PRIVACY-5
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { PathFilter } from '../../src/detection/pathFilter.js';

const projectRoot = path.resolve('tests/fixtures/codebases/small');

describe('PathFilter (SG-2)', () => {
  let filter: PathFilter;

  it('allows a valid file inside project root', () => {
    filter = new PathFilter(projectRoot);
    const file = path.join(projectRoot, 'CLAUDE.md');
    expect(filter.isAllowed(file, projectRoot)).toBe(true);
  });

  it('rejects path traversal outside project root', () => {
    filter = new PathFilter(projectRoot);
    const outside = path.resolve(projectRoot, '../../package.json');
    expect(filter.isAllowed(outside, projectRoot)).toBe(false);
  });

  it('rejects .env files (NFR-PRIVACY-5)', () => {
    filter = new PathFilter(projectRoot);
    const envFile = path.join(projectRoot, '.env');
    expect(filter.isAllowed(envFile, projectRoot)).toBe(false);
  });

  it('rejects files matching coherence/ignore patterns', () => {
    // node_modules should be excluded
    filter = new PathFilter(projectRoot);
    const nmFile = path.join(projectRoot, 'node_modules', 'foo', 'README.md');
    expect(filter.isAllowed(nmFile, projectRoot)).toBe(false);
  });
});
