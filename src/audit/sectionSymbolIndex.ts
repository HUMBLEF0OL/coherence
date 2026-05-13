/**
 * Section-symbol-index cache — lazy-built, invalidated on
 * (section-index.json hash, registry-files hash) change. Stored at
 * `.claude/coherence/section-symbol-index.json` (gitignored).
 *
 * v1.0 M3 (TS-6).
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import path from 'path';

export interface SymbolIndex {
  schema_version: 1;
  source_index_hash: string;
  registry_hash: string;
  built_at: string;
  /** Map from sectionRef to list of registry symbols that appear in its content. */
  symbols: Record<string, string[]>;
}

function projectPaths(projectRoot: string): { indexPath: string; cachePath: string; registriesDir: string } {
  return {
    indexPath: path.join(projectRoot, '.claude', 'coherence', 'section-index.json'),
    cachePath: path.join(projectRoot, '.claude', 'coherence', 'section-symbol-index.json'),
    registriesDir: path.join(projectRoot, 'src', 'validation', 'registries'),
  };
}

function hashFile(filePath: string): string {
  if (!existsSync(filePath)) return 'absent';
  const buf = readFileSync(filePath);
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function hashConcatFiles(filePaths: string[]): string {
  const h = createHash('sha256');
  for (const fp of filePaths) {
    if (!existsSync(fp)) continue;
    h.update(readFileSync(fp));
  }
  return h.digest('hex').slice(0, 16);
}

export async function loadOrBuildIndex(projectRoot: string): Promise<SymbolIndex> {
  const { indexPath, cachePath, registriesDir } = projectPaths(projectRoot);
  const sourceIndexHash = hashFile(indexPath);
  const registryFiles = existsSync(registriesDir)
    ? readdirSync(registriesDir)
        .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
        .sort()
        .map((f) => path.join(registriesDir, f))
    : [];
  const registryHash = hashConcatFiles(registryFiles);

  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8')) as SymbolIndex;
      if (
        cached.schema_version === 1 &&
        cached.source_index_hash === sourceIndexHash &&
        cached.registry_hash === registryHash
      ) {
        return cached;
      }
    } catch {
      /* rebuild */
    }
  }

  // Rebuild
  const sections: Array<{ sectionRef: string; content?: string; heading?: string }> = (() => {
    if (!existsSync(indexPath)) return [];
    try {
      const obj = JSON.parse(readFileSync(indexPath, 'utf8')) as {
        entries?: Array<{ sectionRef: string; content?: string; heading?: string }>;
        sections?: Array<{ sectionRef: string; content?: string; heading?: string }>;
      };
      return obj.entries ?? obj.sections ?? [];
    } catch {
      return [];
    }
  })();

  const symbols: Record<string, string[]> = {};
  for (const sec of sections) {
    if (!sec.content) continue;
    const found = extractCodeSymbols(sec.content);
    if (found.size > 0) symbols[sec.sectionRef] = [...found].sort();
  }

  const fresh: SymbolIndex = {
    schema_version: 1,
    source_index_hash: sourceIndexHash,
    registry_hash: registryHash,
    built_at: new Date().toISOString(),
    symbols,
  };
  try {
    const tmp = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, JSON.stringify(fresh, null, 2) + '\n', 'utf8');
    // Use renameSync via fs/promises wouldn't be lazy — keep simple
    const { renameSync } = await import('fs');
    renameSync(tmp, cachePath);
  } catch {
    /* cache write best-effort */
  }
  return fresh;
}

/**
 * Extract code-symbol-like tokens from prose / Markdown / code fences.
 *
 * Rejects:
 *   - identifiers shorter than 4 chars (low signal)
 *   - all-lowercase tokens that look like English words (no _, no digit, no
 *     internal capital). This eliminates the bulk of noise like "section",
 *     "module", "describe", "function", etc.
 *
 * Keeps:
 *   - any identifier with an underscore (snake_case, _private)
 *   - any identifier with a digit (foo2, v1)
 *   - any identifier with internal capitals (camelCase, PascalCase)
 *   - any identifier inside a code-fence-like backtick wrapper
 *
 * This isn't the registry-driven extraction the plan briefly mentioned
 * (registries are import-line tokenizers, not symbol lists), but it produces
 * a useful overlap signal for cross-section consistency pair detection.
 */
export function extractCodeSymbols(content: string): Set<string> {
  const out = new Set<string>();
  // First: anything inside backticks is treated as a symbol if it parses as
  // a single identifier (allows hyphens to bridge multi-word slugs).
  const fenceRe = /`([^`\n]{2,80})`/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(content)) !== null) {
    const inner = m[1].trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*(?:[.][A-Za-z_][A-Za-z0-9_]*)*$/.test(inner) && inner.length >= 4) {
      out.add(inner);
    }
  }
  // Second: bare identifiers with shape markers (underscore, digit, internal capital).
  const idRe = /\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g;
  while ((m = idRe.exec(content)) !== null) {
    const tok = m[0];
    const hasUnderscore = tok.includes('_');
    const hasDigit = /\d/.test(tok);
    const hasInternalCapital = /[a-z][A-Z]/.test(tok) || /^[A-Z][a-z]+[A-Z]/.test(tok);
    if (hasUnderscore || hasDigit || hasInternalCapital) {
      out.add(tok);
    }
  }
  return out;
}

export function computeSymbolSharingPairs(index: SymbolIndex, filterRefs?: ReadonlySet<string>): Array<{ a: string; b: string; shared: string[] }> {
  const refs = Object.keys(index.symbols).filter((r) => !filterRefs || filterRefs.has(r));
  const result: Array<{ a: string; b: string; shared: string[] }> = [];
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i];
      const b = refs[j];
      const setB = new Set(index.symbols[b]);
      const shared = index.symbols[a].filter((s) => setB.has(s));
      if (shared.length >= 3) result.push({ a, b, shared });
    }
  }
  result.sort((x, y) => y.shared.length - x.shared.length);
  return result;
}

void statSync;
