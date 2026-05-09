/**
 * Anchor scanner unit tests.
 * FR-DETECT-12, R-18 (fenced-code false-positive), R-7 (orphan/duplicate IDs)
 */
import { describe, it, expect } from 'vitest';
import { scanAnchors } from '../../../src/detection/anchorScanner.js';

describe('anchorScanner', () => {
  it('parses a simple open/close anchor pair', () => {
    const source = `
<!-- coherence:section id="intro" -->
Hello world
<!-- /coherence:section -->
`;
    const { sections, warnings } = scanAnchors(source, 'test.md');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.id).toBe('intro');
    expect(sections[0]!.content).toContain('Hello world');
    expect(warnings).toHaveLength(0);
  });

  it('reports orphan close anchor', () => {
    const source = `<!-- /coherence:section -->`;
    const { warnings } = scanAnchors(source, 'test.md');
    expect(warnings.some((w) => w.includes('Orphan'))).toBe(true);
  });

  it('reports unclosed anchor', () => {
    const source = `<!-- coherence:section id="open" -->
content without close`;
    const { warnings } = scanAnchors(source, 'test.md');
    expect(warnings.some((w) => w.includes('Unclosed'))).toBe(true);
  });

  it('reports duplicate section id', () => {
    const source = `
<!-- coherence:section id="dup" -->
A
<!-- /coherence:section -->
<!-- coherence:section id="dup" -->
B
<!-- /coherence:section -->
`;
    const { warnings } = scanAnchors(source, 'test.md');
    expect(warnings.some((w) => w.includes('Duplicate'))).toBe(true);
  });

  it('skips coherence anchors inside fenced code blocks (R-18)', () => {
    const source = `
\`\`\`
<!-- coherence:section id="fake" -->
code content
<!-- /coherence:section -->
\`\`\`
`;
    const { sections } = scanAnchors(source, 'test.md');
    expect(sections).toHaveLength(0);
  });

  it('skips anchors inside tilde fenced blocks (R-18)', () => {
    const source = `
~~~
<!-- coherence:section id="fake2" -->
content
<!-- /coherence:section -->
~~~
`;
    const { sections } = scanAnchors(source, 'test.md');
    expect(sections).toHaveLength(0);
  });

  it('normalizes section ids to [a-z0-9_-]+', () => {
    const source = `
<!-- coherence:section id="My Section ID" -->
content
<!-- /coherence:section -->
`;
    const { sections } = scanAnchors(source, 'test.md');
    expect(sections[0]!.id).toMatch(/^[a-z0-9_-]+$/);
  });

  it('captures heading attribute', () => {
    const source = `
<!-- coherence:section id="setup" heading="Setup Guide" -->
content
<!-- /coherence:section -->
`;
    const { sections } = scanAnchors(source, 'test.md');
    expect(sections[0]!.heading).toBe('Setup Guide');
  });
});
