/**
 * Advisory file lock manager.
 * TS-6 §6.6, FR-FAILURE-3, FR-FAILURE-3b, DD-041
 *
 * Lock payload: {pid, started_at, hostname, namespace_hint}
 * Alive-check: process.kill(pid, 0) for same hostname/namespace
 * Age-only fence cross-host: 30s buffer / 5s scanner
 * Exponential backoff: 10/20/40ms, cap 500ms, total ≤ 5s
 * Degraded-mode flag after 3 consecutive timeouts
 */
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { hostname } from 'os';
import path from 'path';

const BUFFER_FENCE_MS = 30_000;
const SCANNER_FENCE_MS = 5_000;
const MAX_RETRIES = 5;
const MAX_TOTAL_MS = 5_000;
const DEGRADED_THRESHOLD = 3;

interface LockPayload {
  pid: number;
  started_at: string;
  hostname: string;
  namespace_hint: string;
}

export class LockManager {
  private consecutiveTimeouts = 0;
  public degraded = false;

  async acquire(filePath: string, namespaceHint = 'default'): Promise<boolean> {
    const lockPath = `${filePath}.lock`;
    mkdirSync(path.dirname(lockPath), { recursive: true });

    const payload: LockPayload = {
      pid: process.pid,
      started_at: new Date().toISOString(),
      hostname: hostname(),
      namespace_hint: namespaceHint,
    };

    const start = Date.now();
    let delay = 10;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (Date.now() - start > MAX_TOTAL_MS) {
        this.recordTimeout();
        return false;
      }

      const existing = this.readLock(lockPath);
      if (existing) {
        const age = Date.now() - new Date(existing.started_at).getTime();
        const sameHost = existing.hostname === hostname();
        const sameNs = existing.namespace_hint === namespaceHint;

        if (sameHost && sameNs) {
          // Try alive check
          const alive = this.isProcessAlive(existing.pid);
          if (!alive) {
            // Stale lock — remove it
            this.removeLock(lockPath);
          } else if (age > BUFFER_FENCE_MS) {
            this.removeLock(lockPath);
          }
        } else {
          // Cross-host: age-only fence
          const fence = sameNs ? BUFFER_FENCE_MS : SCANNER_FENCE_MS;
          if (age > fence) {
            this.removeLock(lockPath);
          }
        }
      }

      try {
        writeFileSync(lockPath, JSON.stringify(payload), { flag: 'wx' });
        this.consecutiveTimeouts = 0;
        return true;
      } catch {
        // Lock file exists — retry with backoff
        if (attempt < MAX_RETRIES) {
          await sleep(delay);
          delay = Math.min(delay * 2, 500);
        }
      }
    }

    this.recordTimeout();
    return false;
  }

  release(filePath: string): void {
    this.removeLock(`${filePath}.lock`);
  }

  private readLock(lockPath: string): LockPayload | null {
    try {
      const raw = readFileSync(lockPath, 'utf8');
      return JSON.parse(raw) as LockPayload;
    } catch {
      return null;
    }
  }

  private removeLock(lockPath: string): void {
    try {
      unlinkSync(lockPath);
    } catch {
      // already gone
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** Reset degraded state and consecutive-timeout counter (used by /coherence:recover). */
  reset(): void {
    this.consecutiveTimeouts = 0;
    this.degraded = false;
  }

  private recordTimeout(): void {
    this.consecutiveTimeouts++;
    if (this.consecutiveTimeouts >= DEGRADED_THRESHOLD) {
      this.degraded = true;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Module-level singleton used by stateStore */
export const lockManager = new LockManager();
