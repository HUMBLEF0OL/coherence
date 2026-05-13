/**
 * v1.0 M2 — codebase-linked assertion engines (TS-4 FR-ASSERTS-3).
 *
 * `symbol_exists:<symbol>[:<lang>]` — searches the project tree for the symbol
 * across language-appropriate source files. Per-session file-list cache
 * (pass-2 amendment).
 *
 * `file_exists:<path>` — relative to project root.
 *
 * Uses `fast-glob` for file discovery + parallel batched reads with
 * short-circuit. NOT ripgrep (pass-1 audit amendment).
 */
import fastGlob from 'fast-glob';
import { existsSync } from 'fs';
import { stat, readFile } from 'fs/promises';
import path from 'path';
import type { AssertionInput, AssertionOutcome } from './textPatterns.js';

const SUPPORTED_LANGS = ['typescript', 'javascript', 'python', 'go', 'rust', 'java'] as const;
type SupportedLang = (typeof SUPPORTED_LANGS)[number];

const LANG_GLOBS: Record<SupportedLang, string[]> = {
  typescript: ['**/*.ts', '**/*.tsx'],
  javascript: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
  python: ['**/*.py'],
  go: ['**/*.go'],
  rust: ['**/*.rs'],
  java: ['**/*.java'],
};

const IGNORE_GLOBS = ['node_modules/**', '.git/**', 'dist/**', 'build/**', '.cache/**', 'coverage/**'];

const BATCH = 10;

let projectRootForCache = '';
const fileListCache = new Map<SupportedLang, string[]>();

/** Test helper: clear the per-process file-list cache between fixtures. */
export function resetFileListCache(): void {
  fileListCache.clear();
  projectRootForCache = '';
}

function detectLang(projectRoot: string): SupportedLang {
  // Cheap detection: look for the most common manifest. TS over JS when both
  // tsconfig and package.json exist.
  if (existsSync(path.join(projectRoot, 'tsconfig.json'))) return 'typescript';
  if (existsSync(path.join(projectRoot, 'package.json'))) return 'javascript';
  if (existsSync(path.join(projectRoot, 'pyproject.toml'))) return 'python';
  if (existsSync(path.join(projectRoot, 'go.mod'))) return 'go';
  if (existsSync(path.join(projectRoot, 'Cargo.toml'))) return 'rust';
  return 'typescript';
}

function isSupportedLang(s: string): s is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(s);
}

export async function symbol_exists(
  _input: AssertionInput,
  param: string | undefined,
  opts: { projectRoot: string },
): Promise<AssertionOutcome> {
  if (!param) return { passed: false, message: 'symbol_exists: missing symbol param' };
  let symbol: string;
  let lang: SupportedLang;
  // Parse "symbol:language" — split on LAST colon
  const lastColon = param.lastIndexOf(':');
  if (lastColon !== -1 && isSupportedLang(param.slice(lastColon + 1))) {
    symbol = param.slice(0, lastColon);
    lang = param.slice(lastColon + 1) as SupportedLang;
  } else {
    symbol = param;
    lang = detectLang(opts.projectRoot);
  }
  if (symbol.length === 0) {
    return { passed: false, message: `symbol_exists: empty symbol in '${param}'` };
  }

  if (projectRootForCache !== opts.projectRoot) {
    fileListCache.clear();
    projectRootForCache = opts.projectRoot;
  }

  let files = fileListCache.get(lang);
  if (!files) {
    files = await fastGlob(LANG_GLOBS[lang], {
      cwd: opts.projectRoot,
      absolute: true,
      ignore: IGNORE_GLOBS,
      onlyFiles: true,
      followSymbolicLinks: false,
    });
    fileListCache.set(lang, files);
  }

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((f) => readFile(f, 'utf8').then((c) => c.includes(symbol)).catch(() => false)),
    );
    if (results.some(Boolean)) return { passed: true };
  }
  return { passed: false, message: `symbol_exists: '${symbol}' not found in ${lang} source files under ${opts.projectRoot}` };
}

export async function file_exists(
  _input: AssertionInput,
  param: string | undefined,
  opts: { projectRoot: string },
): Promise<AssertionOutcome> {
  if (!param) return { passed: false, message: 'file_exists: missing path param' };
  const resolved = path.resolve(opts.projectRoot, param);
  const rel = path.relative(opts.projectRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { passed: false, message: `file_exists: path '${param}' escapes project root` };
  }
  try {
    await stat(resolved);
    return { passed: true };
  } catch {
    return { passed: false, message: `file_exists: '${param}' does not exist under project root` };
  }
}

export { SUPPORTED_LANGS };
