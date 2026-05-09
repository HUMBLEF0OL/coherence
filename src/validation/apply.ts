/**
 * Apply check — verify diff applies cleanly using git apply --check.
 * TS-5 §5.5
 */
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

export interface ApplyCheckResult {
  applies: boolean;
  error: string | null;
}

export function checkApplies(diffRaw: string, projectRoot: string): ApplyCheckResult {
  // Write diff to a temp file
  const tmpPath = path.join(os.tmpdir(), `coherence-${process.pid}-${Date.now()}.patch`);

  try {
    writeFileSync(tmpPath, diffRaw, 'utf8');

    execFileSync('git', ['apply', '--check', tmpPath], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });

    return { applies: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { applies: false, error: msg };
  } finally {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch { /* best-effort */ }
  }
}
