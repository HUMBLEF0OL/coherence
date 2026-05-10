/**
 * PreCompact hook — clear compaction caches (TS-4 §4.8).
 * Full compaction detection in M5.
 */
import type { HookResult } from './exceptionGuard.js';
import { withExceptionGuard } from './exceptionGuard.js';
import { Sentinels } from '../state/sentinels.js';
import { getCoherenceDir } from '../state/init.js';

const SUCCESS: HookResult = { success: true };

let lastRefreshedSectionSet: string[] = [];
let lastRefreshedFlaggedAgents: string[] = [];
let compactionDetected = false;

export function resetCompactionCaches(): void {
  lastRefreshedSectionSet = [];
  lastRefreshedFlaggedAgents = [];
  compactionDetected = false;
}

export function getCompactionState(): {
  lastRefreshedSectionSet: string[];
  lastRefreshedFlaggedAgents: string[];
  compactionDetected: boolean;
} {
  return { lastRefreshedSectionSet, lastRefreshedFlaggedAgents, compactionDetected };
}

export async function preCompactHook(
  _event: unknown,
  projectRoot: string,
): Promise<HookResult> {
  const sentinels = new Sentinels(getCoherenceDir(projectRoot));
  // eslint-disable-next-line @typescript-eslint/require-await
  return withExceptionGuard(sentinels, async () => {
    if (sentinels.isDisabled()) return SUCCESS;

    // Clear compaction caches (DD-039)
    resetCompactionCaches();
    compactionDetected = true;

    return SUCCESS;
  });
}
