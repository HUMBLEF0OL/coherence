/**
 * Annotate proposer (DD-069, DD-073).
 */
import { describe, it, expect } from 'vitest';
import { proposeAnnotate } from '../../../src/proposers/annotateProposer.js';

describe('proposeAnnotate', () => {
  it('refuses already-annotated docs', () => {
    const body = `# Foo\n<!-- coherence:section foo -->\nbody text`;
    const r = proposeAnnotate({
      body,
      basename: 'foo',
      preservesUnknownFrontmatter: true,
    });
    expect(r.status).toBe('no_proposal');
    expect(r.reason).toBe('already_annotated');
  });

  it('refuses docs with no headings', () => {
    const r = proposeAnnotate({
      body: 'just some prose, no headings',
      basename: 'plain',
      preservesUnknownFrontmatter: true,
    });
    expect(r.status).toBe('no_proposal');
    expect(r.reason).toBe('no_headings');
  });

  it('inserts anchors above each heading', () => {
    const body = `# Introduction\n\nIntro text\n\n## Usage\n\nUsage text\n\n## Edge cases\n\nedges`;
    const r = proposeAnnotate({
      body,
      basename: 'guide',
      preservesUnknownFrontmatter: true,
    });
    expect(r.status).toBe('proposal');
    expect(r.anchors).toHaveLength(3);
    expect(r.anchors[0].id).toBe('introduction');
    expect(r.anchors[1].id).toBe('usage');
    expect(r.anchors[2].id).toBe('edge-cases');
    expect(r.body_md).toContain('<!-- coherence:section introduction -->');
    expect(r.body_md).toContain('<!-- coherence:section usage -->');
    expect(r.body_md).toContain('<!-- coherence:section edge-cases -->');
  });

  it('emits inline frontmatter when host preserves unknown keys', () => {
    const body = `# X`;
    const r = proposeAnnotate({
      body,
      basename: 'x',
      preservesUnknownFrontmatter: true,
    });
    expect(r.frontmatter).toEqual({ 'auto-annotated': true });
    expect(r.sidecar).toBeUndefined();
  });

  it('emits sidecar when host strips unknown frontmatter', () => {
    const body = `# X`;
    const r = proposeAnnotate({
      body,
      basename: 'x',
      preservesUnknownFrontmatter: false,
    });
    expect(r.sidecar).toBeDefined();
    expect(r.sidecar!.auto_annotated).toBe(true);
    expect(r.frontmatter).toBeUndefined();
  });

  it('round-trips: re-running on the produced body refuses (already annotated)', () => {
    const body = `# Hello\n\ncontent`;
    const first = proposeAnnotate({
      body,
      basename: 'h',
      preservesUnknownFrontmatter: true,
    });
    expect(first.status).toBe('proposal');
    const second = proposeAnnotate({
      body: first.body_md,
      basename: 'h',
      preservesUnknownFrontmatter: true,
    });
    expect(second.status).toBe('no_proposal');
    expect(second.reason).toBe('already_annotated');
  });
});
