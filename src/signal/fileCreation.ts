/**
 * File-creation pattern detector (DD-077, FR-AUTHOR-8/-9).
 *
 * Threshold: 3 files + locality (same directory) + structural similarity
 * Jaccard ≥ 0.8. Computed against the first 5 non-blank lines tokenised on
 * whitespace (a stable signal independent of variable names).
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
): FileDetectionResult {
  const count = cfg.count ?? DEFAULT_FILE_CREATION_COUNT;
  const jaccardMin = cfg.jaccard ?? DEFAULT_FILE_CREATION_JACCARD;

  const tokens = structuralTokens(content);
  // Hash the *token set* so structurally-similar files collapse onto the same
  // signature regardless of identifier renames.
  const tokenSig = signatureHash(
    'file_write_path',
    Array.from(tokens).sort().join(' '),
  );

  const dir = path.dirname(filePath).replace(/\\/g, '/');
  const dirHash = createHash('sha256').update(dir).digest('hex').slice(0, 12);

  // Count items in the same locality whose Jaccard overlap is ≥ threshold.
  let jaccardMax = 0;
  let localityHits = 0;
  for (const [otherPath, otherTokens] of recentTokenSets.entries()) {
    if (otherPath === filePath) continue;
    const otherDir = path.dirname(otherPath).replace(/\\/g, '/');
    if (otherDir !== dir) continue;
    const j = jaccard(tokens, otherTokens);
    if (j > jaccardMax) jaccardMax = j;
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
  };
}
