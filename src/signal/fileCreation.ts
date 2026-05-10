/**
 * File-creation pattern detector (DD-077, FR-AUTHOR-8/-9).
 *
 * Threshold: 3 files + locality (same directory) + structural similarity
 * Jaccard ≥ 0.8.
 *
 * DD-077 amended: similarity is the MAX of three Jaccard variants:
 *   1. Structural tokens — first 5 non-blank lines tokenised on whitespace
 *      (stable signal independent of variable names).
 *   2. Import set — extension-aware import statement extraction
 *      (`import x from 'y'`, `from y import x`, `require('y')`, `use y::x`,
 *      `#include "y"` etc.). Catches "three files that wrap the same
 *      dependency set" — the classic skill/agent codegen pattern.
 *   3. Heading hierarchy — ATX-style heading paths in Markdown (and
 *      similar #-prefixed structural lines in restructured text). Catches
 *      "three skill / spec docs with the same outline" — the canonical
 *      codegen-doc pattern that import-set + structural variants miss.
 *
 * All three variants are computed in their own token spaces; callers feed
 * parallel session-scoped maps via fileLocalityCache.
 */
import { signatureHash } from './signatureHash.js';
import { createHash } from 'crypto';
import type { SignalCache } from './signalCache.js';
import path from 'path';

export interface FileDetectionResult {
  signature_hash: string;
  directory_hash: string;
  fired: boolean;
  occurrences_in_locality: number;
  jaccard_max: number;
  /** DD-077 amended: which variant won the max. Useful for telemetry. */
  jaccard_variant?: 'structural' | 'import_set' | 'heading_hierarchy';
}

export const DEFAULT_FILE_CREATION_COUNT = 3;
export const DEFAULT_FILE_CREATION_JACCARD = 0.8;

export interface FileDetectionConfig {
  count?: number;
  jaccard?: number;
}

/** Tokenise the first 5 non-blank lines on whitespace; lowercase. */
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
 * Extract the set of imported module names from `content`, dispatched by
 * file extension. Returns an empty set for unknown extensions or files
 * with no imports — the caller will then rely on `structuralTokens` only.
 *
 * Exported (audit follow-up) so the session-scoped fileLocalityCache can
 * remember import sets per file and the detector can compare variants in
 * matching token spaces. Without this, comparing self-imports against
 * other-file structural tokens is a token-space mismatch (always 0).
 *
 * Extension dispatch table is intentionally narrow; add to it as new
 * languages produce false-negative misses in calibration.
 */
export function extractImportSet(filePath: string, content: string): Set<string> {
  const ext = path.extname(filePath).toLowerCase();
  const out = new Set<string>();
  // Cap content scan to first 8 KB — imports are conventionally at the
  // top of the file and we don't want pathological large fixtures to
  // dominate the detection budget.
  const head = content.slice(0, 8192);

  // JS/TS family
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
    // ESM: import ... from 'x' / import 'x'
    for (const m of head.matchAll(/\bimport\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"\n]+)['"]/g)) {
      out.add(m[1].toLowerCase());
    }
    // CJS: require('x')
    for (const m of head.matchAll(/\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g)) {
      out.add(m[1].toLowerCase());
    }
    // Dynamic import
    for (const m of head.matchAll(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g)) {
      out.add(m[1].toLowerCase());
    }
    return out;
  }

  // Python
  if (ext === '.py') {
    for (const m of head.matchAll(/^\s*from\s+([\w.]+)\s+import\b/gm)) {
      out.add(m[1].toLowerCase());
    }
    for (const m of head.matchAll(/^\s*import\s+([\w.,\s]+)$/gm)) {
      for (const name of m[1].split(',')) {
        const t = name.trim().split(/\s+as\s+/i)[0].trim().toLowerCase();
        if (t) out.add(t);
      }
    }
    return out;
  }

  // Rust
  if (ext === '.rs') {
    for (const m of head.matchAll(/^\s*use\s+([\w:]+)/gm)) {
      out.add(m[1].toLowerCase());
    }
    return out;
  }

  // Go
  if (ext === '.go') {
    // Single-line + grouped import blocks.
    for (const m of head.matchAll(/^\s*import\s+(?:\(([^)]*)\)|"([^"]+)")/gm)) {
      const block = m[1] ?? '';
      if (m[2]) out.add(m[2].toLowerCase());
      for (const im of block.matchAll(/"([^"]+)"/g)) {
        out.add(im[1].toLowerCase());
      }
    }
    return out;
  }

  // C/C++/ObjC
  if (ext === '.c' || ext === '.h' || ext === '.cc' || ext === '.cpp' || ext === '.hpp' || ext === '.m' || ext === '.mm') {
    for (const m of head.matchAll(/^\s*#\s*include\s+[<"]([^>"\n]+)[>"]/gm)) {
      out.add(m[1].toLowerCase());
    }
    return out;
  }

  // Java/Kotlin/Scala
  if (ext === '.java' || ext === '.kt' || ext === '.kts' || ext === '.scala') {
    for (const m of head.matchAll(/^\s*import\s+([\w.*]+)/gm)) {
      out.add(m[1].toLowerCase());
    }
    return out;
  }

  // Ruby
  if (ext === '.rb') {
    for (const m of head.matchAll(/^\s*require(?:_relative)?\s+['"]([^'"\n]+)['"]/gm)) {
      out.add(m[1].toLowerCase());
    }
    return out;
  }

  return out;
}

/**
 * Extract the heading-hierarchy "path set" from a Markdown / RST document.
 * Each element is a slash-joined path of ancestor heading slugs ending at
 * the heading itself (e.g. `usage/installation/macos`). Two skill or spec
 * docs with identical outlines but different prose collide on their full
 * heading-path set; the import + structural variants both miss this case.
 *
 * Returns an empty set for non-markdown extensions or files with no
 * detectable headings.
 *
 * Caps content scan at 16 KB to keep the detector under the per-call
 * budget; canonical skill/spec docs put their full outline near the top.
 */
export function extractHeadingHierarchy(filePath: string, content: string): Set<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.md' && ext !== '.markdown' && ext !== '.mdx' && ext !== '.rst') {
    return new Set();
  }
  const head = content.slice(0, 16384);
  const out = new Set<string>();
  const stack: string[] = []; // slugs at depth 1..N

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[`*_~]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  // ATX headings (`# ...` through `###### ...`). RST `=====`/`-----`
  // underline syntax is matched on the previous non-blank line if both
  // are present; for cost we approximate RST by accepting standalone
  // `=====`/`-----` runs after a text line.
  const lines = head.split(/\r?\n/);
  let prevText: string | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const atx = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) {
      const depth = atx[1].length;
      const slug = slugify(atx[2]);
      if (slug.length === 0) {
        prevText = line;
        continue;
      }
      while (stack.length >= depth) stack.pop();
      stack.push(slug);
      out.add(stack.join('/'));
      prevText = null;
      continue;
    }
    if (ext === '.rst' && /^[=\-~^"+*#]{3,}\s*$/.test(line) && prevText) {
      const slug = slugify(prevText);
      const depth = line.startsWith('=') ? 1 : line.startsWith('-') ? 2 : 3;
      while (stack.length >= depth) stack.pop();
      stack.push(slug);
      out.add(stack.join('/'));
      prevText = null;
      continue;
    }
    prevText = line.length > 0 ? line : null;
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function detectFileCreation(
  cache: SignalCache,
  filePath: string,
  content: string,
  recentTokenSets: Map<string, Set<string>>,
  cfg: FileDetectionConfig = {},
  recentImportSets?: Map<string, Set<string>>,
  recentHeadingSets?: Map<string, Set<string>>,
): FileDetectionResult {
  const count = cfg.count ?? DEFAULT_FILE_CREATION_COUNT;
  const jaccardMin = cfg.jaccard ?? DEFAULT_FILE_CREATION_JACCARD;

  const tokens = structuralTokens(content);
  const imports = extractImportSet(filePath, content);
  const headings = extractHeadingHierarchy(filePath, content);
  // Hash the *token set* so structurally-similar files collapse onto the same
  // signature regardless of identifier renames. The import set + heading set,
  // when present, are folded in so renames don't artificially split the bucket.
  const sigSeed =
    Array.from(tokens).sort().join(' ') +
    (imports.size > 0 ? ' ::imports::' + Array.from(imports).sort().join(' ') : '') +
    (headings.size > 0 ? ' ::headings::' + Array.from(headings).sort().join(' ') : '');
  const tokenSig = signatureHash('file_write_path', sigSeed);

  const dir = path.dirname(filePath).replace(/\\/g, '/');
  const dirHash = createHash('sha256').update(dir).digest('hex').slice(0, 12);

  // Count items in the same locality whose Jaccard overlap is ≥ threshold.
  // DD-077 amended: take MAX(structural, import-set, heading-hierarchy)
  // Jaccard per pair, comparing each variant in its own token space.
  // Each parallel `recent*Sets` map is optional; when omitted the detector
  // falls back to whichever variants are available.
  let jaccardMax = 0;
  let jaccardVariant: 'structural' | 'import_set' | 'heading_hierarchy' | undefined;
  let localityHits = 0;
  for (const [otherPath, otherTokens] of recentTokenSets.entries()) {
    if (otherPath === filePath) continue;
    const otherDir = path.dirname(otherPath).replace(/\\/g, '/');
    if (otherDir !== dir) continue;
    const jStruct = jaccard(tokens, otherTokens);
    const otherImports = recentImportSets?.get(otherPath);
    const jImport =
      imports.size > 0 && otherImports && otherImports.size > 0
        ? jaccard(imports, otherImports)
        : 0;
    const otherHeadings = recentHeadingSets?.get(otherPath);
    const jHead =
      headings.size > 0 && otherHeadings && otherHeadings.size > 0
        ? jaccard(headings, otherHeadings)
        : 0;
    const j = Math.max(jStruct, jImport, jHead);
    if (j > jaccardMax) {
      jaccardMax = j;
      jaccardVariant =
        jHead === j && jHead > 0
          ? 'heading_hierarchy'
          : jImport === j && jImport > jStruct
            ? 'import_set'
            : 'structural';
    }
    if (j >= jaccardMin) localityHits += 1;
  }

  // Also factor in pre-existing items in cache with same dirHash.
  const cachedHits = cache.buckets.file_creation.items.filter(
    (i) => i.directory_hash === dirHash,
  );
  const totalOccurrences = localityHits + cachedHits.length + 1;

  return {
    signature_hash: tokenSig,
    directory_hash: dirHash,
    occurrences_in_locality: totalOccurrences,
    jaccard_max: jaccardMax,
    fired: totalOccurrences >= count && jaccardMax >= jaccardMin,
    ...(jaccardVariant ? { jaccard_variant: jaccardVariant } : {}),
  };
}
