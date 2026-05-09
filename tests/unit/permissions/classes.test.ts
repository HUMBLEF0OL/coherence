/**
 * Change-class gating tests.
 * FR-PERMISSION-1..3
 */
import { describe, it, expect } from 'vitest';
import { gateChangeClass, requiresConfirmation } from '../../../src/permissions/classes.js';

describe('gateChangeClass', () => {
  it('additive + graduated → auto-apply', () => {
    expect(gateChangeClass('additive', 'graduated')).toBe('auto-apply');
  });

  it('additive + observe → confirm', () => {
    expect(gateChangeClass('additive', 'observe')).toBe('confirm');
  });

  it('modifying always requires confirm', () => {
    expect(gateChangeClass('modifying', 'graduated')).toBe('confirm');
    expect(gateChangeClass('modifying', 'observe')).toBe('confirm');
  });

  it('destructive always requires confirm', () => {
    expect(gateChangeClass('destructive', 'graduated')).toBe('confirm');
    expect(gateChangeClass('destructive', 'observe')).toBe('confirm');
  });

  it('frontmatter always requires confirm regardless of mode (FR-PERMISSION-3)', () => {
    expect(gateChangeClass('frontmatter', 'graduated')).toBe('confirm');
    expect(gateChangeClass('frontmatter', 'observe')).toBe('confirm');
  });
});

describe('requiresConfirmation', () => {
  it('returns false for additive in graduated', () => {
    expect(requiresConfirmation('additive', 'graduated')).toBe(false);
  });

  it('returns true for frontmatter in graduated', () => {
    expect(requiresConfirmation('frontmatter', 'graduated')).toBe(true);
  });
});
