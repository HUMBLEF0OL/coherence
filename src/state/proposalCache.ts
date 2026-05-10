/**
 * proposal-cache.json read/write + FSM transition machinery (DD-088).
 *
 * State machine:
 *   queued → surfaced
 *   surfaced → ignored | accepted | rejected | expired
 *   accepted → reverted
 *   queued | surfaced | ignored → expired
 *
 * `state_history[]` is append-only; cap at 50 entries with oldest pruned
 * (resolves Open Question §3 in the v0.2 plan).
 */
import type { StateStore } from './stateStore.js';
import type { ProposalKind } from '../proposals/quarantine.js';
import type { ProposalState } from '../proposals/manifest.js';
import { nowIsoUtc } from '../util/time.js';

export const STATE_HISTORY_CAP = 50;

export type SignalKind =
  | 'bash_repetition'
  | 'file_creation'
  | 'agent_correction'
  | 'anchor_less_doc';

export interface ProposalCacheEntry {
  proposal_id: string;
  kind: ProposalKind;
  signal_hash: string;
  signal_kind?: SignalKind;
  state: ProposalState;
  generated_at: string;
  expires_at: string;
  last_signal_at?: string;
  consecutive_ignored: number;
  state_history: Array<{ state: ProposalState; at: string; reason?: string }>;
}

export interface ProposalCache {
  schema_version: 2;
  entries: ProposalCacheEntry[];
}

export class ProposalStateError extends Error {
  constructor(
    public readonly proposalId: string,
    public readonly fromState: ProposalState,
    public readonly toState: ProposalState,
  ) {
    super(`illegal proposal state transition for ${proposalId}: ${fromState} → ${toState}`);
    this.name = 'ProposalStateError';
  }
}

const ALLOWED_TRANSITIONS: Record<ProposalState, ProposalState[]> = {
  // v0.3 DD-088 amendment: any non-terminal state can fall to
  // `ignored_by_team` when a teammate commits a matching path to
  // `coherence/ignore`.
  queued: ['surfaced', 'expired', 'ignored_by_team'],
  surfaced: ['ignored', 'accepted', 'rejected', 'expired', 'ignored_by_team'],
  ignored: ['surfaced', 'expired', 'ignored_by_team'],
  accepted: ['reverted'],
  rejected: [],
  reverted: [],
  expired: [],
  ignored_by_team: [],
};

export function defaultCache(): ProposalCache {
  return { schema_version: 2, entries: [] };
}

export async function readCache(store: StateStore): Promise<ProposalCache> {
  return (await store.read<ProposalCache>('proposal-cache.json')) ?? defaultCache();
}

export async function writeCache(store: StateStore, cache: ProposalCache): Promise<void> {
  await store.write('proposal-cache.json', cache);
}

/** Add a queued entry; throws if id already present. */
export function enqueueEntry(
  cache: ProposalCache,
  entry: Omit<ProposalCacheEntry, 'state_history' | 'state'> & { state?: ProposalState },
): ProposalCache {
  if (cache.entries.find((e) => e.proposal_id === entry.proposal_id)) {
    throw new ProposalStateError(entry.proposal_id, 'queued', 'queued');
  }
  const now = nowIsoUtc();
  const state: ProposalState = entry.state ?? 'queued';
  // E6: state_history is bounded at construction too; ensures the cap is a
  // structural invariant, not a transition-time-only check.
  const newEntry: ProposalCacheEntry = {
    ...entry,
    state,
    consecutive_ignored: entry.consecutive_ignored ?? 0,
    state_history: [{ state, at: now }].slice(-STATE_HISTORY_CAP),
  };
  return { ...cache, entries: [...cache.entries, newEntry] };
}

/** Apply an FSM transition or throw `ProposalStateError`. */
export function transition(
  cache: ProposalCache,
  proposalId: string,
  toState: ProposalState,
  reason?: string,
): { cache: ProposalCache; truncated: boolean } {
  const entry = cache.entries.find((e) => e.proposal_id === proposalId);
  if (!entry) {
    throw new ProposalStateError(proposalId, 'queued', toState);
  }
  const allowed = ALLOWED_TRANSITIONS[entry.state];
  if (!allowed.includes(toState)) {
    throw new ProposalStateError(proposalId, entry.state, toState);
  }

  const now = nowIsoUtc();
  const history = [...entry.state_history, { state: toState, at: now, ...(reason ? { reason } : {}) }];
  let truncated = false;
  let trimmed = history;
  if (history.length > STATE_HISTORY_CAP) {
    trimmed = history.slice(history.length - STATE_HISTORY_CAP);
    truncated = true;
  }
  const updatedEntry: ProposalCacheEntry = {
    ...entry,
    state: toState,
    consecutive_ignored:
      toState === 'ignored' ? entry.consecutive_ignored + 1 : entry.consecutive_ignored,
    state_history: trimmed,
  };
  return {
    cache: {
      ...cache,
      entries: cache.entries.map((e) => (e.proposal_id === proposalId ? updatedEntry : e)),
    },
    truncated,
  };
}

/** Counts (for the snapshot writer). */
export function counts(cache: ProposalCache): {
  queued: number;
  surfaced: number;
  ignored: number;
} {
  const out = { queued: 0, surfaced: 0, ignored: 0 };
  for (const e of cache.entries) {
    if (e.state === 'queued') out.queued += 1;
    else if (e.state === 'surfaced') out.surfaced += 1;
    else if (e.state === 'ignored') out.ignored += 1;
  }
  return out;
}
