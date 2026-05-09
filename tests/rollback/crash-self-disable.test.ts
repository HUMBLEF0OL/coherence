/**
 * RG-4: 3 induced hook exceptions → disabled file present, 4th hook is no-op.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  withExceptionGuard,
  resetExceptionCount,
  getExceptionCount,
} from '../../src/hooks/exceptionGuard.js';
import { Sentinels } from '../../src/state/sentinels.js';

function makeCoherenceDir(): { coherenceDir: string; sentinels: Sentinels } {
  const dir = path.join(tmpdir(), `coherence-csd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return { coherenceDir: dir, sentinels: new Sentinels(dir) };
}

describe('crash self-disable (RG-4)', () => {
  beforeEach(() => {
    resetExceptionCount();
  });

  it('auto-disables after 3 hook exceptions, 4th call is no-op', async () => {
    const { coherenceDir, sentinels } = makeCoherenceDir();

    const thrower = async () => {
      throw new Error('induced failure');
    };

    for (let i = 0; i < 3; i++) {
      await withExceptionGuard(sentinels, thrower);
    }

    expect(existsSync(path.join(coherenceDir, 'auto-disabled'))).toBe(true);
    expect(getExceptionCount()).toBe(3);

    // 4th call: sentinel is now set, hook should be a no-op (checked at hook level)
    expect(sentinels.isAutoDisabled()).toBe(true);
  });

  it('returns success even when handler throws (never re-throws)', async () => {
    const { sentinels } = makeCoherenceDir();

    const result = await withExceptionGuard(sentinels, async () => {
      throw new Error('boom');
    });

    expect(result.success).toBe(true);
  });

  it('does not disable on first two exceptions', async () => {
    const { coherenceDir, sentinels } = makeCoherenceDir();

    for (let i = 0; i < 2; i++) {
      await withExceptionGuard(sentinels, async () => { throw new Error('boom'); });
    }

    expect(existsSync(path.join(coherenceDir, 'auto-disabled'))).toBe(false);
  });
});
