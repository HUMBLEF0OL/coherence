/**
 * Session-scoped file-locality cache (P2 fix).
 *
 * The persisted `signal-cache.json` stores only signature hashes
 * (privacy-safe), so we cannot reconstruct token sets keyed by file
 * path from it. The file-creation detector's locality check needs a
 * `Map<filePath, Set<tokens>>`. We keep that map in-process for the
 * current session only — never persisted, never crosses session
 * boundaries (NFR-PRIVACY-by-construction).
 *
 * DD-077 amended (audit fix): each entry carries BOTH the structural
 * token set and the import-statement set so the detector can compare
 * variants in matching token spaces. Without the parallel map the
 * import-set Jaccard reduces to comparing module paths against
 * whitespace-tokenised lines (disjoint spaces → always 0).
 *
 * Bounded at 256 entries FIFO; oldest paths evicted as new files arrive.
 */
import { extractImportSet, extractHeadingHierarchy } from './fileCreation.js';

const MAX_ENTRIES = 256;

interface Entry {
  filePath: string;
  tokens: Set<string>;
  imports: Set<string>;
  headings: Set<string>;
}

const recent: Entry[] = [];

/** Compute the structural-token set used by `fileCreation.detectFileCreation`. */
function structuralTokens(content: string): Set<string> {
  const lines = content
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 5);
  const tokens = new Set<string>();
  for (const line of lines) {
    for (const t of line.toLowerCase().split(/\s+/)) {
      if (t.length > 0) tokens.add(t);
    }
  }
  return tokens;
}

/**
 * Add or refresh `(filePath, tokens, imports, headings)` in the locality
 * cache and return the three session-scoped maps for the detector to consume.
 */
export function rememberFileContent(
  filePath: string,
  content: string,
): {
  tokens: Map<string, Set<string>>;
  imports: Map<string, Set<string>>;
  headings: Map<string, Set<string>>;
} {
  const tokens = structuralTokens(content);
  const imports = extractImportSet(filePath, content);
  const headings = extractHeadingHierarchy(filePath, content);
  const idx = recent.findIndex((e) => e.filePath === filePath);
  if (idx >= 0) {
    recent.splice(idx, 1);
  }
  recent.push({ filePath, tokens, imports, headings });
  while (recent.length > MAX_ENTRIES) recent.shift();

  const tokenMap = new Map<string, Set<string>>();
  const importMap = new Map<string, Set<string>>();
  const headingMap = new Map<string, Set<string>>();
  for (const e of recent) {
    tokenMap.set(e.filePath, e.tokens);
    importMap.set(e.filePath, e.imports);
    headingMap.set(e.filePath, e.headings);
  }
  return { tokens: tokenMap, imports: importMap, headings: headingMap };
}

/** Reset the cache (called by SessionStart / SessionEnd to honour
 *  session-scoped semantics). */
export function resetFileLocalityCache(): void {
  recent.length = 0;
}

/** Test/diagnostic accessor. */
export function _peekFileLocalityCache(): ReadonlyArray<Entry> {
  return recent;
}
