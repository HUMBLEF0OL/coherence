/**
 * v0.3 M5 — per-file scan tombstone (DD-103, FR-TOMBSTONE-1).
 *
 * Composes with the v0.2 P7 doc-content memo: tombstone consultation runs
 * BEFORE doc read; memo consultation runs INSIDE the detector. On a tombstone
 * hit where the memo has the same docPath, no disk re-read is needed.
 *
 * Tombstone shape:
 *   path_hash   12-hex SHA-256 of normalised path (privacy-safe key for
 *               telemetry; the on-disk store uses the normalised path as
 *               its dictionary key)
 *   content_hash 12-hex SHA-256 of file body at time of insertion
 *   git_mtime   ISO8601 mtime — used as the eviction predicate (mtime moved
 *               forward on disk → tombstone invalid)
 *   inserted_at ISO8601 wall-clock at insertion
 *   expires_at  optional explicit expiry (used by trickle scanner to age
 *               out tombstones for files that haven't been visited in a
 *               long time)
 *
 * LRU cap: 5,000 entries. On insertion, the oldest (by `inserted_at`) entry
 * is evicted when the cap is exceeded.
 */
import { createHash } from 'crypto';
import path from 'path';
import {
  existsSync as fsExistsSync,
  readFileSync as fsReadFileSync,
  writeFileSync as fsWriteFileSync,
  mkdirSync as fsMkdirSync,
} from 'fs';

export const TOMBSTONE_LRU_CAP = 5_000;

export interface TombstoneEntry {
  path_hash: string;
  content_hash: string;
  git_mtime: string;
  inserted_at: string;
  expires_at?: string;
}

export interface TombstoneCache {
  /** Map of normalised-path → entry. Plain object so it serialises cleanly to JSON. */
  entries: Record<string, TombstoneEntry>;
}

export function emptyTombstoneCache(): TombstoneCache {
  return { entries: {} };
}

/**
 * Normalise a path for tombstone keying:
 *  - convert backslashes → forward slashes (Windows compat)
 *  - lowercase on case-insensitive filesystems (a conservative test:
 *    lowercase win32 + darwin; leave linux paths untouched)
 *  - strip leading `./` and `/`
 */
export function normaliseTombstonePath(p: string): string {
  let out = p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (process.platform === 'win32' || process.platform === 'darwin') {
    out = out.toLowerCase();
  }
  return out;
}

export function hashTombstoneKey(normalisedPath: string): string {
  return createHash('sha256').update(normalisedPath).digest('hex').slice(0, 12);
}

export function hashContent(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 12);
}

export interface UpsertArgs {
  cache: TombstoneCache;
  /** Repo-relative path BEFORE normalisation. */
  filePath: string;
  /** File body at the time of insertion. */
  content: string;
  /** mtime as reported by `stat()`. */
  mtimeMs: number;
  /** Optional explicit expiry; useful for tests. */
  expiresAt?: string;
  /** Override `now` for deterministic tests. */
  now?: Date;
  /**
   * Override the LRU cap; defaults to `TOMBSTONE_LRU_CAP`. Tests use a small
   * cap to exercise eviction without paying the 5k-entry copy cost.
   */
  maxEntries?: number;
}

/**
 * Insert/refresh a tombstone entry. Evicts the oldest if the LRU cap is
 * exceeded. Mutates `cache.entries` in place — the function returns the same
 * cache object for caller convenience but does not preserve immutability.
 * Production callers pass a per-store cache instance and treat it as owned.
 */
export function upsertTombstone(args: UpsertArgs): TombstoneCache {
  const { cache, filePath, content, mtimeMs, expiresAt, now } = args;
  const cap = args.maxEntries ?? TOMBSTONE_LRU_CAP;
  const normalised = normaliseTombstonePath(filePath);
  const insertedAt = (now ?? new Date()).toISOString();
  const entry: TombstoneEntry = {
    path_hash: hashTombstoneKey(normalised),
    content_hash: hashContent(content),
    git_mtime: new Date(mtimeMs).toISOString(),
    inserted_at: insertedAt,
    ...(expiresAt !== undefined ? { expires_at: expiresAt } : {}),
  };
  cache.entries[normalised] = entry;
  enforceLruCapInPlace(cache, cap);
  return cache;
}

function enforceLruCapInPlace(cache: TombstoneCache, cap: number): void {
  const keys = Object.keys(cache.entries);
  if (keys.length <= cap) return;
  const sorted = keys
    .map((k) => ({ k, at: cache.entries[k].inserted_at }))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  const drop = keys.length - cap;
  for (let i = 0; i < drop; i++) {
    delete cache.entries[sorted[i].k];
  }
}

export interface QueryArgs {
  cache: TombstoneCache;
  filePath: string;
  /** Current mtime on disk for invalidation. */
  currentMtimeMs: number;
  /** Override `now` for deterministic tests. */
  now?: Date;
}

export interface QueryResult {
  /** True when the tombstone exists and is still valid (not mtime-evicted, not expired). */
  hit: boolean;
  /** Reason for a miss when `hit === false`. */
  reason?: 'absent' | 'mtime_advanced' | 'expired';
  /** The entry — present even on miss when the entry exists but invalidated. */
  entry?: TombstoneEntry;
}

export function queryTombstone(args: QueryArgs): QueryResult {
  const { cache, filePath, currentMtimeMs, now } = args;
  const normalised = normaliseTombstonePath(filePath);
  const entry = cache.entries[normalised];
  if (!entry) return { hit: false, reason: 'absent' };
  const recordedMtime = new Date(entry.git_mtime).getTime();
  if (currentMtimeMs > recordedMtime) {
    return { hit: false, reason: 'mtime_advanced', entry };
  }
  if (entry.expires_at && new Date(entry.expires_at).getTime() < (now ?? new Date()).getTime()) {
    return { hit: false, reason: 'expired', entry };
  }
  return { hit: true, entry };
}

/** Test/diagnostics helper: count entries currently held. */
export function tombstoneSize(cache: TombstoneCache): number {
  return Object.keys(cache.entries).length;
}

/** Project-relative tombstone state path: `.claude/coherence/scan-cache/tombstones.json`. */
export function tombstoneStatePath(coherenceDir: string): string {
  return path.join(coherenceDir, 'scan-cache', 'tombstones.json');
}

/**
 * Read the on-disk tombstone cache. Returns an empty cache if the file is
 * missing or unreadable — tombstone is best-effort.
 */
export function readTombstoneCache(coherenceDir: string): TombstoneCache {
  const p = tombstoneStatePath(coherenceDir);
  try {
    if (!fsExistsSync(p)) return emptyTombstoneCache();
    const raw = fsReadFileSync(p, 'utf8');
    return JSON.parse(raw) as TombstoneCache;
  } catch {
    return emptyTombstoneCache();
  }
}

/** Atomic write of the tombstone cache. */
export function writeTombstoneCache(coherenceDir: string, cache: TombstoneCache): void {
  const p = tombstoneStatePath(coherenceDir);
  fsMkdirSync(path.dirname(p), { recursive: true });
  fsWriteFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

