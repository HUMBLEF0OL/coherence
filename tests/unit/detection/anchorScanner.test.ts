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
    expect(sections[0].id).toBe('intro');
    expect(sections[0].content).toContain('Hello world');
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

  // ── v1.0.1 Fix 7 (BUG-V1.0-D) regression ───────────────────────────
  // Prior bug: the opening fence line was dropped from `section.content`
  // when scanAnchors entered fence-tracking mode. This broke
  // `has_example` (FENCED_CODE_RE needs both fences) and sent malformed
  // text to the Stage 2 LLM. The closing fence was retained but the
  // opening was lost — sections appeared to lack a code example even
  // when one was present.
  it('section content retains BOTH the opening and closing fence lines (Fix 7)', () => {
    const source = `<!-- coherence:section id="x" -->
## X

\`\`\`ts
const x = 1;
\`\`\`
<!-- /coherence:section -->
`;
    const { sections } = scanAnchors(source, 'x.md');
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain('```ts');
    expect(sections[0].content).toContain('const x = 1;');
    // Closing fence too — should still be there.
    expect(sections[0].content.split('\n').filter((l) => l.trim() === '```')).toHaveLength(1);
    // FENCED_CODE_RE = /```[\s\S]*?```/  — must match end-to-end.
    expect(/```[\s\S]*?```/.test(sections[0].content)).toBe(true);
  });

  it('retains fences for sections with multiple code blocks', () => {
    const source = `<!-- coherence:section id="multi" -->
First block:
\`\`\`ts
const a = 1;
\`\`\`
Second block:
\`\`\`js
const b = 2;
\`\`\`
<!-- /coherence:section -->
`;
    const { sections } = scanAnchors(source, 'multi.md');
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain('```ts');
    expect(sections[0].content).toContain('```js');
    // Two opening + two closing = 4 fence lines.
    expect(sections[0].content.split('\n').filter((l) => /^```/.test(l))).toHaveLength(4);
  });

  it('retains tilde fences inside sections too', () => {
    const source = `<!-- coherence:section id="t" -->
~~~yaml
key: value
~~~
<!-- /coherence:section -->
`;
    const { sections } = scanAnchors(source, 't.md');
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain('~~~yaml');
  });

  it('normalizes section ids to [a-z0-9_-]+', () => {
    const source = `
<!-- coherence:section id="My Section ID" -->
content
<!-- /coherence:section -->
`;
    const { sections } = scanAnchors(source, 'test.md');
    expect(sections[0].id).toMatch(/^[a-z0-9_-]+$/);
  });

  it('captures heading attribute', () => {
    const source = `
<!-- coherence:section id="setup" heading="Setup Guide" -->
content
<!-- /coherence:section -->
`;
    const { sections } = scanAnchors(source, 'test.md');
    expect(sections[0].heading).toBe('Setup Guide');
  });
});
