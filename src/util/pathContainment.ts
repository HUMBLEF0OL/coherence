/**
 * v0.3 audit-4 I — shared path-containment helper.
 *
 * Previously duplicated in `src/commands/deAnnotate.ts:isInside` and
 * `src/commands/exportMetrics.ts:isPathInside`. Consolidated here so a
 * single implementation handles the Windows / POSIX edge cases:
 *   - `path.relative` returns an ABSOLUTE path when roots differ on
 *     Windows (`C:\` vs `D:\`); `.startsWith('..')` is therefore not
 *     sufficient on its own.
 *   - Resolved equality (`c === b`) handles the "candidate IS the
 *     boundary" case explicitly so the relative-empty case is unambiguous.
 */
import path from 'path';

export function isPathInside(boundary: string, candidate: string): boolean {
  const b = path.resolve(boundary);
  const c = path.resolve(candidate);
  if (c === b) return true;
  const rel = path.relative(b, c);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}
