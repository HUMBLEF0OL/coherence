/**
 * Statusline badge tests.
 * FR-PERMISSION-7
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { computeStatusline } from '../../../src/observability/statusline.js';
import type { NormalizedPath, SectionRef, ContentHash } from '../../../src/types/index.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-statusline-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('computeStatusline', () => {
  it('returns empty string when buffer is empty', async () => {
    const badge = await computeStatusline(store, 'observe', false);
    expect(badge.text).toBe('');
  });

  it('returns [🧭 ⚠] when degraded', async () => {
    const badge = await computeStatusline(store, 'observe', true);
    expect(badge.text).toBe('[🧭 ⚠]');
    expect(badge.degraded).toBe(true);
  });

  it('returns [🧭 NO] badge with count in observe mode', async () => {
    const { BufferLifecycle } = await import('../../../src/buffer/lifecycle.js');
    const lifecycle = new BufferLifecycle(store);
    await lifecycle.append({
      path: 'docs/api.md' as NormalizedPath,
      sectionRef: 'docs/api.md#intro' as SectionRef,
      contentHash: 'a'.repeat(64) as ContentHash,
      triggeredAt: new Date().toISOString(),
      source: 'posttooluse',
    });

    const badge = await computeStatusline(store, 'observe', false);
    expect(badge.text).toContain('🧭');
    expect(badge.text).toContain('1');
    expect(badge.text).toContain('O');
  });

  it('returns G suffix in graduated mode', async () => {
    const { BufferLifecycle } = await import('../../../src/buffer/lifecycle.js');
    const lifecycle = new BufferLifecycle(store);
    await lifecycle.append({
      path: 'docs/api.md' as NormalizedPath,
      sectionRef: 'docs/api.md#intro' as SectionRef,
      contentHash: 'a'.repeat(64) as ContentHash,
      triggeredAt: new Date().toISOString(),
      source: 'posttooluse',
    });

    const badge = await computeStatusline(store, 'graduated', false);
    expect(badge.text).toContain('G');
  });
});
