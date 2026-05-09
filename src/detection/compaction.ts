/**
 * Compaction detection for PostToolUse step 5.
 * FR-MIDSESSION-1c: trigger when token_drop_pct >= 50% AND token_drop_abs >= 5,000
 * DD-039: 30-min wall-time fallback when token counts unavailable
 */
import { nowIsoUtc } from '../util/time.js';

export type CompactionMode = 'token-delta' | 'time-fallback';

export interface CompactionEvent {
  mode: CompactionMode;
  detected_at: string;
}

let lastTokenCount = 0;
let lastEventTime = Date.now();

export function detectCompaction(
  currentTokenCount?: number,
  hostHasTokenCounts = false,
): CompactionEvent | null {
  const now = Date.now();

  if (hostHasTokenCounts && currentTokenCount !== undefined) {
    const tokenDrop = lastTokenCount - currentTokenCount;
    const dropPct = lastTokenCount > 0 ? (tokenDrop / lastTokenCount) * 100 : 0;

    lastTokenCount = currentTokenCount;
    lastEventTime = now;

    if (dropPct >= 50 && tokenDrop >= 5000) {
      return { mode: 'token-delta', detected_at: nowIsoUtc() };
    }
    return null;
  }

  // Time fallback: 30-min wall-time
  const elapsedMs = now - lastEventTime;
  lastEventTime = now;

  if (elapsedMs >= 30 * 60 * 1000) {
    return { mode: 'time-fallback', detected_at: nowIsoUtc() };
  }

  return null;
}

export function resetCompactionState(): void {
  lastTokenCount = 0;
  lastEventTime = Date.now();
}
