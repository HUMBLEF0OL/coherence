/**
 * In-process signal cache rings (DD-089, FR-AUTHOR-13, M4).
 *
 * Three buckets with hard maxItems caps:
 *   bash_repetition: 500
 *   file_creation:   500
 *   agent_correction: 200
 *
 * FIFO eviction (Open Question §1 default).
 */
import type { StateStore } from '../state/stateStore.js';

export interface BashItem {
  signature_hash: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  /**
   * Per-occurrence timestamps (D4 fix). Bounded at 200 entries; older
   * timestamps are dropped FIFO. Required for windowed counting since
   * `occurrences` is a lifetime counter that overcounts inside a 30-min
   * rolling window.
   */
  timestamps: string[];
}

const TIMESTAMPS_CAP = 200;

export interface FileItem {
  signature_hash: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  directory_hash: string;
}

export interface CorrectionItem {
  agent_id: string;
  first_seen: string;
  last_seen: string;
  occurrences: number;
  line_ratio: number;
}

export interface SignalCache {
  schema_version: 2;
  buckets: {
    bash_repetition: { maxItems: 500; items: BashItem[] };
    file_creation: { maxItems: 500; items: FileItem[] };
    agent_correction: { maxItems: 200; items: CorrectionItem[] };
  };
}

export function defaultSignalCache(): SignalCache {
  return {
    schema_version: 2,
    buckets: {
      bash_repetition: { maxItems: 500, items: [] },
      file_creation: { maxItems: 500, items: [] },
      agent_correction: { maxItems: 200, items: [] },
    },
  };
}

export async function readSignalCache(store: StateStore): Promise<SignalCache> {
  return (await store.read<SignalCache>('signal-cache.json')) ?? defaultSignalCache();
}

export async function writeSignalCache(store: StateStore, cache: SignalCache): Promise<void> {
  await store.write('signal-cache.json', cache);
}

function fifoAppend<T>(items: T[], cap: number, item: T): T[] {
  const next = [...items, item];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Append-or-update bash signal item (collapses identical signature_hash). */
export function appendBash(cache: SignalCache, hash: string, now: string): SignalCache {
  const items = cache.buckets.bash_repetition.items;
  const idx = items.findIndex((i) => i.signature_hash === hash);
  let next: BashItem[];
  if (idx >= 0) {
    next = items.map((i, k) => {
      if (k !== idx) return i;
      const ts = [...i.timestamps, now];
      // Bound timestamps[] FIFO so cache size stays predictable.
      const trimmed = ts.length > TIMESTAMPS_CAP ? ts.slice(ts.length - TIMESTAMPS_CAP) : ts;
      return { ...i, last_seen: now, occurrences: i.occurrences + 1, timestamps: trimmed };
    });
  } else {
    next = fifoAppend(items, cache.buckets.bash_repetition.maxItems, {
      signature_hash: hash,
      first_seen: now,
      last_seen: now,
      occurrences: 1,
      timestamps: [now],
    });
  }
  return {
    ...cache,
    buckets: {
      ...cache.buckets,
      bash_repetition: { maxItems: 500, items: next },
    },
  };
}

export function appendFile(
  cache: SignalCache,
  hash: string,
  directoryHash: string,
  now: string,
): SignalCache {
  const items = cache.buckets.file_creation.items;
  const idx = items.findIndex(
    (i) => i.signature_hash === hash && i.directory_hash === directoryHash,
  );
  let next: FileItem[];
  if (idx >= 0) {
    next = items.map((i, k) =>
      k === idx ? { ...i, last_seen: now, occurrences: i.occurrences + 1 } : i,
    );
  } else {
    next = fifoAppend(items, cache.buckets.file_creation.maxItems, {
      signature_hash: hash,
      first_seen: now,
      last_seen: now,
      occurrences: 1,
      directory_hash: directoryHash,
    });
  }
  return {
    ...cache,
    buckets: {
      ...cache.buckets,
      file_creation: { maxItems: 500, items: next },
    },
  };
}

export function appendCorrection(
  cache: SignalCache,
  agentId: string,
  ratio: number,
  now: string,
): SignalCache {
  const items = cache.buckets.agent_correction.items;
  const idx = items.findIndex((i) => i.agent_id === agentId);
  let next: CorrectionItem[];
  if (idx >= 0) {
    next = items.map((i, k) =>
      k === idx
        ? {
            ...i,
            last_seen: now,
            occurrences: i.occurrences + 1,
            line_ratio: Math.max(i.line_ratio, ratio),
          }
        : i,
    );
  } else {
    next = fifoAppend(items, cache.buckets.agent_correction.maxItems, {
      agent_id: agentId,
      first_seen: now,
      last_seen: now,
      occurrences: 1,
      line_ratio: ratio,
    });
  }
  return {
    ...cache,
    buckets: {
      ...cache.buckets,
      agent_correction: { maxItems: 200, items: next },
    },
  };
}

/**
 * SessionEnd prune: drop items with last_seen < cutoff (7-day rolling window).
 * E5 fix: malformed `last_seen` (NaN from Date.parse) is treated as expired
 * (fail-closed) rather than retained forever.
 */
export function pruneSignalCache(cache: SignalCache, cutoffIso: string): {
  cache: SignalCache;
  removed: { bash_repetition: number; file_creation: number; agent_correction: number };
} {
  const cutoff = Date.parse(cutoffIso);
  const removed = { bash_repetition: 0, file_creation: 0, agent_correction: 0 };

  function expired(lastSeen: string): boolean {
    const t = Date.parse(lastSeen);
    if (Number.isNaN(t)) return true; // E5 fail-closed
    return t < cutoff;
  }

  const bash = cache.buckets.bash_repetition.items.filter((i) => {
    if (expired(i.last_seen)) {
      removed.bash_repetition += 1;
      return false;
    }
    return true;
  });
  const file = cache.buckets.file_creation.items.filter((i) => {
    if (expired(i.last_seen)) {
      removed.file_creation += 1;
      return false;
    }
    return true;
  });
  const correction = cache.buckets.agent_correction.items.filter((i) => {
    if (expired(i.last_seen)) {
      removed.agent_correction += 1;
      return false;
    }
    return true;
  });

  return {
    cache: {
      ...cache,
      buckets: {
        bash_repetition: { maxItems: 500, items: bash },
        file_creation: { maxItems: 500, items: file },
        agent_correction: { maxItems: 200, items: correction },
      },
    },
    removed,
  };
}
