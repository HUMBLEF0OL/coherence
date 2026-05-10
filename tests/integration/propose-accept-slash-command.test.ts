/**
 * N5 fix coverage: slash_command accept delivers the markdown artifact to
 * .claude/commands/<name>.md but does NOT auto-register in plugin.json
 * (since the artifact is documentation-shaped, not an executable handler).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-pa-cmd-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
  ProposalStore.resetSessionCount('s');
  writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify({ name: 'coherence', slashCommands: [] }, null, 2),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('N5 fix: slash_command accept is documentation-only', () => {
  it('writes the markdown to .claude/commands/<name>.md', async () => {
    const pstore = new ProposalStore(store);
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'slash_command',
      signalHash: 'h',
      artifact: { filename: 'cleanup.md', content: '# Cleanup' },
      sessionId: 's',
    });

    const out = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: r.manifest.proposal_id,
    });
    expect(out.accepted).toBe(true);
    expect(existsSync(out.written_path!)).toBe(true);
    expect(out.written_path).toContain(path.join('.claude', 'commands'));
    expect(readFileSync(out.written_path!, 'utf8')).toBe('# Cleanup');
  });

  it('does NOT modify plugin.json (no broken auto-registration)', async () => {
    const before = readFileSync(path.join(dir, 'plugin.json'), 'utf8');
    const pstore = new ProposalStore(store);
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'slash_command',
      signalHash: 'h2',
      artifact: { filename: 'foo.md', content: '# Foo' },
      sessionId: 's',
    });
    await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: r.manifest.proposal_id,
    });
    const after = readFileSync(path.join(dir, 'plugin.json'), 'utf8');
    expect(after).toBe(before);
  });
});
