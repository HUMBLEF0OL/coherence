/**
 * Proposal expiry sweep (DD-075, M3).
 *
 * Three fences:
 *   (1) time fence: now − generated_at ≥ 14 days → expired
 *   (2) signal-recurrence fence: signal_hash absent from metrics last 7 days → expired
 *   (3) consecutive-ignored counter: ≥ 5 → expired (default per FR-PROPOSE-11)
 */
import {
  existsSync,
  readFileSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { getCoherenceDir } from '../state/init.js';
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
  /** Optional set of signal hashes seen in the last N days; if undefined,
   *  the sweep loads `metrics.jsonl` and constructs the set from
   *  `proposal_signal_observed` events automatically (E7 fix). */
  recentSignalHashes?: Set<string>;
  /** Project root (required when `recentSignalHashes` is auto-loaded). */
  projectRoot?: string;
}

/**
 * E7 + P8: load recent signal hashes from metrics.jsonl (last N days).
 * Bounded — if the file exceeds `MAX_METRICS_BYTES`, we read only the
 * tail. Old hashes are unlikely to be in the recent window anyway.
 */
const MAX_METRICS_BYTES = 5 * 1024 * 1024; // 5 MB

function loadRecentSignalHashes(
  projectRoot: string,
  windowDays: number,
  now: Date,
): Set<string> {
  const jsonlPath = path.join(getCoherenceDir(projectRoot), 'metrics.jsonl');
  const out = new Set<string>();
  if (!existsSync(jsonlPath)) return out;
  const cutoff = now.getTime() - windowDays * 24 * 3600 * 1000;
  let raw: string;
  try {
    const stat = statSync(jsonlPath);
    if (stat.size > MAX_METRICS_BYTES) {
      // Tail-read: skip the leading bytes; the partial first line gets
      // dropped by the JSON.parse guard below. Newer entries (the ones we
      // care about for the recurrence fence) live at the file's end.
      const handle = openSync(jsonlPath, 'r');
      try {
        const buf = Buffer.alloc(MAX_METRICS_BYTES);
        const offset = stat.size - MAX_METRICS_BYTES;
        readSync(handle, buf, 0, MAX_METRICS_BYTES, offset);
        raw = buf.toString('utf8');
      } finally {
        closeSync(handle);
      }
    } else {
      raw = readFileSync(jsonlPath, 'utf8');
    }
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as {
        event?: string;
        signal_hash?: string;
        _ts?: string;
      };
      if (ev.event !== 'proposal_signal_observed') continue;
      if (typeof ev.signal_hash !== 'string') continue;
      const ts = ev._ts ? Date.parse(ev._ts) : Number.NaN;
      if (Number.isNaN(ts) || ts < cutoff) continue;
      out.add(ev.signal_hash);
    } catch {
      /* skip malformed line — including the partial first line in tail-read */
    }
  }
  return out;
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

  // E7: auto-load recent signal hashes if a project root is supplied.
  let recentHashes = cfg.recentSignalHashes;
  if (recentHashes === undefined && cfg.projectRoot !== undefined) {
    recentHashes = loadRecentSignalHashes(cfg.projectRoot, recurrenceDays, now);
  }

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
      recentHashes !== undefined &&
      !recentHashes.has(entry.signal_hash) &&
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
