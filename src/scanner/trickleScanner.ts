/**
 * Trickle deep-scan (M6, DD-066, FR-TRICKLE-1..N).
 *
 * Triggered from PostToolUse only when:
 *   (a) host idle ≥ idle_threshold_ms (default 30 000)
 *   (b) entries_this_session < per_session_cap (default 20)
 *   (c) cumulative trickle CPU this PostToolUse < 100 ms
 *
 * Walks unedited tracked docs in deterministic order (lex-sort default per
 * Open Question §2). Appends `trickle_deep_scan` source entries to
 * drift-buffer.json. Persists last_pass_at + entries_this_session in
 * scan-cache/state.json.
 */
import type { StateStore } from '../state/stateStore.js';
import { nowIsoUtc } from '../util/time.js';

export interface ScanCacheState {
  schema_version: 2;
  last_pass_at: string;
  entries_this_session: number;
  per_session_cap: number;
  idle_threshold_ms: number;
}

export const DEFAULT_PER_SESSION_CAP = 20;
export const DEFAULT_IDLE_THRESHOLD_MS = 30_000;
export const TRICKLE_BUDGET_MS = 100;

export interface TrickleInput {
  candidatePaths: string[];
  /** ms since last tool call; if < idle_threshold_ms, scanner short-circuits. */
  idleMs: number;
  /** Cumulative trickle ms used this PostToolUse window. */
  cumulativeMs: number;
  /** Optional `now` injection for deterministic tests. */
  now?: Date;
}

export interface TrickleResult {
  scanned: string[];
  /** Whether the budget was hit / per-session cap reached / not idle. */
  reason?: 'not_idle' | 'cap_reached' | 'budget_exhausted' | 'no_candidates';
  /** Updated state to persist. */
  state: ScanCacheState;
  /** ms attributed to the scan. */
  ms_used: number;
}

export async function readScanCacheState(store: StateStore): Promise<ScanCacheState> {
  const f = await store.read<ScanCacheState>('scan-cache/state.json');
  return (
    f ?? {
      schema_version: 2,
      last_pass_at: '',
      entries_this_session: 0,
      per_session_cap: DEFAULT_PER_SESSION_CAP,
      idle_threshold_ms: DEFAULT_IDLE_THRESHOLD_MS,
    }
  );
}

export async function writeScanCacheState(
  store: StateStore,
  state: ScanCacheState,
): Promise<void> {
  await store.write('scan-cache/state.json', state);
}

/**
 * Pure scanner: takes input, returns scanned paths + new state. Side-effect-free.
 * The hook layer is responsible for buffering entries and persisting state.
 */
export function scanTrickle(state: ScanCacheState, input: TrickleInput): TrickleResult {
  if (input.idleMs < state.idle_threshold_ms) {
    return {
      scanned: [],
      reason: 'not_idle',
      state,
      ms_used: 0,
    };
  }
  if (state.entries_this_session >= state.per_session_cap) {
    return {
      scanned: [],
      reason: 'cap_reached',
      state,
      ms_used: 0,
    };
  }
  if (input.cumulativeMs >= TRICKLE_BUDGET_MS) {
    return {
      scanned: [],
      reason: 'budget_exhausted',
      state,
      ms_used: 0,
    };
  }
  if (input.candidatePaths.length === 0) {
    return { scanned: [], reason: 'no_candidates', state, ms_used: 0 };
  }

  const sorted = [...input.candidatePaths].sort((a, b) => a.localeCompare(b));
  const remainingBudget = TRICKLE_BUDGET_MS - input.cumulativeMs;
  // Synthetic ms-per-doc accounting: 5 ms per scan (the v0.1 anchor scan
  // dominates). The hook layer wraps this with real timing.
  const msPerDoc = 5;
  const maxByBudget = Math.floor(remainingBudget / msPerDoc);
  const remainingCap = state.per_session_cap - state.entries_this_session;
  const limit = Math.min(maxByBudget, remainingCap, sorted.length);
  const scanned = sorted.slice(0, limit);

  const newState: ScanCacheState = {
    ...state,
    last_pass_at: (input.now ?? new Date(Date.parse(nowIsoUtc()))).toISOString(),
    entries_this_session: state.entries_this_session + scanned.length,
  };
  return {
    scanned,
    state: newState,
    ms_used: scanned.length * msPerDoc,
  };
}
