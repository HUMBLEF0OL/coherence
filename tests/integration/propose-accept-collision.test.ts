/**
 * /coherence:propose accept (M7, DD-082 collision policy; v1.1.0 C3 subcommand surface).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pa-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
  ProposalStore.resetSessionCount('s');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seedProposal(): Promise<string> {
  const pstore = new ProposalStore(store);
  const r = await pstore.enqueue({
    projectRoot: dir,
    kind: 'skill',
    signalHash: 'h',
    artifact: { filename: 'SKILL.md', content: '# proposal body' },
    sessionId: 's',
  });
  return r.manifest.proposal_id;
}

describe('propose-accept collision policy (DD-082)', () => {
  it('writes when target does not exist', async () => {
    const id = await seedProposal();
    const r = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: id,
    });
    expect(r.accepted).toBe(true);
    expect(existsSync(r.written_path!)).toBe(true);
  });

  it('refuses with a suffix suggestion when target exists', async () => {
    const id = await seedProposal();
    // Pre-create the target file.
    const target = path.join(dir, '.claude', 'skills', id, 'SKILL.md');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'pre-existing content');

    const r = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: id,
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('name_collision');
    expect(r.suggestion).toMatch(/SKILL-2\.md$/);
  });

  it('--rename succeeds with the suffixed name', async () => {
    const id = await seedProposal();
    const target = path.join(dir, '.claude', 'skills', id, 'SKILL.md');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'pre-existing content');

    const r = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: id,
      rename: true,
    });
    expect(r.accepted).toBe(true);
    expect(r.written_path).toMatch(/SKILL-2\.md$/);
    expect(readFileSync(target, 'utf8')).toBe('pre-existing content');
  });

  it('--overwrite quarantines existing then writes', async () => {
    const id = await seedProposal();
    const target = path.join(dir, '.claude', 'skills', id, 'SKILL.md');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'pre-existing content');

    const r = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: id,
      overwriteRetypedPath: target,
    });
    expect(r.accepted).toBe(true);
    expect(readFileSync(target, 'utf8')).toContain('proposal body');
  });

  it('--overwrite with mismatched path refuses', async () => {
    const id = await seedProposal();
    const target = path.join(dir, '.claude', 'skills', id, 'SKILL.md');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'pre-existing');
    const r = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: id,
      overwriteRetypedPath: '/etc/passwd',
    });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('overwrite_mismatch');
  });
});
