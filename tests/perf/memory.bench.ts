/**
 * Memory test — orchestration RSS delta for 36-section buffer.
 * Full LLM memory test requires cassettes; this tests the non-LLM path.
 * NFR-PERF-9
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { BufferLifecycle } from '../../src/buffer/lifecycle.js';
import { groupEntries } from '../../src/pipeline/grouping.js';
import { enforceCaps } from '../../src/pipeline/caps.js';
import type { NormalizedPath, SectionRef, ContentHash } from '../../src/types/index.js';

const HASH = ('a'.repeat(64)) as ContentHash;
const RSS_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

let tmpDir: string;
let store: StateStore;

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-mem-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
  const lifecycle = new BufferLifecycle(store);
  for (let g = 0; g < 3; g++) {
    for (let i = 0; i < 12; i++) {
      await lifecycle.append({
        path: `docs/g${g}.md` as NormalizedPath,
        sectionRef: `docs/g${g}.md#s${i}` as SectionRef,
        contentHash: HASH,
        triggeredAt: new Date().toISOString(),
        source: 'posttooluse',
      });
    }
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Memory — orchestration (NFR-PERF-9)', () => {
  it('RSS delta for buffer + grouping + caps stays under 50 MB', async () => {
    if (typeof globalThis.gc === 'function') globalThis.gc();
    const rssBefore = process.memoryUsage().rss;

    const buf = await new BufferLifecycle(store).read();
    const groups = groupEntries(buf.entries);
    const { allowed } = enforceCaps(groups);

    const rssAfter = process.memoryUsage().rss;
    const delta = Math.max(0, rssAfter - rssBefore);

    expect(allowed.length).toBeGreaterThan(0);
    expect(
      delta,
      `RSS delta ${(delta / 1024 / 1024).toFixed(1)} MB exceeds 50 MB limit`,
    ).toBeLessThan(RSS_LIMIT_BYTES);
  });
});
