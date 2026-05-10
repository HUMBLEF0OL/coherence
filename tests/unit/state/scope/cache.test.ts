/**
 * v0.3 M1 — scope-cache (DD-106).
 *
 * Atomic writes + mtime-based eviction.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, statSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  emptyScopeCache,
  isStale,
  readScopeCacheDirect,
  writeScopeCacheDirect,
  type ScopeCacheEntry,
} from '../../../../src/state/scope/cache.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'coherence-scope-cache-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeEntry(file: string, mtimeMs: number): ScopeCacheEntry {
  return {
    file,
    ancestor_chain: [{ file, mtimeMs }],
    extends_resolved: { schema_version: 1 },
    written_at: new Date().toISOString(),
  };
}

describe('scope-cache (DD-106)', () => {
  it('isStale returns false when ancestor mtime matches recorded mtime', () => {
    const file = path.join(root, 'CLAUDE.md');
    writeFileSync(file, '# x', 'utf8');
    const st = statSync(file);
    const e = makeEntry(file, st.mtimeMs);
    expect(isStale(e)).toBe(false);
  });

  it('isStale returns true when ancestor mtime advanced', () => {
    const file = path.join(root, 'CLAUDE.md');
    writeFileSync(file, '# x', 'utf8');
    const st = statSync(file);
    const e = makeEntry(file, st.mtimeMs);
    // Advance mtime by 1 second.
    const future = (st.mtimeMs + 1000) / 1000;
    utimesSync(file, future, future);
    expect(isStale(e)).toBe(true);
  });

  it('isStale returns true when ancestor file was deleted', () => {
    const file = path.join(root, 'CLAUDE.md');
    writeFileSync(file, '# x', 'utf8');
    const st = statSync(file);
    const e = makeEntry(file, st.mtimeMs);
    rmSync(file);
    expect(isStale(e)).toBe(true);
  });

  it('readScopeCacheDirect returns empty cache when file missing', () => {
    const cache = readScopeCacheDirect(root);
    expect(cache.schema_version).toBe(3);
    expect(Object.keys(cache.entries).length).toBe(0);
  });

  it('write/read round-trip preserves entries', () => {
    const cache = emptyScopeCache();
    cache.entries['/abs/file.ts'] = makeEntry('/abs/file.ts', 12345);
    writeScopeCacheDirect(root, cache);
    const back = readScopeCacheDirect(root);
    expect(back.entries['/abs/file.ts']).toEqual(cache.entries['/abs/file.ts']);
  });
});
