/**
 * /coherence:propose-list (M7).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeList } from '../../src/commands/proposeList.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pl-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runProposeList', () => {
  it('renders an empty list when no proposals exist', async () => {
    const r = await runProposeList(store);
    expect(r.items).toHaveLength(0);
    expect(r.rendered).toContain('(none)');
  });

  it('lists queued+surfaced proposals; transitions queued → surfaced', async () => {
    const pstore = new ProposalStore(store);
    await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h1',
      signalKind: 'file_creation',
      artifact: { filename: 'SKILL.md', content: '# x' },
      sessionId: 's',
    });
    const r = await runProposeList(store, { sessionId: 's1' });
    expect(r.items).toHaveLength(1);
    // After list, the entry is surfaced.
    const cache = await pstore.list();
    expect(cache.entries[0].state).toBe('surfaced');
  });

  it('hides expired and reverted entries', async () => {
    const pstore = new ProposalStore(store);
    const e = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'hh',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    // Force the entry into surfaced then expired by direct cache write.
    await pstore.transition(e.manifest.proposal_id, 'surfaced', 's');
    await pstore.transition(e.manifest.proposal_id, 'expired', 's');
    const r = await runProposeList(store, { preview: true });
    expect(r.items).toHaveLength(0);
  });

  it('preview=true does not transition', async () => {
    const pstore = new ProposalStore(store);
    await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h2',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    await runProposeList(store, { preview: true });
    const cache = await pstore.list();
    expect(cache.entries[0].state).toBe('queued');
  });
});
