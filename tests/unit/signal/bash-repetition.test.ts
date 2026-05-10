/**
 * Bash repetition detector (DD-076).
 *
 * Updated for D4 fix: detector returns the mutated cache; uses per-occurrence
 * timestamps for windowed counting (not lifetime occurrences).
 */
import { describe, it, expect } from 'vitest';
import {
  detectBashRepetition,
  countInWindow,
} from '../../../src/signal/bashRepetition.js';
import {
  defaultSignalCache,
  type SignalCache,
} from '../../../src/signal/signalCache.js';
import { signatureHash } from '../../../src/signal/signatureHash.js';
import { normaliseBashCommand } from '../../../src/signal/normalize.js';

function pump(cache: SignalCache, raw: string, at: string): SignalCache {
  return detectBashRepetition(cache, raw, new Date(at)).cache;
}

describe('bash repetition (DD-076)', () => {
  it('fires on the third matching command in a 30-min window', () => {
    let cache = defaultSignalCache();
    cache = pump(cache, 'ls -la', '2026-05-10T10:00:00Z');
    cache = pump(cache, 'ls -la', '2026-05-10T10:05:00Z');
    const r = detectBashRepetition(
      cache,
      'ls -la',
      new Date('2026-05-10T10:25:00Z'),
    );
    expect(r.fired).toBe(true);
    expect(r.occurrences_in_window).toBe(3);
  });

  it('does not fire if window has expired (D4 windowed count)', () => {
    let cache = defaultSignalCache();
    cache = pump(cache, 'ls -la', '2026-05-10T08:00:00Z');
    cache = pump(cache, 'ls -la', '2026-05-10T08:05:00Z');
    const r = detectBashRepetition(
      cache,
      'ls -la',
      new Date('2026-05-10T10:00:00Z'),
    );
    // The new invocation at 10:00 brings the window to [9:30, 10:00].
    // Only the 10:00 timestamp itself is in the window — fired=false.
    expect(r.fired).toBe(false);
    expect(r.occurrences_in_window).toBe(1);
  });

  it('treats `ls -la` ≡ `ls   -la` ≡ `cd /tmp && ls -la`', () => {
    const a = signatureHash('tool_invocation', normaliseBashCommand('ls -la'));
    const b = signatureHash('tool_invocation', normaliseBashCommand('ls   -la'));
    const c = signatureHash('tool_invocation', normaliseBashCommand('cd /tmp && ls -la'));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('does not fire on three different commands (negative case)', () => {
    let cache = defaultSignalCache();
    cache = pump(cache, 'echo a', '2026-05-10T10:00:00Z');
    cache = pump(cache, 'echo b', '2026-05-10T10:05:00Z');
    const r = detectBashRepetition(
      cache,
      'echo c',
      new Date('2026-05-10T10:10:00Z'),
    );
    expect(r.fired).toBe(false);
    expect(r.occurrences_in_window).toBe(1);
  });

  it('boundary case: exactly at threshold count fires', () => {
    let cache = defaultSignalCache();
    cache = pump(cache, 'cmd', '2026-05-10T10:00:00Z');
    cache = pump(cache, 'cmd', '2026-05-10T10:01:00Z');
    const r = detectBashRepetition(cache, 'cmd', new Date('2026-05-10T10:02:00Z'));
    expect(r.occurrences_in_window).toBe(3);
    expect(r.fired).toBe(true);
  });

  it('SG-1a determinism: same normalised input → same hash', () => {
    const a = signatureHash('tool_invocation', normaliseBashCommand('ls -la'));
    const b = signatureHash('tool_invocation', normaliseBashCommand('ls -la'));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });

  it('SG-1 collision rate: 10000 distinct inputs produce mostly distinct hashes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10000; i++) {
      seen.add(signatureHash('tool_invocation', `cmd-${i}`));
    }
    expect(seen.size).toBeGreaterThanOrEqual(9999);
  });

  it('D4: countInWindow uses per-occurrence timestamps, not lifetime counter', () => {
    // 100 invocations over 24 hours; only the most recent 5 are in window.
    const ts: string[] = [];
    const base = Date.parse('2026-05-09T10:00:00Z');
    for (let i = 0; i < 100; i++) {
      ts.push(new Date(base + i * 15 * 60_000).toISOString());
    }
    // Last timestamp is 100*15min = 25 hours after base. Window = 30 min.
    const now = new Date(base + 100 * 15 * 60_000);
    const inWindow = countInWindow(ts, now, 30 * 60_000);
    // Window covers timestamps 98 (15min ago) and 99 (now). i.e. 2 entries.
    expect(inWindow).toBe(2);
  });

  it('D4: detector mutates cache by appending the new timestamp', () => {
    const cache = defaultSignalCache();
    const r = detectBashRepetition(cache, 'foo', new Date('2026-05-10T10:00:00Z'));
    const item = r.cache.buckets.bash_repetition.items.find(
      (i) => i.signature_hash === r.signature_hash,
    );
    expect(item).toBeDefined();
    expect(item!.timestamps).toEqual(['2026-05-10T10:00:00.000Z']);
    expect(item!.occurrences).toBe(1);
  });

  it('D4: malformed timestamp in cache is skipped (E5 fail-closed via NaN)', () => {
    const r = countInWindow(
      ['not-a-date', '2026-05-10T10:00:00Z'],
      new Date('2026-05-10T10:05:00Z'),
      30 * 60_000,
    );
    expect(r).toBe(1);
  });
});
