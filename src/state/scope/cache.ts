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

export function emptyScopeCache(): ScopeCacheFile {
  return { schema_version: 3, generated_at: nowIsoUtc(), entries: {} };
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

/** True if any ancestor in `entry.ancestor_chain` no longer matches its recorded mtime. */
export function isStale(entry: ScopeCacheEntry): boolean {
  for (const ref of entry.ancestor_chain) {
    if (!existsSync(ref.file)) return true;
    try {
      const st = statSync(ref.file);
      if (st.mtimeMs !== ref.mtimeMs) return true;
    } catch {
      return true;
    }
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
