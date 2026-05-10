/**
 * /coherence:propose-reject <id> (M7, FR-PROPOSE-8).
 */
import type { StateStore } from '../state/stateStore.js';
import { ProposalStore } from '../proposals/store.js';
import { emitMetric } from '../state/metrics.js';

export interface ProposeRejectResult {
  rejected: boolean;
  reason?: string;
  rendered: string;
}

export async function runProposeReject(
  store: StateStore,
  proposalId: string,
  sessionId = 'session',
): Promise<ProposeRejectResult> {
  const pstore = new ProposalStore(store);
  const cache = await pstore.list();
  const entry = cache.entries.find((e) => e.proposal_id === proposalId);
  if (!entry) {
    return { rejected: false, reason: 'not_found', rendered: `[coherence] propose-reject: not found` };
  }
  if (entry.state !== 'surfaced' && entry.state !== 'queued') {
    return { rejected: false, reason: 'illegal_state', rendered: `[coherence] propose-reject: cannot reject from ${entry.state}` };
  }
  // Force a queued→surfaced transition first if needed (so reject is allowed).
  let working = entry.state;
  if (working === 'queued') {
    await pstore.transition(proposalId, 'surfaced', sessionId);
    working = 'surfaced';
  }
  await pstore.transition(proposalId, 'rejected', sessionId);
  await emitMetric(store, {
    event: 'proposal_rejected',
    session_id: sessionId,
    proposal_id: proposalId,
  });
  return {
    rejected: true,
    rendered: `[coherence] propose-reject: ${proposalId} → rejected`,
  };
}
