/**
 * Buffer lifecycle state machine.
 * States: [empty] → [pending] → ([cleared] | [deferred] → [persisted])
 * TS-4 §4.9, DD-010
 * Buffer payload is hash-only (path + sectionRef + contentHash). NFR-PRIVACY-4.
 */
import { StateStore } from '../state/stateStore.js';
import { nowIsoUtc } from '../util/time.js';
import type { BufferEntry } from '../types/index.js';

type BufferState = 'empty' | 'pending' | 'cleared' | 'deferred' | 'persisted';

const MAX_ENTRIES = 200;
const STALE_DAYS = 14;

export interface DriftBuffer {
  state: BufferState;
  entries: BufferEntry[];
  last_changed_at?: string;
  stale_fence?: string;
}

function staleFence(): string {
  const d = new Date();
  d.setDate(d.getDate() + STALE_DAYS);
  return d.toISOString();
}

export class BufferLifecycle {
  constructor(private readonly store: StateStore) {}

  async read(): Promise<DriftBuffer> {
    const buf = await this.store.read<DriftBuffer>('drift-buffer.json');
    if (!buf) return { state: 'empty', entries: [] };
    return buf;
  }

  async append(entry: BufferEntry): Promise<void> {
    const buf = await this.read();
    const now = nowIsoUtc();

    // Prune stale entries (14-day fence)
    const fence = new Date();
    fence.setDate(fence.getDate() - STALE_DAYS);
    const fresh = buf.entries.filter(
      (e) => new Date(e.triggeredAt) > fence,
    );

    // Dedup by sectionRef — keep latest
    const byRef = new Map<string, BufferEntry>();
    for (const e of fresh) byRef.set(e.sectionRef, e);
    byRef.set(entry.sectionRef, entry);

    let entries = Array.from(byRef.values());

    // Cap at 200 — prune oldest first
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => a.triggeredAt.localeCompare(b.triggeredAt));
      entries = entries.slice(entries.length - MAX_ENTRIES);
    }

    await this.store.write<DriftBuffer>('drift-buffer.json', {
      state: 'pending',
      entries,
      last_changed_at: now,
      stale_fence: staleFence(),
    });
  }

  async clear(): Promise<void> {
    await this.store.write<DriftBuffer>('drift-buffer.json', {
      state: 'cleared',
      entries: [],
      last_changed_at: nowIsoUtc(),
    });
  }

  async defer(): Promise<void> {
    const buf = await this.read();
    await this.store.write<DriftBuffer>('drift-buffer.json', {
      ...buf,
      state: 'deferred',
      last_changed_at: nowIsoUtc(),
    });
  }

  async isEmpty(): Promise<boolean> {
    const buf = await this.read();
    return buf.entries.length === 0 || buf.state === 'empty' || buf.state === 'cleared';
  }
}
