/**
 * E2E-10: Cross-layer coherence (FR-LAYERS-5, DD-008).
 * Plan-added scenario — not required for BRD-4 §4.9 sign-off.
 * Three stale docs simultaneously → grouping + caps handles them correctly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeStub } from './harness/claudeCodeStub.js';
import { groupEntries } from '../../src/pipeline/grouping.js';
import { enforceCaps } from '../../src/pipeline/caps.js';

let stub: ClaudeCodeStub;

beforeEach(() => {
  stub = new ClaudeCodeStub();
});

afterEach(() => {
  stub.destroy();
});

const LAYERS = [
  { file: 'docs/api.md', id: 'api-intro' },
  { file: 'docs/guide.md', id: 'guide-intro' },
  { file: 'docs/reference.md', id: 'ref-intro' },
];

describe('E2E-10: cross-layer coherence (FR-LAYERS-5)', () => {
  it('three stale docs each get their own group', async () => {
    await stub.sessionStart();

    for (const layer of LAYERS) {
      const filePath = stub.createDocFile(layer.file, [
        `<!-- coherence:section id="${layer.id}" -->`,
        '# Section',
        '',
        'Content.',
      ].join('\n'));
      await stub.postToolUse(filePath);
    }

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
    const entries = buf!.entries as Parameters<typeof groupEntries>[0];

    const groups = groupEntries(entries);
    expect(groups.length).toBe(3);
  });

  it('caps allows all 3 groups through', async () => {
    await stub.sessionStart();

    for (const layer of LAYERS) {
      const filePath = stub.createDocFile(layer.file, [
        `<!-- coherence:section id="${layer.id}" -->`,
        '# Section',
        '',
        'Content.',
      ].join('\n'));
      await stub.postToolUse(filePath);
    }

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');
    const entries = buf!.entries as Parameters<typeof groupEntries>[0];

    const groups = groupEntries(entries);
    const { allowed, deferredSectionCount } = enforceCaps(groups);

    expect(allowed.length).toBe(3);
    expect(deferredSectionCount).toBe(0);
  });
});
