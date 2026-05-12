/**
 * M-PARSEMAJOR-1 — v0.4 DD-124.
 *
 * Asserts parseMajor uses the SemVer major digit only (not major.minor).
 */
import { describe, it, expect } from 'vitest';
import { parseMajorForTest } from '../../../src/commands/recover.js';

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
