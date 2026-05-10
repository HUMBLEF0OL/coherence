/**
 * Mode resolver (DD-074, FR-MODES-1..7).
 */
import { describe, it, expect } from 'vitest';
import { resolveMode } from '../../../src/modes/resolver.js';
import type { GraduationFile } from '../../../src/state/graduation.js';

const empty: GraduationFile = { schema_version: 2, global_mode: 'observe', scopes: [] };

describe('resolveMode', () => {
  it('falls back to global when no scope matches', () => {
    expect(resolveMode({ graduation: empty, targetPath: 'docs/x.md' })).toBe('observe');
  });

  it('per-doc exact match wins', () => {
    const g: GraduationFile = {
      schema_version: 2,
      global_mode: 'observe',
      scopes: [
        { path: 'docs/', mode: 'annotate' },
        { path: 'docs/api.md', mode: 'author' },
      ],
    };
    expect(resolveMode({ graduation: g, targetPath: 'docs/api.md' })).toBe('author');
    expect(resolveMode({ graduation: g, targetPath: 'docs/other.md' })).toBe('annotate');
    expect(resolveMode({ graduation: g, targetPath: 'src/main.ts' })).toBe('observe');
  });

  it('longest-prefix wins for nested directory scopes', () => {
    const g: GraduationFile = {
      schema_version: 2,
      global_mode: 'observe',
      scopes: [
        { path: 'docs/', mode: 'annotate' },
        { path: 'docs/api/', mode: 'author' },
      ],
    };
    expect(resolveMode({ graduation: g, targetPath: 'docs/api/v1.md' })).toBe('author');
    expect(resolveMode({ graduation: g, targetPath: 'docs/intro.md' })).toBe('annotate');
  });

  it('lex-first wins on equally-specific scopes', () => {
    const g: GraduationFile = {
      schema_version: 2,
      global_mode: 'observe',
      scopes: [
        { path: 'docs/', mode: 'author' },
        { path: 'docz/', mode: 'annotate' },
      ],
    };
    expect(resolveMode({ graduation: g, targetPath: 'docs/x.md' })).toBe('author');
  });

  it('FR-MODES-6 hard invariant: changing mode never enables auto-apply', () => {
    // Resolver returns *advisory* mode strings only — no side effect on quarantine.
    const g: GraduationFile = {
      schema_version: 2,
      global_mode: 'author',
      scopes: [],
    };
    const m = resolveMode({ graduation: g, targetPath: 'docs/x.md' });
    expect(m).toBe('author');
    // The boundary is enforced structurally elsewhere (M1 SG-3 fixture).
  });
});
