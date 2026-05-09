/**
 * Git adapter — shell out to git CLI.
 * D-4, NFR-COMPAT-1..2, TS-6 §6.4
 * Pre-flight: refuse MERGE_HEAD, CHERRY_PICK_HEAD, REBASE_HEAD; warn on detached HEAD.
 * Never git add . — only explicit doc paths.
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

export type PreflightResult =
  | { ok: true; warning?: string }
  | { ok: false; reason: string };

export interface CommitResult {
  ok: boolean;
  sha: string | null;
  error: string | null;
}

/** Check for in-progress git operations that block committing. */
export function preflight(projectRoot: string): PreflightResult {
  const gitDir = path.join(projectRoot, '.git');

  if (existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
    return { ok: false, reason: 'Merge in progress — resolve merge before running coherence' };
  }
  if (existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) {
    return { ok: false, reason: 'Cherry-pick in progress — complete it first' };
  }
  if (existsSync(path.join(gitDir, 'REBASE_HEAD')) ||
      existsSync(path.join(gitDir, 'rebase-apply')) ||
      existsSync(path.join(gitDir, 'rebase-merge'))) {
    return { ok: false, reason: 'Rebase in progress — complete it first' };
  }

  // Detached HEAD: warn but proceed
  try {
    const headRef = execFileSync('git', ['symbolic-ref', 'HEAD'], {
      cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    if (!headRef.startsWith('refs/heads/')) {
      return { ok: true, warning: 'Detached HEAD — commit will be made but no branch is updated' };
    }
  } catch {
    return { ok: true, warning: 'Could not determine HEAD ref — proceeding anyway' };
  }

  return { ok: true };
}

/**
 * Check if targeted doc paths have unrelated working-tree changes.
 * Returns the list of paths that have uncommitted changes.
 */
export function checkUnrelatedChanges(
  projectRoot: string,
  docPaths: string[],
): string[] {
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--', ...docPaths], {
      cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();

    return status
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => l.slice(3).trim());
  } catch {
    return [];
  }
}

/**
 * Apply a unified diff to the working tree via git apply.
 */
export function applyPatch(projectRoot: string, diffContent: string): boolean {
  try {
    execFileSync('git', ['apply', '--whitespace=fix', '-'], {
      cwd: projectRoot,
      input: diffContent,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Stage specific file paths (never git add .).
 */
export function stageFiles(projectRoot: string, filePaths: string[]): boolean {
  try {
    execFileSync('git', ['add', '--', ...filePaths], {
      cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a commit with the given message.
 * On failure: reset HEAD and checkout the files (no partial commit).
 */
export function createCommit(
  projectRoot: string,
  message: string,
  filePaths: string[],
): CommitResult {
  try {
    execFileSync('git', ['commit', '--no-gpg-sign', '-m', message], {
      cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
    });

    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();

    return { ok: true, sha, error: null };
  } catch (err) {
    // Rollback: reset and checkout
    try {
      execFileSync('git', ['reset', 'HEAD', '--', ...filePaths], {
        cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
      });
      execFileSync('git', ['checkout', '--', ...filePaths], {
        cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch { /* best-effort rollback */ }

    return {
      ok: false,
      sha: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get the current HEAD SHA for reference in coherence-log.
 */
export function getHeadSha(projectRoot: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
  } catch {
    return null;
  }
}
