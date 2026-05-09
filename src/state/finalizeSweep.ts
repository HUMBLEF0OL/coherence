/**
 * Finalize sweep: locate <!-- coherence-pending: YYYY-MM-DD --> markers ≥7 days old
 * and commit them with [coherence] finalize prefix (DD-038).
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { discoverFiles } from '../detection/discovery.js';

const PENDING_MARKER_RE = /<!--\s*coherence-pending:\s*(\d{4}-\d{2}-\d{2})\s*-->/g;
const FINALIZE_DAYS = 7;

export function runFinalizeSweep(projectRoot: string): { finalized: string[] } {
  const finalized: string[] = [];
  const files = discoverFiles(projectRoot);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FINALIZE_DAYS);

  for (const file of files) {
    if (!existsSync(file.path)) continue;

    let source: string;
    try {
      source = readFileSync(file.path, 'utf8');
    } catch {
      continue;
    }

    let modified = source;
    let hasChanges = false;
    let match: RegExpExecArray | null;

    PENDING_MARKER_RE.lastIndex = 0;
    while ((match = PENDING_MARKER_RE.exec(source)) !== null) {
      const dateStr = match[1]!;
      const markerDate = new Date(dateStr);
      if (markerDate < cutoff) {
        // Remove the marker — the patch is now finalized
        modified = modified.replace(match[0], '');
        hasChanges = true;
        finalized.push(file.path);
      }
    }

    if (hasChanges) {
      writeFileSync(file.path, modified, 'utf8');
      try {
        execSync(`git add "${file.path}"`, { cwd: projectRoot, timeout: 5000 });
        execSync(
          `git commit -m "[coherence] finalize: remove aged pending markers\n\nsection: ${file.path}"`,
          { cwd: projectRoot, timeout: 10000 },
        );
      } catch { /* best-effort commit */ }
    }
  }

  return { finalized };
}
