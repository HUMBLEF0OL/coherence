/**
 * E7 fix coverage: expirySweep auto-loads recent signal hashes from
 * metrics.jsonl when given a projectRoot.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { writeCache } from '../../src/state/proposalCache.js';
import { runExpirySweep } from '../../src/proposals/expirySweep.js';
import { nowIsoUtc } from '../../src/util/time.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-exp-rec-'));
  const c = path.join(dir, '.claude', 'coherence');
  store = new StateStore(c, path.join(c, 'quarantine'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('E7: signal-recurrence fence loads recentSignalHashes from metrics.jsonl', () => {
  it('hash present in last 7 days → not expired by recurrence fence', async () => {
    const old = '2026-04-25T00:00:00.000Z';
    await writeCache(store, {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'a'.repeat(32),
          kind: 'skill',
          signal_hash: 'present',
          state: 'queued',
          generated_at: old,
          expires_at: '2026-05-09T00:00:00.000Z',
          consecutive_ignored: 0,
          state_history: [{ state: 'queued', at: old }],
        },
      ],
    });
    // Seed metrics.jsonl with the signal hash recently observed.
    const recent = nowIsoUtc();
    const line = JSON.stringify({
      event: 'proposal_signal_observed',
      session_id: 's',
      signal_hash: 'present',
      _ts: recent,
    });
    writeFileSync(
      path.join(dir, '.claude', 'coherence', 'metrics.jsonl'),
      line + '\n',
    );

    const r = await runExpirySweep(
      store,
      's',
      { projectRoot: dir, expiryDays: 365 }, // disable time fence
      new Date('2026-05-04T00:00:00.000Z'),
    );
    expect(r.expired_proposal_ids).toEqual([]);
  });

  it('hash absent from metrics.jsonl + age >= 7 days → expired by recurrence fence', async () => {
    const old = '2026-04-25T00:00:00.000Z';
    await writeCache(store, {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'b'.repeat(32),
          kind: 'skill',
          signal_hash: 'gone',
          state: 'queued',
          generated_at: old,
          expires_at: '2026-05-09T00:00:00.000Z',
          consecutive_ignored: 0,
          state_history: [{ state: 'queued', at: old }],
        },
      ],
    });
    // Empty metrics.jsonl
    writeFileSync(path.join(dir, '.claude', 'coherence', 'metrics.jsonl'), '');

    const r = await runExpirySweep(
      store,
      's',
      { projectRoot: dir, expiryDays: 365 },
      new Date('2026-05-04T00:00:00.000Z'),
    );
    expect(r.expired_proposal_ids).toHaveLength(1);
    expect(r.reasons[r.expired_proposal_ids[0]]).toBe('signal_recurrence_fence');
  });
});
