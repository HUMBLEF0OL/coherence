/**
 * v0.3 M1 — scope-cache miss telemetry sampling (1:100 deterministic counter).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetScopeCacheMissCounter,
  shouldEmitScopeCacheMiss,
  SCOPE_CACHE_MISS_SAMPLE_RATE,
  getScopeCacheMissCount,
} from '../../../../src/state/scope/cache.js';

describe('scope_cache_miss telemetry (DD-106)', () => {
  beforeEach(() => {
    resetScopeCacheMissCounter();
  });

  it('emits exactly once per SCOPE_CACHE_MISS_SAMPLE_RATE calls', () => {
    expect(SCOPE_CACHE_MISS_SAMPLE_RATE).toBe(100);
    let emits = 0;
    for (let i = 0; i < 250; i++) {
      if (shouldEmitScopeCacheMiss()) emits++;
    }
    // 1, 101, 201 → 3 emits over 250 calls.
    expect(emits).toBe(3);
    expect(getScopeCacheMissCount()).toBe(250);
  });

  it('first call always emits (deterministic — counter starts at 0 → first call counter=1 → 1 % 100 === 1)', () => {
    expect(shouldEmitScopeCacheMiss()).toBe(true);
  });

  it('reset zeroes the counter', () => {
    for (let i = 0; i < 50; i++) shouldEmitScopeCacheMiss();
    expect(getScopeCacheMissCount()).toBe(50);
    resetScopeCacheMissCounter();
    expect(getScopeCacheMissCount()).toBe(0);
  });
});
