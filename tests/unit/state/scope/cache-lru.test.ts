/**
 * v0.3 audit-4 B — scope-cache LRU enforcement.
 *
 * Without the cap, a session that touches many distinct files would grow
 * `scope-cache.json` unbounded. This suite exercises the LRU policy on a
 * small cap (50) so the test runs fast.
 */
import { describe, it, expect } from 'vitest';
import {
  emptyScopeCache,
  enforceScopeCacheLru,
  SCOPE_CACHE_LRU_CAP,
} from '../../../../src/state/scope/cache.js';

describe('enforceScopeCacheLru (audit-4 B)', () => {
  it('keeps cache under cap by dropping oldest written_at', () => {
    const cache = emptyScopeCache();
    // Build cap + 5 entries with strictly-increasing written_at.
    const cap = 50;
    for (let i = 0; i < cap + 5; i++) {
      cache.entries[`file-${i}`] = {
        file: `file-${i}`,
        ancestor_chain: [],
        extends_resolved: {},
        written_at: new Date(2_000_000_000_000 + i * 1000).toISOString(),
      };
    }
    enforceScopeCacheLru(cache, cap);
    expect(Object.keys(cache.entries).length).toBe(cap);
    // Oldest 5 must be evicted.
    expect(cache.entries['file-0']).toBeUndefined();
    expect(cache.entries['file-4']).toBeUndefined();
    expect(cache.entries[`file-${cap + 4}`]).toBeDefined();
  });

  it('is a no-op when entry count ≤ cap', () => {
    const cache = emptyScopeCache();
    cache.entries['a'] = {
      file: 'a',
      ancestor_chain: [],
      extends_resolved: {},
      written_at: '2026-05-10T10:00:00Z',
    };
    enforceScopeCacheLru(cache, 10);
    expect(cache.entries['a']).toBeDefined();
  });

  it('default cap is 5,000', () => {
    expect(SCOPE_CACHE_LRU_CAP).toBe(5_000);
  });
});
