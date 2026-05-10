/**
 * Proposal expiry sweep (DD-075, M3).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { runExpirySweep } from '../../src/proposals/expirySweep.js';
import { writeCache } from '../../src/state/proposalCache.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-expiry-'));
  store = new StateStore(dir, path.join(dir, 'quarantine'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('proposal expiry sweep (DD-075)', () => {
  it('expires proposals past the 14-day fence', async () => {
    const old = '2026-04-01T00:00:00.000Z';
    const expires = '2026-04-15T00:00:00.000Z';
    await writeCache(store, {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'a'.repeat(32),
          kind: 'skill',
          signal_hash: 'abc',
          state: 'queued',
          generated_at: old,
          expires_at: expires,
          consecutive_ignored: 0,
          state_history: [{ state: 'queued', at: old }],
        },
      ],
    });

    const result = await runExpirySweep(
      store,
      'session-1',
      {},
      new Date('2026-05-10T00:00:00.000Z'),
    );
    expect(result.expired_proposal_ids).toHaveLength(1);
    expect(result.reasons[result.expired_proposal_ids[0]]).toBe('time_fence');
  });

  it('expires proposals past the 5-consecutive-ignored fence', async () => {
    const now = '2026-05-09T00:00:00.000Z';
    await writeCache(store, {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'b'.repeat(32),
          kind: 'skill',
          signal_hash: 'xyz',
          state: 'surfaced',
          generated_at: now,
          expires_at: '2026-05-23T00:00:00.000Z',
          consecutive_ignored: 5,
          state_history: [{ state: 'queued', at: now }, { state: 'surfaced', at: now }],
        },
      ],
    });

    const result = await runExpirySweep(
      store,
      'session-1',
      {},
      new Date('2026-05-10T00:00:00.000Z'),
    );
    expect(result.expired_proposal_ids).toHaveLength(1);
    expect(result.reasons[result.expired_proposal_ids[0]]).toBe('consecutive_ignored');
  });

  it('leaves fresh, recently-ignored proposals alone', async () => {
    const now = '2026-05-09T00:00:00.000Z';
    await writeCache(store, {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'c'.repeat(32),
          kind: 'skill',
          signal_hash: 'fresh',
          state: 'surfaced',
          generated_at: now,
          expires_at: '2026-05-23T00:00:00.000Z',
          consecutive_ignored: 1,
          state_history: [{ state: 'queued', at: now }],
        },
      ],
    });
    const result = await runExpirySweep(
      store,
      'session-1',
      {},
      new Date('2026-05-10T00:00:00.000Z'),
    );
    expect(result.expired_proposal_ids).toHaveLength(0);
  });

  it('expires on signal-recurrence fence when the signal hash is absent from recent', async () => {
    const old = '2026-05-01T00:00:00.000Z';
    await writeCache(store, {
      schema_version: 2,
      entries: [
        {
          proposal_id: 'd'.repeat(32),
          kind: 'skill',
          signal_hash: 'gone',
          state: 'queued',
          generated_at: old,
          expires_at: '2026-05-15T00:00:00.000Z',
          consecutive_ignored: 0,
          state_history: [{ state: 'queued', at: old }],
        },
      ],
    });
    const result = await runExpirySweep(
      store,
      'session-1',
      { recentSignalHashes: new Set<string>() },
      new Date('2026-05-09T00:00:00.000Z'),
    );
    expect(result.reasons[result.expired_proposal_ids[0]]).toBe('signal_recurrence_fence');
  });
});
