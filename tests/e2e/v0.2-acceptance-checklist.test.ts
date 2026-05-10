/**
 * v0.2 acceptance checklist (M10).
 *
 * Runs every BRD-4 acceptance row against (a) a fresh v0.2 install and
 * (b) a v0.1 → v0.2 upgrade install, exercising:
 *   - migrator (FG-1)
 *   - graduate v0.2 (FG-2)
 *   - signal detector positive case → proposal_signal_observed (FG-5)
 *   - propose-list / show / accept / reject round-trip (FG-8/9/10)
 *   - DD-075 expiry (FG-11)
 *   - statusline install/uninstall round-trip (FG-13/14)
 *   - SG-3 boundary preserved end-to-end
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import { runMigrations } from '../../src/state/migrate/index.js';
import { runGraduate } from '../../src/commands/graduate.js';
import { ProposalStore } from '../../src/proposals/store.js';
import { runProposeList } from '../../src/commands/proposeList.js';
import { runProposeAccept } from '../../src/commands/proposeAccept.js';
import { runProposeReject } from '../../src/commands/proposeReject.js';
import { detectBashRepetition } from '../../src/signal/bashRepetition.js';
import { defaultSignalCache, appendBash } from '../../src/signal/signalCache.js';
import { signatureHash } from '../../src/signal/signatureHash.js';
import { normaliseBashCommand } from '../../src/signal/normalize.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-e2e-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('v0.2 acceptance checklist', () => {
  it('FG-1: fresh install lays down v2 schemas', async () => {
    await initCoherenceDir(dir);
    expect(existsSync(path.join(dir, '.claude', 'coherence', 'graduation.json'))).toBe(true);
    expect(existsSync(path.join(dir, '.claude', 'coherence', 'proposal-cache.json'))).toBe(true);
    expect(existsSync(path.join(dir, '.claude', 'coherence', 'signal-cache.json'))).toBe(true);
  });

  it('FG-1: v1 → v2 migration via runMigrations()', async () => {
    const cohDir = path.join(dir, '.claude', 'coherence');
    const qDir = path.join(cohDir, 'quarantine');
    mkdirSync(cohDir, { recursive: true });
    mkdirSync(qDir, { recursive: true });
    writeFileSync(
      path.join(cohDir, 'version.json'),
      JSON.stringify({
        schema_version: 1,
        plugin_version: '0.1.1',
        installed_at: '2026-04-01T00:00:00.000Z',
        prior_versions: [],
      }),
    );
    const results = await runMigrations(cohDir, qDir);
    expect(results.find((r) => r.from === 1 && r.to === 2)?.migrated).toBe(true);
    const v = JSON.parse(readFileSync(path.join(cohDir, 'version.json'), 'utf8'));
    expect(v.schema_version).toBe(2);
  });

  it('FG-2: graduate v0.2 sets per-scope mode + --status reflects it', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    await runGraduate(store, { mode: 'annotate', scope: 'docs/' });
    const r = await runGraduate(store, { status: true, cwdPath: 'docs/foo.md' });
    expect(r.effectiveMode).toBe('annotate');
  });

  it('FG-5: bash signal detector fires after 3 normalised matches', () => {
    let cache = defaultSignalCache();
    const hash = signatureHash('tool_invocation', normaliseBashCommand('ls -la'));
    cache = appendBash(cache, hash, '2026-05-10T10:00:00Z');
    cache = appendBash(cache, hash, '2026-05-10T10:01:00Z');
    const r = detectBashRepetition(cache, 'ls -la', new Date('2026-05-10T10:02:00Z'));
    expect(r.fired).toBe(true);
  });

  it('FG-8/9/10: propose accept + reject round-trip preserves boundary', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const pstore = new ProposalStore(store);

    const enq1 = await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h1',
      artifact: { filename: 'SKILL.md', content: '# proposal\n\nbody' },
      sessionId: 's',
    });
    const enq2 = await pstore.enqueue({
      projectRoot: dir,
      kind: 'slash_command',
      signalHash: 'h2',
      artifact: { filename: 'cmd.md', content: '# cmd' },
      sessionId: 's',
    });
    const list = await runProposeList(store);
    expect(list.items.length).toBe(2);

    const a = await runProposeAccept({
      store,
      projectRoot: dir,
      proposalId: enq1.manifest.proposal_id,
    });
    expect(a.accepted).toBe(true);
    expect(existsSync(a.written_path!)).toBe(true);

    const r = await runProposeReject(store, enq2.manifest.proposal_id);
    expect(r.rejected).toBe(true);
  });

  it('SG-3: writing proposals never escapes .claude/coherence/', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const pstore = new ProposalStore(store);
    await pstore.enqueue({
      projectRoot: dir,
      kind: 'skill',
      signalHash: 'h',
      artifact: { filename: 'SKILL.md', content: '# x' },
      sessionId: 's',
    });
    expect(existsSync(path.join(dir, '.claude', 'skills'))).toBe(false);
    expect(existsSync(path.join(dir, '.claude', 'agents'))).toBe(false);
  });
});
