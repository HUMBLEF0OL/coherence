/**
 * v1.0.1 M1 — embedded-version-constant scanner.
 *
 * Closes the bug class behind v1.0.1 Fix 2 (BUG-V1.0-C):
 * `DEFAULT_PLUGIN_VERSION = '0.4.0'` was hardcoded in
 * `src/state/consent.ts` and missed by the v1.0 release pipeline
 * because `assertVersionSync` only inspected three top-level sources
 * (package.json, .claude-plugin/plugin.json, src/state/init.ts).
 *
 * The scanner walks `src/**\/*.ts` and flags every SemVer-shaped string
 * literal on a line that also references an identifier containing
 * `version` (case-insensitive). False positives are surfaced for
 * review rather than suppressed — over-reporting is preferable to
 * under-reporting in a release-gate scanner.
 *
 * Lives under `scripts/lib/` so it can be imported by tests without
 * triggering `release-ga.mjs`'s top-level CLI side effects.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SEMVER_LITERAL_RE = /['"](\d+\.\d+\.\d+(?:[-+][\w.-]+)?)['"]/g;
// Match `version` (case-insensitive) ANYWHERE on the line — includes
// bare `version`, `pluginVersion`, `versionPair`, `_VERSION_CONST`, etc.
// Intentionally broad: false positives produce a manual-review prompt
// rather than under-reporting a real drift.
const VERSION_CONTEXT_RE = /version/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.next']);

function walkTsFiles(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkTsFiles(full, acc);
    else if (st.isFile() && name.endsWith('.ts') && !name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

/**
 * Return every embedded SemVer literal in `srcRoot` that does NOT match
 * `canonicalVersion`. Each finding is `{ file, line, snippet, value }`.
 *
 * Heuristic: a candidate line must contain BOTH a SemVer-shaped string
 * literal AND an identifier substring containing `version` so we don't
 * flag every dep version pin or unrelated literal in the codebase.
 */
export function scanEmbeddedVersions(srcRoot, canonicalVersion) {
  const findings = [];
  for (const file of walkTsFiles(srcRoot)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = line.trimStart();
      // Skip pure comment lines — they document, they don't bind values.
      if (stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('/*')) continue;
      // Reset regex state (it's `g`-flagged).
      SEMVER_LITERAL_RE.lastIndex = 0;
      let m;
      while ((m = SEMVER_LITERAL_RE.exec(line)) !== null) {
        const value = m[1];
        if (value === canonicalVersion) continue;
        if (!VERSION_CONTEXT_RE.test(line)) continue;
        findings.push({
          file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
          line: i + 1,
          snippet: line.trim(),
          value,
        });
      }
    }
  }
  return findings;
}

/**
 * Source files that legitimately reference an OLDER version string
 * (e.g. migration helpers, prior-version tests, audit-history docs).
 * Add entries here only when manual review confirms the reference is
 * intentional and won't drift with future bumps. Entries use the
 * `<relative-path>:<line>` form.
 */
export const EMBEDDED_VERSION_ALLOWLIST = new Set([
  // Defensive sentinel — `pkg.version ?? '0.0.0'` lets parseMajor fall
  // through to 0 when package.json is missing the version field.
  // Not a version-drift bug; the literal is intentionally != canonical.
  'src/commands/recover.ts:49',
]);
