/**
 * v1.0 M1 Step 7 — Net-new file gate relaxation (FR-TRUST-3 / DD-065 amended).
 *
 * Verifies the auto-accept sweep:
 *   1. Non-promoted developer → no auto-accept.
 *   2. Promoted developer, kind IN auto_land_kinds → auto-accepts.
 *   3. Promoted developer, kind NOT IN auto_land_kinds → still queued.
 *   4. Already-accepted proposals are skipped (idempotent).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { setIdentityOverride } from '../../src/state/identity.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runAutoAcceptSweep } from '../../src/proposals/autoAcceptSweep.js';
import {
  readLedger,
  writeLedger,
  emptyLedger,
} from '../../src/state/trustLedger.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-auto-accept-'));
  const c = path.join(dir, '.claude', 'coherence');
  mkdirSync(c, { recursive: true });
  mkdirSync(path.join(c, 'quarantine'), { recursive: true });
  store = new StateStore(c, path.join(c, 'quarantine'));
  setIdentityOverride({ hash: 'aaaaaaaaaaaa', display: 'Tester' });
  ProposalStore.resetSessionCount('sess');
});

afterEach(() => {
  setIdentityOverride(null);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
});

async function enqueueAnnotateProposal(): Promise<string> {
  const docPath = path.join(dir, 'docs', 'guide.md');
  mkdirSync(path.dirname(docPath), { recursive: true });
  writeFileSync(docPath, '# Hi\n\nhi');
  const annotated = '<!-- coherence:section hi -->\n# Hi\n\nhi';
  const pstore = new ProposalStore(store);
  const r = await pstore.enqueue({
    projectRoot: dir,
    kind: 'annotate',
    signalHash: 'src-hash-' + Math.random().toString(36).slice(2, 8),
    signalKind: 'anchor_less_doc',
    artifact: { filename: 'PROPOSAL.md', content: annotated },
    sessionId: 'sess',
    targetPath: path.relative(dir, docPath),
  });
  expect(r.enqueued).toBe(true);
  // Transition queued → surfaced (the sweep only operates on surfaced)
  await pstore.transition(r.manifest.proposal_id, 'surfaced');
  return r.manifest.proposal_id;
}

async function promote(kinds: Array<'annotate' | 'skill' | 'agent' | 'slash_command'>): Promise<void> {
  const ledger = emptyLedger();
  ledger.promoted_at = new Date().toISOString();
  ledger.auto_land_kinds = kinds;
  await writeLedger(store, ledger);
}

describe('runAutoAcceptSweep (FR-TRUST-3)', () => {
  it('no-op for non-promoted developer', async () => {
    await enqueueAnnotateProposal();
    const result = await runAutoAcceptSweep(store, dir, 'sess');
    expect(result.accepted).toEqual([]);
    expect(result.skipped).toBe(0);
    // Proposal still surfaced (not auto-accepted)
    const cache = await new ProposalStore(store).list();
    expect(cache.entries[0].state).toBe('surfaced');
  });

  it('auto-accepts when kind matches auto_land_kinds', async () => {
    const id = await enqueueAnnotateProposal();
    await promote(['annotate']);
    const result = await runAutoAcceptSweep(store, dir, 'sess');
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].proposalId).toBe(id);
    expect(result.accepted[0].kind).toBe('annotate');
    // State transitioned to accepted
    const cache = await new ProposalStore(store).list();
    expect(cache.entries[0].state).toBe('accepted');
  });

  it('does NOT auto-accept kinds outside auto_land_kinds (DD-065 preserved)', async () => {
    await enqueueAnnotateProposal();
    // Promoted, but for a kind that doesn't match the proposal
    await promote(['skill']);
    const result = await runAutoAcceptSweep(store, dir, 'sess');
    expect(result.accepted).toEqual([]);
    const cache = await new ProposalStore(store).list();
    expect(cache.entries[0].state).toBe('surfaced');
  });

  it('is idempotent — running twice does not re-accept already-accepted proposals', async () => {
    await enqueueAnnotateProposal();
    await promote(['annotate']);
    await runAutoAcceptSweep(store, dir, 'sess');
    const second = await runAutoAcceptSweep(store, dir, 'sess');
    expect(second.accepted).toEqual([]);
  });

  it('handles empty auto_land_kinds gracefully (promoted with no kinds enabled)', async () => {
    await enqueueAnnotateProposal();
    const ledger = emptyLedger();
    ledger.promoted_at = new Date().toISOString();
    ledger.auto_land_kinds = [];
    await writeLedger(store, ledger);
    const result = await runAutoAcceptSweep(store, dir, 'sess');
    expect(result.accepted).toEqual([]);
  });
});

void readLedger;
