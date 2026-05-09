/**
 * SG-1: npm audit — no high/critical vulnerabilities.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

describe('SG-1: npm audit', () => {
  it('npm audit --audit-level=high returns 0 vulnerabilities', () => {
    let exitCode = 0;
    try {
      execSync('npm audit --audit-level=high', {
        cwd: PROJECT_ROOT,
        shell: true,
        stdio: 'pipe',
      });
    } catch (err: unknown) {
      const error = err as { status?: number; stdout?: Buffer };
      exitCode = error.status ?? 1;
      if (exitCode !== 0) {
        const output = error.stdout?.toString() ?? '';
        console.warn('[SG-1] npm audit output:', output.slice(0, 500));
      }
    }
    expect(exitCode).toBe(0);
  });
});
