/**
 * /coherence:recover — clear quarantine, reset locks, drop progress files,
 * remove auto-disable sentinel (NOT manual DISABLED).
 * FR-FAILURE-7
 */
import { existsSync, readdirSync, unlinkSync } from 'fs';
import path from 'path';
import { Sentinels } from '../state/sentinels.js';
import { lockManager } from '../state/locks.js';

export interface RecoverResult {
  actions: string[];
}

export async function runRecover(coherenceDir: string): Promise<RecoverResult> {
  const actions: string[] = [];
  const sentinels = new Sentinels(coherenceDir);

  // 1. Clear auto-disabled sentinel (never touches DISABLED)
  if (sentinels.isAutoDisabled()) {
    sentinels.clearAutoDisabled();
    actions.push('Cleared auto-disabled sentinel');
  }

  if (sentinels.isManuallyDisabled()) {
    actions.push('Warning: DISABLED (manual kill-switch) is still active — /coherence:recover cannot remove it');
  }

  // 2. Reset lock manager (release any stale locks) — only log if it was degraded
  const wasDegraded = lockManager.degraded;
  lockManager.reset();
  if (wasDegraded) {
    actions.push('Reset degraded lock manager');
  }

  // 3. Drop stop-progress.json (orphaned crash progress)
  const progressPath = path.join(coherenceDir, 'stop-progress.json');
  if (existsSync(progressPath)) {
    unlinkSync(progressPath);
    actions.push('Removed stop-progress.json');
  }

  // 4. Clear quarantine directory
  const quarantineDir = path.join(coherenceDir, 'quarantine');
  if (existsSync(quarantineDir)) {
    const files = readdirSync(quarantineDir).filter((f) => !f.startsWith('.'));
    for (const f of files) {
      try {
        unlinkSync(path.join(quarantineDir, f));
      } catch { /* best-effort */ }
    }
    if (files.length > 0) {
      actions.push(`Cleared quarantine (${files.length} file(s))`);
    }
  }

  if (actions.length === 0) {
    actions.push('Nothing to recover — state is clean');
  }

  return { actions };
}

export function formatRecover(result: RecoverResult): string {
  const lines = ['[coherence] recover:'];
  for (const a of result.actions) lines.push(`  • ${a}`);
  return lines.join('\n');
}
