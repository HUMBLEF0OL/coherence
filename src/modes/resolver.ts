/**
 * Mode resolver (DD-074).
 *
 * Resolution order: per-doc (exact path) → per-dir (longest prefix) → global.
 * Most-specific-wins. Two equally-specific scopes: lex-first scope wins
 * (deterministic; documented in the v0.2 plan's Open Questions §6).
 *
 * Never bypasses DD-065 quarantine. Author/annotate modes change *which*
 * proposers fire; they never authorise direct writes outside quarantine.
 */
import type { GraduationFile } from '../state/graduation.js';

export type V02Mode = 'observe' | 'annotate' | 'author';

export interface ResolveOptions {
  graduation: GraduationFile;
  /** Project-relative, forward-slash path to resolve. */
  targetPath: string;
}

function normalise(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isDirScope(scopePath: string): boolean {
  return scopePath.endsWith('/') || !scopePath.includes('.');
}

/**
 * Pick the most specific scope mode for `targetPath`. Falls back to
 * `global_mode` if no scope matches.
 */
export function resolveMode({ graduation, targetPath }: ResolveOptions): V02Mode {
  const target = normalise(targetPath);

  // Per-doc exact-path match (highest precedence).
  const exact = graduation.scopes
    .filter((s) => !isDirScope(s.path) && normalise(s.path) === target)
    .sort((a, b) => a.path.localeCompare(b.path));
  if (exact.length > 0) return exact[0].mode;

  // Per-dir longest-prefix match.
  const dirMatches = graduation.scopes
    .filter((s) => isDirScope(s.path))
    .map((s) => ({
      ...s,
      norm: normalise(s.path),
    }))
    .filter((s) => target === s.norm || target.startsWith(s.norm + '/'))
    .sort((a, b) => b.norm.length - a.norm.length || a.path.localeCompare(b.path));
  if (dirMatches.length > 0) return dirMatches[0].mode;

  return graduation.global_mode;
}
