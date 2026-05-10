/**
 * Stop pipeline integration tests.
 * Empty buffer no-op, cap enforcement, bundle atomicity.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { BufferLifecycle } from '../../src/buffer/lifecycle.js';
import { enforceCaps } from '../../src/pipeline/caps.js';
import { buildCommitMessage } from '../../src/git/coherenceCommit.js';
import { mergePatches } from '../../src/pipeline/merge.js';
import { assembleBundle } from '../../src/pipeline/bundle.js';
import type { BufferEntry, Patch, NormalizedPath, SectionRef, ContentHash } from '../../src/types/index.js';

function np(s: string): NormalizedPath { return s as NormalizedPath; }
function ref(s: string): SectionRef { return s as SectionRef; }
function hash(s: string): ContentHash { return s as ContentHash; }

function entry(p: string, id: string): BufferEntry {
  return {
    path: np(p),
    sectionRef: ref(`${p}#${id}`),
    contentHash: hash('abc'),
    triggeredAt: '2026-05-09T00:00:00Z',
    source: 'posttooluse',
  };
}

function patch(sectionRef: string, diff: string, valid: boolean): Patch {
  return {
    sectionRef: ref(sectionRef),
    diff,
    changeClass: 'additive',
    validationPassed: valid,
  };
}

describe('Stop pipeline — empty buffer no-op', () => {
  let tmpDir: string;
  let store: StateStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-stop-'));
    store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buffer starts empty — no entries', async () => {
    const lifecycle = new BufferLifecycle(store);
    const buf = await lifecycle.read();
    expect(buf.entries).toHaveLength(0);
  });
});

describe('enforceCaps (DD-056)', () => {
  it('allows up to 3 groups', () => {
    const groups = [
      { group_id: 'g0', entries: [entry('a.md', 's1')], triggering_files: [np('a.md')] },
      { group_id: 'g1', entries: [entry('b.md', 's1')], triggering_files: [np('b.md')] },
      { group_id: 'g2', entries: [entry('c.md', 's1')], triggering_files: [np('c.md')] },
      { group_id: 'g3', entries: [entry('d.md', 's1')], triggering_files: [np('d.md')] },
    ];
    const { allowed, deferredSectionCount } = enforceCaps(groups);
    expect(allowed).toHaveLength(3);
    expect(deferredSectionCount).toBe(1);
  });

  it('defers group that would exceed MAX_SECTIONS_PER_GROUP', () => {
    const bigEntries = Array.from({ length: 13 }, (_, i) => entry('big.md', `s${i}`));
    const groups = [
      { group_id: 'g0', entries: bigEntries, triggering_files: [np('big.md')] },
    ];
    const { allowed, deferredSectionCount } = enforceCaps(groups);
    expect(allowed).toHaveLength(0);
    expect(deferredSectionCount).toBe(13);
  });
});

describe('buildCommitMessage (FR-PERMISSION-4)', () => {
  it('formats [coherence] prefix with section list', () => {
    const patches: Patch[] = [
      patch('docs/api.md#intro', '--- diff', true),
      patch('docs/guide.md#setup', '--- diff', true),
    ];
    const msg = buildCommitMessage('Update API intro', patches);
    expect(msg).toMatch(/^\[coherence\] Update API intro/);
    expect(msg).toContain('section: docs/api.md#intro');
    expect(msg).toContain('section: docs/guide.md#setup');
  });

  it('excludes ESCALATE and NO_PATCH_NEEDED patches', () => {
    const patches: Patch[] = [
      patch('docs/api.md#intro', '--- diff', true),
      patch('docs/guide.md#skip', 'NO_PATCH_NEEDED', true),
      patch('docs/ref.md#esc', 'ESCALATE', false),
    ];
    const msg = buildCommitMessage('Update', patches);
    expect(msg).toContain('section: docs/api.md#intro');
    expect(msg).not.toContain('section: docs/guide.md#skip');
    expect(msg).not.toContain('section: docs/ref.md#esc');
  });
});

describe('mergePatches (FR-STOP-8)', () => {
  it('passes non-overlapping patches', () => {
    const patches: Patch[] = [
      patch('docs/api.md#intro', '--- a/docs/api.md\n+++ b/docs/api.md\n@@ -1,2 +1,2 @@\n # API\n-old\n+new', true),
      patch('docs/api.md#usage', '--- a/docs/api.md\n+++ b/docs/api.md\n@@ -10,2 +10,2 @@\n ## Usage\n-old\n+new', true),
    ];
    const { merged: _merged, rejected } = mergePatches(patches);
    expect(rejected).toHaveLength(0);
  });

  it('rejects overlapping patches from same file', () => {
    const patches: Patch[] = [
      patch('docs/api.md#a', '--- a/docs/api.md\n+++ b/docs/api.md\n@@ -5,3 +5,3 @@\n-old1\n+new1\n', true),
      patch('docs/api.md#b', '--- a/docs/api.md\n+++ b/docs/api.md\n@@ -5,3 +5,4 @@\n-old2\n+new2\n', true),
    ];
    const { rejected } = mergePatches(patches);
    expect(rejected).toHaveLength(2);
  });
});

describe('assembleBundle (FR-STOP-9)', () => {
  it('creates bundle with applicable patches only', () => {
    const patches: Patch[] = [
      patch('docs/api.md#intro', '--- diff', true),
      patch('docs/api.md#skip', 'NO_PATCH_NEEDED', true),
      patch('docs/api.md#esc', 'ESCALATE', false),
    ];
    const bundle = assembleBundle('g0', patches, ref('docs/api.md#intro'));
    expect(bundle.patches).toHaveLength(1);
    expect(bundle.bundle_id).toBe('bundle-g0');
  });
});
