/**
 * v0.3 DD-095 amended (under DD-118): /coherence:recover refuses cross-major-
 * version targets. The current major is read from `package.json#version`. For
 * 0.x.y plugins, "major" means major.minor — v0.2 → v0.3 is a major bump.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  runRecover,
  _resetRecoverVersionCache,
} from '../../../src/commands/recover.js';

let tmp: string;
let coherenceDir: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'coherence-rec-major-'));
  coherenceDir = path.join(tmp, '.claude', 'coherence');
  mkdirSync(coherenceDir, { recursive: true });
  _resetRecoverVersionCache();
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('runRecover cross-major-version refusal (DD-095 amended; v0.4 DD-124 parseMajor fix)', () => {
  it('refuses target v0.2.0 when running v1.x (cross-major-digit 0 → 1)', async () => {
    const r = await runRecover(coherenceDir, { target: 'v0.2.0' });
    expect(r.refusedCrossMajor).toBe(true);
  });

  it('refuses target v0.4.0 when running v1.x (cross-major-digit 0 → 1)', async () => {
    const r = await runRecover(coherenceDir, { target: 'v0.4.0' });
    expect(r.refusedCrossMajor).toBe(true);
  });

  it('accepts within-major target tag v1.0.0-pre.0', async () => {
    const r = await runRecover(coherenceDir, { target: 'v1.0.0-pre.0' });
    expect(r.refusedCrossMajor).toBeFalsy();
  });

  it('accepts target tag v1.0.0 when running v1.x (same major)', async () => {
    const r = await runRecover(coherenceDir, { target: 'v1.0.0' });
    expect(r.refusedCrossMajor).toBeFalsy();
  });

  it('refuses target tag v2.0.0 when running v1.x (cross-major-digit)', async () => {
    const r = await runRecover(coherenceDir, { target: 'v2.0.0' });
    expect(r.refusedCrossMajor).toBe(true);
    expect(r.actions).toEqual([
      'cohrence does not roll back across major versions; re-install the target version manually',
    ]);
  });

  it('accepts no-target call (within-major rollback unchanged)', async () => {
    const r = await runRecover(coherenceDir);
    expect(r.refusedCrossMajor).toBeFalsy();
    // No target → normal recovery flow runs (non-empty action list).
    expect(r.actions.length).toBeGreaterThan(0);
  });
});
