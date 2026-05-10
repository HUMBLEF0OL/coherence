/**
 * v0.3 DD-088 amendment — team-ignore FSM transition.
 *
 * When a teammate adds a path to committed `coherence/ignore` matching a
 * proposal's anchor, the proposal transitions to terminal state
 * `ignored_by_team`. This module owns the predicate (does an ignore line
 * match an anchor?) and the helper that drives `transition()` for any
 * proposal in a non-terminal state. The actual scan that fires the helper
 * is wired by the caller (currently SessionStart-time sweep planned for M3
 * + M4 follow-up).
 *
 * Constraints honoured (per v0.2 audit findings):
 *   - **P15**: a single ignored_by_team transition adds exactly ONE
 *     state_history entry; no duplicate `queued` entry is appended.
 *   - **P4**: an *accepted* proposal is terminal; team-ignore does NOT
 *     re-transition it (preserving "no second proposal_accepted").
 *
 * Telemetry payload follows DD-068 hashing rules:
 *   `{ proposal_id_hash: 32-hex, ignore_path_hash: 12-hex }`
 * The `proposal_id` is already a 32-hex UUID v5 so it doubles as its own
 * hash; the ignore path is hashed via SHA-256 truncated to 12 hex chars.
 */
import { createHash } from 'crypto';
import type { StateStore } from '../state/stateStore.js';
import {
  readCache,
  writeCache,
  transition,
  ProposalStateError,
  type ProposalCacheEntry,
} from '../state/proposalCache.js';
import { emitMetric } from '../state/metrics.js';
import type { ProposalState } from './manifest.js';

const NON_TERMINAL_FOR_TEAM_IGNORE: ProposalState[] = ['queued', 'surfaced', 'ignored'];

/** Hash an ignore-file path or anchor for telemetry — DD-068 12-hex SHA-256. */
export function shortHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * True if `ignoreLine` matches `proposalAnchor`. The matcher honours simple
 * gitignore-style wildcards (`*`, `?`) plus literal directory containment
 * (`coherence/` matches `coherence/proposals/x`). The proposal's anchor
 * is whatever the caller decides identifies the proposal (annotate kind →
 * source doc path; signal kinds → derivable from manifest extras).
 */
export function ignoreLineMatchesAnchor(ignoreLine: string, proposalAnchor: string): boolean {
  const line = ignoreLine.trim();
  if (line === '' || line.startsWith('#')) return false;
  // Strip leading `/` (anchored to repo root).
  const pattern = line.replace(/^\/+/, '');
  // Directory-prefix containment (e.g. `docs/` matches `docs/intro.md`).
  if (pattern.endsWith('/')) {
    return proposalAnchor.startsWith(pattern);
  }
  // Glob → regex.
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '__DOUBLE_STAR__')
        .replace(/\*/g, '[^/]*')
        .replace(/__DOUBLE_STAR__/g, '.*')
        .replace(/\?/g, '[^/]') +
      '$',
  );
  return re.test(proposalAnchor);
}

/**
 * Apply the `ignored_by_team` transition to every non-terminal proposal whose
 * anchor matches any line in the supplied committed ignore content. Returns
 * the proposal IDs transitioned (caller may use the count for logging /
 * telemetry summarisation).
 *
 * `extractAnchor` is supplied by the caller because anchors live outside the
 * cache entry itself (per-kind manifests carry them). For tests, the helper
 * supports a static `Map<proposal_id, anchor>` indirection.
 */
export interface TeamIgnoreSweepArgs {
  store: StateStore;
  sessionId: string;
  /** Lines from committed `coherence/ignore`. */
  ignoreLines: string[];
  /**
   * Resolves `proposal_id → anchor` for a single entry. Returning `undefined`
   * skips the entry (no anchor available — common for non-annotate proposals
   * until M3's plan-store wiring extends the manifest extras).
   */
  resolveAnchor: (entry: ProposalCacheEntry) => string | undefined;
}

export interface TeamIgnoreSweepResult {
  transitioned: string[];
}

export async function applyTeamIgnoreSweep(
  args: TeamIgnoreSweepArgs,
): Promise<TeamIgnoreSweepResult> {
  const { store, sessionId, ignoreLines, resolveAnchor } = args;

  const cache = await readCache(store);
  let updated = cache;
  const transitioned: string[] = [];

  for (const entry of cache.entries) {
    if (!NON_TERMINAL_FOR_TEAM_IGNORE.includes(entry.state)) continue;
    const anchor = resolveAnchor(entry);
    if (!anchor) continue;
    const matchedLine = ignoreLines.find((line: string) => ignoreLineMatchesAnchor(line, anchor));
    if (!matchedLine) continue;
    try {
      const t = transition(updated, entry.proposal_id, 'ignored_by_team', 'team-ignore');
      updated = t.cache;
      transitioned.push(entry.proposal_id);
      // round-2 C3 fix: emit `proposal_ignored_by_team`, NOT `plan_ignored_by_team`.
      try {
        await emitMetric(store, {
          event: 'proposal_ignored_by_team',
          session_id: sessionId,
          proposal_id_hash: entry.proposal_id, // already 32-hex
          ignore_path_hash: shortHash(matchedLine),
        });
      } catch {
        /* telemetry non-fatal */
      }
    } catch (err) {
      if (err instanceof ProposalStateError) continue;
      throw err;
    }
  }

  if (transitioned.length > 0) {
    await writeCache(store, updated);
  }
  return { transitioned };
}
