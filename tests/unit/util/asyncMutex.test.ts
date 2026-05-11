/**
 * v0.3 audit-4 — in-process Promise mutex.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  withInProcessMutex,
  _resetInProcessMutexes,
} from '../../../src/util/asyncMutex.js';

beforeEach(() => {
  _resetInProcessMutexes();
});

describe('withInProcessMutex', () => {
  it('serialises concurrent fn invocations on the same key', async () => {
    const events: string[] = [];
    async function task(label: string, delayMs: number): Promise<void> {
      await withInProcessMutex('k', async () => {
        events.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, delayMs));
        events.push(`${label}:end`);
      });
    }

    await Promise.all([task('A', 30), task('B', 10), task('C', 5)]);

    // Each task's end must immediately follow its start; no interleaving.
    for (const label of ['A', 'B', 'C']) {
      const startIdx = events.indexOf(`${label}:start`);
      const endIdx = events.indexOf(`${label}:end`);
      expect(endIdx).toBe(startIdx + 1);
    }
  });

  it('different keys do NOT serialise against each other', async () => {
    const order: string[] = [];
    await Promise.all([
      withInProcessMutex('k1', async () => {
        order.push('k1:start');
        await new Promise((r) => setTimeout(r, 30));
        order.push('k1:end');
      }),
      withInProcessMutex('k2', async () => {
        order.push('k2:start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('k2:end');
      }),
    ]);
    // k2 ran in parallel and finished before k1; we should see interleaving.
    expect(order).toEqual(['k1:start', 'k2:start', 'k2:end', 'k1:end']);
  });

  it('releases the mutex when fn throws', async () => {
    await expect(
      withInProcessMutex('k', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Subsequent acquire must succeed immediately.
    const t0 = Date.now();
    await withInProcessMutex('k', async () => {
      // no-op
    });
    expect(Date.now() - t0).toBeLessThan(100);
  });
});
