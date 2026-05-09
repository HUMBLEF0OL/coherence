/**
 * /coherence:status canonical output tests.
 * DD-055: output is diff-stable across consecutive runs.
 * NFR-OBS-5: ISO-8601 timestamps in log files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { runStatus, formatStatus } from '../../src/commands/status.js';
import { appendCoherenceLog } from '../../src/state/coherenceLog.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-canonical-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('status canonical output (DD-055)', () => {
  it('output has fixed sections in fixed order', async () => {
    const out = await runStatus(store, tmpDir);
    const text = formatStatus(out);

    // Header comes before Buffer
    const headerIdx = text.indexOf('[coherence] status');
    const bufferIdx = text.indexOf('Buffer:');
    expect(headerIdx).toBeLessThan(bufferIdx);

    // Buffer comes before DD-044 footer
    const footerIdx = text.indexOf('[limitation]');
    expect(bufferIdx).toBeLessThan(footerIdx);
  });

  it('is byte-identical between two consecutive runs with same state', async () => {
    const out1 = await runStatus(store, tmpDir);
    const out2 = await runStatus(store, tmpDir);
    expect(out1.lines).toEqual(out2.lines);
  });

  it('includes DD-044 footer on every run', async () => {
    for (let i = 0; i < 3; i++) {
      const out = await runStatus(store, tmpDir);
      const text = formatStatus(out);
      expect(text).toContain('Mid-session branch switches: not detected');
    }
  });
});

describe('NFR-OBS-5: log file timestamps are ISO-8601', () => {
  const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  it('coherence-log.md entries have ISO-8601 timestamps', async () => {
    await appendCoherenceLog(store, {
      type: 'auto-applied',
      gitRef: 'abc12345',
      summary: 'Test',
      sectionRefs: ['docs/api.md#intro'],
    });

    const logPath = path.join(tmpDir, 'coherence-log.md');
    const raw = readFileSync(logPath, 'utf8');

    // Extract timestamps from headings: ## YYYY-MM-DDTHH:MM:SSZ — type
    const tsMatches = raw.match(/## (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)/g) ?? [];
    expect(tsMatches.length).toBeGreaterThan(0);

    for (const match of tsMatches) {
      const ts = match.replace('## ', '').split(' — ')[0]!;
      expect(ISO_8601_RE.test(ts), `timestamp "${ts}" should match ISO-8601`).toBe(true);
    }
  });

  it('metrics.jsonl entries have ISO-8601 _ts', async () => {
    await store.appendJsonl('metrics.jsonl', { event: 'compaction_detected', session_id: 'x' });

    const raw = readFileSync(path.join(tmpDir, 'metrics.jsonl'), 'utf8');
    const lines = raw.split('\n').filter(Boolean);

    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      const ts = record['_ts'] as string;
      expect(ISO_8601_RE.test(ts), `_ts "${ts}" should match ISO-8601`).toBe(true);
    }
  });

  it('drift-buffer.json entries have ISO-8601 triggeredAt', async () => {
    const { BufferLifecycle } = await import('../../src/buffer/lifecycle.js');
    const lifecycle = new BufferLifecycle(store);
    await lifecycle.append({
      path: 'docs/api.md' as import('../../src/types/index.js').NormalizedPath,
      sectionRef: 'docs/api.md#intro' as import('../../src/types/index.js').SectionRef,
      contentHash: 'a'.repeat(64) as import('../../src/types/index.js').ContentHash,
      triggeredAt: new Date().toISOString(),
      source: 'posttooluse',
    });

    const buf = await store.read<{ entries: Array<{ triggeredAt: string }> }>('drift-buffer.json');
    for (const e of buf!.entries) {
      expect(ISO_8601_RE.test(e.triggeredAt), `triggeredAt "${e.triggeredAt}" should match ISO-8601`).toBe(true);
    }
  });
});
