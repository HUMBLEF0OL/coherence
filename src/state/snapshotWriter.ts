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

/**
 * E2 fix: snapshot state is per-StateStore (WeakMap). The legacy module-
 * level `defaultState` survives for the markDirty()/flush() convenience
 * pair; the StateStore-keyed map provides isolation when multiple stores
 * exist in the same process (test fixtures, multi-project hosts).
 */
const defaultState: SnapshotState = { dirty: false, lastFlushAt: 0, pending: null };
const perStore = new WeakMap<StateStore, SnapshotState>();

function stateFor(store: StateStore | null): SnapshotState {
  if (!store) return defaultState;
  let s = perStore.get(store);
  if (!s) {
    s = { dirty: false, lastFlushAt: 0, pending: null };
    perStore.set(store, s);
  }
  return s;
}

/**
 * PostToolUse-side: mark the snapshot dirty without touching disk.
 * If `store` is provided, the dirty bit is stored per-store; otherwise
 * the legacy module-level state is updated (kept for v0.1 compatibility).
 */
export function markDirty(snapshot: StateSnapshot, store?: StateStore): void {
  const s = stateFor(store ?? null);
  s.dirty = true;
  s.pending = snapshot;
}

export function isDirty(store?: StateStore): boolean {
  return stateFor(store ?? null).dirty;
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
  // Q1 fix: strict per-store lookup. The previous P5 fix retained a fall-
  // through to `defaultState` when `perStore.get(store)` was undefined,
  // which still allowed cross-store snapshot leakage when defaultState
  // was dirty (e.g. test code calling `markDirty(snap)` without a store).
  // All hook callers now pass `store`, so the legacy fallback is dead
  // weight. Removing it closes the leak completely.
  let s = perStore.get(store);
  if (!s) {
    // Bootstrap: synthesise an empty per-store entry so the bootstrap
    // write goes through. No fall-through to defaultState.
    if (!options.bootstrap) return false;
    s = { dirty: false, lastFlushAt: 0, pending: null };
    perStore.set(store, s);
  } else if (!s.dirty || !s.pending) {
    if (!options.bootstrap) return false;
  }
  const now = options.now ?? Date.now();
  const sinceLast = now - s.lastFlushAt;
  if (!options.force && !options.bootstrap && sinceLast < MIN_FLUSH_INTERVAL_MS) {
    return false;
  }
  const snapshot: StateSnapshot = s.pending ?? {
    schema_version: 2,
    written_at: nowIsoUtc(),
    buffer_count: 0,
    proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
    mode: 'observe',
  };
  await store.write('state-snapshot.json', { ...snapshot, written_at: nowIsoUtc() });
  s.dirty = false;
  s.lastFlushAt = now;
  return true;
}

/** Reset (used by tests). Resets both default and per-store state. */
export function reset(): void {
  defaultState.dirty = false;
  defaultState.lastFlushAt = 0;
  defaultState.pending = null;
}

export function _peekState(store?: StateStore): SnapshotState {
  return stateFor(store ?? null);
}
