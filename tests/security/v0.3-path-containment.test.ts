/**
 * v0.3 audit-3 S1+S2+S3 — path-containment guards for the v0.3 commands.
 *
 *   - runDeAnnotate refuses paths outside projectRoot
 *   - runScopeDebug refuses paths outside projectRoot
 *   - runExportMetrics refuses to silently `mkdir` outside cwd / projectRoot
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../src/state/init.js';
import { runDeAnnotate } from '../../src/commands/deAnnotate.js';
import { runScopeDebug } from '../../src/commands/scopeDebug.js';
import { runExportMetrics } from '../../src/commands/exportMetrics.js';

let dir: string;
let outsideTmp: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-s12-'));
  outsideTmp = mkdtempSync(path.join(tmpdir(), 'coherence-outside-'));
  await initCoherenceDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outsideTmp, { recursive: true, force: true });
});

describe('S1 — runDeAnnotate refuses paths outside projectRoot', () => {
  it('rejects a parent-relative path', async () => {
    const store = makeStateStore(dir);
    await expect(
      runDeAnnotate({ store, projectRoot: dir, target: '../leak.md' }),
    ).rejects.toThrow(/outside the project root/);
  });

  it('rejects an absolute path pointing outside projectRoot', async () => {
    const store = makeStateStore(dir);
    const evilTarget = path.join(outsideTmp, 'evil.md');
    writeFileSync(
      evilTarget,
      '<!-- coherence:section x\nauto-annotated: true -->\nbody\n',
    );
    await expect(
      runDeAnnotate({ store, projectRoot: dir, target: evilTarget }),
    ).rejects.toThrow(/outside the project root/);
  });
});

describe('S2 — runScopeDebug refuses paths outside projectRoot', () => {
  it('rejects a parent-relative path', async () => {
    const store = makeStateStore(dir);
    await expect(
      runScopeDebug({
        store,
        projectRoot: dir,
        filePath: '../leak.ts',
        sessionId: 's',
      }),
    ).rejects.toThrow(/outside the project root/);
  });

  it('rejects an absolute path outside projectRoot', async () => {
    const store = makeStateStore(dir);
    const evilTarget = path.join(outsideTmp, 'evil.ts');
    writeFileSync(evilTarget, '');
    await expect(
      runScopeDebug({
        store,
        projectRoot: dir,
        filePath: evilTarget,
        sessionId: 's',
      }),
    ).rejects.toThrow(/outside the project root/);
  });
});

describe('S3 — runExportMetrics refuses to mkdir outside cwd/projectRoot', () => {
  beforeEach(() => {
    // Seed metrics.jsonl with one event so export-metrics has something to read.
    const cohDir = path.join(dir, '.claude', 'coherence');
    mkdirSync(cohDir, { recursive: true });
    writeFileSync(
      path.join(cohDir, 'metrics.jsonl'),
      JSON.stringify({ event: 'a', session_id: 's' }) + '\n',
    );
  });

  it('refuses an --out whose parent directory does not exist AND is outside cwd/projectRoot', async () => {
    const store = makeStateStore(dir);
    // Use a sibling tmp dir as the "outside" location, then nest a path
    // that does NOT exist so mkdir would be attempted.
    const nonExistentOutside = path.join(outsideTmp, 'newdir-that-does-not-exist', 'export.jsonl');
    await expect(
      runExportMetrics({
        store,
        projectRoot: dir,
        sessionId: 's',
        out: nonExistentOutside,
      }),
    ).rejects.toThrow(/outside the project root/);
  });

  it('accepts an --out inside projectRoot even if the directory must be created', async () => {
    const store = makeStateStore(dir);
    const inside = path.join(dir, 'newdir-inside', 'export.jsonl');
    const r = await runExportMetrics({
      store,
      projectRoot: dir,
      sessionId: 's',
      out: inside,
    });
    expect(r.outPath).toBe(inside);
  });
});
