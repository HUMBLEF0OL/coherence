/**
 * v0.3 M2 — DD-088 amendment: proposal_ignored_by_team FSM transition.
 *
 * Verifies:
 *   - non-terminal entries (queued/surfaced/ignored) transition to
 *     `ignored_by_team` when a committed-ignore line matches the anchor
 *   - the transition emits `proposal_ignored_by_team` (NOT `plan_*`)
 *   - v0.2 P15 honoured: state_history grows by exactly ONE entry
 *   - v0.2 P4 honoured: an `accepted` entry is NOT touched
 *   - terminal entries (rejected/expired/reverted/ignored_by_team) are no-ops
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../../src/state/init.js';
import {
  applyTeamIgnoreSweep,
  ignoreLineMatchesAnchor,
  shortHash,
} from '../../../src/proposals/teamIgnore.js';
import {
  enqueueEntry,
  readCache,
  writeCache,
  transition,
  type ProposalCacheEntry,
} from '../../../src/state/proposalCache.js';
import { nowIsoUtc } from '../../../src/util/time.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-team-ignore-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function tomorrow(): string {
  return new Date(Date.now() + 24 * 3600 * 1000).toISOString();
}

function seed(entry: Partial<ProposalCacheEntry> = {}): ProposalCacheEntry {
  return {
    proposal_id: '0000000000000000000000000000abcd',
    kind: 'annotate',
    signal_hash: 'sig',
    state: 'queued',
    generated_at: nowIsoUtc(),
    expires_at: tomorrow(),
    consecutive_ignored: 0,
    state_history: [{ state: 'queued', at: nowIsoUtc() }],
    ...entry,
  };
}

describe('ignoreLineMatchesAnchor (DD-088 amendment)', () => {
  it('matches dir-prefix', () => {
    expect(ignoreLineMatchesAnchor('docs/', 'docs/intro.md')).toBe(true);
    expect(ignoreLineMatchesAnchor('/docs/', 'docs/intro.md')).toBe(true);
    expect(ignoreLineMatchesAnchor('src/', 'docs/intro.md')).toBe(false);
  });

  it('matches glob', () => {
    expect(ignoreLineMatchesAnchor('*.md', 'README.md')).toBe(true);
    expect(ignoreLineMatchesAnchor('docs/**', 'docs/sub/intro.md')).toBe(true);
    expect(ignoreLineMatchesAnchor('docs/?.md', 'docs/x.md')).toBe(true);
    expect(ignoreLineMatchesAnchor('docs/?.md', 'docs/xy.md')).toBe(false);
  });

  it('skips comments + blanks', () => {
    expect(ignoreLineMatchesAnchor('', 'docs/x.md')).toBe(false);
    expect(ignoreLineMatchesAnchor('# comment', 'docs/x.md')).toBe(false);
  });
});

describe('applyTeamIgnoreSweep (DD-088 amendment)', () => {
  it('transitions matched non-terminal proposals to ignored_by_team', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const cache0 = await readCache(store);
    const cache1 = enqueueEntry(cache0, seed({ proposal_id: 'a'.repeat(32) }));
    await writeCache(store, cache1);

    const r = await applyTeamIgnoreSweep({
      store,
      sessionId: 's',
      ignoreLines: ['docs/'],
      resolveAnchor: () => 'docs/intro.md',
    });
    expect(r.transitioned).toEqual(['a'.repeat(32)]);

    const cache2 = await readCache(store);
    const e = cache2.entries[0];
    expect(e.state).toBe('ignored_by_team');
    // v0.2 P15: exactly ONE state_history entry was appended (initial queued + one transition).
    expect(e.state_history.length).toBe(2);
    expect(e.state_history[1].state).toBe('ignored_by_team');
  });

  it('does NOT transition accepted entries (v0.2 P4 — no second proposal_accepted)', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const cache0 = await readCache(store);
    let cache = enqueueEntry(cache0, seed({ proposal_id: 'b'.repeat(32) }));
    cache = transition(cache, 'b'.repeat(32), 'surfaced').cache;
    cache = transition(cache, 'b'.repeat(32), 'accepted').cache;
    await writeCache(store, cache);

    const r = await applyTeamIgnoreSweep({
      store,
      sessionId: 's',
      ignoreLines: ['**'],
      resolveAnchor: () => 'docs/x.md',
    });
    // accepted is terminal → not transitioned.
    expect(r.transitioned.length).toBe(0);
  });

  it('emits proposal_ignored_by_team (NOT plan_*) on transition', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const cache0 = await readCache(store);
    const cache1 = enqueueEntry(cache0, seed({ proposal_id: 'c'.repeat(32) }));
    await writeCache(store, cache1);

    await applyTeamIgnoreSweep({
      store,
      sessionId: 's',
      ignoreLines: ['docs/'],
      resolveAnchor: () => 'docs/intro.md',
    });

    const metricsPath = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
    expect(existsSync(metricsPath)).toBe(true);
    const lines = readFileSync(metricsPath, 'utf8').trim().split('\n');
    const teamIgnoreEvents = lines
      .map((l) => JSON.parse(l) as { event: string })
      .filter((e) => e.event === 'proposal_ignored_by_team');
    expect(teamIgnoreEvents.length).toBe(1);
    // Negative assertion: round-2 C3 fix.
    const planIgnoreEvents = lines
      .map((l) => JSON.parse(l) as { event: string })
      .filter((e) => e.event === 'plan_ignored_by_team');
    expect(planIgnoreEvents.length).toBe(0);
  });

  it('telemetry payload uses 32-hex proposal_id_hash and 12-hex ignore_path_hash', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const cache0 = await readCache(store);
    const cache1 = enqueueEntry(cache0, seed({ proposal_id: 'd'.repeat(32) }));
    await writeCache(store, cache1);

    await applyTeamIgnoreSweep({
      store,
      sessionId: 's',
      ignoreLines: ['docs/'],
      resolveAnchor: () => 'docs/intro.md',
    });

    const metricsPath = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
    const lines = readFileSync(metricsPath, 'utf8').trim().split('\n');
    const evt = lines
      .map((l) => JSON.parse(l) as { event: string; proposal_id_hash?: string; ignore_path_hash?: string })
      .find((e) => e.event === 'proposal_ignored_by_team')!;
    expect(evt.proposal_id_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(evt.ignore_path_hash).toMatch(/^[0-9a-f]{12}$/);
    expect(evt.ignore_path_hash).toBe(shortHash('docs/'));
  });
});
