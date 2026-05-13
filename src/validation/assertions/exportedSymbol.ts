/**
 * v1.0.1 LIM-1 closure (Item D) — `symbol_exported` assertion engine.
 *
 * `symbol_exists` (the existing v1.0 engine) does a corpus-grep: a symbol
 * is "present" if any project source file contains its literal text. That
 * misses the realistic rename-with-stale-callers drift: when a function
 * is renamed in its source module but stale callers still text-mention
 * the old name (a TS2305 build break), the old name still passes
 * `symbol_exists`. The mcp-sentry fixture's `gradeBelow` →
 * `isBelowThreshold` rename is the canonical example.
 *
 * `symbol_exported` answers a stricter question: does the symbol appear
 * in an EXPORT declaration anywhere in the project? Stale `import { X }`
 * statements no longer count — only real `export ... X ...` declarations
 * do. Renamed functions are caught immediately.
 *
 * v1.0.1 scope: TypeScript (and JavaScript, since the same patterns
 * apply). Other languages return `ignored: 'unsupported_lang'` and pass.
 * v1.1 adds Python/Go/Rust/Java.
 *
 * Parameter form: `symbol_exported:<name>[:<lang>]` (same shape as
 * `symbol_exists`). The `:<lang>` suffix is optional — falls back to
 * project-root manifest detection.
 */
import fastGlob from 'fast-glob';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import type { AssertionInput, AssertionOutcome } from './textPatterns.js';

// Languages this engine currently understands. Symbols requested in
// other languages return `ignored: 'unsupported_lang'`.
const SUPPORTED_LANGS = ['typescript', 'javascript'] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

// All known languages — these still parse but the engine declines to
// resolve. Aligned with codebaseLinked.ts so users can mix the two
// engines without surprises.
const KNOWN_LANGS = [
  'typescript', 'javascript', 'python', 'go', 'rust', 'java',
] as const;
type KnownLang = (typeof KNOWN_LANGS)[number];

const LANG_GLOBS: Record<SupportedLang, string[]> = {
  typescript: ['**/*.ts', '**/*.tsx'],
  javascript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
};

const IGNORE_GLOBS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.cache/**',
  'coverage/**',
  '**/*.d.ts',
];

const BATCH = 10;

/**
 * Per-process file-list cache, keyed by (projectRoot, lang). Mirrors the
 * codebaseLinked.ts pattern so identical-input runs don't re-glob.
 */
let projectRootForCache = '';
const fileListCache = new Map<SupportedLang, string[]>();

/** Test helper — reset the per-process cache between fixtures. */
export function resetExportIndexCache(): void {
  fileListCache.clear();
  projectRootForCache = '';
}

function isSupportedLang(s: string): s is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(s);
}

function isKnownLang(s: string): s is KnownLang {
  return (KNOWN_LANGS as readonly string[]).includes(s);
}

function detectLang(projectRoot: string): KnownLang {
  if (existsSync(path.join(projectRoot, 'tsconfig.json'))) return 'typescript';
  if (existsSync(path.join(projectRoot, 'package.json'))) return 'javascript';
  if (existsSync(path.join(projectRoot, 'pyproject.toml'))) return 'python';
  if (existsSync(path.join(projectRoot, 'go.mod'))) return 'go';
  if (existsSync(path.join(projectRoot, 'Cargo.toml'))) return 'rust';
  return 'typescript';
}

/**
 * Build a Set of every symbol that appears in an `export ...` declaration
 * in the given TypeScript/JavaScript source text. Patterns covered:
 *
 *   - `export function|const|let|var|class|interface|type|enum NAME`
 *   - `export default (function|class) NAME`
 *   - `export { A, B as C, D } [from '...']`  — captures A, C, D
 *
 * Caveats (residual limitations — closed by future work):
 *   - **Re-exports are trusted at face value.** `export { multiply }
 *     from './calc.js'` adds `multiply` to the export set even if
 *     `./calc.js` no longer exports it. Catching broken re-exports
 *     requires transitive resolution (load the cited module, check
 *     its own export set, follow chains, detect cycles). v1.1 will
 *     fold this in via a `resolveTransitiveExports` pass.
 *   - **Line comments are stripped; block comments are not.** Block
 *     comments containing `export ...` strings would over-report.
 *     Acceptable for a conservative drift check.
 *   - **`export * from '...'` is not resolved.** Only directly-named
 *     symbols are captured.
 *
 * What this engine catches today (v1.0.1):
 *   - The canonical LIM-1 fixture: rename where a stale CALLER still
 *     `import { oldName }` from the renamed module. The old name is
 *     not in any `export` declaration anywhere → fails.
 *   - Rename where stale TESTS reference the old name.
 *   - Documentation that references a renamed-and-removed symbol.
 */
export function extractExportedSymbols(source: string): Set<string> {
  const out = new Set<string>();
  // Strip line comments. Block comments are left in — the patterns we
  // care about are unlikely to appear textually inside block comments.
  const stripped = source.replace(/\/\/[^\n]*/g, '');

  // 1. `export function|const|let|var|class|interface|type|enum NAME`
  //    Also covers `export async function NAME`.
  const declRe =
    /\bexport\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(stripped)) !== null) {
    out.add(m[1]);
  }

  // 2. `export default function|class NAME` (the name is optional in TS;
  //    when present we capture it for cross-reference).
  const defaultRe = /\bexport\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((m = defaultRe.exec(stripped)) !== null) {
    out.add(m[1]);
  }

  // 3. `export { A, B as C, D } [from '...']`
  //    The block can span multiple lines.
  const blockRe = /\bexport\s*\{([^}]*)\}/g;
  while ((m = blockRe.exec(stripped)) !== null) {
    const inner = m[1];
    for (const part of inner.split(',')) {
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      // Forms: `A`, `A as B`, `default as A`, `type A`
      const asMatch = /^(?:type\s+)?\S+\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(trimmed);
      if (asMatch) {
        out.add(asMatch[1]);
        continue;
      }
      const bare = /^(?:type\s+)?([A-Za-z_$][A-Za-z0-9_$]*)$/.exec(trimmed);
      if (bare) out.add(bare[1]);
    }
  }
  return out;
}

export async function symbol_exported(
  _input: AssertionInput,
  param: string | undefined,
  opts: { projectRoot: string },
): Promise<AssertionOutcome> {
  if (!param) return { passed: false, message: 'symbol_exported: missing symbol param' };

  let symbol: string;
  let requested: string;
  const lastColon = param.lastIndexOf(':');
  if (lastColon !== -1 && isKnownLang(param.slice(lastColon + 1))) {
    symbol = param.slice(0, lastColon);
    requested = param.slice(lastColon + 1);
  } else {
    symbol = param;
    requested = detectLang(opts.projectRoot);
  }
  if (symbol.length === 0) {
    return { passed: false, message: `symbol_exported: empty symbol in '${param}'` };
  }

  if (!isSupportedLang(requested)) {
    // Known language but not yet implemented — pass with `ignored` so
    // users get a clear signal rather than a misleading verdict.
    return {
      passed: true,
      ignored: 'unsupported_lang',
      message: `symbol_exported: language '${requested}' not yet supported in v1.0.1 (TypeScript/JavaScript only)`,
    };
  }

  if (projectRootForCache !== opts.projectRoot) {
    fileListCache.clear();
    projectRootForCache = opts.projectRoot;
  }

  let files = fileListCache.get(requested);
  if (!files) {
    files = await fastGlob(LANG_GLOBS[requested], {
      cwd: opts.projectRoot,
      absolute: true,
      ignore: IGNORE_GLOBS,
      onlyFiles: true,
      followSymbolicLinks: false,
    });
    fileListCache.set(requested, files);
  }

  // Per-file scan with short-circuit on first match.
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (f) => {
        try {
          const content = await readFile(f, 'utf8');
          // Cheap skip: if the symbol text is nowhere in the file, no
          // need to run the regex parser.
          if (!content.includes(symbol)) return false;
          const exports = extractExportedSymbols(content);
          return exports.has(symbol);
        } catch {
          return false;
        }
      }),
    );
    if (results.some(Boolean)) return { passed: true };
  }

  return {
    passed: false,
    message:
      `symbol_exported: '${symbol}' not found in any export declaration ` +
      `across ${requested} source files under ${opts.projectRoot}. ` +
      `(Compare with symbol_exists, which would pass if any stale ` +
      `caller still text-mentions '${symbol}'.)`,
  };
}
