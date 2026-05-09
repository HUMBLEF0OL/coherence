/**
 * /coherence:recover contract tests.
 * Clears auto-disabled but never DISABLED; drops progress files.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { runRecover } from '../../../src/commands/recover.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-recover-'));
  mkdirSync(path.join(tmpDir, 'quarantine'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('/coherence:recover', () => {
  it('clears auto-disabled sentinel', async () => {
    writeFileSync(path.join(tmpDir, 'auto-disabled'), 'auto\n');
    const result = await runRecover(tmpDir);
    expect(result.actions.some((a) => a.includes('auto-disabled'))).toBe(true);
    expect(existsSync(path.join(tmpDir, 'auto-disabled'))).toBe(false);
  });

  it('does NOT remove DISABLED (manual kill-switch)', async () => {
    writeFileSync(path.join(tmpDir, 'DISABLED'), 'manual\n');
    const result = await runRecover(tmpDir);
    expect(existsSync(path.join(tmpDir, 'DISABLED'))).toBe(true);
    expect(result.actions.some((a) => a.includes('DISABLED'))).toBe(true);
    expect(result.actions.some((a) => a.includes('cannot remove'))).toBe(true);
  });

  it('removes stop-progress.json if present', async () => {
    const progressPath = path.join(tmpDir, 'stop-progress.json');
    writeFileSync(progressPath, JSON.stringify({ session_id: 'test' }));
    const result = await runRecover(tmpDir);
    expect(existsSync(progressPath)).toBe(false);
    expect(result.actions.some((a) => a.includes('stop-progress'))).toBe(true);
  });

  it('clears quarantine directory', async () => {
    const quarantineDir = path.join(tmpDir, 'quarantine');
    writeFileSync(path.join(quarantineDir, 'corrupt-file.json'), '{}');
    const result = await runRecover(tmpDir);
    expect(result.actions.some((a) => a.includes('quarantine'))).toBe(true);
    expect(existsSync(path.join(quarantineDir, 'corrupt-file.json'))).toBe(false);
  });

  it('reports nothing to recover when state is clean', async () => {
    const result = await runRecover(tmpDir);
    expect(result.actions.some((a) => a.includes('Nothing to recover'))).toBe(true);
  });
});
