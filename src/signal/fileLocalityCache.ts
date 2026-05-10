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
 * Bounded at 256 entries FIFO; oldest paths evicted as new files arrive.
 */

const MAX_ENTRIES = 256;

interface Entry {
  filePath: string;
  tokens: Set<string>;
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
 * Add or refresh `(filePath, tokens(content))` in the locality cache and
 * return the full session map for the detector to consume.
 */
export function rememberFileContent(
  filePath: string,
  content: string,
): Map<string, Set<string>> {
  const tokens = structuralTokens(content);
  const idx = recent.findIndex((e) => e.filePath === filePath);
  if (idx >= 0) {
    recent.splice(idx, 1);
  }
  recent.push({ filePath, tokens });
  while (recent.length > MAX_ENTRIES) recent.shift();

  const map = new Map<string, Set<string>>();
  for (const e of recent) map.set(e.filePath, e.tokens);
  return map;
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
