/**
 * Canonical Selection Algorithm unit tests.
 * DD-015/-016/-018/-028, FR-STOP-14
 */
import { describe, it, expect } from 'vitest';
import {
  selectCanonical,
  deepestCommonAncestor,
  filterAtOrBelowAncestor,
} from '../../../src/pipeline/canonical.js';
import type { SectionCandidate } from '../../../src/pipeline/canonical.js';
import type { SectionRef, NormalizedPath } from '../../../src/types/index.js';

function ref(s: string): SectionRef {
  return s as SectionRef;
}
function np(s: string): NormalizedPath {
  return s as NormalizedPath;
}

function candidate(path: string, declared?: boolean): SectionCandidate {
  return {
    sectionRef: ref(`${path}#section`),
    path: np(path),
    declared_canonical: declared,
  };
}

describe('deepestCommonAncestor', () => {
  it('returns empty string for empty input', () => {
    expect(deepestCommonAncestor([])).toBe('');
  });

  it('returns directory of single file', () => {
    expect(deepestCommonAncestor(['docs/api.md'])).toBe('docs');
  });

  it('finds common ancestor of sibling files', () => {
    expect(deepestCommonAncestor(['docs/api.md', 'docs/guide.md'])).toBe('docs');
  });

  it('finds common ancestor across layers', () => {
    expect(deepestCommonAncestor(['docs/api.md', 'src/index.ts'])).toBe('');
  });

  it('finds nested common ancestor', () => {
    expect(
      deepestCommonAncestor(['docs/v2/api.md', 'docs/v2/guide.md', 'docs/v2/ref.md']),
    ).toBe('docs/v2');
  });
});

describe('filterAtOrBelowAncestor (DD-028)', () => {
  it('filters candidates to at-or-below ancestor', () => {
    const candidates = [
      candidate('docs/api.md'),
      candidate('src/index.ts'),
      candidate('docs/guide.md'),
    ];
    const result = filterAtOrBelowAncestor(candidates, ['docs/api.md', 'docs/guide.md']);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.path)).toContain('docs/api.md');
    expect(result.map((c) => c.path)).toContain('docs/guide.md');
  });

  it('returns all candidates if none survive filter', () => {
    const candidates = [candidate('README.md'), candidate('CHANGELOG.md')];
    const result = filterAtOrBelowAncestor(candidates, ['docs/api.md', 'docs/guide.md']);
    expect(result).toHaveLength(2);
  });
});

describe('selectCanonical — Rule 2: declared-canonical absolute honour (DD-015)', () => {
  it('selects declared canonical unconditionally', () => {
    const candidates = [
      candidate('docs/api.md', true),
      candidate('docs/spec.md'),
      candidate('CLAUDE.md'),
    ];
    const { canonical, demoted } = selectCanonical(candidates, ['src/index.ts']);
    expect(canonical.path).toBe('docs/api.md');
    expect(demoted).toHaveLength(0);
  });

  it('demotes extra declared canonicals when multiple exist', () => {
    const candidates = [
      candidate('docs/api.md', true),
      candidate('docs/guide.md', true),
    ];
    const { canonical, demoted } = selectCanonical(candidates, []);
    expect(demoted).toHaveLength(1);
    expect(demoted[0]!.path).not.toBe(canonical.path);
  });
});

describe('selectCanonical — Rule 3: architecture/skill/CLAUDE.md preference', () => {
  it('prefers architecture paths (Rule 3a)', () => {
    const candidates = [
      candidate('docs/architecture/overview.md'),
      candidate('docs/guide.md'),
      candidate('docs/api.md'),
    ];
    const { canonical } = selectCanonical(candidates, ['src/service.ts']);
    expect(canonical.path).toBe('docs/architecture/overview.md');
  });

  it('prefers SKILL.md over regular docs (Rule 3b)', () => {
    const candidates = [
      candidate('skills/SKILL.md'),
      candidate('docs/guide.md'),
    ];
    const { canonical } = selectCanonical(candidates, ['src/service.ts']);
    expect(canonical.path).toBe('skills/SKILL.md');
  });

  it('prefers CLAUDE.md when no arch or SKILL (Rule 3c)', () => {
    const candidates = [
      candidate('CLAUDE.md'),
      candidate('docs/guide.md'),
    ];
    const { canonical } = selectCanonical(candidates, ['src/service.ts']);
    expect(canonical.path).toBe('CLAUDE.md');
  });
});

describe('selectCanonical — DD-016: depth-score tiebreak', () => {
  it('selects shallower path when depth differs', () => {
    const candidates = [
      candidate('docs/v2/deep/section.md'),
      candidate('docs/overview.md'),
    ];
    const { canonical } = selectCanonical(candidates, ['src/index.ts']);
    expect(canonical.path).toBe('docs/overview.md');
  });
});

describe('selectCanonical — DD-018: nearest-wins', () => {
  it('prefers candidate sharing more path prefix with triggering files', () => {
    const candidates = [
      candidate('docs/api/endpoint.md'),
      candidate('README.md'),
    ];
    // triggering file is in docs/api/ — endpoint.md shares more prefix
    const { canonical } = selectCanonical(candidates, ['docs/api/handler.ts']);
    expect(canonical.path).toBe('docs/api/endpoint.md');
  });
});

describe('selectCanonical — lex-path final tiebreak', () => {
  it('picks lexicographically first path in a tie', () => {
    const candidates = [
      candidate('docs/zzz.md'),
      candidate('docs/aaa.md'),
    ];
    const { canonical } = selectCanonical(candidates, []);
    expect(canonical.path).toBe('docs/aaa.md');
  });
});

describe('selectCanonical — edge cases', () => {
  it('throws on empty candidates', () => {
    expect(() => selectCanonical([], [])).toThrow();
  });

  it('returns sole candidate without error', () => {
    const { canonical } = selectCanonical([candidate('docs/only.md')], []);
    expect(canonical.path).toBe('docs/only.md');
  });
});
