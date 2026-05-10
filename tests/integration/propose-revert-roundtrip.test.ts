/**
 * /coherence:propose-revert-acceptance round-trip (M7, DD-083).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';
import { runProposeRevertAcceptance } from '../../src/commands/proposeRevertAcceptance.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pr-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seedAndAccept(): Promise<{ id: string; written: string }> {
  const pstore = new ProposalStore(store);
  const r = await pstore.enqueue({
    projectRoot: dir,
    kind: 'skill',
    signalHash: 'roundtrip',
    artifact: { filename: 'SKILL.md', content: '# body' },
    sessionId: 's',
  });
  const a = await runProposeAccept({
    store,
    projectRoot: dir,
    proposalId: r.manifest.proposal_id,
  });
  return { id: r.manifest.proposal_id, written: a.written_path! };
}

describe('propose-revert-acceptance round-trip (DD-083)', () => {
  it('reverts an accepted proposal: state→reverted + file removed + log appended', async () => {
    const { id, written } = await seedAndAccept();
    expect(existsSync(written)).toBe(true);

    const r = await runProposeRevertAcceptance({
      store,
      projectRoot: dir,
      proposalId: id,
      acceptedPath: written,
    });
    expect(r.reverted).toBe(true);
    expect(existsSync(written)).toBe(false);

    const log = readFileSync(
      path.join(dir, '.claude', 'coherence', 'coherence-log.md'),
      'utf8',
    );
    expect(log).toContain('[coherence-revert]');
  });

  it('refuses revert from non-accepted state', async () => {
    const pstore = new ProposalStore(store);
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h',
      artifact: { filename: 'SKILL.md', content: '' },
      sessionId: 's',
    });
    const out = await runProposeRevertAcceptance({
      store,
      projectRoot: dir,
      proposalId: r.manifest.proposal_id,
    });
    expect(out.reverted).toBe(false);
    expect(out.reason).toBe('illegal_state');
  });
});
