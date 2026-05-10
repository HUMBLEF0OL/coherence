/**
 * v0.3 scope-cache: bounded ancestor walk (DD-097).
 *
 * Given a file path inside a project, walks up the directory tree looking for
 * CLAUDE.md and coherence/scope.json files. Reuses the v0.2 P6 walker
 * primitive (depth cap 8, expanded skipDirs). Returns the ancestors in
 * deepest-first order — the most-specific ancestor leads. The caller (the
 * scope resolver) consumes that ordering for most-specific-wins or
 * `extends:`-merge semantics.
 */
import { existsSync, statSync } from 'fs';
import path from 'path';

/** v0.3 NFR-PERF-N4: walks must short-circuit before they explode. */
export const SCOPE_WALK_MAX_DEPTH = 8;

/** Filenames the walker considers candidates for a scope ancestor. */
export const SCOPE_FILES: readonly string[] = ['CLAUDE.md', path.join('coherence', 'scope.json')];

/**
 * Directory names the walker treats as boundaries — we never walk *into*
 * these for scope discovery, but we do walk *out of* them (a CLAUDE.md inside
 * `node_modules` would be ignored by the runtime hook anyway).
 *
 * Mirrors the v0.2 P6 trickle walker `TRICKLE_SKIP_DIRS` set so behaviour is
 * symmetric across discovery code paths.
 */
export const SCOPE_SKIP_DIRS = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'build',
  '.next',
  '.cache',
  '.idea',
  '.vscode',
]);

export interface ScopeAncestor {
  /** Absolute path to the directory holding the scope file. */
  dir: string;
  /** Absolute path to the scope file itself (CLAUDE.md or coherence/scope.json). */
  file: string;
  /** mtime of the scope file at walk time, for cache eviction. */
  mtimeMs: number;
}

export interface WalkOptions {
  /** Hard repository root — walker never ascends past this. */
  projectRoot: string;
  /** Maximum number of parent dirs to inspect. Defaults to SCOPE_WALK_MAX_DEPTH. */
  maxDepth?: number;
}

/**
 * Walk from `startPath` up to `projectRoot`, collecting any scope files
 * present. Returns ancestors in deepest-first order (closest to the file
 * first). The result excludes scope files inside `SCOPE_SKIP_DIRS` segments —
 * those would never be discovered by the runtime in any case.
 */
export function walkScopeAncestors(
  startPath: string,
  options: WalkOptions,
): ScopeAncestor[] {
  const { projectRoot, maxDepth = SCOPE_WALK_MAX_DEPTH } = options;

  const projectAbs = path.resolve(projectRoot);
  let cursor = path.resolve(path.dirname(startPath));

  const ancestors: ScopeAncestor[] = [];
  let depth = 0;

  while (depth <= maxDepth) {
    if (segmentsCrossSkipDirs(cursor, projectAbs)) {
      break;
    }
    for (const file of SCOPE_FILES) {
      const candidate = path.join(cursor, file);
      if (existsSync(candidate)) {
        try {
          const st = statSync(candidate);
          ancestors.push({ dir: cursor, file: candidate, mtimeMs: st.mtimeMs });
        } catch {
          // Race: file disappeared between existsSync and statSync. Skip.
        }
      }
    }
    if (cursor === projectAbs) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
    depth++;
  }

  return ancestors;
}

/**
 * True if the path segment between `cursor` and `projectAbs` traverses any
 * SCOPE_SKIP_DIRS entry. Lets the walker short-circuit when the start file
 * lives inside `node_modules` or similar — those scopes are not legitimate.
 */
function segmentsCrossSkipDirs(cursor: string, projectAbs: string): boolean {
  if (!cursor.startsWith(projectAbs)) return false;
  const rel = path.relative(projectAbs, cursor);
  if (rel === '' || rel === '.') return false;
  for (const seg of rel.split(path.sep)) {
    if (SCOPE_SKIP_DIRS.has(seg)) return true;
  }
  return false;
}
