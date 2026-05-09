/**
 * /coherence:review --estimate skips Stage 2.
 * FR-MIDSESSION-5, FR-MIDSESSION-6
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { runReview } from '../../src/commands/review.js';
import { BufferLifecycle } from '../../src/buffer/lifecycle.js';
import type { NormalizedPath, SectionRef, ContentHash } from '../../src/types/index.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-review-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('/coherence:review --estimate', () => {
  it('returns empty message when buffer is empty', async () => {
    const result = await runReview(store, [], {
      estimate: true,
      sessionId: 'test',
      projectRoot: tmpDir,
      mode: 'observe',
    });
    expect(result.message).toContain('Buffer is empty');
  });

  it('reports estimated groups and sections without running Stage 2', async () => {
    const lifecycle = new BufferLifecycle(store);
    await lifecycle.append({
      path: 'docs/api.md' as NormalizedPath,
      sectionRef: 'docs/api.md#intro' as SectionRef,
      contentHash: 'a'.repeat(64) as ContentHash,
      triggeredAt: new Date().toISOString(),
      source: 'posttooluse',
    });

    const result = await runReview(store, [], {
      estimate: true,
      sessionId: 'test-estimate',
      projectRoot: tmpDir,
      mode: 'observe',
    });

    expect(result.estimate).toBe(true);
    expect(result.estimatedGroups).toBeGreaterThanOrEqual(1);
    expect(result.message).toContain('--estimate');
    // No actual patches produced
    expect(result.result).toBeUndefined();
  });
});

describe('/coherence:review full run', () => {
  it('returns empty message when buffer is empty', async () => {
    const result = await runReview(store, [], {
      estimate: false,
      sessionId: 'test',
      projectRoot: tmpDir,
      mode: 'observe',
    });
    expect(result.message).toContain('Buffer is empty');
  });
});
