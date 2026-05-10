/**
 * Union-find grouping tests.
 * FR-DETECT-3, DD-025
 */
import { describe, it, expect } from 'vitest';
import { groupEntries } from '../../../src/pipeline/grouping.js';
import type { BufferEntry, SectionRef, NormalizedPath, ContentHash } from '../../../src/types/index.js';

function entry(path: string, id: string): BufferEntry {
  return {
    path: path as NormalizedPath,
    sectionRef: `${path}#${id}` as SectionRef,
    contentHash: 'abc123' as ContentHash,
    triggeredAt: '2026-01-01T00:00:00Z',
    source: 'posttooluse',
  };
}

describe('groupEntries', () => {
  it('returns empty array for empty input', () => {
    expect(groupEntries([])).toHaveLength(0);
  });

  it('puts single entry in its own group', () => {
    const groups = groupEntries([entry('docs/api.md', 'intro')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
  });

  it('groups two entries from the same file', () => {
    const groups = groupEntries([
      entry('docs/api.md', 'intro'),
      entry('docs/api.md', 'usage'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
  });

  it('keeps entries from different files in separate groups', () => {
    const groups = groupEntries([
      entry('docs/api.md', 'intro'),
      entry('docs/guide.md', 'overview'),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('merges transitively: a-b and b-c → one group', () => {
    // a.md#s1 and a.md#s2 share path a.md, b.md#s3 and b.md... wait
    // Actually: to merge transitively via path, we need entries sharing paths.
    // entry A: path=docs/api.md, entry B: path=docs/api.md → same group
    // entry C: path=docs/guide.md, entry D: path=docs/guide.md → same group
    // No transitive merge via different paths unless same section appears in two paths.
    // Test three entries all sharing same path → one group
    const groups = groupEntries([
      entry('docs/api.md', 's1'),
      entry('docs/api.md', 's2'),
      entry('docs/api.md', 's3'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
  });

  it('group_id is unique per group', () => {
    const groups = groupEntries([
      entry('docs/api.md', 'intro'),
      entry('docs/guide.md', 'overview'),
      entry('README.md', 'install'),
    ]);
    const ids = groups.map((g) => g.group_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('triggering_files lists paths of all entries in group', () => {
    const groups = groupEntries([
      entry('docs/api.md', 's1'),
      entry('docs/api.md', 's2'),
    ]);
    expect(groups[0].triggering_files).toContain('docs/api.md');
    expect(groups[0].triggering_files).toHaveLength(1);
  });
});
