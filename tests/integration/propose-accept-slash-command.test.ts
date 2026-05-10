/**
 * D7 fix coverage: slash_command accept appends to plugin.json.
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
  // Seed a minimal plugin.json the registrar will append to.
  writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify({ name: 'coherence', slashCommands: [] }, null, 2),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('D7: slash_command accept registers in plugin.json', () => {
  it('appends a slashCommands entry on accept', async () => {
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

    const plugin = JSON.parse(readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    const cmd = (plugin.slashCommands as Array<{ name: string; handler: string }>)
      .find((c) => c.name === 'coherence:cleanup');
    expect(cmd).toBeDefined();
    expect(cmd!.handler).toBe('commands/cleanup');
  });

  it('idempotent: re-registering the same name does not duplicate', async () => {
    const pstore = new ProposalStore(store);
    const r = await pstore.enqueue({
      projectRoot: dir,
      kind: 'slash_command',
      signalHash: 'h',
      artifact: { filename: 'foo.md', content: '# Foo' },
      sessionId: 's',
    });
    await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: r.manifest.proposal_id,
    });
    // Manually edit plugin.json again with the same name; rerun
    const plugin1 = JSON.parse(readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
    const before = (plugin1.slashCommands as unknown[]).length;
    expect(before).toBe(1);
  });
});
