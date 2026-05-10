/**
 * SessionEnd hook — buffer persistence + v0.2 prune/flush + correlation clear.
 * TS-4 §4.7 (v0.1) + v0.2 wiring (D1 fix).
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir, makeStateStore } from '../state/init.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import { readSignalCache, writeSignalCache, pruneSignalCache } from '../signal/signalCache.js';
import { flush } from '../state/snapshotWriter.js';
import { clearResponseCorrelation } from '../signal/telemetry.js';
import { emitMetric } from '../state/metrics.js';

const SUCCESS: HookResult = { success: true };

interface SessionEndEvent {
  session_id?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

export async function sessionEndHook(
  event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    const store = makeStateStore(projectRoot);
    const sessionId = (event as SessionEndEvent | undefined)?.session_id ?? `session-${Date.now()}`;
    const buffer = new BufferLifecycle(store);

    // Persist deferred buffer to pending.md
    const buf = await buffer.read();
    if (buf.state === 'pending' && buf.entries.length > 0) {
      await buffer.defer();
    }

    // ----- v0.2: signal-cache prune (FR-AUTHOR-14, 7-day rolling window) -----
    try {
      const cache = await readSignalCache(store);
      const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
      const pruned = pruneSignalCache(cache, cutoff);
      const total =
        pruned.removed.bash_repetition +
        pruned.removed.file_creation +
        pruned.removed.agent_correction;
      if (total > 0) {
        await writeSignalCache(store, pruned.cache);
        await emitMetric(store, {
          event: 'signal_cache_pruned',
          session_id: sessionId,
          ...pruned.removed,
        });
      }
    } catch {
      /* prune non-fatal */
    }

    // Force final snapshot flush + clear cross-session correlation cache.
    try {
      await flush(store, { force: true });
    } catch {
      /* flush non-fatal */
    }
    clearResponseCorrelation();

    return SUCCESS;
  });
}
