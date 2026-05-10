/**
 * proposalStore unit tests (M5).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { ProposalStore } from '../../../src/proposals/store.js';
import { ProposalStateError } from '../../../src/state/proposalCache.js';

let dir: string;
let store: StateStore;
let pstore: ProposalStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pstore-'));
  // Place coherence state under .claude/coherence so getProposalsRoot resolves
  // correctly (see init.ts).
  const coherenceDir = path.join(dir, '.claude', 'coherence');
  store = new StateStore(coherenceDir, path.join(coherenceDir, 'quarantine'));
  pstore = new ProposalStore(store);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ProposalStore', () => {
  it('enqueue lands artifact + manifest under quarantine', async () => {
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'abcdef123456',
      signalKind: 'file_creation',
      artifact: { filename: 'SKILL.md', content: '# proposal' },
      sessionId: 's1',
    });
    expect(r.enqueued).toBe(true);

    const proposalDir = path.join(
      dir,
      '.claude',
      'coherence',
      'proposals',
      'skill',
      r.manifest.proposal_id,
    );
    expect(existsSync(path.join(proposalDir, 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(proposalDir, 'manifest.json'))).toBe(true);
  });

  it('collision pre-check refuses duplicate signal hashes (kind+signal_hash)', async () => {
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'samehash',
      artifact: { filename: 'SKILL.md', content: 'a' },
      sessionId: 's1',
    });
    expect(a.enqueued).toBe(true);

    const b = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'samehash',
      artifact: { filename: 'SKILL.md', content: 'b' },
      sessionId: 's1',
    });
    expect(b.enqueued).toBe(false);
    expect(b.reason).toBe('collision');
  });

  it('different kinds with same signal hash are distinct proposals', async () => {
    const a = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'hash',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    const b = await pstore.enqueue({
      projectRoot: dir,
      kind: 'slash_command',
      signalHash: 'hash',
      artifact: { filename: 'CMD.md', content: '' },
      sessionId: 's',
    });
    expect(a.enqueued && b.enqueued).toBe(true);
    expect(a.manifest.proposal_id).not.toBe(b.manifest.proposal_id);
  });

  it('FSM transition from queued → surfaced', async () => {
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    await pstore.transition(r.manifest.proposal_id, 'surfaced', 's');
    const list = await pstore.list();
    expect(list.entries[0].state).toBe('surfaced');
    expect(list.entries[0].state_history).toHaveLength(2);
  });

  it('illegal transition raises ProposalStateError', async () => {
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    await expect(
      pstore.transition(r.manifest.proposal_id, 'reverted', 's'),
    ).rejects.toThrow(ProposalStateError);
  });

  it('counts() reflects the live FSM state', async () => {
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    expect((await pstore.counts()).queued).toBe(1);
    await pstore.transition(r.manifest.proposal_id, 'surfaced', 's');
    expect((await pstore.counts()).surfaced).toBe(1);
    expect((await pstore.counts()).queued).toBe(0);
  });
});
