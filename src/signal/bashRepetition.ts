/**
 * Bash repetition detector (DD-076, FR-AUTHOR-6/-7).
 *
 * Threshold: 3 normalised matches in a 30-min rolling window.
 *
 * D4 fix: counts via per-occurrence `timestamps[]`, not the lifetime
 * `occurrences` counter. Returns the cache mutated by appending the new
 * invocation timestamp; callers must persist it.
 */
import { signatureHash } from './signatureHash.js';
import { normaliseBashCommand } from './normalize.js';
import { appendBash, type SignalCache } from './signalCache.js';

export interface BashDetectionResult {
  signature_hash: string;
  normalised_command: string;
  fired: boolean;
  occurrences_in_window: number;
  /** Cache state with the new invocation appended; persist this. */
  cache: SignalCache;
}

export const DEFAULT_BASH_REPETITION_COUNT = 3;
export const DEFAULT_BASH_REPETITION_WINDOW_MIN = 30;

export interface BashDetectionConfig {
  count?: number;
  windowMinutes?: number;
}

/**
 * Read-only count of timestamps in `[now-window, now]`. Caller must have
 * already appended the new invocation timestamp.
 */
export function countInWindow(
  timestamps: ReadonlyArray<string>,
  now: Date,
  windowMs: number,
): number {
  const cutoff = now.getTime() - windowMs;
  let n = 0;
  for (const ts of timestamps) {
    const t = Date.parse(ts);
    if (Number.isNaN(t)) continue; // E5: fail-closed on malformed timestamps.
    if (t >= cutoff) n += 1;
  }
  return n;
}

/**
 * Detect-and-append. Appends the new invocation timestamp to the cache,
 * counts timestamps inside the rolling window, and returns the mutated
 * cache for the caller to persist.
 */
export function detectBashRepetition(
  cache: SignalCache,
  rawCommand: string,
  now: Date = new Date(),
  cfg: BashDetectionConfig = {},
): BashDetectionResult {
  const count = cfg.count ?? DEFAULT_BASH_REPETITION_COUNT;
  const windowMin = cfg.windowMinutes ?? DEFAULT_BASH_REPETITION_WINDOW_MIN;
  const normalised = normaliseBashCommand(rawCommand);
  const hash = signatureHash('tool_invocation', normalised);

  const updated = appendBash(cache, hash, now.toISOString());
  const item = updated.buckets.bash_repetition.items.find((i) => i.signature_hash === hash);
  const inWindow =
    item === undefined
      ? 0
      : countInWindow(item.timestamps, now, windowMin * 60 * 1000);

  return {
    signature_hash: hash,
    normalised_command: normalised,
    fired: inWindow >= count,
    occurrences_in_window: inWindow,
    cache: updated,
  };
}
