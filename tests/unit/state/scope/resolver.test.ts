/**
 * v0.3 M1 — scope resolver (DD-105).
 *
 * Most-specific-wins by default; `extends:` flag observed but the merge is
 * already shallow. ignore[] arrays merge additively per DD-105 narrative.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { walkScopeAncestors } from '../../../../src/state/scope/walker.js';
import { resolveScope } from '../../../../src/state/scope/resolver.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'coherence-scope-resolve-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function touchJson(rel: string, body: object): string {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(body), 'utf8');
  return full;
}

function touch(rel: string, body = ''): string {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, body, 'utf8');
  return full;
}

describe('resolveScope (DD-105)', () => {
  it('most-specific scope wins on overlapping keys', () => {
    touchJson('coherence/scope.json', {
      schema_version: 1,
      mode: 'observe',
      scope_id: 'root',
    });
    touchJson('packages/a/coherence/scope.json', {
      schema_version: 1,
      mode: 'annotate',
      scope_id: 'pkg-a',
    });
    const target = touch('packages/a/src/file.ts', '');
    const ancestors = walkScopeAncestors(target, { projectRoot: root });
    const r = resolveScope(ancestors);
    expect(r.effective.mode).toBe('annotate');
    expect(r.effective.scope_id).toBe('pkg-a');
    expect(r.provenance.mode).toContain(path.join('packages', 'a', 'coherence', 'scope.json'));
  });

  it('ignore arrays merge additively across ancestors', () => {
    touchJson('coherence/scope.json', {
      schema_version: 1,
      ignore: ['*.log'],
    });
    touchJson('packages/a/coherence/scope.json', {
      schema_version: 1,
      ignore: ['*.tmp'],
    });
    const target = touch('packages/a/src/file.ts', '');
    const ancestors = walkScopeAncestors(target, { projectRoot: root });
    const r = resolveScope(ancestors);
    expect(r.effective.ignore).toEqual(expect.arrayContaining(['*.log', '*.tmp']));
  });

  it('flags extendsApplied when any ancestor opts in', () => {
    touchJson('packages/a/coherence/scope.json', {
      schema_version: 1,
      extends: 'shared',
      mode: 'author',
    });
    const target = touch('packages/a/src/file.ts', '');
    const ancestors = walkScopeAncestors(target, { projectRoot: root });
    const r = resolveScope(ancestors);
    expect(r.extendsApplied).toBe(true);
    expect(r.effective.mode).toBe('author');
  });

  it('CLAUDE.md presence does not contribute keys (M1 sidecar-only semantics)', () => {
    touch('CLAUDE.md', '# rules\n');
    touchJson('packages/a/coherence/scope.json', {
      schema_version: 1,
      mode: 'annotate',
    });
    const target = touch('packages/a/src/file.ts', '');
    const ancestors = walkScopeAncestors(target, { projectRoot: root });
    const r = resolveScope(ancestors);
    // CLAUDE.md is in the ancestors list (presence), but no JSON merge.
    expect(ancestors.length).toBe(2);
    expect(r.effective.mode).toBe('annotate');
  });
});
