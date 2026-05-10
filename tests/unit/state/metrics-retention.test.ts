/**
 * Metrics retention sweep — 90-day rolling log.
 * NFR-OBS-2, DD-060
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { runRetentionSweep } from '../../../src/state/metricsRetention.js';

let tmpDir: string;
let store: StateStore;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-retention-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runRetentionSweep', () => {
  it('no-op when metrics.jsonl is missing', async () => {
    await expect(runRetentionSweep(store, tmpDir)).resolves.not.toThrow();
  });

  it('truncates old entries from metrics.jsonl', async () => {
    const jsonlPath = path.join(tmpDir, 'metrics.jsonl');
    const entries = [
      { event: 'patch_proposed', session_id: 'old', _ts: daysAgo(100) },
      { event: 'patch_applied', session_id: 'recent', _ts: daysAgo(10) },
    ];
    writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    await runRetentionSweep(store, tmpDir);

    const remaining = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
    expect(remaining).toHaveLength(1);
    const parsed = JSON.parse(remaining[0]) as { session_id: string };
    expect(parsed.session_id).toBe('recent');
  });

  it('aggregates truncated entries into metrics-summary.json', async () => {
    const jsonlPath = path.join(tmpDir, 'metrics.jsonl');
    const entries = [
      { event: 'patch_proposed', session_id: 'old1', _ts: daysAgo(100) },
      { event: 'patch_proposed', session_id: 'old2', _ts: daysAgo(95) },
      { event: 'cost_per_stop', session_id: 'old3', _ts: daysAgo(91) },
    ];
    writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    await runRetentionSweep(store, tmpDir);

    const summaryPath = path.join(tmpDir, 'metrics-summary.json');
    expect(existsSync(summaryPath)).toBe(true);
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as { counts: Record<string, number> };
    expect(summary.counts['patch_proposed']).toBe(2);
    expect(summary.counts['cost_per_stop']).toBe(1);
  });

  it('merges counts into existing metrics-summary.json', async () => {
    const summaryPath = path.join(tmpDir, 'metrics-summary.json');
    writeFileSync(summaryPath, JSON.stringify({
      generated_at: daysAgo(1),
      cutoff: daysAgo(91),
      counts: { patch_proposed: 5 },
    }), 'utf8');

    const jsonlPath = path.join(tmpDir, 'metrics.jsonl');
    writeFileSync(jsonlPath, JSON.stringify({
      event: 'patch_proposed', session_id: 'old', _ts: daysAgo(100),
    }) + '\n', 'utf8');

    await runRetentionSweep(store, tmpDir);

    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as { counts: Record<string, number> };
    expect(summary.counts['patch_proposed']).toBe(6);
  });

  it('preserves recent entries unchanged', async () => {
    const jsonlPath = path.join(tmpDir, 'metrics.jsonl');
    const entry = { event: 'patch_applied', session_id: 'new', _ts: daysAgo(5) };
    writeFileSync(jsonlPath, JSON.stringify(entry) + '\n', 'utf8');

    await runRetentionSweep(store, tmpDir);

    const remaining = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
    expect(remaining).toHaveLength(1);
    const parsed = JSON.parse(remaining[0]) as { session_id: string };
    expect(parsed.session_id).toBe('new');
  });
});
