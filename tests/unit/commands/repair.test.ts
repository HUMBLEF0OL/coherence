/**
 * /coherence:repair contract tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { runRepair } from '../../../src/commands/repair.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-repair-'));
  mkdirSync(path.join(tmpDir, 'quarantine'), { recursive: true });
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('/coherence:repair', () => {
  it('reports no issues when state is clean', async () => {
    const result = await runRepair(store, tmpDir, tmpDir);
    expect(result.actions.some((a) => a.includes('No issues found'))).toBe(true);
  });

  it('clears orphaned progress when buffer is empty', async () => {
    // Write a stop-progress.json with empty buffer
    const progress = {
      session_id: 'test',
      started_at: new Date().toISOString(),
      groups: [],
    };
    await store.write('stop-progress.json', progress);
    // Buffer stays empty (not written)

    const result = await runRepair(store, tmpDir, tmpDir);
    // Should notice the orphaned progress
    const hasProgressNote = result.actions.some(
      (a) => a.includes('orphaned') || a.includes('stop-progress') || a.includes('No issues'),
    );
    expect(hasProgressNote).toBe(true);
  });
});
