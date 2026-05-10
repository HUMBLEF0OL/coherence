/**
 * File-creation pattern detector (DD-077).
 */
import { describe, it, expect } from 'vitest';
import { detectFileCreation, jaccard } from '../../../src/signal/fileCreation.js';
import { defaultSignalCache } from '../../../src/signal/signalCache.js';

describe('jaccard()', () => {
  it('1.0 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });
  it('0 for disjoint sets', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
  it('intersection / union for partial overlap', () => {
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(0.5);
  });
});

describe('detectFileCreation (DD-077)', () => {
  it('fires when 3 structurally-similar files in same dir', () => {
    const recent = new Map<string, Set<string>>();
    const fileA = '#!/bin/bash\nset -eu\nexport FOO=bar\necho hello\nexit 0';
    const fileB = '#!/bin/bash\nset -eu\nexport FOO=baz\necho hello\nexit 0';
    recent.set('scripts/a.sh', new Set(fileA.toLowerCase().split(/\s+/)));
    recent.set('scripts/b.sh', new Set(fileB.toLowerCase().split(/\s+/)));
    const r = detectFileCreation(
      defaultSignalCache(),
      'scripts/c.sh',
      fileA,
      recent,
    );
    expect(r.jaccard_max).toBeGreaterThanOrEqual(0.8);
    expect(r.fired).toBe(true);
  });

  it('does not fire on dissimilar files', () => {
    const recent = new Map<string, Set<string>>();
    recent.set('scripts/a.sh', new Set(['echo', 'hello']));
    recent.set('scripts/b.sh', new Set(['printf', 'world']));
    const r = detectFileCreation(
      defaultSignalCache(),
      'scripts/c.sh',
      'completely different content here',
      recent,
    );
    expect(r.fired).toBe(false);
  });

  it('does not fire across different directories (locality)', () => {
    const recent = new Map<string, Set<string>>();
    const content = '#!/bin/bash\nset -eu\necho hi';
    recent.set('a/x.sh', new Set(content.toLowerCase().split(/\s+/)));
    recent.set('b/y.sh', new Set(content.toLowerCase().split(/\s+/)));
    const r = detectFileCreation(defaultSignalCache(), 'c/z.sh', content, recent);
    expect(r.fired).toBe(false);
  });
});
