/**
 * File-creation pattern detector (DD-077).
 */
import { describe, it, expect } from 'vitest';
import {
  detectFileCreation,
  jaccard,
  extractImportSet,
  extractHeadingHierarchy,
} from '../../../src/signal/fileCreation.js';
import { defaultSignalCache } from '../../../src/signal/signalCache.js';

describe('jaccard()', () => {
  it('1.0 for identical sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
  });
  it('0 for disjoint sets', () => {
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
  });
  it('intersection / union for partial overlap', () => {
    expect(jaccard(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd']))).toBeCloseTo(0.5);
  });
});

describe('detectFileCreation (DD-077)', () => {
  it('fires when 3 structurally-similar files in same dir', () => {
    const recent = new Map<string, Set<string>>();
    const fileA = '#!/bin/bash\nset -eu\nexport FOO=bar\necho hello\nexit 0';
    const fileB = '#!/bin/bash\nset -eu\nexport FOO=baz\necho hello\nexit 0';
    recent.set('scripts/a.sh', new Set(fileA.toLowerCase().split(/\s+/)));
    recent.set('scripts/b.sh', new Set(fileB.toLowerCase().split(/\s+/)));
    const r = detectFileCreation(
      defaultSignalCache(),
      'scripts/c.sh',
      fileA,
      recent,
    );
    expect(r.jaccard_max).toBeGreaterThanOrEqual(0.8);
    expect(r.fired).toBe(true);
  });

  it('does not fire on dissimilar files', () => {
    const recent = new Map<string, Set<string>>();
    recent.set('scripts/a.sh', new Set(['echo', 'hello']));
    recent.set('scripts/b.sh', new Set(['printf', 'world']));
    const r = detectFileCreation(
      defaultSignalCache(),
      'scripts/c.sh',
      'completely different content here',
      recent,
    );
    expect(r.fired).toBe(false);
  });

  it('does not fire across different directories (locality)', () => {
    const recent = new Map<string, Set<string>>();
    const content = '#!/bin/bash\nset -eu\necho hi';
    recent.set('a/x.sh', new Set(content.toLowerCase().split(/\s+/)));
    recent.set('b/y.sh', new Set(content.toLowerCase().split(/\s+/)));
    const r = detectFileCreation(defaultSignalCache(), 'c/z.sh', content, recent);
    expect(r.fired).toBe(false);
  });
});

describe('extractHeadingHierarchy (DD-077 amended)', () => {
  it('extracts ATX heading paths from markdown', () => {
    const md = '# Title\n## Usage\n### Macos\n## Setup\n';
    const out = extractHeadingHierarchy('docs/readme.md', md);
    expect(out.has('title')).toBe(true);
    expect(out.has('title/usage')).toBe(true);
    expect(out.has('title/usage/macos')).toBe(true);
    expect(out.has('title/setup')).toBe(true);
  });

  it('returns empty set for non-markdown extensions', () => {
    expect(extractHeadingHierarchy('src/x.ts', '# not a heading\n').size).toBe(0);
  });

  it('handles RST setext-style underline headings', () => {
    const rst = 'Title\n=====\n\nUsage\n-----\n';
    const out = extractHeadingHierarchy('docs/x.rst', rst);
    expect(out.has('title')).toBe(true);
    expect(out.has('title/usage')).toBe(true);
  });
});

describe('detectFileCreation heading-hierarchy variant (DD-077 amended)', () => {
  it('fires on three skill docs with identical outline but different prose', () => {
    const recentTokens = new Map<string, Set<string>>();
    const recentImports = new Map<string, Set<string>>();
    const recentHeadings = new Map<string, Set<string>>();
    const skill = (n: number) =>
      `# Skill\n\nLorem ipsum unique-${n}-prose alpha bravo charlie.\n\n## Usage\n\nFoo bar baz delta-${n} echo foxtrot.\n\n## Triggers\n\nGolf hotel india-${n} juliet kilo.\n`;
    for (let i = 1; i <= 2; i++) {
      const p = `skills/s${i}.md`;
      const c = skill(i);
      // Use deliberately disjoint structural tokens by giving each file
      // a unique line-1 word — that forces struct/import variants to 0
      // and leaves the heading variant as the only signal.
      recentTokens.set(p, new Set([`unique-${i}-line-token`]));
      recentImports.set(p, new Set());
      recentHeadings.set(p, extractHeadingHierarchy(p, c));
    }
    const r = detectFileCreation(
      defaultSignalCache(),
      'skills/s3.md',
      skill(3),
      recentTokens,
      undefined,
      recentImports,
      recentHeadings,
    );
    expect(r.jaccard_max).toBeGreaterThanOrEqual(0.8);
    expect(r.jaccard_variant).toBe('heading_hierarchy');
    expect(r.fired).toBe(true);
  });
});

describe('detectFileCreation import-set variant (DD-077 amended)', () => {
  it('fires on three TS files that import the same dependencies', () => {
    const tsContent = (id: string) =>
      `import { foo as a${id} } from 'lodash';\nimport zod from 'zod';\nimport fs from 'node:fs';\nexport const v_${id} = a${id}(zod, fs);\n`;
    const recentTokens = new Map<string, Set<string>>();
    const recentImports = new Map<string, Set<string>>();
    for (let i = 1; i <= 2; i++) {
      const p = `src/m${i}.ts`;
      // Diverge structural tokens so import set is the deciding variant.
      recentTokens.set(p, new Set([`distinct-line-${i}`]));
      recentImports.set(p, extractImportSet(p, tsContent(String(i))));
    }
    const r = detectFileCreation(
      defaultSignalCache(),
      'src/m3.ts',
      tsContent('3'),
      recentTokens,
      undefined,
      recentImports,
    );
    expect(r.jaccard_max).toBeGreaterThanOrEqual(0.8);
    expect(r.jaccard_variant).toBe('import_set');
    expect(r.fired).toBe(true);
  });
});
