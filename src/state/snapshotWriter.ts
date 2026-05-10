/**
 * DD-084 debounced state-snapshot writer.
 *
 * PostToolUse only flips an in-process *dirty bit* — never disk I/O on the
 * hot path. Flush conditions:
 *   (a) Stop / SubagentStop / SessionEnd hooks (already off the hot path)
 *   (b) Opportunistic debounced writer with ≥5 s minimum interval
 * Locked-protected via stateStore.write atomic semantics.
 *
 * NFR-PERF-N4: snapshot write ≤ 5 ms p95 isolated, 0 ms attributed to
 * PostToolUse.
 */
import type { StateStore } from './stateStore.js';
import type { V02Mode } from './graduation.js';
import { nowIsoUtc } from '../util/time.js';

export interface StateSnapshot {
  schema_version: 2;
  written_at: string;
  buffer_count: number;
  proposal_counts: { queued: number; surfaced: number; ignored: number };
  mode: V02Mode;
  degraded?: boolean;
}

export const MIN_FLUSH_INTERVAL_MS = 5000;

interface SnapshotState {
  dirty: boolean;
  lastFlushAt: number;
  pending: StateSnapshot | null;
}

const state: SnapshotState = { dirty: false, lastFlushAt: 0, pending: null };

/** PostToolUse-side: mark the snapshot dirty without touching disk. */
export function markDirty(snapshot: StateSnapshot): void {
  state.dirty = true;
  state.pending = snapshot;
}

export function isDirty(): boolean {
  return state.dirty;
}

/**
 * Debounced flush. Honours the 5 s minimum interval unless `force=true`
 * (used by Stop / SubagentStop / SessionEnd, FR-STATUSLINE-7).
 *
 * Returns true iff a write happened.
 */
export async function flush(
  store: StateStore,
  options: { force?: boolean; bootstrap?: boolean; now?: number } = {},
): Promise<boolean> {
  if (!state.dirty || !state.pending) {
    if (!options.bootstrap) return false;
  }
  const now = options.now ?? Date.now();
  const sinceLast = now - state.lastFlushAt;
  if (!options.force && !options.bootstrap && sinceLast < MIN_FLUSH_INTERVAL_MS) {
    return false;
  }
  const snapshot: StateSnapshot = state.pending ?? {
    schema_version: 2,
    written_at: nowIsoUtc(),
    buffer_count: 0,
    proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
    mode: 'observe',
  };
  await store.write('state-snapshot.json', { ...snapshot, written_at: nowIsoUtc() });
  state.dirty = false;
  state.lastFlushAt = now;
  return true;
}

/** Reset (used by tests). */
export function reset(): void {
  state.dirty = false;
  state.lastFlushAt = 0;
  state.pending = null;
}

export function _peekState(): SnapshotState {
  return state;
}
