/**
 * Revert detection: scan [coherence] commits for ≥80% line removals (DD-035).
 */
import { execSync } from 'child_process';

export interface RevertEvent {
  commit: string;
  sectionRef: string;
  lineRemovedPct: number;
}

const REVERT_THRESHOLD_PCT = 80;

export function detectReverts(
  projectRoot: string,
  since?: string,
): RevertEvent[] {
  const events: RevertEvent[] = [];

  let log: string;
  try {
    const sinceArg = since ? `--since="${since}"` : '-30';
    log = execSync(`git log ${sinceArg} --oneline --format="%H %s"`, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
    });
  } catch {
    return events;
  }

  const commits = log
    .split('\n')
    .filter((l) => l.includes('[coherence]'));

  for (const commitLine of commits) {
    const hash = commitLine.split(' ')[0];
    if (!hash) continue;

    try {
      const stat = execSync(`git diff-tree --no-commit-id -r --numstat ${hash}`, {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 5000,
      });

      for (const line of stat.split('\n').filter(Boolean)) {
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const added = parseInt(parts[0] ?? '0', 10);
        const removed = parseInt(parts[1] ?? '0', 10);
        const total = added + removed;
        if (total === 0) continue;
        const removedPct = (removed / total) * 100;
        if (removedPct >= REVERT_THRESHOLD_PCT) {
          events.push({ commit: hash, sectionRef: parts[2] ?? '', lineRemovedPct: removedPct });
        }
      }
    } catch { /* skip this commit */ }
  }

  return events;
}
