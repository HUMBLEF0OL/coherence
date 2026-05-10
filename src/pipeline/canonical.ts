/**
 * Canonical Selection Algorithm.
 * FR-STOP-14, TS-4 §4.11, DD-015/-016/-018/-028
 */
import type { SectionRef, NormalizedPath } from '../types/index.js';

export interface SectionCandidate {
  sectionRef: SectionRef;
  path: NormalizedPath;
  declared_canonical?: boolean;
}

/**
 * Compute the deepest common ancestor directory of a set of paths.
 * e.g. ['docs/api.md', 'docs/guide.md', 'src/index.ts'] → 'docs' (shared prefix of docs/)
 * Operates on the directory portions of the paths.
 */
export function deepestCommonAncestor(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) {
    const p = paths[0];
    const idx = p.lastIndexOf('/');
    return idx > 0 ? p.slice(0, idx) : '';
  }

  const dirParts = paths.map((p) => {
    const idx = p.lastIndexOf('/');
    return idx > 0 ? p.slice(0, idx).split('/') : [];
  });

  const shortest = dirParts.reduce(
    (acc, parts) => (parts.length < acc.length ? parts : acc),
    dirParts[0],
  );

  const common: string[] = [];
  for (let i = 0; i < shortest.length; i++) {
    if (dirParts.every((parts) => parts[i] === shortest[i])) {
      common.push(shortest[i]);
    } else {
      break;
    }
  }
  return common.join('/');
}

/**
 * DD-028: Filter candidates to those at or below the deepest common ancestor.
 * If no candidates survive, return all (no filtering).
 */
export function filterAtOrBelowAncestor(
  candidates: SectionCandidate[],
  triggeringFiles: string[],
): SectionCandidate[] {
  const ancestor = deepestCommonAncestor(triggeringFiles);
  if (!ancestor) return candidates;

  const filtered = candidates.filter(
    (c) => c.path === ancestor || c.path.startsWith(ancestor + '/'),
  );
  return filtered.length > 0 ? filtered : candidates;
}

/**
 * DD-018: Nearest-wins — prefer the candidate whose path is closest to the
 * triggering files (shortest Levenshtein-path distance, approximated by
 * shared directory prefix length).
 */
function sharedPrefixLength(a: string, b: string): number {
  const partsA = a.split('/');
  const partsB = b.split('/');
  let shared = 0;
  const len = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    if (partsA[i] === partsB[i]) shared++;
    else break;
  }
  return shared;
}

function nearestToTriggers(
  candidates: SectionCandidate[],
  triggeringFiles: string[],
): SectionCandidate[] {
  if (triggeringFiles.length === 0) return candidates;

  const scores = candidates.map((c) => {
    const best = triggeringFiles.reduce(
      (max, t) => Math.max(max, sharedPrefixLength(c.path, t)),
      0,
    );
    return { candidate: c, score: best };
  });

  const maxScore = Math.max(...scores.map((s) => s.score));
  return scores.filter((s) => s.score === maxScore).map((s) => s.candidate);
}

/**
 * DD-016: Depth-score tiebreak — fewest '/' separators wins (shallowest path).
 */
function shallowest(candidates: SectionCandidate[]): SectionCandidate[] {
  const depths = candidates.map((c) => ({
    candidate: c,
    depth: c.path.split('/').length,
  }));
  const minDepth = Math.min(...depths.map((d) => d.depth));
  return depths.filter((d) => d.depth === minDepth).map((d) => d.candidate);
}

/**
 * Lex-path final tiebreak — ascending lexicographic sort, first wins.
 */
function lexFirst(candidates: SectionCandidate[]): SectionCandidate {
  return candidates.slice().sort((a, b) => a.path.localeCompare(b.path))[0];
}

/**
 * Full Canonical Selection Algorithm.
 * Returns the selected canonical and the demoted candidates (those that were
 * declared_canonical but lost the tiebreak).
 */
export function selectCanonical(
  candidates: SectionCandidate[],
  triggeringFiles: string[],
): { canonical: SectionCandidate; demoted: SectionCandidate[] } {
  if (candidates.length === 0) {
    throw new Error('selectCanonical: no candidates');
  }

  // Rule 2: Declared-canonical absolute honour
  const declared = candidates.filter((c) => c.declared_canonical);
  if (declared.length === 1) {
    const winner = declared[0];
    const demoted = candidates.filter(
      (c) => c.declared_canonical && c !== winner,
    );
    return { canonical: winner, demoted };
  }

  if (declared.length > 1) {
    // Multiple declared: apply tiebreakers among declared only, demote losers
    const winner = lexFirst(shallowest(nearestToTriggers(declared, triggeringFiles)));
    const demoted = declared.filter((c) => c !== winner);
    return { canonical: winner, demoted };
  }

  // Rules 3–5: No declared canonical — apply filtering + tiebreakers
  // Rule 3a: architecture/spec/design path preference
  const archPreferred = candidates.filter(
    (c) => /architecture|spec|design/i.test(c.path),
  );
  if (archPreferred.length === 1) return { canonical: archPreferred[0], demoted: [] };

  const pool = archPreferred.length > 0 ? archPreferred : candidates;

  // Rule 3b: SKILL.md preference
  const skillPreferred = pool.filter((c) => /SKILL\.md$/i.test(c.path));
  if (skillPreferred.length === 1) return { canonical: skillPreferred[0], demoted: [] };

  // Rule 3c: CLAUDE.md preference
  const pool2 = skillPreferred.length > 0 ? skillPreferred : pool;
  const claudePreferred = pool2.filter((c) => /CLAUDE\.md$/i.test(c.path));
  if (claudePreferred.length === 1) return { canonical: claudePreferred[0], demoted: [] };

  // Rule 3d + DD-028: filter at/below deepest common ancestor
  const pool3 = claudePreferred.length > 0 ? claudePreferred : pool2;
  const filtered = filterAtOrBelowAncestor(pool3, triggeringFiles);

  // DD-018: nearest-wins
  const nearest = nearestToTriggers(filtered, triggeringFiles);

  // DD-016: depth-score tiebreak
  const shallow = shallowest(nearest);

  // Lex-path final tiebreak
  const winner = lexFirst(shallow);
  return { canonical: winner, demoted: [] };
}
