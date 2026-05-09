/**
 * coherence-log.md is append-only — no rotation in v0.1.
 * NFR-OBS-1
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { appendCoherenceLog } from '../../../src/state/coherenceLog.js';
import { runRetentionSweep } from '../../../src/state/metricsRetention.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-nolog-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('coherence-log.md no-rotate (NFR-OBS-1)', () => {
  it('retention sweep does NOT truncate coherence-log.md', async () => {
    // Write some entries to coherence-log.md
    await appendCoherenceLog(store, {
      type: 'auto-applied',
      gitRef: 'abc12345',
      summary: 'Test entry',
      sectionRefs: ['docs/api.md#intro'],
    });
    await appendCoherenceLog(store, {
      type: 'reviewed',
      gitRef: null,
      summary: 'Second entry',
      sectionRefs: [],
    });

    const before = readFileSync(path.join(tmpDir, 'coherence-log.md'), 'utf8');

    // Run retention sweep
    await runRetentionSweep(store, tmpDir);

    const after = readFileSync(path.join(tmpDir, 'coherence-log.md'), 'utf8');

    // coherence-log.md must be identical after sweep
    expect(after).toBe(before);
  });

  it('retention sweep only affects metrics.jsonl', async () => {
    // Write an old-style metrics entry
    await store.appendJsonl('metrics.jsonl', {
      event: 'patch_proposed',
      session_id: 'old',
      _ts: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(), // 100 days ago
    });

    // Write coherence-log.md
    await appendCoherenceLog(store, {
      type: 'auto-applied',
      gitRef: null,
      summary: 'should survive',
      sectionRefs: [],
    });

    const logBefore = readFileSync(path.join(tmpDir, 'coherence-log.md'), 'utf8');

    await runRetentionSweep(store, tmpDir);

    const logAfter = readFileSync(path.join(tmpDir, 'coherence-log.md'), 'utf8');
    expect(logAfter).toBe(logBefore);
  });
});
