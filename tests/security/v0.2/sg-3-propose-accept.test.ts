/**
 * SG-3 propose-accept defence-in-depth: a proposal whose target path tries
 * to escape via `..` traversal is refused.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { ProposalStore } from '../../../src/proposals/store.js';
import { runProposeAccept } from '../../../src/commands/proposeAccept.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pa-sg3-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SG-3 propose-accept path escape', () => {
  it('refuses targetPathFor that resolves outside projectRoot', async () => {
    const pstore = new ProposalStore(store);
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h',
      artifact: { filename: 'SKILL.md', content: '# body' },
      sessionId: 's',
    });
    const out = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: r.manifest.proposal_id,
      targetPathFor: () => path.join(dir, '..', 'escape.md'),
    });
    expect(out.accepted).toBe(false);
    expect(out.reason).toBe('path_escape');
  });
});
