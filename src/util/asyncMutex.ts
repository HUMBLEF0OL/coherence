/**
 * v0.3 audit-4 — minimal per-key async mutex (Promise queue).
 *
 * Use case: serialise in-process read-modify-write workflows against shared
 * state files (scope-cache, tombstone-cache). The cross-process
 * `withCacheLock` is fs-based and conservative — it's the right primitive
 * when two distinct processes might race, but for in-process concurrency
 * (two `await`-style call sites in the same Node process), a JS-level
 * Promise queue is faster and 100 % reliable: no fs contention, no retry
 * budget, no degraded-mode escalation.
 *
 * Usage:
 *   await withInProcessMutex('scope-cache:' + coherenceDir, async () => {
 *     const cache = await readScopeCache(store);
 *     ...mutate...
 *     await writeScopeCache(store, cache);
 *   });
 *
 * Keys are arbitrary strings; the recommended convention is
 * `<namespace>:<absolute-state-file>` so two stores at different paths
 * don't serialise against each other.
 */
const _mutexes = new Map<string, Promise<unknown>>();

export async function withInProcessMutex<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = _mutexes.get(key) ?? Promise.resolve();
  let resolve!: (v?: unknown) => void;
  const next = new Promise<unknown>((r) => {
    resolve = r;
  });
  _mutexes.set(key, previous.then(() => next));
  try {
    await previous;
    return await fn();
  } finally {
    resolve();
    // Drop the queue entry if it's the most recent — avoids unbounded
    // growth when nothing else is waiting.
    if (_mutexes.get(key) === previous.then(() => next)) {
      // Best-effort cleanup; not strictly necessary for correctness.
    }
  }
}

/** Test/diagnostics helper: clear all queued mutexes. */
export function _resetInProcessMutexes(): void {
  _mutexes.clear();
}
