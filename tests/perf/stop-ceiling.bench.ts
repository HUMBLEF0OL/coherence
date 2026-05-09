/**
 * Stop-ceiling test — buffer + grouping + caps for 36 sections.
 * Tests the non-LLM orchestration path (PG-3/PG-4 cassette verification
 * requires ANTHROPIC_API_KEY or pre-recorded cassettes).
 * NFR-PERF-5
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
// Orchestration (non-LLM) for 36 sections should complete in < 1 s
const ORCHESTRATION_CEILING_MS = 1_000;

let tmpDir: string;
let store: StateStore;
const entries: import('../../src/types/index.js').BufferEntry[] = [];

beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-bench-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
  entries.length = 0;

  const lifecycle = new BufferLifecycle(store);
  // 3 files × 12 sections = 36 entries (all in same 3 files → 3 groups)
  for (let g = 0; g < 3; g++) {
    for (let i = 0; i < 12; i++) {
      const entry = {
        path: `docs/group${g}.md` as NormalizedPath,
        sectionRef: `docs/group${g}.md#s${i}` as SectionRef,
        contentHash: HASH,
        triggeredAt: new Date().toISOString(),
        source: 'posttooluse' as const,
      };
      entries.push(entry);
      await lifecycle.append(entry);
    }
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('Stop ceiling orchestration (NFR-PERF-5)', () => {
  it('buffer + grouping + caps for 36 sections completes in < 1 s', async () => {
    const start = performance.now();

    // Read buffer
    const buf = await new BufferLifecycle(store).read();
    expect(buf.entries.length).toBe(36);

    // Group entries
    const groups = groupEntries(buf.entries);
    expect(groups.length).toBe(3); // 3 files → 3 groups

    // Enforce caps
    const { allowed, deferredSectionCount } = enforceCaps(groups);
    expect(allowed.length).toBe(3);
    expect(deferredSectionCount).toBe(0);

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(ORCHESTRATION_CEILING_MS);
  });

  it('groups 36 entries into exactly 3 groups (DD-056 cap)', () => {
    const groups = groupEntries(entries);
    expect(groups.length).toBe(3);
    for (const g of groups) {
      expect(g.entries.length).toBe(12);
    }
  });

  it('caps enforcement passes 3×12 groups without deferral', () => {
    const groups = groupEntries(entries);
    const { allowed, deferredSectionCount } = enforceCaps(groups);
    expect(allowed.length).toBe(3);
    expect(deferredSectionCount).toBe(0);
  });
});
