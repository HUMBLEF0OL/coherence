/**
 * Signal cache rings (DD-089).
 */
import { describe, it, expect } from 'vitest';
import {
  defaultSignalCache,
  appendBash,
  appendFile,
  appendCorrection,
  pruneSignalCache,
} from '../../../src/signal/signalCache.js';

describe('signalCache', () => {
  it('appendBash collapses identical hashes and increments occurrences', () => {
    let c = defaultSignalCache();
    c = appendBash(c, 'abc', '2026-05-10T10:00:00Z');
    c = appendBash(c, 'abc', '2026-05-10T10:01:00Z');
    expect(c.buckets.bash_repetition.items).toHaveLength(1);
    expect(c.buckets.bash_repetition.items[0].occurrences).toBe(2);
  });

  it('appendBash respects 500 maxItems FIFO eviction', () => {
    let c = defaultSignalCache();
    for (let i = 0; i < 600; i++) {
      c = appendBash(c, `hash-${i}`, '2026-05-10T10:00:00Z');
    }
    expect(c.buckets.bash_repetition.items).toHaveLength(500);
    expect(c.buckets.bash_repetition.items[0].signature_hash).toBe('hash-100');
  });

  it('appendFile collapses by signature + directory hash', () => {
    let c = defaultSignalCache();
    c = appendFile(c, 'sig', 'dirA', '2026-05-10T10:00:00Z');
    c = appendFile(c, 'sig', 'dirA', '2026-05-10T10:01:00Z');
    c = appendFile(c, 'sig', 'dirB', '2026-05-10T10:02:00Z');
    expect(c.buckets.file_creation.items).toHaveLength(2);
  });

  it('appendCorrection caps at 200', () => {
    let c = defaultSignalCache();
    for (let i = 0; i < 250; i++) {
      c = appendCorrection(c, `agent-${i}`, 0.5, '2026-05-10T10:00:00Z');
    }
    expect(c.buckets.agent_correction.items).toHaveLength(200);
  });

  it('pruneSignalCache drops items past cutoff', () => {
    let c = defaultSignalCache();
    c = appendBash(c, 'old', '2026-04-01T10:00:00Z');
    c = appendBash(c, 'new', '2026-05-09T10:00:00Z');
    const r = pruneSignalCache(c, '2026-05-02T00:00:00Z');
    expect(r.cache.buckets.bash_repetition.items).toHaveLength(1);
    expect(r.cache.buckets.bash_repetition.items[0].signature_hash).toBe('new');
    expect(r.removed.bash_repetition).toBe(1);
  });
});
