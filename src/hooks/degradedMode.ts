/**
 * Degraded-mode flag manager. Set after 3 consecutive lock timeouts (FR-FAILURE-4).
 * Surfaced in statusline by M9.
 */
import { lockManager } from '../state/locks.js';

export function isDegraded(): boolean {
  return lockManager.degraded;
}

export function getDegradedStatusPayload(): string | undefined {
  if (!lockManager.degraded) return undefined;
  return '[🧭 ⚠] coherence degraded (lock contention)';
}
