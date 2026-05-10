/**
 * Bash repetition detector (DD-076).
 */
import { describe, it, expect } from 'vitest';
import { detectBashRepetition } from '../../../src/signal/bashRepetition.js';
import {
  defaultSignalCache,
  appendBash,
  type SignalCache,
} from '../../../src/signal/signalCache.js';
import { signatureHash } from '../../../src/signal/signatureHash.js';
import { normaliseBashCommand } from '../../../src/signal/normalize.js';

function pumpCommand(cache: SignalCache, raw: string, at: string): SignalCache {
  const normalised = normaliseBashCommand(raw);
  const hash = signatureHash('tool_invocation', normalised);
  return appendBash(cache, hash, at);
}

describe('bash repetition (DD-076)', () => {
  it('fires on the third matching command in a 30-min window', () => {
    let cache = defaultSignalCache();
    cache = pumpCommand(cache, 'ls -la', '2026-05-10T10:00:00Z');
    cache = pumpCommand(cache, 'ls -la', '2026-05-10T10:05:00Z');
    const r = detectBashRepetition(
      cache,
      'ls -la',
      new Date('2026-05-10T10:25:00Z'),
    );
    expect(r.fired).toBe(true);
    expect(r.occurrences_in_window).toBe(3);
  });

  it('does not fire if window has expired', () => {
    let cache = defaultSignalCache();
    cache = pumpCommand(cache, 'ls -la', '2026-05-10T08:00:00Z');
    cache = pumpCommand(cache, 'ls -la', '2026-05-10T08:05:00Z');
    const r = detectBashRepetition(
      cache,
      'ls -la',
      new Date('2026-05-10T10:00:00Z'),
    );
    expect(r.fired).toBe(false);
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
    cache = pumpCommand(cache, 'echo a', '2026-05-10T10:00:00Z');
    cache = pumpCommand(cache, 'echo b', '2026-05-10T10:05:00Z');
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
    cache = pumpCommand(cache, 'cmd', '2026-05-10T10:00:00Z');
    cache = pumpCommand(cache, 'cmd', '2026-05-10T10:01:00Z');
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
    // 10000/2^48 → essentially zero expected collisions; assert ≥ 9999 distinct.
    expect(seen.size).toBeGreaterThanOrEqual(9999);
  });
});
