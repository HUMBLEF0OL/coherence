/**
 * /coherence:scope-debug — print walked ancestors + resolved scope for a path
 * (DD-097/DD-098/DD-105/DD-106). Read-only.
 *
 * Usage: `/coherence:scope-debug <path>`
 * Output: ancestor chain (deepest first), per-key winning provenance, cache
 *         hit/miss + age. Useful when a developer wants to know which
 *         CLAUDE.md / coherence/scope.json supplied a given key.
 */
import path from 'path';
import { existsSync } from 'fs';
import { walkScopeAncestors } from '../state/scope/walker.js';
import { resolveScope, describeChain } from '../state/scope/resolver.js';
import {
  readScopeCache,
  writeScopeCache,
  isStale,
  shouldEmitScopeCacheMiss,
} from '../state/scope/cache.js';
import type { StateStore } from '../state/stateStore.js';
import { emitMetric } from '../state/metrics.js';
import { nowIsoUtc } from '../util/time.js';

export interface ScopeDebugOptions {
  store: StateStore;
  projectRoot: string;
  filePath: string;
  sessionId: string;
  /** Test injection: skip walks past this depth. */
  maxDepth?: number;
}

export interface ScopeDebugResult {
  /** Path resolved (absolute). */
  file: string;
  ancestors: string[];
  /** Winning value per key + the source file that supplied it. */
  provenance: Record<string, { value: unknown; from: string }>;
  effective: Record<string, unknown>;
  cacheHit: boolean;
  cacheAgeMs: number | null;
  /** True if any ancestor used `extends:`. */
  extendsApplied: boolean;
}

export async function runScopeDebug(
  options: ScopeDebugOptions,
): Promise<ScopeDebugResult> {
  const { store, projectRoot, filePath, sessionId, maxDepth } = options;

  const absFile = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(projectRoot, filePath);

  // Audit-3 S2: refuse paths outside projectRoot. The walker would
  // otherwise statSync every CLAUDE.md / coherence/scope.json above the
  // project (info disclosure: existence + mtime probes outside the repo).
  const projectAbs = path.resolve(projectRoot);
  const rel = path.relative(projectAbs, absFile);
  if (absFile !== projectAbs && (rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new Error(
      `scope-debug: refuses to inspect path outside the project root: ${filePath}`,
    );
  }

  if (!existsSync(absFile)) {
    throw new Error(`scope-debug: path not found: ${filePath}`);
  }

  const cache = await readScopeCache(store);
  const cacheKey = absFile;
  const existing = cache.entries[cacheKey];

  let cacheHit = false;
  let cacheAgeMs: number | null = null;

  if (existing && !isStale(existing)) {
    cacheHit = true;
    cacheAgeMs = Date.now() - new Date(existing.written_at).getTime();
  }

  const ancestors = walkScopeAncestors(
    absFile,
    maxDepth === undefined ? { projectRoot } : { projectRoot, maxDepth },
  );
  const resolved = resolveScope(ancestors);

  if (!cacheHit) {
    cache.entries[cacheKey] = {
      file: absFile,
      ancestor_chain: ancestors.map((a) => ({ file: a.file, mtimeMs: a.mtimeMs })),
      extends_resolved: resolved.effective as unknown as Record<string, unknown>,
      written_at: nowIsoUtc(),
    };
    cache.generated_at = nowIsoUtc();
    await writeScopeCache(store, cache);

    if (shouldEmitScopeCacheMiss()) {
      try {
        await emitMetric(store, {
          event: 'scope_cache_miss',
          session_id: sessionId,
          ancestor_count: ancestors.length,
        });
      } catch {
        /* telemetry non-fatal */
      }
    }
  }

  const provenance: Record<string, { value: unknown; from: string }> = {};
  for (const [key, fromFile] of Object.entries(resolved.provenance)) {
    provenance[key] = {
      value: (resolved.effective as Record<string, unknown>)[key],
      from: path.relative(projectRoot, fromFile).replace(/\\/g, '/'),
    };
  }

  return {
    file: absFile,
    ancestors: describeChain(resolved),
    provenance,
    effective: resolved.effective as unknown as Record<string, unknown>,
    cacheHit,
    cacheAgeMs,
    extendsApplied: resolved.extendsApplied,
  };
}

/** Format a `ScopeDebugResult` for the CLI. */
export function formatScopeDebug(r: ScopeDebugResult): string {
  const lines: string[] = [];
  lines.push(`[coherence] scope-debug: ${path.relative(process.cwd(), r.file).replace(/\\/g, '/')}`);
  lines.push(`  cache: ${r.cacheHit ? `hit (age ${r.cacheAgeMs ?? 0}ms)` : 'miss → repopulated'}`);
  lines.push(`  ancestors (deepest first):`);
  if (r.ancestors.length === 0) {
    lines.push(`    (none)`);
  } else {
    for (const a of r.ancestors) lines.push(`    • ${a}`);
  }
  lines.push(`  resolved keys:`);
  if (Object.keys(r.provenance).length === 0) {
    lines.push(`    (no scope keys merged)`);
  } else {
    for (const [key, info] of Object.entries(r.provenance)) {
      lines.push(`    ${key} = ${JSON.stringify(info.value)}  (from ${info.from})`);
    }
  }
  if (r.extendsApplied) lines.push(`  extends: opted-in by at least one ancestor`);
  return lines.join('\n');
}
