/**
 * /coherence:propose list (M7, FR-PROPOSE-7; v1.1.0 C3 subcommand surface).
 */
import type { StateStore } from '../state/stateStore.js';
import { ProposalStore } from '../proposals/store.js';
import { emitMetric } from '../state/metrics.js';
import type { ProposalCacheEntry } from '../state/proposalCache.js';

export interface ProposeListOptions {
  sessionId?: string;
  /** When true, do not transition queued → surfaced. */
  preview?: boolean;
}

export interface ProposeListItem {
  proposal_id: string;
  state: ProposalCacheEntry['state'];
  kind: ProposalCacheEntry['kind'];
  signal_kind?: string;
  ttl_days?: number;
  consecutive_ignored: number;
}

export interface ProposeListResult {
  items: ProposeListItem[];
  rendered: string;
}

const DAY_MS = 24 * 3600 * 1000;

function ttlDays(entry: ProposalCacheEntry, now: Date): number {
  return Math.max(
    0,
    Math.floor((Date.parse(entry.expires_at) - now.getTime()) / DAY_MS),
  );
}

export async function runProposeList(
  store: StateStore,
  opts: ProposeListOptions = {},
  now: Date = new Date(),
): Promise<ProposeListResult> {
  const pstore = new ProposalStore(store);
  const cache = await pstore.list();
  const lines = ['[coherence] proposals:'];

  // Sort by last state-history entry desc.
  const sorted = [...cache.entries].sort((a, b) => {
    const av = a.state_history.length > 0 ? a.state_history[a.state_history.length - 1].at : '';
    const bv = b.state_history.length > 0 ? b.state_history[b.state_history.length - 1].at : '';
    return bv.localeCompare(av);
  });

  const items: ProposeListItem[] = [];

  for (const e of sorted) {
    if (e.state === 'expired' || e.state === 'reverted') continue;
    const ttl = ttlDays(e, now);
    items.push({
      proposal_id: e.proposal_id,
      state: e.state,
      kind: e.kind,
      ...(e.signal_kind ? { signal_kind: e.signal_kind } : {}),
      ttl_days: ttl,
      consecutive_ignored: e.consecutive_ignored,
    });
    lines.push(
      `  [${e.state}] ${e.kind} ${e.proposal_id} — ttl ${ttl}d, ignored ${e.consecutive_ignored}`,
    );
  }
  if (items.length === 0) lines.push('  (none)');

  // FSM transition: queued → surfaced for any item we are showing for the
  // first time, unless preview=true.
  if (!opts.preview) {
    for (const e of sorted) {
      if (e.state === 'queued') {
        try {
          await pstore.transition(e.proposal_id, 'surfaced', opts.sessionId ?? 'session');
        } catch {
          /* swallow — concurrent transition */
        }
      }
    }
  }
  await emitMetric(store, {
    event: 'proposal_listed',
    session_id: opts.sessionId ?? 'session',
    count: items.length,
  });

  return { items, rendered: lines.join('\n') };
}
