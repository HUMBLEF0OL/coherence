/**
 * /coherence:repair — fix anchor collisions, schema drift, buffer corruption,
 * pending.md mismatches, and (v1.0 M4) trust-ledger orphan keys.
 * FR-PERMISSION-6 + FR-REPAIR-1
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { BufferLifecycle } from '../buffer/lifecycle.js';
import type { DriftBuffer } from '../buffer/lifecycle.js';
import type { StopProgress } from '../types/index.js';
import {
  listOrphanedKeys,
  reassociateKey,
  expireOrphans,
} from '../state/trustLedger.js';
import { appendCoherenceLog } from '../state/coherenceLog.js';

export interface RepairOptions {
  /** Reassociate trust-ledger key from oldRef. Requires `--to <newRef>`. */
  reassociate?: { from: string; to: string };
  /** Drop trust-ledger entries whose sectionRef no longer appears in section-index.json. */
  expireOrphans?: boolean;
}

export interface RepairResult {
  actions: string[];
  repaired: boolean;
}

function readKnownSectionRefs(coherenceDir: string): Set<string> {
  const fp = path.join(coherenceDir, 'section-index.json');
  if (!existsSync(fp)) return new Set();
  try {
    const obj = JSON.parse(readFileSync(fp, 'utf8')) as {
      entries?: Array<{ sectionRef: string }>;
      sections?: Array<{ sectionRef: string }>;
    };
    const list = obj.entries ?? obj.sections ?? [];
    return new Set(list.map((s) => s.sectionRef));
  } catch {
    return new Set();
  }
}

export async function runRepair(
  store: StateStore,
  coherenceDir: string,
  projectRoot: string,
  options: RepairOptions = {},
): Promise<RepairResult> {
  const actions: string[] = [];

  // v1.0 M4 — Trust-ledger flag branches (FR-REPAIR-1).
  if (options.reassociate) {
    const { from, to } = options.reassociate;
    await reassociateKey(store, from, to);
    actions.push(`Trust ledger reassociated: ${from} → ${to}`);
    await appendCoherenceLog(store, {
      type: 'repair',
      gitRef: null,
      summary: `Trust ledger reassociated: ${from} → ${to}`,
      sectionRefs: [from, to],
    });
    return { actions, repaired: true };
  }
  if (options.expireOrphans) {
    const known = readKnownSectionRefs(coherenceDir);
    const removed = await expireOrphans(store, known);
    const preview = removed.slice(0, 20).join(', ') + (removed.length > 20 ? ` … and ${removed.length - 20} more` : '');
    actions.push(`Trust orphans expired: ${removed.length} sectionRef(s)${removed.length > 0 ? ` (${preview})` : ''}`);
    if (removed.length > 0) {
      await appendCoherenceLog(store, {
        type: 'repair',
        gitRef: null,
        summary: `Trust orphans expired: ${removed.length} sectionRef(s) removed`,
        sectionRefs: removed,
      });
    }
    return { actions, repaired: removed.length > 0 };
  }

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

  // v1.0 M4 — default-flow trust-ledger orphan listing (FR-REPAIR-1).
  try {
    const known = readKnownSectionRefs(coherenceDir);
    const orphans = await listOrphanedKeys(store, known);
    if (orphans.length > 0) {
      actions.push(`Orphaned trust-ledger keys (${orphans.length}):`);
      for (let i = 0; i < orphans.length; i++) {
        actions.push(`  [${i + 1}] ${orphans[i]}`);
      }
      actions.push('Use --reassociate <oldRef> --to <newRef> or --expire-orphans to resolve.');
    }
  } catch {
    /* trust ledger check best-effort */
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
