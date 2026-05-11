/**
 * v0.3 audit-3 B2 — SessionStart applies team-ignore sweep.
 *
 * Plan §M2: a teammate's commit to `coherence/ignore` matching a queued
 * proposal's anchor must transition the proposal to `ignored_by_team` and
 * emit `proposal_ignored_by_team`. Prior to audit-3 the helper existed but
 * no hook called it. This test seeds an annotate-kind proposal + its
 * manifest, drops a matching `coherence/ignore` line, and asserts the
 * sweep fires from SessionStart.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { sessionStartHook } from '../../src/hooks/sessionStart.js';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import {
  readCache,
  writeCache,
  enqueueEntry,
  type ProposalCacheEntry,
} from '../../src/state/proposalCache.js';
import { nowIsoUtc } from '../../src/util/time.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-ss-team-ignore-'));
  await initCoherenceDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seedAnnotateProposal(proposalId: string, targetPath: string): Promise<void> {
  const store = makeStateStore(dir);
  const cache = await readCache(store);
  const entry: ProposalCacheEntry = {
    proposal_id: proposalId,
    kind: 'annotate',
    signal_hash: 'sig',
    state: 'queued',
    generated_at: nowIsoUtc(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    consecutive_ignored: 0,
    state_history: [{ state: 'queued', at: nowIsoUtc() }],
  };
  await writeCache(store, enqueueEntry(cache, entry));

  // Write the manifest with target_path so resolveAnchor returns it.
  const manifestDir = path.join(dir, '.claude', 'coherence', 'proposals', 'annotate', proposalId);
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    path.join(manifestDir, 'manifest.json'),
    JSON.stringify({
      proposal_id: proposalId,
      kind: 'annotate',
      signal_hash: 'sig',
      generated_at: nowIsoUtc(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      state: 'queued',
      ignored_count: 0,
      schema_version: 2,
      target_path: targetPath,
    }),
  );
}

describe('SessionStart × team-ignore sweep (audit-3 B2)', () => {
  it('transitions queued annotate proposal whose target matches coherence/ignore', async () => {
    const pid = 'a'.repeat(32);
    await seedAnnotateProposal(pid, 'docs/intro.md');

    // Drop committed coherence/ignore.
    mkdirSync(path.join(dir, 'coherence'), { recursive: true });
    writeFileSync(path.join(dir, 'coherence', 'ignore'), 'docs/\n');

    await sessionStartHook({ session_id: 's' }, dir);

    const store = makeStateStore(dir);
    const cache = await readCache(store);
    const entry = cache.entries.find((e) => e.proposal_id === pid);
    expect(entry).toBeDefined();
    expect(entry!.state).toBe('ignored_by_team');

    const metrics = readFileSync(
      path.join(dir, '.claude', 'coherence', 'metrics.jsonl'),
      'utf8',
    )
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { event: string });
    expect(metrics.some((e) => e.event === 'proposal_ignored_by_team')).toBe(true);
  });

  it('is a no-op when coherence/ignore does not exist', async () => {
    const pid = 'b'.repeat(32);
    await seedAnnotateProposal(pid, 'docs/intro.md');

    await sessionStartHook({ session_id: 's' }, dir);

    const store = makeStateStore(dir);
    const cache = await readCache(store);
    const entry = cache.entries.find((e) => e.proposal_id === pid);
    expect(entry!.state).toBe('queued');
  });

  it('is a no-op when no proposal anchor matches', async () => {
    const pid = 'c'.repeat(32);
    await seedAnnotateProposal(pid, 'docs/intro.md');

    mkdirSync(path.join(dir, 'coherence'), { recursive: true });
    writeFileSync(path.join(dir, 'coherence', 'ignore'), 'src/\n');

    await sessionStartHook({ session_id: 's' }, dir);

    const store = makeStateStore(dir);
    const cache = await readCache(store);
    const entry = cache.entries.find((e) => e.proposal_id === pid);
    expect(entry!.state).toBe('queued');
  });
});
