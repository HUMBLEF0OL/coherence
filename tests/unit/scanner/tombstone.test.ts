/**
 * v0.3 M5 — per-file scan tombstone (DD-103, FR-TOMBSTONE-1).
 */
import { describe, it, expect } from 'vitest';
import {
  emptyTombstoneCache,
  upsertTombstone,
  queryTombstone,
  normaliseTombstonePath,
  hashTombstoneKey,
  hashContent,
  tombstoneSize,
  TOMBSTONE_LRU_CAP,
} from '../../../src/scanner/scanCacheTombstone.js';

describe('normaliseTombstonePath', () => {
  it('forward-slashes Windows separators', () => {
    expect(normaliseTombstonePath('docs\\intro.md')).toContain('docs/intro.md');
  });

  it('strips leading ./ and /', () => {
    expect(normaliseTombstonePath('./foo')).not.toMatch(/^\.\//);
    expect(normaliseTombstonePath('/foo')).not.toMatch(/^\//);
  });

  it('lowercases on case-insensitive filesystems', () => {
    const out = normaliseTombstonePath('Docs/Intro.MD');
    if (process.platform === 'win32' || process.platform === 'darwin') {
      expect(out).toBe(out.toLowerCase());
    } else {
      expect(out).toBe('Docs/Intro.MD');
    }
  });
});

describe('tombstone hash invariants', () => {
  it('hashTombstoneKey returns 12-hex', () => {
    expect(hashTombstoneKey('docs/intro.md')).toMatch(/^[0-9a-f]{12}$/);
  });

  it('hashContent returns 12-hex deterministic', () => {
    const a = hashContent('# heading');
    const b = hashContent('# heading');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('upsert / query semantics', () => {
  it('upsert adds an entry; query returns hit when mtime matches', () => {
    const c = upsertTombstone({
      cache: emptyTombstoneCache(),
      filePath: 'docs/intro.md',
      content: '# x',
      mtimeMs: 1_000_000,
    });
    const r = queryTombstone({
      cache: c,
      filePath: 'docs/intro.md',
      currentMtimeMs: 1_000_000,
    });
    expect(r.hit).toBe(true);
  });

  it('miss reason "absent" when key not in cache', () => {
    const r = queryTombstone({
      cache: emptyTombstoneCache(),
      filePath: 'docs/missing.md',
      currentMtimeMs: 0,
    });
    expect(r).toEqual({ hit: false, reason: 'absent' });
  });

  it('miss reason "mtime_advanced" when current mtime > recorded', () => {
    const c = upsertTombstone({
      cache: emptyTombstoneCache(),
      filePath: 'docs/intro.md',
      content: '# x',
      mtimeMs: 1_000_000,
    });
    const r = queryTombstone({
      cache: c,
      filePath: 'docs/intro.md',
      currentMtimeMs: 1_000_001,
    });
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('mtime_advanced');
  });

  it('miss reason "expired" when expires_at < now', () => {
    const past = new Date('2026-01-01T00:00:00Z').toISOString();
    const c = upsertTombstone({
      cache: emptyTombstoneCache(),
      filePath: 'docs/intro.md',
      content: '# x',
      mtimeMs: 1_000_000,
      expiresAt: past,
    });
    const r = queryTombstone({
      cache: c,
      filePath: 'docs/intro.md',
      currentMtimeMs: 1_000_000,
      now: new Date('2026-05-10T00:00:00Z'),
    });
    expect(r.hit).toBe(false);
    expect(r.reason).toBe('expired');
  });
});

describe('LRU cap enforcement', () => {
  it('evicts oldest when entries exceed cap (cap=50 for fast test)', () => {
    let cache = emptyTombstoneCache();
    const TEST_CAP = 50;
    for (let i = 0; i < TEST_CAP + 3; i++) {
      cache = upsertTombstone({
        cache,
        filePath: `docs/file-${i}.md`,
        content: 'x',
        mtimeMs: 1_000_000,
        now: new Date(2_000_000_000_000 + i * 1000),
        maxEntries: TEST_CAP,
      });
    }
    expect(tombstoneSize(cache)).toBe(TEST_CAP);
    expect(cache.entries['docs/file-0.md']).toBeUndefined();
    expect(cache.entries['docs/file-1.md']).toBeUndefined();
    expect(cache.entries['docs/file-2.md']).toBeUndefined();
    expect(cache.entries[`docs/file-${TEST_CAP + 2}.md`]).toBeDefined();
  });

  it('default cap is TOMBSTONE_LRU_CAP=5000', () => {
    expect(TOMBSTONE_LRU_CAP).toBe(5_000);
  });
});

describe('composition with v0.2 P7 doc-content memo', () => {
  it('a tombstone hit sharing a content_hash with the memo means no disk re-read needed', () => {
    // Memo carries content + content_hash; tombstone only carries content_hash.
    // The detector treats matching content_hashes as "no change", so the
    // upper-layer cache logic can skip readFileSync.
    const cache = upsertTombstone({
      cache: emptyTombstoneCache(),
      filePath: 'docs/x.md',
      content: '# heading\nbody',
      mtimeMs: 1_000_000,
    });
    const r = queryTombstone({
      cache,
      filePath: 'docs/x.md',
      currentMtimeMs: 1_000_000,
    });
    expect(r.hit).toBe(true);
    expect(r.entry?.content_hash).toBe(hashContent('# heading\nbody'));
  });
});
