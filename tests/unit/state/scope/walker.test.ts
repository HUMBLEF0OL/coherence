/**
 * v0.3 M1 — scope walker (DD-097).
 *
 * Bounded ancestor walk to find CLAUDE.md / coherence/scope.json files. Tests:
 *  - depth cap enforcement
 *  - ancestor enumeration in deepest-first order
 *  - skipDirs (node_modules, .git, dist, build, …) shut the walk down
 *  - projectRoot is the hard ceiling
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  walkScopeAncestors,
  SCOPE_WALK_MAX_DEPTH,
  SCOPE_SKIP_DIRS,
} from '../../../../src/state/scope/walker.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'coherence-scope-walker-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function touch(rel: string, body = ''): string {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body, 'utf8');
  return full;
}

describe('walkScopeAncestors (DD-097)', () => {
  it('returns ancestors deepest-first', () => {
    touch('CLAUDE.md', '# root');
    touch('packages/a/CLAUDE.md', '# pkg a');
    touch('packages/a/src/CLAUDE.md', '# src a');
    const target = touch('packages/a/src/file.ts', '');
    const out = walkScopeAncestors(target, { projectRoot: root });
    expect(out.map((a) => path.relative(root, a.file).replace(/\\/g, '/'))).toEqual([
      'packages/a/src/CLAUDE.md',
      'packages/a/CLAUDE.md',
      'CLAUDE.md',
    ]);
  });

  it('honours coherence/scope.json sidecar (DD-098)', () => {
    touch(
      'packages/a/coherence/scope.json',
      JSON.stringify({ schema_version: 1, scope_id: 'pkg-a' }),
    );
    const target = touch('packages/a/src/file.ts', '');
    const out = walkScopeAncestors(target, { projectRoot: root });
    expect(out.length).toBe(1);
    expect(out[0].file.endsWith(path.join('coherence', 'scope.json'))).toBe(true);
  });

  it('respects SCOPE_WALK_MAX_DEPTH', () => {
    expect(SCOPE_WALK_MAX_DEPTH).toBe(8);
    // Build a chain deeper than the cap.
    let dir = root;
    for (let i = 0; i < SCOPE_WALK_MAX_DEPTH + 4; i++) {
      dir = path.join(dir, `lvl${i}`);
      touch(path.relative(root, path.join(dir, 'CLAUDE.md')), `# lvl${i}`);
    }
    const target = touch(path.relative(root, path.join(dir, 'file.ts')), '');
    const out = walkScopeAncestors(target, { projectRoot: root, maxDepth: 4 });
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('does not walk past projectRoot', () => {
    touch('CLAUDE.md', '# in-root');
    const target = touch('a/b/c/file.ts', '');
    const out = walkScopeAncestors(target, { projectRoot: path.join(root, 'a', 'b') });
    // Only b and c can be inspected; the root CLAUDE.md is above the projectRoot.
    expect(out.find((a) => a.file === path.join(root, 'CLAUDE.md'))).toBeUndefined();
  });

  it('SCOPE_SKIP_DIRS short-circuits when start path is inside a skip dir', () => {
    touch('CLAUDE.md', '# root');
    touch('node_modules/foo/CLAUDE.md', '# fake');
    const target = touch('node_modules/foo/file.ts', '');
    const out = walkScopeAncestors(target, { projectRoot: root });
    // Walker breaks immediately because cursor is inside `node_modules`.
    expect(out.length).toBe(0);
    expect(SCOPE_SKIP_DIRS.has('node_modules')).toBe(true);
  });
});
