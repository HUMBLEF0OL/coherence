/**
 * E2E-4: Crash mid-Stage-2-call-3-of-4 → resume from stop-progress.json.
 * R-4 closure.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { Checkpoint } from '../../src/pipeline/checkpoint.js';
import type { StopProgress, StopProgressGroup, Patch, SectionRef } from '../../src/types/index.js';

function ref(s: string): SectionRef { return s as SectionRef; }

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-e2e4-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('E2E-4: checkpoint + resume (R-4)', () => {
  it('initializes stop-progress.json with pending sections', async () => {
    const checkpoint = new Checkpoint(store, 'session-test');
    const groups: StopProgressGroup[] = [
      {
        group_id: 'g0',
        canonical: ref('docs/api.md#intro'),
        sections: [
          { sectionRef: ref('docs/api.md#intro'), status: 'pending' },
          { sectionRef: ref('docs/api.md#usage'), status: 'pending' },
          { sectionRef: ref('docs/guide.md#setup'), status: 'pending' },
          { sectionRef: ref('docs/guide.md#auth'), status: 'pending' },
        ],
      },
    ];

    await checkpoint.init(groups);

    const loaded = await checkpoint.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.groups[0]!.sections).toHaveLength(4);
    expect(loaded!.groups[0]!.sections.every((s) => s.status === 'pending')).toBe(true);
  });

  it('marks a section done and persists', async () => {
    const checkpoint = new Checkpoint(store, 'session-test');
    const groups: StopProgressGroup[] = [
      {
        group_id: 'g0',
        canonical: ref('docs/api.md#intro'),
        sections: [
          { sectionRef: ref('docs/api.md#intro'), status: 'pending' },
          { sectionRef: ref('docs/api.md#usage'), status: 'pending' },
          { sectionRef: ref('docs/guide.md#setup'), status: 'pending' },
          { sectionRef: ref('docs/guide.md#auth'), status: 'pending' },
        ],
      },
    ];

    await checkpoint.init(groups);

    const dummyPatch: Patch = {
      sectionRef: ref('docs/api.md#intro'),
      diff: 'NO_PATCH_NEEDED',
      changeClass: 'additive',
      validationPassed: true,
    };

    // Simulate sections 1, 2, 3 done — crash before section 4
    await checkpoint.markDone('g0', ref('docs/api.md#intro'), dummyPatch);
    await checkpoint.markDone('g0', ref('docs/api.md#usage'), dummyPatch);
    await checkpoint.markDone('g0', ref('docs/guide.md#setup'), dummyPatch);

    // Resume: load from disk and find pending sections
    const progress = await checkpoint.load();
    expect(progress).not.toBeNull();

    const pending = checkpoint.pendingSections(progress!, 'g0');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toBe('docs/guide.md#auth');
  });

  it('clear marks all sections done', async () => {
    const checkpoint = new Checkpoint(store, 'session-test');
    const groups: StopProgressGroup[] = [
      {
        group_id: 'g0',
        canonical: ref('docs/api.md#intro'),
        sections: [
          { sectionRef: ref('docs/api.md#intro'), status: 'pending' },
          { sectionRef: ref('docs/api.md#usage'), status: 'pending' },
        ],
      },
    ];

    await checkpoint.init(groups);
    await checkpoint.clear();

    const progress = await checkpoint.load();
    expect(progress!.groups[0]!.sections.every((s) => s.status === 'done')).toBe(true);
  });

  it('pendingSections returns empty array for unknown group', async () => {
    const checkpoint = new Checkpoint(store, 'session-test');
    const progress: StopProgress = {
      session_id: 'test',
      started_at: '2026-05-09T00:00:00Z',
      groups: [],
    };
    const pending = checkpoint.pendingSections(progress, 'nonexistent');
    expect(pending).toHaveLength(0);
  });
});
