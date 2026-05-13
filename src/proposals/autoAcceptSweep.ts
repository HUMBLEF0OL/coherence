/**
 * v1.0 M1 Step 7 — Net-new file gate relaxation (FR-TRUST-3 / DD-065 amended).
 *
 * For developers who have run `/coherence:trust --promote --auto-land <kinds>`,
 * proposals whose `kind` is in `auto_land_kinds` should auto-accept instead
 * of waiting for an explicit `/coherence:propose-accept <id>` invocation.
 *
 * Kinds outside `auto_land_kinds` still require explicit accept (DD-065
 * preserved). Non-promoted developers see no change.
 *
 * The sweep is idempotent: it filters by `state === 'surfaced'` and only
 * accepts proposals matching the promoted kind set. Each call to
 * `runProposeAccept` goes through the token-gated SG-3 boundary, so the
 * structural security model is unchanged.
 */
import type { StateStore } from '../state/stateStore.js';
import { readLedger, type AutoLandKind } from '../state/trustLedger.js';
import { ProposalStore } from './store.js';
import { runProposeAccept } from '../commands/proposeAccept.js';
import { emitMetric } from '../state/metrics.js';

export interface AutoAcceptResult {
  accepted: Array<{ proposalId: string; kind: string }>;
  skipped: number;
}

const VALID_KINDS: AutoLandKind[] = ['annotate', 'skill', 'agent', 'slash_command'];

export async function runAutoAcceptSweep(
  store: StateStore,
  projectRoot: string,
  sessionId: string,
): Promise<AutoAcceptResult> {
  const ledger = await readLedger(store);
  if (ledger.promoted_at === null || ledger.auto_land_kinds.length === 0) {
    return { accepted: [], skipped: 0 };
  }
  const allowed = new Set<AutoLandKind>(
    ledger.auto_land_kinds.filter((k): k is AutoLandKind => VALID_KINDS.includes(k)),
  );
  if (allowed.size === 0) return { accepted: [], skipped: 0 };

  const pstore = new ProposalStore(store);
  const cache = await pstore.list();
  const candidates = cache.entries.filter(
    (e) => e.state === 'surfaced' && allowed.has(e.kind as AutoLandKind),
  );

  const accepted: AutoAcceptResult['accepted'] = [];
  let skipped = 0;
  for (const entry of candidates) {
    try {
      const result = await runProposeAccept({
        store,
        projectRoot,
        proposalId: entry.proposal_id,
        sessionId,
      });
      if (result.accepted) {
        accepted.push({ proposalId: entry.proposal_id, kind: entry.kind });
        await emitMetric(store, {
          event: 'proposal_accepted',
          session_id: sessionId,
          proposal_id: entry.proposal_id,
          kind: entry.kind,
          delivery_mode: 'auto_landed',
        } as unknown as Parameters<typeof emitMetric>[1]);
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { accepted, skipped };
}
