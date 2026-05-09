/**
 * Line ratio check tests.
 */
import { describe, it, expect } from 'vitest';
import { checkLineRatio } from '../../../src/validation/lineRatio.js';

describe('checkLineRatio', () => {
  it('does not escalate small changes', () => {
    const r = checkLineRatio(2, 1, 20);
    expect(r.shouldEscalate).toBe(false);
    expect(r.ratio).toBeCloseTo(0.15);
  });

  it('escalates when ratio > 40%', () => {
    const r = checkLineRatio(5, 5, 10);
    expect(r.shouldEscalate).toBe(true);
    expect(r.ratio).toBeCloseTo(1.0);
  });

  it('does not escalate at exactly 40%', () => {
    const r = checkLineRatio(4, 0, 10);
    expect(r.shouldEscalate).toBe(false);
    expect(r.ratio).toBeCloseTo(0.4);
  });

  it('escalates just above 40%', () => {
    const r = checkLineRatio(5, 0, 10);
    expect(r.shouldEscalate).toBe(true);
  });

  it('handles zero original lines without error', () => {
    const r = checkLineRatio(5, 3, 0);
    expect(r.shouldEscalate).toBe(false);
    expect(r.ratio).toBe(0);
  });
});
