/**
 * /coherence:recover — clear quarantine, reset locks, drop progress files,
 * remove auto-disable sentinel (NOT manual DISABLED).
 * FR-FAILURE-7
 *
 * v0.3 amendment (DD-095 amended under DD-118): when called with an explicit
 * `target` version whose major component differs from the current major, the
 * command refuses. Cross-major-version rollback is not supported — re-install
 * the target version manually instead. Within-major-version rollback paths are
 * unchanged.
 */
import { existsSync, readdirSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sentinels } from '../state/sentinels.js';
import { lockManager } from '../state/locks.js';

export interface RecoverResult {
  actions: string[];
  refusedCrossMajor?: boolean;
}

export interface RecoverOptions {
  /**
   * Optional rollback target (e.g. `v0.2.0`, `0.3.0-pre.0`). Leading `v` is
   * tolerated. When provided, a major-version mismatch against the running
   * plugin's major aborts the recover with a clear message.
   */
  target?: string;
}

const REFUSE_CROSS_MAJOR_MESSAGE =
  'cohrence does not roll back across major versions; re-install the target version manually';

interface PackageJson {
  version?: string;
}

let _currentMajor: number | null = null;

function readCurrentMajor(): number {
  if (_currentMajor !== null) return _currentMajor;
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json',
  );
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
    _currentMajor = parseMajor(pkg.version ?? '0.0.0') ?? 0;
  } catch {
    _currentMajor = 0;
  }
  return _currentMajor;
}

function parseMajor(version: string): number | null {
  const trimmed = version.replace(/^v/, '').trim();
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(trimmed);
  if (!m) return null;
  // For 0.x.y plugins (still pre-1.0), the *minor* component carries the
  // breaking-change semantics — i.e. v0.2 → v0.3 is a major bump in this
  // project's versioning. Treat the major-version key as `major.minor` joined.
  return Number(m[1]) * 1000 + Number(m[2]);
}

/** Test helper: clear the cached current-major so a fresh package.json read happens. */
export function _resetRecoverVersionCache(): void {
  _currentMajor = null;
}

// eslint-disable-next-line @typescript-eslint/require-await -- async public API
export async function runRecover(
  coherenceDir: string,
  options: RecoverOptions = {},
): Promise<RecoverResult> {
  const actions: string[] = [];

  if (options.target) {
    const targetMajor = parseMajor(options.target);
    const currentMajor = readCurrentMajor();
    if (targetMajor !== null && targetMajor !== currentMajor) {
      return {
        actions: [REFUSE_CROSS_MAJOR_MESSAGE],
        refusedCrossMajor: true,
      };
    }
  }

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
