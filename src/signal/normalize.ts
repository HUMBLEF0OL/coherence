/**
 * Bash command normalisation (DD-076, FR-OBS-N1a).
 *
 * Goals (round-trips deterministically):
 *  - whitespace collapse
 *  - env-var assignments stripped (`FOO=bar cmd …` → `cmd …`)
 *  - leading `cd <dir> &&` tolerated
 *  - timestamps / UUIDs / numeric placeholders normalised
 */

const TIMESTAMP_RE = /\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const NUMERIC_RE = /\b\d+\b/g;
const ENV_ASSIGN_RE = /^([A-Z][A-Z0-9_]*=\S+\s+)+/;

export function normaliseBashCommand(cmd: string): string {
  let out = cmd.trim();
  // Strip leading `cd <dir> && `
  out = out.replace(/^cd\s+\S+\s*&&\s*/, '');
  // Strip leading env-var assignments
  out = out.replace(ENV_ASSIGN_RE, '');
  // Whitespace collapse
  out = out.replace(/\s+/g, ' ');
  // Replace timestamps, UUIDs, numerics with placeholders
  out = out.replace(TIMESTAMP_RE, '<TS>');
  out = out.replace(UUID_RE, '<UUID>');
  out = out.replace(NUMERIC_RE, '<N>');
  return out;
}

/**
 * File-creation path template normaliser (FR-OBS-N1b).
 *
 * Replaces UUIDs, dates, numerics in path segments with placeholders so that
 * `tests/unit/signal/2026-05-10/foo-12345.test.ts` and
 * `tests/unit/signal/2026-05-11/foo-67890.test.ts` collapse to the same key.
 */
export function normaliseFilePath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(TIMESTAMP_RE, '<TS>')
    .replace(UUID_RE, '<UUID>')
    .replace(NUMERIC_RE, '<N>');
}

/**
 * Length bucket boundaries for prompt size buckets (FR-OBS-N1c).
 * Bucket index is the first boundary the input exceeds.
 */
export const LENGTH_BUCKETS: ReadonlyArray<number> = [
  64,
  256,
  1024,
  4096,
  16_384,
  65_536,
];

export function lengthBucket(n: number): number {
  for (let i = 0; i < LENGTH_BUCKETS.length; i++) {
    if (n <= LENGTH_BUCKETS[i]) return i;
  }
  return LENGTH_BUCKETS.length;
}

/** FR-OBS-N1d: refers_to_prior heuristic regex (corrective prompts). */
export const REFERS_TO_PRIOR_RE =
  /\b(no|nope|don't|not that|wait|actually|undo|revert|that's wrong|that is wrong|fix that|change that|instead|should be|should have|use \w+ instead)\b/i;

export function refersToPrior(prompt: string): boolean {
  return REFERS_TO_PRIOR_RE.test(prompt);
}
