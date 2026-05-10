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
