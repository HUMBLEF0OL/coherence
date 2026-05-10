/**
 * Proposal expiry sweep (DD-075, M3).
 *
 * Three fences:
 *   (1) time fence: now − generated_at ≥ 14 days → expired
 *   (2) signal-recurrence fence: signal_hash absent from metrics last 7 days → expired
 *   (3) consecutive-ignored counter: ≥ 5 → expired (default per FR-PROPOSE-11)
 */
import type { StateStore } from '../state/stateStore.js';
import {
  readCache,
  writeCache,
  transition,
  type ProposalCache,
} from '../state/proposalCache.js';
import { emitMetric } from '../state/metrics.js';

export interface ExpirySweepConfig {
  expiryDays?: number;
  signalRecurrenceDays?: number;
  consecutiveIgnoreThreshold?: number;
  /** Optional set of signal hashes seen in the last N days; if undefined, sweep ignores fence (2). */
  recentSignalHashes?: Set<string>;
}

const DAY_MS = 24 * 3600 * 1000;

export interface ExpirySweepResult {
  expired_proposal_ids: string[];
  reasons: Record<string, 'time_fence' | 'signal_recurrence_fence' | 'consecutive_ignored'>;
}

export async function runExpirySweep(
  store: StateStore,
  sessionId: string,
  cfg: ExpirySweepConfig = {},
  now: Date = new Date(),
): Promise<ExpirySweepResult> {
  const expiryDays = cfg.expiryDays ?? 14;
  const recurrenceDays = cfg.signalRecurrenceDays ?? 7;
  const consecutiveIgnoreThreshold = cfg.consecutiveIgnoreThreshold ?? 5;

  const cache = await readCache(store);
  let working: ProposalCache = cache;
  const expired: string[] = [];
  const reasons: ExpirySweepResult['reasons'] = {};

  for (const entry of cache.entries) {
    if (entry.state === 'expired' || entry.state === 'accepted' || entry.state === 'rejected' || entry.state === 'reverted') {
      continue;
    }
    const ageMs = now.getTime() - new Date(entry.generated_at).getTime();
    let reason: ExpirySweepResult['reasons'][string] | null = null;
    if (ageMs >= expiryDays * DAY_MS) reason = 'time_fence';
    else if (
      cfg.recentSignalHashes !== undefined &&
      !cfg.recentSignalHashes.has(entry.signal_hash) &&
      ageMs >= recurrenceDays * DAY_MS
    )
      reason = 'signal_recurrence_fence';
    else if (entry.consecutive_ignored >= consecutiveIgnoreThreshold) reason = 'consecutive_ignored';

    if (reason) {
      const t = transition(working, entry.proposal_id, 'expired', reason);
      working = t.cache;
      expired.push(entry.proposal_id);
      reasons[entry.proposal_id] = reason;
    }
  }

  if (expired.length > 0) {
    await writeCache(store, working);
    for (const id of expired) {
      await emitMetric(store, {
        event: 'proposal_expired',
        session_id: sessionId,
        proposal_id: id,
        reason: reasons[id],
      });
    }
  }
  return { expired_proposal_ids: expired, reasons };
}
