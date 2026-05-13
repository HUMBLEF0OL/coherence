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
    // v1.0.1 Fix 4 (BUG-V1.0-A): `parseStage2Response` trims its input,
    // which strips the trailing newline that terminates the diff's last
    // line. `git apply --check` rejects the patch with "corrupt patch at
    // line N" when the final hunk line is not newline-terminated. Restore
    // the terminator at the gate boundary so all upstream trims stay safe.
    const patchBody = diffRaw.endsWith('\n') ? diffRaw : diffRaw + '\n';
    writeFileSync(tmpPath, patchBody, 'utf8');

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
