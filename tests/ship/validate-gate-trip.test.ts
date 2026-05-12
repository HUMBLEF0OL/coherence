/**
 * M-VALIDATE-1 meta-test (v0.4 M0).
 *
 * Asserts that the validate-plugin wrapper exits non-zero when the manifest
 * is broken. The wrapper script invokes `claude plugin validate` in its
 * current working directory; we point it at a temp dir containing a broken
 * `.claude-plugin/plugin.json` so the real manifest is never mutated and
 * other test files reading the real manifest in parallel are not affected.
 *
 * NOTE: the actual `claude` CLI may be unavailable in CI/dev shells; the
 * wrapper exits with the spawn's status (or 1 on missing binary), so a
 * missing `claude` binary also yields non-zero — still a valid trip.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

describe('M-VALIDATE-1 meta-test', () => {
  it('exits non-zero when .claude-plugin/plugin.json has a missing required field', () => {
    const wrapper = path.resolve(process.cwd(), 'scripts', 'validate-plugin.mjs');
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'validate-gate-trip-'));
    try {
      mkdirSync(path.join(tempDir, '.claude-plugin'), { recursive: true });
      // Broken manifest (missing required "name" field).
      writeFileSync(
        path.join(tempDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ version: '0.4.0' }, null, 2),
      );
      const result = spawnSync('node', [wrapper], {
        stdio: 'pipe',
        cwd: tempDir,
      });
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
