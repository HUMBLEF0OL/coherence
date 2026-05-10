/**
 * Wilson 95% confidence interval (DD-092 calibration helper).
 */
import { describe, it, expect } from 'vitest';
import { wilson95, meetsCalibrationFloor } from '../../../src/util/wilson.js';

describe('wilson95', () => {
  it('zero trials returns all-zero interval', () => {
    const r = wilson95(0, 0);
    expect(r.mean).toBe(0);
    expect(r.lower).toBe(0);
    expect(r.upper).toBe(0);
  });

  it('all-successes (5/5) → high mean, lower bound far below 1', () => {
    const r = wilson95(5, 5);
    expect(r.mean).toBe(1);
    expect(r.upper).toBe(1);
    // Wilson with 5 trials at 100% gives ~0.566 lower bound.
    expect(r.lower).toBeCloseTo(0.566, 1);
  });

  it('all-failures (0/5) → mean=0, upper bound > 0', () => {
    const r = wilson95(0, 5);
    expect(r.mean).toBe(0);
    expect(r.lower).toBe(0);
    expect(r.upper).toBeGreaterThan(0);
  });

  it('7/12 → mean ≈ 0.583', () => {
    const r = wilson95(7, 12);
    expect(r.mean).toBeCloseTo(0.583, 2);
    expect(r.lower).toBeLessThan(r.mean);
    expect(r.upper).toBeGreaterThan(r.mean);
  });

  it('large sample tightens the interval (50/50 vs 500/500)', () => {
    const small = wilson95(50, 50);
    const large = wilson95(500, 500);
    expect(large.lower).toBeGreaterThan(small.lower);
  });

  it('throws on invalid inputs', () => {
    expect(() => wilson95(5, 3)).toThrow();
    expect(() => wilson95(-1, 5)).toThrow();
  });
});

describe('meetsCalibrationFloor (DD-092 acceptance)', () => {
  it('returns true when lower bound clears the 0.7 floor', () => {
    // 100/100 → Wilson lower ≈ 0.963 > 0.7
    expect(meetsCalibrationFloor(100, 100)).toBe(true);
  });

  it('returns false when lower bound is below the floor', () => {
    // 50/100 → Wilson lower ≈ 0.401 < 0.7
    expect(meetsCalibrationFloor(50, 100)).toBe(false);
  });

  it('respects custom floor', () => {
    expect(meetsCalibrationFloor(50, 100, 0.3)).toBe(true);
    expect(meetsCalibrationFloor(50, 100, 0.5)).toBe(false);
  });
});
