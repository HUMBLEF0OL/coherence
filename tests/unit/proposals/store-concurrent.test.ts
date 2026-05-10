/**
 * R6 fix coverage: proposalStore.enqueue + .transition are lock-protected.
 * Two parallel calls don't lose updates.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { ProposalStore } from '../../../src/proposals/store.js';

let dir: string;
let store: StateStore;
let pstore: ProposalStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pstore-conc-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
  pstore = new ProposalStore(store);
  ProposalStore.resetSessionCount('s');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('R6: proposalStore concurrent operations', () => {
  it('two parallel enqueue calls for distinct signals both succeed', async () => {
    const [a, b] = await Promise.all([
      pstore.enqueue({
        projectRoot: dir,
        kind: 'skill',
        signalHash: 'h1',
        artifact: { filename: 'SKILL.md', content: '# A' },
        sessionId: 's',
      }),
      pstore.enqueue({
        projectRoot: dir,
        kind: 'skill',
        signalHash: 'h2',
        artifact: { filename: 'SKILL.md', content: '# B' },
        sessionId: 's',
      }),
    ]);
    expect(a.enqueued).toBe(true);
    expect(b.enqueued).toBe(true);
    const cache = await pstore.list();
    expect(cache.entries).toHaveLength(2);
  });

  it('parallel transitions on distinct proposals do not lose updates', async () => {
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h1',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    const b = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h2',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    await Promise.all([
      pstore.transition(a.manifest.proposal_id, 'surfaced', 's'),
      pstore.transition(b.manifest.proposal_id, 'surfaced', 's'),
    ]);
    const cache = await pstore.list();
    const states = cache.entries.map((e) => e.state).sort();
    expect(states).toEqual(['surfaced', 'surfaced']);
  });

  it('parallel enqueue + transition on same proposal_id are serialised', async () => {
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    // Re-enqueueing while still queued should refuse (collision).
    // Done in parallel with a transition: the lock serialises both.
    const [reenq, t] = await Promise.all([
      pstore.enqueue({
        projectRoot: dir,
        kind: 'skill',
        signalHash: 'h',
        artifact: { filename: 'SKILL.md', content: '' },
        sessionId: 's',
      }),
      pstore.transition(a.manifest.proposal_id, 'surfaced', 's'),
    ]);
    // One of two outcomes is acceptable depending on which acquired first:
    //   - re-enqueue runs first: collision (state=queued); then transition
    //     surfaces it.
    //   - transition runs first: state=surfaced; re-enqueue still collides
    //     (surfaced is non-terminal).
    // In either case, exactly one cache entry exists with state ∈ {queued,surfaced}.
    expect(reenq.enqueued).toBe(false);
    expect(reenq.reason).toBe('collision');
    const cache = await pstore.list();
    expect(cache.entries).toHaveLength(1);
    expect(['queued', 'surfaced']).toContain(cache.entries[0].state);
    void t;
  });
});
