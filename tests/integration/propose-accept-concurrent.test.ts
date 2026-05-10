/**
 * E9 fix coverage: concurrent propose-accept calls are serialised by the
 * coherence-dir lock; cache state-machine transitions don't lose updates.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pa-conc-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
  ProposalStore.resetSessionCount('s');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('E9 fix: concurrent propose-accept', () => {
  it('two parallel accepts of distinct proposals both succeed (lock serialises but does not block)', async () => {
    const pstore = new ProposalStore(store);
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h1',
      artifact: { filename: 'SKILL.md', content: '# A' },
      sessionId: 's',
    });
    const b = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h2',
      artifact: { filename: 'SKILL.md', content: '# B' },
      sessionId: 's',
    });
    const [ra, rb] = await Promise.all([
      runProposeAccept({
        store,
        projectRoot: dir,
        proposalId: a.manifest.proposal_id,
        sessionId: 's-a',
      }),
      runProposeAccept({
        store,
        projectRoot: dir,
        proposalId: b.manifest.proposal_id,
        sessionId: 's-b',
      }),
    ]);
    expect(ra.accepted).toBe(true);
    expect(rb.accepted).toBe(true);
    // Cache reflects both transitions.
    const cache = await pstore.list();
    const states = cache.entries.map((e) => e.state).sort();
    expect(states).toEqual(['accepted', 'accepted']);
  });
});
