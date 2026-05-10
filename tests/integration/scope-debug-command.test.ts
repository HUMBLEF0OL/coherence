/**
 * v0.3 M1 — /coherence:scope-debug integration.
 *
 * End-to-end through the runScopeDebug entrypoint: walks ancestors, resolves
 * scope, populates cache, second invocation hits cache.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import { runScopeDebug, formatScopeDebug } from '../../src/commands/scopeDebug.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-scope-debug-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('/coherence:scope-debug integration (DD-097, DD-098, DD-105)', () => {
  it('walks ancestors and reports the merged scope', async () => {
    await initCoherenceDir(dir);
    mkdirSync(path.join(dir, 'coherence'), { recursive: true });
    mkdirSync(path.join(dir, 'packages', 'a', 'src'), { recursive: true });
    mkdirSync(path.join(dir, 'packages', 'a', 'coherence'), { recursive: true });
    writeFileSync(
      path.join(dir, 'coherence', 'scope.json'),
      JSON.stringify({ schema_version: 1, mode: 'observe' }),
    );
    writeFileSync(
      path.join(dir, 'packages', 'a', 'coherence', 'scope.json'),
      JSON.stringify({ schema_version: 1, mode: 'annotate' }),
    );
    const target = path.join(dir, 'packages', 'a', 'src', 'file.ts');
    writeFileSync(target, '', 'utf8');

    const store = makeStateStore(dir);
    const r1 = await runScopeDebug({
      store,
      projectRoot: dir,
      filePath: target,
      sessionId: 's1',
    });
    expect(r1.cacheHit).toBe(false);
    expect(r1.effective.mode).toBe('annotate');
    expect(r1.ancestors.length).toBe(2);

    const r2 = await runScopeDebug({
      store,
      projectRoot: dir,
      filePath: target,
      sessionId: 's1',
    });
    expect(r2.cacheHit).toBe(true);

    const formatted = formatScopeDebug(r2);
    expect(formatted).toContain('cache: hit');
    expect(formatted).toContain('mode = "annotate"');
  });

  it('throws on a missing path so the caller can surface a clear message', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    await expect(
      runScopeDebug({
        store,
        projectRoot: dir,
        filePath: path.join(dir, 'does/not/exist.ts'),
        sessionId: 's',
      }),
    ).rejects.toThrow(/path not found/);
  });
});
