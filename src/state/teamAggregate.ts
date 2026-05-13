/**
 * Team trust-aggregate — read all per-developer committed files under
 * `coherence/trust/<author-hash>.json`, filter by 180-day staleness, return
 * per-section arithmetic mean + contested flag.
 *
 * Used by `/coherence:trust --status` (TS-5) and `/coherence:metrics` (TS-6).
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';

const STALENESS_DAYS = 180;
const STALENESS_MS = STALENESS_DAYS * 24 * 60 * 60 * 1000;
const CONTESTED_THRESHOLD = 0.2; // |aggregate| < 0.2 AND ≥ 2 contributors
const PRUNE_DAYS = 365;          // /coherence:trust --prune-stale removes files older than this
const PRUNE_MS = PRUNE_DAYS * 24 * 60 * 60 * 1000;

export interface TeamAggregateFile {
  schema_version: 3;
  author_hash: string;
  last_synced_at: string;
  scores: Record<string, { score: number; as_of: string }>;
}

export interface AggregateEntry {
  aggregate_score: number;
  contributing_authors: number;
  contested: boolean;
  freshest_as_of: string;
}

export interface TrustDirInfo {
  dir: string;
  files: string[];
}

export function trustDir(projectRoot: string): string {
  return path.join(projectRoot, 'coherence', 'trust');
}

export function listTrustFiles(projectRoot: string): string[] {
  const dir = trustDir(projectRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f));
}

function readTeamFile(filePath: string): TeamAggregateFile | null {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const obj = JSON.parse(raw) as Partial<TeamAggregateFile>;
    if (
      obj.schema_version === 3 &&
      typeof obj.author_hash === 'string' &&
      typeof obj.last_synced_at === 'string' &&
      obj.scores &&
      typeof obj.scores === 'object'
    ) {
      return obj as TeamAggregateFile;
    }
  } catch {
    /* skip malformed */
  }
  return null;
}

/**
 * Compute per-section aggregate across all *active* team trust files.
 * Files older than 180 days are excluded (FR-LEDGER-3).
 */
export function computeAggregate(projectRoot: string, nowMs: number = Date.now()): Map<string, AggregateEntry> {
  const result = new Map<string, AggregateEntry>();
  const filePaths = listTrustFiles(projectRoot);
  if (filePaths.length === 0) return result;

  const active: TeamAggregateFile[] = [];
  for (const fp of filePaths) {
    const data = readTeamFile(fp);
    if (!data) continue;
    const syncedAt = Date.parse(data.last_synced_at);
    if (Number.isNaN(syncedAt)) continue;
    if (nowMs - syncedAt > STALENESS_MS) continue;
    active.push(data);
  }

  const allRefs = new Set<string>();
  for (const f of active) for (const ref of Object.keys(f.scores)) allRefs.add(ref);

  for (const ref of allRefs) {
    const scoresAndDates: Array<{ score: number; as_of: string }> = [];
    for (const f of active) {
      const e = f.scores[ref];
      if (e) scoresAndDates.push(e);
    }
    if (scoresAndDates.length === 0) continue;
    const sum = scoresAndDates.reduce((a, b) => a + b.score, 0);
    const aggregate_score = sum / scoresAndDates.length;
    const contested =
      scoresAndDates.length >= 2 && Math.abs(aggregate_score) < CONTESTED_THRESHOLD;
    const freshest_as_of = scoresAndDates
      .map((s) => s.as_of)
      .sort()
      .pop() as string;
    result.set(ref, {
      aggregate_score,
      contributing_authors: scoresAndDates.length,
      contested,
      freshest_as_of,
    });
  }
  return result;
}

/** Files whose in-file `last_synced_at` is older than 365 days. */
export function listPruneCandidates(projectRoot: string, nowMs: number = Date.now()): string[] {
  const filePaths = listTrustFiles(projectRoot);
  const candidates: string[] = [];
  for (const fp of filePaths) {
    const f = readTeamFile(fp);
    if (!f) continue;
    const syncedAt = Date.parse(f.last_synced_at);
    if (Number.isNaN(syncedAt)) continue;
    if (nowMs - syncedAt > PRUNE_MS) candidates.push(fp);
  }
  return candidates;
}

/** Summary helpers for /coherence:trust --status (TS-5 §5.4 section d). */
export function activeContributorCount(projectRoot: string, nowMs: number = Date.now()): number {
  const filePaths = listTrustFiles(projectRoot);
  let count = 0;
  for (const fp of filePaths) {
    const f = readTeamFile(fp);
    if (!f) continue;
    if (nowMs - Date.parse(f.last_synced_at) <= STALENESS_MS) count++;
  }
  return count;
}

export { STALENESS_DAYS, CONTESTED_THRESHOLD, PRUNE_DAYS };
