/**
 * D3 + D5 fix coverage: terminal-state re-enqueue and per-session cap.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import {
  ProposalStore,
  PROPOSALS_PER_SESSION_CAP,
} from '../../../src/proposals/store.js';

let dir: string;
let store: StateStore;
let pstore: ProposalStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-store-fix-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
  pstore = new ProposalStore(store);
  ProposalStore.resetSessionCount('s');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('D3: re-enqueue after terminal state', () => {
  it('re-enqueueing the same kind+signal_hash after rejection succeeds', async () => {
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'recur',
      artifact: { filename: 'SKILL.md', content: '# v1' },
      sessionId: 's',
    });
    expect(a.enqueued).toBe(true);
    await pstore.transition(a.manifest.proposal_id, 'surfaced', 's');
    await pstore.transition(a.manifest.proposal_id, 'rejected', 's');

    // Now the same signal recurs.
    const b = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'recur',
      artifact: { filename: 'SKILL.md', content: '# v2' },
      sessionId: 's',
    });
    expect(b.enqueued).toBe(true);
    expect(b.reason).toBeUndefined();
    expect(b.manifest.proposal_id).toBe(a.manifest.proposal_id);
  });

  it('N6: re-enqueue preserves prior state_history (DD-088 append-only)', async () => {
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'preserve',
      artifact: { filename: 'SKILL.md', content: '# v1' },
      sessionId: 's',
    });
    await pstore.transition(a.manifest.proposal_id, 'surfaced', 's');
    await pstore.transition(a.manifest.proposal_id, 'rejected', 's');
    const cacheBefore = await pstore.list();
    expect(cacheBefore.entries[0].state_history).toHaveLength(3);

    const b = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'preserve',
      artifact: { filename: 'SKILL.md', content: '# v2' },
      sessionId: 's',
    });
    expect(b.enqueued).toBe(true);

    const cacheAfter = await pstore.list();
    const entry = cacheAfter.entries.find(
      (e) => e.proposal_id === b.manifest.proposal_id,
    )!;
    expect(entry.state_history.length).toBeGreaterThanOrEqual(4);
    // The continuation marker is present.
    const sep = entry.state_history.find((h) =>
      h.reason?.includes('re-enqueued after terminal'),
    );
    expect(sep).toBeDefined();
    // First state in the merged history is the original `queued`.
    expect(entry.state_history[0].state).toBe('queued');
  });

  it('re-enqueueing while still surfaced is refused (collision)', async () => {
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'live',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    await pstore.transition(a.manifest.proposal_id, 'surfaced', 's');

    const b = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'live',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    expect(b.enqueued).toBe(false);
    expect(b.reason).toBe('collision');
  });
});

describe('D5: proposals_per_session ≤ 3 cap', () => {
  it('refuses the 4th enqueue with reason=session_cap', async () => {
    expect(PROPOSALS_PER_SESSION_CAP).toBe(3);
    for (let i = 0; i < 3; i++) {
      const r = await pstore.enqueue({
        projectRoot: dir,
        kind: 'skill',
        signalHash: `h${i}`,
        artifact: { filename: 'SKILL.md', content: '' },
        sessionId: 's',
      });
      expect(r.enqueued).toBe(true);
    }
    expect(ProposalStore.peekSessionCount('s')).toBe(3);

    const fourth = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'over',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    expect(fourth.enqueued).toBe(false);
    expect(fourth.reason).toBe('session_cap');
  });

  it('resetSessionCount clears the counter', async () => {
    for (let i = 0; i < 3; i++) {
      await pstore.enqueue({
        projectRoot: dir,
        kind: 'skill',
        signalHash: `h${i}`,
        artifact: { filename: 'SKILL.md', content: '' },
        sessionId: 's',
      });
    }
    ProposalStore.resetSessionCount('s');
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'reset',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    expect(r.enqueued).toBe(true);
  });

  it('M1: session_cap returns a real proposal_id (no empty-string stub)', async () => {
    for (let i = 0; i < 3; i++) {
      await pstore.enqueue({
        projectRoot: dir,
        kind: 'skill',
        signalHash: `h${i}`,
        artifact: { filename: 'SKILL.md', content: '' },
        sessionId: 's',
      });
    }
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'over-the-cap',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    expect(r.enqueued).toBe(false);
    expect(r.reason).toBe('session_cap');
    expect(r.entry).toBeNull();
    // The manifest has a real 32-hex id (M1 fix), not an empty stub.
    expect(r.manifest.proposal_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('separate session ids have independent budgets', async () => {
    for (let i = 0; i < 3; i++) {
      await pstore.enqueue({
        projectRoot: dir,
        kind: 'skill',
        signalHash: `s1-h${i}`,
        artifact: { filename: 'SKILL.md', content: '' },
        sessionId: 'sess-a',
      });
    }
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 's2-fresh',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 'sess-b',
    });
    expect(r.enqueued).toBe(true);
  });
});
