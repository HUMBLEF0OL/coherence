/**
 * v0.3 M5 — /coherence:de-annotate two-mode + scope persistence.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, utimesSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import { runDeAnnotate, formatDeAnnotate } from '../../src/commands/deAnnotate.js';
import { readGraduation, resolveDeAnnotate } from '../../src/state/graduation.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-de-annotate-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const annotated = (id: string, body: string): string =>
  `<!-- coherence:section ${id}\nauto-annotated: true -->\n${body}`;

describe('/coherence:de-annotate (DD-102/DD-110)', () => {
  it('default mode strips auto-annotated blocks from the targeted doc', async () => {
    await initCoherenceDir(dir);
    const docs = path.join(dir, 'docs');
    mkdirSync(docs, { recursive: true });
    const target = path.join(docs, 'intro.md');
    writeFileSync(target, annotated('intro_overview', '# Intro\n\nbody\n'));

    const store = makeStateStore(dir);
    const r = await runDeAnnotate({
      store,
      projectRoot: dir,
      target,
    });
    expect(r.action).toBe('strip');
    expect(r.filesAffected).toContain(target);
    const after = readFileSync(target, 'utf8');
    expect(after).not.toMatch(/auto-annotated:\s*true/);
    expect(after).toMatch(/# Intro/);
  });

  it('--keep-as-user-anchor flips auto-annotated to false but preserves the anchor', async () => {
    await initCoherenceDir(dir);
    const docs = path.join(dir, 'docs');
    mkdirSync(docs, { recursive: true });
    const target = path.join(docs, 'intro.md');
    writeFileSync(target, annotated('intro_overview', '# Intro\n\nbody\n'));

    const store = makeStateStore(dir);
    const r = await runDeAnnotate({
      store,
      projectRoot: dir,
      target,
      keepAsUserAnchor: true,
    });
    expect(r.action).toBe('keep-as-user-anchor');
    const after = readFileSync(target, 'utf8');
    expect(after).toMatch(/coherence:section intro_overview/);
    expect(after).toMatch(/auto-annotated:\s*false/);
  });

  it('persists scope decision to graduation.json#de_annotate', async () => {
    await initCoherenceDir(dir);
    const docs = path.join(dir, 'docs');
    mkdirSync(docs, { recursive: true });
    const target = path.join(docs, 'intro.md');
    writeFileSync(target, annotated('a', 'body'));
    const store = makeStateStore(dir);

    await runDeAnnotate({ store, projectRoot: dir, target, scope: 'per-doc' });

    const g = await readGraduation(store);
    expect(g.de_annotate?.length).toBe(1);
    expect(g.de_annotate?.[0]).toMatchObject({
      path: target,
      scope: 'per-doc',
      action: 'strip',
    });
  });

  it('most-specific-wins resolution: per-doc > per-directory > global', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);

    await runDeAnnotate({
      store,
      projectRoot: dir,
      target: '*',
      scope: 'global',
      keepAsUserAnchor: false,
    });
    await runDeAnnotate({
      store,
      projectRoot: dir,
      target: 'docs/',
      scope: 'per-directory',
      keepAsUserAnchor: true,
    });
    await runDeAnnotate({
      store,
      projectRoot: dir,
      target: 'docs/special.md',
      scope: 'per-doc',
      keepAsUserAnchor: false,
    });

    const g = await readGraduation(store);
    expect(resolveDeAnnotate(g, 'docs/special.md')?.scope).toBe('per-doc');
    expect(resolveDeAnnotate(g, 'docs/intro.md')?.scope).toBe('per-directory');
    expect(resolveDeAnnotate(g, 'README.md')?.scope).toBe('global');
  });

  it('emits the user-edit hint when the doc is large and recently modified', async () => {
    await initCoherenceDir(dir);
    const docs = path.join(dir, 'docs');
    mkdirSync(docs, { recursive: true });
    const target = path.join(docs, 'intro.md');
    const big = annotated('a', 'x'.repeat(8000));
    writeFileSync(target, big);
    const st = statSync(target);
    // touch mtime to "now" to satisfy the heuristic.
    utimesSync(target, st.atimeMs / 1000, Date.now() / 1000);
    const store = makeStateStore(dir);
    const r = await runDeAnnotate({ store, projectRoot: dir, target });
    expect(r.hint).toBe('Run with --keep-as-user-anchor to preserve.');
    expect(formatDeAnnotate(r)).toContain('hint');
  });
});
