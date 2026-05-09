/**
 * /coherence:status contract tests.
 * DD-055: fixed-order output, DD-044 footer always present.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { runStatus, formatStatus } from '../../../src/commands/status.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-status-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('/coherence:status', () => {
  it('always includes DD-044 footer', async () => {
    const out = await runStatus(store, tmpDir);
    const text = formatStatus(out);
    expect(text).toContain('Mid-session branch switches: not detected — Stop-time re-validation');
  });

  it('reports empty buffer', async () => {
    const out = await runStatus(store, tmpDir);
    const text = formatStatus(out);
    expect(text).toContain('Buffer: 0 pending section(s)');
  });

  it('reports buffer count when entries exist', async () => {
    const { BufferLifecycle } = await import('../../../src/buffer/lifecycle.js');
    const lifecycle = new BufferLifecycle(store);
    const entry = {
      path: 'docs/api.md' as import('../../../src/types/index.js').NormalizedPath,
      sectionRef: 'docs/api.md#intro' as import('../../../src/types/index.js').SectionRef,
      contentHash: 'a'.repeat(64) as import('../../../src/types/index.js').ContentHash,
      triggeredAt: new Date().toISOString(),
      source: 'posttooluse' as const,
    };
    await lifecycle.append(entry);

    const out = await runStatus(store, tmpDir);
    const text = formatStatus(out);
    expect(text).toContain('Buffer: 1 pending section(s)');
    expect(text).toContain('docs/api.md#intro');
  });

  it('includes mode in header', async () => {
    await store.write('config.json', { mode: 'graduated' });
    const out = await runStatus(store, tmpDir);
    const text = formatStatus(out);
    expect(text).toContain('mode: graduated');
  });

  it('includes plugin version', async () => {
    const out = await runStatus(store, tmpDir);
    const text = formatStatus(out);
    expect(text).toContain('plugin');
  });

  it('output is stable across two consecutive calls with same state', async () => {
    const out1 = await runStatus(store, tmpDir);
    const out2 = await runStatus(store, tmpDir);
    // Lines may differ only in timing — compare structure excluding timing
    expect(out1.lines.length).toBe(out2.lines.length);
    // DD-044 footer is always at end
    const last1 = out1.lines[out1.lines.length - 1];
    const last2 = out2.lines[out2.lines.length - 1];
    expect(last1).toBe(last2);
  });

  it('completes in reasonable time (< 500ms)', async () => {
    const out = await runStatus(store, tmpDir);
    expect(out.elapsedMs).toBeLessThan(500);
  });
});
