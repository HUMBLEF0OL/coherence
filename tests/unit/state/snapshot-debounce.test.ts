/**
 * DD-084 snapshot writer hot-path-zero-cost test.
 *
 * 1000 markDirty calls produce 0 disk writes; debounced flush respects the
 * 5 s minimum interval; force=true bypasses the interval.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import {
  flush,
  markDirty,
  reset,
  MIN_FLUSH_INTERVAL_MS,
} from '../../../src/state/snapshotWriter.js';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-snap-'));
  store = new StateStore(dir, path.join(dir, 'quarantine'));
  reset();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('snapshot debounced writer (DD-084)', () => {
  it('1000 markDirty calls produce 0 disk writes', () => {
    for (let i = 0; i < 1000; i++) {
      markDirty({
        schema_version: 2,
        written_at: '2026-05-10T00:00:00Z',
        buffer_count: i,
        proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
        mode: 'observe',
      });
    }
    expect(existsSync(path.join(dir, 'state-snapshot.json'))).toBe(false);
  });

  it('flush honours the 5 s minimum interval', async () => {
    markDirty({
      schema_version: 2,
      written_at: '2026-05-10T00:00:00Z',
      buffer_count: 1,
      proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
      mode: 'observe',
    });
    const t0 = 1_000_000;
    const a = await flush(store, { now: t0 });
    expect(a).toBe(true);

    // Within 5 s — no further flush
    markDirty({
      schema_version: 2,
      written_at: '2026-05-10T00:00:01Z',
      buffer_count: 2,
      proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
      mode: 'observe',
    });
    const b = await flush(store, { now: t0 + 1000 });
    expect(b).toBe(false);

    // After 5 s — flush again
    const c = await flush(store, { now: t0 + MIN_FLUSH_INTERVAL_MS + 1 });
    expect(c).toBe(true);
  });

  it('force=true bypasses the interval (Stop hook flush)', async () => {
    markDirty({
      schema_version: 2,
      written_at: '2026-05-10T00:00:00Z',
      buffer_count: 1,
      proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
      mode: 'observe',
    });
    const a = await flush(store);
    expect(a).toBe(true);
    markDirty({
      schema_version: 2,
      written_at: '2026-05-10T00:00:01Z',
      buffer_count: 2,
      proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
      mode: 'observe',
    });
    const b = await flush(store, { force: true });
    expect(b).toBe(true);
  });

  it('snapshot file matches schema after flush', async () => {
    markDirty({
      schema_version: 2,
      written_at: '2026-05-10T00:00:00Z',
      buffer_count: 3,
      proposal_counts: { queued: 1, surfaced: 0, ignored: 0 },
      mode: 'annotate',
    });
    await flush(store);
    const written = JSON.parse(
      readFileSync(path.join(dir, 'state-snapshot.json'), 'utf8'),
    );
    expect(written.schema_version).toBe(2);
    expect(written.buffer_count).toBe(3);
    expect(written.mode).toBe('annotate');
    expect(written.proposal_counts).toEqual({ queued: 1, surfaced: 0, ignored: 0 });
  });
});
