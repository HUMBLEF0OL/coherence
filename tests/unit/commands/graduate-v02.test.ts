/**
 * /coherence:graduate v0.2 surface (M3, DD-074, FR-MODES-1..7).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { runGraduate } from '../../../src/commands/graduate.js';
import { readGraduation } from '../../../src/state/graduation.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-grad-v02-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('graduate v0.2', () => {
  it('mode=annotate sets global to annotate', async () => {
    const r = await runGraduate(store, { mode: 'annotate' });
    expect(r.v02NewMode).toBe('annotate');
    const g = await readGraduation(store);
    expect(g.global_mode).toBe('annotate');
  });

  it('mode=author + scope sets per-scope override', async () => {
    await runGraduate(store, { mode: 'author', scope: 'docs/api/' });
    const g = await readGraduation(store);
    expect(g.global_mode).toBe('observe');
    expect(g.scopes).toContainEqual({ path: 'docs/api/', mode: 'author' });
  });

  it('--status reports effective mode for cwd', async () => {
    await runGraduate(store, { mode: 'annotate', scope: 'docs/' });
    const r = await runGraduate(store, { status: true, cwdPath: 'docs/intro.md' });
    expect(r.effectiveMode).toBe('annotate');
    expect(r.message).toContain("docs/intro.md");
  });

  it('FR-MODES-7: --status surfaces global when no scope matches', async () => {
    await runGraduate(store, { mode: 'observe' });
    const r = await runGraduate(store, { status: true, cwdPath: 'src/main.ts' });
    expect(r.effectiveMode).toBe('observe');
  });

  it('legacy graduate toggle still flips observe ↔ graduated', async () => {
    const r = await runGraduate(store);
    expect(r.newMode).toBe('graduated');
    const r2 = await runGraduate(store, { revert: true });
    expect(r2.newMode).toBe('observe');
  });
});
