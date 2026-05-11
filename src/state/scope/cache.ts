/**
 * v0.3 scope-cache writer — atomic, mtime-keyed eviction (DD-106).
 *
 * Persists ancestor chains and resolved configs to
 * `.claude/coherence/scope-cache.json` as a sibling of `state-snapshot.json`.
 * Each entry is keyed by the file path being resolved and carries the mtime
 * of every ancestor it consulted; if any ancestor's mtime advances, the
 * entry is invalid on next consultation.
 *
 * Telemetry: emits `scope_cache_miss` sampled 1:100 (deterministic per-process
 * counter; resets at SessionStart). Hit rate is implicit (1 − miss).
 */
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'fs';
import path from 'path';
import { nowIsoUtc } from '../../util/time.js';
import type { StateStore } from '../stateStore.js';

export interface ScopeCacheAncestorRef {
  file: string;
  mtimeMs: number;
}

export interface ScopeCacheEntry {
  /** Absolute path the entry was resolved for. */
  file: string;
  /** Deepest-first ancestor list with mtime fences. */
  ancestor_chain: ScopeCacheAncestorRef[];
  /** Resolved scope config (the result of resolver.resolveScope). */
  extends_resolved: Record<string, unknown>;
  /** Cache write time. */
  written_at: string;
}

export interface ScopeCacheFile {
  /** Plugin-managed sentinel (round-2 C4 two-tier convention). */
  schema_version: 3;
  generated_at: string;
  entries: Record<string, ScopeCacheEntry>;
}

const SCOPE_CACHE_FILE = 'scope-cache.json';

/**
 * Audit-4 B: LRU cap on the scope cache.
 *
 * Without this, a long-running session that touches many distinct files
 * grows `scope-cache.json` unbounded. The 5,000 entry cap mirrors the
 * tombstone LRU (`TOMBSTONE_LRU_CAP`) and matches the per-session work
 * upper bound for any reasonable monorepo session.
 */
export const SCOPE_CACHE_LRU_CAP = 5_000;

export function emptyScopeCache(): ScopeCacheFile {
  return { schema_version: 3, generated_at: nowIsoUtc(), entries: {} };
}

/**
 * Trim the LRU to `cap` entries by dropping the oldest `written_at`
 * entries. Mutates `cache.entries` in place. Audit-4 B.
 */
export function enforceScopeCacheLru(
  cache: ScopeCacheFile,
  cap: number = SCOPE_CACHE_LRU_CAP,
): void {
  const keys = Object.keys(cache.entries);
  if (keys.length <= cap) return;
  const sorted = keys
    .map((k) => ({ k, at: cache.entries[k].written_at }))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  const drop = keys.length - cap;
  for (let i = 0; i < drop; i++) {
    delete cache.entries[sorted[i].k];
  }
}

export async function readScopeCache(store: StateStore): Promise<ScopeCacheFile> {
  const f = await store.read<ScopeCacheFile>(SCOPE_CACHE_FILE);
  return f ?? emptyScopeCache();
}

export async function writeScopeCache(
  store: StateStore,
  cache: ScopeCacheFile,
): Promise<void> {
  await store.write(SCOPE_CACHE_FILE, cache);
}

/**
 * True if any ancestor in `entry.ancestor_chain` no longer matches its
 * recorded mtime, OR if any DIRECTORY between `entry.file` and the
 * shallowest recorded ancestor has acquired a new candidate scope file
 * since the entry was written.
 *
 * Audit-3 S9: the old check only validated EXISTING ancestor mtimes. If a
 * developer added a NEW `CLAUDE.md` higher up the tree after the entry was
 * cached, the resolved chain was missing that file but isStale returned
 * false. The fix walks the candidate directory list from `entry.file`
 * upward and asserts that no scope file exists at a directory that isn't
 * already in `ancestor_chain`.
 */
export function isStale(entry: ScopeCacheEntry): boolean {
  // Existing ancestor mtime check.
  for (const ref of entry.ancestor_chain) {
    if (!existsSync(ref.file)) return true;
    try {
      const st = statSync(ref.file);
      if (st.mtimeMs !== ref.mtimeMs) return true;
    } catch {
      return true;
    }
  }
  // New-ancestor check: walk dirs from entry.file up; if any directory
  // contains CLAUDE.md or coherence/scope.json AND that file is not in
  // ancestor_chain, the cache is stale.
  const recordedFiles = new Set(entry.ancestor_chain.map((r) => r.file));
  let cursor = path.dirname(entry.file);
  const fsRoot = path.parse(cursor).root;
  // Cap the walk to match SCOPE_WALK_MAX_DEPTH = 8 (avoid pathological climbs).
  for (let depth = 0; depth <= 8; depth++) {
    for (const candidateName of ['CLAUDE.md', path.join('coherence', 'scope.json')]) {
      const candidate = path.join(cursor, candidateName);
      if (existsSync(candidate) && !recordedFiles.has(candidate)) {
        return true;
      }
    }
    if (cursor === fsRoot) break;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return false;
}

// ── Telemetry sampling state (per-process counter; reset at SessionStart) ──

let _missCounter = 0;

/** Test/lifecycle hook: reset the per-process scope-cache miss counter. */
export function resetScopeCacheMissCounter(): void {
  _missCounter = 0;
}

/** Telemetry sampling rate — 1:100 deterministic; matches DD-068 conventions. */
export const SCOPE_CACHE_MISS_SAMPLE_RATE = 100;

/** True if this miss should be reported to telemetry (every 100th call). */
export function shouldEmitScopeCacheMiss(): boolean {
  _missCounter += 1;
  return _missCounter % SCOPE_CACHE_MISS_SAMPLE_RATE === 1;
}

/** Test introspection: total misses observed since process start (or last reset). */
export function getScopeCacheMissCount(): number {
  return _missCounter;
}

// ── Direct fs helpers (used by perf tests where StateStore overhead skews timing) ──

export function readScopeCacheDirect(coherenceDir: string): ScopeCacheFile {
  const p = path.join(coherenceDir, SCOPE_CACHE_FILE);
  if (!existsSync(p)) return emptyScopeCache();
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as ScopeCacheFile;
  } catch {
    return emptyScopeCache();
  }
}

export function writeScopeCacheDirect(coherenceDir: string, cache: ScopeCacheFile): void {
  mkdirSync(coherenceDir, { recursive: true });
  const p = path.join(coherenceDir, SCOPE_CACHE_FILE);
  writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}
