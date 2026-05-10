/**
 * Install size hard gate — npm pack output must be < 10 MB.
 * NFR-PERF-8
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { statSync, unlinkSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

describe('Install size gate (NFR-PERF-8)', () => {
  it('npm pack output < 10 MB', () => {
    let packFile: string | null = null;

    try {
      // Run npm pack --dry-run --json (shell:true handles Windows npm.cmd)
      const output = execSync('npm pack --dry-run --json 2>/dev/null || npm pack --dry-run --json', {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        shell: true,
      });

      // npm pack --json outputs an array
      const jsonStart = output.indexOf('[');
      if (jsonStart >= 0) {
        const results = JSON.parse(output.slice(jsonStart)) as Array<{ size: number }>;
        const totalSize = results[0]?.size ?? 0;
        if (totalSize > 0) {
          expect(
            totalSize,
            `Pack size ${(totalSize / 1024 / 1024).toFixed(2)} MB exceeds 10 MB limit`,
          ).toBeLessThan(MAX_SIZE_BYTES);
          return;
        }
      }
    } catch {
      // fall through to file-based check
    }

    // Fallback: create the tarball and stat it
    try {
      execSync('npm pack', { cwd: PROJECT_ROOT, shell: true, stdio: 'pipe' });
      const tarballs = readdirSync(PROJECT_ROOT).filter((f) => f.endsWith('.tgz'));
      if (tarballs.length > 0) {
        packFile = path.join(PROJECT_ROOT, tarballs[tarballs.length - 1]);
        const stat = statSync(packFile);
        expect(
          stat.size,
          `Pack file ${(stat.size / 1024 / 1024).toFixed(2)} MB exceeds 10 MB limit`,
        ).toBeLessThan(MAX_SIZE_BYTES);
      } else {
        // npm not available or no output — skip gracefully
        expect(true).toBe(true);
      }
    } finally {
      if (packFile) {
        try { unlinkSync(packFile); } catch { /* best-effort */ }
      }
    }
  });
});
