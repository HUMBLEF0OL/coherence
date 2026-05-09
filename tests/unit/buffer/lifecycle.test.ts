/**
 * Buffer lifecycle state machine tests.
 * FR-BUFFER-1..4, -7; DD-051 content-hash reset
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { BufferLifecycle } from '../../../src/buffer/lifecycle.js';
import { StateStore } from '../../../src/state/stateStore.js';
import type { BufferEntry, NormalizedPath, SectionRef, ContentHash } from '../../../src/types/index.js';

function makeEntry(id: string, hash = 'a'.repeat(64)): BufferEntry {
  return {
    path: '/test/path.md' as NormalizedPath,
    sectionRef: `/test/path.md#${id}` as SectionRef,
    contentHash: hash as ContentHash,
    triggeredAt: new Date().toISOString(),
    source: 'posttooluse',
  };
}

function makeBuffer(): BufferLifecycle {
  const dir = path.join(tmpdir(), `coherence-buf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const quarDir = path.join(dir, 'quarantine');
  mkdirSync(quarDir, { recursive: true });
  const store = new StateStore(dir, quarDir);
  return new BufferLifecycle(store);
}

describe('BufferLifecycle', () => {
  let buffer: BufferLifecycle;

  beforeEach(() => {
    buffer = makeBuffer();
  });

  it('starts empty', async () => {
    expect(await buffer.isEmpty()).toBe(true);
  });

  it('transitions to pending after append', async () => {
    await buffer.append(makeEntry('section-a'));
    const buf = await buffer.read();
    expect(buf.state).toBe('pending');
    expect(buf.entries).toHaveLength(1);
  });

  it('deduplicates entries by sectionRef, keeping latest', async () => {
    await buffer.append(makeEntry('section-a', 'a'.repeat(64)));
    await buffer.append(makeEntry('section-a', 'b'.repeat(64)));
    const buf = await buffer.read();
    expect(buf.entries).toHaveLength(1);
    expect(buf.entries[0]!.contentHash).toBe('b'.repeat(64));
  });

  it('clears the buffer', async () => {
    await buffer.append(makeEntry('section-a'));
    await buffer.clear();
    expect(await buffer.isEmpty()).toBe(true);
  });

  it('caps entries at 200, pruning oldest', async () => {
    for (let i = 0; i < 210; i++) {
      await buffer.append(makeEntry(`section-${i}`));
    }
    const buf = await buffer.read();
    expect(buf.entries.length).toBeLessThanOrEqual(200);
  });

  it('does not store raw section content in buffer (NFR-PRIVACY-4)', async () => {
    const entry = makeEntry('private');
    await buffer.append(entry);
    const buf = await buffer.read();
    const json = JSON.stringify(buf);
    // contentHash is a sha256 hex, no raw content
    expect(json).not.toContain('raw content');
    expect(buf.entries[0]).toHaveProperty('contentHash');
    expect(buf.entries[0]).not.toHaveProperty('content');
  });
});
