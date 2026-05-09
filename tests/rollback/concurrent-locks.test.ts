/**
 * RG-3: 3 consecutive lock timeouts → degraded-mode flag set.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { LockManager } from '../../src/state/locks.js';

function makeTmpDir(): string {
  const dir = path.join(tmpdir(), `coherence-locks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('concurrent lock contention (RG-3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it('sets degraded mode after 3 failed lock acquisitions (lock always held)', async () => {
    const manager = new LockManager();
    const filePath = path.join(tmpDir, 'test.json');

    // Write a lock file with a non-existent PID (so alive-check fails but hostname matches)
    // With a very old timestamp to pass fence, but write a PID that doesn't exist so
    // it won't be released... actually we want it to FAIL 3 times.
    // Simplest approach: write a lock with current PID so it looks alive.
    const alivePid = process.pid;
    const lockPayload = {
      pid: alivePid,
      started_at: new Date().toISOString(),
      hostname: require('os').hostname(),
      namespace_hint: 'other-namespace', // different namespace so cross-host path
    };
    writeFileSync(`${filePath}.lock`, JSON.stringify(lockPayload));

    // Try to acquire 3 times against the held lock with very short timeout (simulate timeouts)
    // The manager has a 5s total timeout, but we write fresh lock timestamps each time
    // to prevent stale-fence from kicking in.
    // Instead: use a different manager instance with reduced retries by not exposing internals.
    // For test purposes, directly call acquire which will exhaust retries → degraded.

    // Force 3 failed acquisitions by racing against the lock:
    // We need the lock file to persist. It will: current PID is alive.
    const results = [];
    for (let i = 0; i < 3; i++) {
      // Refresh lock timestamp to prevent age fence
      writeFileSync(`${filePath}.lock`, JSON.stringify({
        ...lockPayload,
        started_at: new Date().toISOString(),
      }));
      // This will exhaust all retries (≤5s total) and increment consecutive timeouts
      const ok = await manager.acquire(filePath, 'default');
      results.push(ok);
    }

    expect(manager.degraded).toBe(true);
  }, 20000); // 3 × 5s timeout

  it('fresh LockManager is not degraded initially', () => {
    const manager = new LockManager();
    expect(manager.degraded).toBe(false);
  });
});
