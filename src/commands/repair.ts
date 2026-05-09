/**
 * /coherence:repair — fix anchor collisions, schema drift, buffer corruption,
 * pending.md mismatches.
 * FR-PERMISSION-6
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import type { DriftBuffer } from '../buffer/lifecycle.js';
import type { StopProgress } from '../types/index.js';

export interface RepairResult {
  actions: string[];
  repaired: boolean;
}

export async function runRepair(
  store: StateStore,
  coherenceDir: string,
  projectRoot: string,
): Promise<RepairResult> {
  const actions: string[] = [];

  // 1. Re-validate drift buffer — quarantine corrupt entries (only if file exists)
  const bufferPath = path.join(coherenceDir, 'drift-buffer.json');
  const bufferExists = existsSync(bufferPath);
  const buf = bufferExists ? await store.read<DriftBuffer>('drift-buffer.json') : null;
  if (bufferExists && buf === null) {
    const lifecycle = new BufferLifecycle(store);
    await lifecycle.clear();
    actions.push('Cleared corrupt drift-buffer.json (schema mismatch)');
  }

  // 2. Clear orphaned stop-progress.json (leftover from crash with no matching buffer entries)
  const progress = await store.read<StopProgress>('stop-progress.json');
  const bufNow = buf;
  if (progress && (!bufNow || bufNow.entries.length === 0)) {
    try {
      const progressPath = path.join(coherenceDir, 'stop-progress.json');
      if (existsSync(progressPath)) {
        const tmpPath = `${progressPath}.removed`;
        writeFileSync(tmpPath, readFileSync(progressPath));
        // Move to quarantine dir
        const quarPath = path.join(coherenceDir, 'quarantine', `stop-progress-orphan-${Date.now()}.json`);
        writeFileSync(quarPath, readFileSync(tmpPath));
        const { unlinkSync } = await import('fs');
        unlinkSync(progressPath);
        unlinkSync(tmpPath);
        actions.push('Removed orphaned stop-progress.json (buffer was empty)');
      }
    } catch {
      actions.push('Could not remove orphaned stop-progress.json');
    }
  }

  // 3. Check pending.md for coherence-pending markers vs buffer entries
  const pendingPath = path.join(projectRoot, 'pending.md');
  if (existsSync(pendingPath)) {
    const raw = readFileSync(pendingPath, 'utf8');
    const markers = (raw.match(/<!-- coherence-pending: \d{4}-\d{2}-\d{2} -->/g) ?? []).length;
    const bufEntries = bufNow?.entries.length ?? 0;
    if (markers > 0 && bufEntries === 0) {
      actions.push(
        `Warning: pending.md has ${markers} marker(s) but buffer is empty — manual review may be needed`,
      );
    }
  }

  if (actions.length === 0) {
    actions.push('No issues found — state is consistent');
  }

  void projectRoot;

  return { actions, repaired: actions.length > 0 };
}

export function formatRepair(result: RepairResult): string {
  const lines = ['[coherence] repair:'];
  for (const a of result.actions) lines.push(`  • ${a}`);
  return lines.join('\n');
}
