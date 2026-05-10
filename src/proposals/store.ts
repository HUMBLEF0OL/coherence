/**
 * Proposal store (M5).
 *
 * High-level read/write API over `proposal-cache.json` + per-proposal artifact
 * directories under `.claude/coherence/proposals/<kind>/<id>/`. Wraps the v0.1
 * `stateStore` atomic-write contract; never crosses the DD-065 boundary.
 */
import type { StateStore } from '../state/stateStore.js';
import type { ProposalKind } from './quarantine.js';
import { writeProposalArtifact } from './quarantine.js';
import { newManifest, writeManifest, type ProposalManifest } from './manifest.js';
import {
  readCache,
  writeCache,
  enqueueEntry,
  transition,
  counts,
  type ProposalCacheEntry,
  type ProposalCache,
  type SignalKind,
} from '../state/proposalCache.js';
import type { ProposalState } from './manifest.js';
import { emitMetric } from '../state/metrics.js';

export interface EnqueueArgs {
  projectRoot: string;
  kind: ProposalKind;
  signalHash: string;
  signalKind?: SignalKind;
  artifact: { filename: string; content: string };
  sessionId: string;
  /** Required for `kind: 'annotate'`; the source doc to overwrite on accept (D2). */
  targetPath?: string;
}

/**
 * EnqueueResult — uniform shape across success and refusal so callers can
 * always read `manifest.proposal_id`. M1 fix: even at session_cap we
 * compute the deterministic proposal_id (no empty-string stub).
 *
 *  - On success: `enqueued: true`, `manifest` is the persisted manifest,
 *    `entry` is the new cache entry.
 *  - On collision: `enqueued: false`, `reason: 'collision'`, `manifest`
 *    has the deterministic id, `entry` is the existing cache entry.
 *  - On session_cap: `enqueued: false`, `reason: 'session_cap'`,
 *    `manifest` carries the would-be id but is NOT written to disk;
 *    `entry` is null.
 */
export interface EnqueueResult {
  enqueued: boolean;
  manifest: ProposalManifest;
  entry: ProposalCacheEntry | null;
  reason?: 'collision' | 'session_cap';
}

const NON_TERMINAL: ProposalState[] = ['queued', 'surfaced', 'ignored'];

/** D5 fix: FR-AUTHOR-3 hard cap. */
export const PROPOSALS_PER_SESSION_CAP = 3;

/**
 * Per-session counter for proposals enqueued in this Node process.
 * Reset by `ProposalStore.resetSessionCount(sessionId)` at SessionStart.
 */
const sessionCounts = new Map<string, number>();

export class ProposalStore {
  constructor(private readonly store: StateStore) {}

  async enqueue(args: EnqueueArgs): Promise<EnqueueResult> {
    // D5 fix: FR-AUTHOR-3 cap — at most 3 proposals enqueued per session.
    // M1 fix: derive the manifest (with real proposal_id) even at the cap,
    // so callers reading `r.manifest.proposal_id` always see a valid id.
    const capManifest = newManifest(
      args.kind,
      args.signalHash,
      undefined,
      args.targetPath ? { targetPath: args.targetPath } : {},
    );
    const used = sessionCounts.get(args.sessionId) ?? 0;
    if (used >= PROPOSALS_PER_SESSION_CAP) {
      await emitMetric(this.store, {
        event: 'proposal_skipped_budget',
        session_id: args.sessionId,
        kind: args.kind,
        signal_hash: args.signalHash,
      });
      return {
        enqueued: false,
        reason: 'session_cap',
        manifest: capManifest,
        entry: null,
      };
    }

    let cache = await readCache(this.store);

    // DD-collision pre-check: refuse if any non-terminal entry shares the
    // proposal_id (which is derived from `kind + signal_hash`).
    const manifest = capManifest;
    const existing = cache.entries.find((e) => e.proposal_id === manifest.proposal_id);
    if (existing && NON_TERMINAL.includes(existing.state)) {
      return {
        enqueued: false,
        reason: 'collision',
        manifest,
        entry: existing,
      };
    }
    // D3 + N6 fix: a prior terminal-state entry (rejected/expired/reverted)
    // must not block re-enqueue, but DD-088 append-only state_history must
    // be preserved across the re-enqueue. Carry forward the old history
    // and add a terminal-state separator so the audit trail survives.
    let carriedHistory: ProposalCacheEntry['state_history'] | undefined;
    if (existing) {
      carriedHistory = [
        ...existing.state_history,
        {
          state: 'queued',
          at: new Date().toISOString(),
          reason: `re-enqueued after terminal state '${existing.state}'`,
        },
      ];
      cache = {
        ...cache,
        entries: cache.entries.filter((e) => e.proposal_id !== manifest.proposal_id),
      };
    }

    // Write artifact + manifest under quarantine.
    writeProposalArtifact(
      args.projectRoot,
      args.kind,
      manifest.proposal_id,
      args.artifact.filename,
      args.artifact.content,
    );
    writeManifest(args.projectRoot, manifest);

    // Append to cache.
    const enqueueArg: Omit<ProposalCacheEntry, 'state' | 'state_history'> = {
      proposal_id: manifest.proposal_id,
      kind: manifest.kind,
      signal_hash: manifest.signal_hash,
      generated_at: manifest.generated_at,
      expires_at: manifest.expires_at,
      consecutive_ignored: 0,
    };
    if (args.signalKind) enqueueArg.signal_kind = args.signalKind;
    let updated = enqueueEntry(cache, enqueueArg);
    // N6: if we evicted a terminal entry, splice the carried history into
    // the freshly-inserted entry so DD-088 append-only-ness holds.
    if (carriedHistory) {
      const STATE_HISTORY_CAP = 50;
      updated = {
        ...updated,
        entries: updated.entries.map((e) =>
          e.proposal_id === manifest.proposal_id
            ? {
                ...e,
                state_history: [...carriedHistory!, ...e.state_history].slice(
                  -STATE_HISTORY_CAP,
                ),
              }
            : e,
        ),
      };
    }
    await writeCache(this.store, updated);
    const entry = updated.entries.find((e) => e.proposal_id === manifest.proposal_id)!;
    sessionCounts.set(args.sessionId, used + 1);

    await emitMetric(this.store, {
      event: 'proposal_proposed',
      session_id: args.sessionId,
      proposal_id: manifest.proposal_id,
      kind: manifest.kind,
      signal_kind: args.signalKind,
    });

    return { manifest, entry, enqueued: true };
  }

  async transition(
    proposalId: string,
    toState: ProposalState,
    sessionId: string,
    reason?: string,
  ): Promise<{ truncated: boolean; cache: ProposalCache }> {
    const cache = await readCache(this.store);
    const result = transition(cache, proposalId, toState, reason);
    await writeCache(this.store, result.cache);
    if (result.truncated) {
      await emitMetric(this.store, {
        event: 'state_history_truncated',
        session_id: sessionId,
        proposal_id: proposalId,
      });
    }
    await emitMetric(this.store, {
      event: 'proposal_state_transition',
      session_id: sessionId,
      proposal_id: proposalId,
      to_state: toState,
      ...(reason ? { reason } : {}),
    });
    return result;
  }

  /**
   * D5: reset the per-session enqueue counter. Called by SessionStart.
   */
  static resetSessionCount(sessionId: string): void {
    sessionCounts.delete(sessionId);
  }

  /** Test/diagnostic accessor for the per-session counter. */
  static peekSessionCount(sessionId: string): number {
    return sessionCounts.get(sessionId) ?? 0;
  }

  async list(): Promise<ProposalCache> {
    return readCache(this.store);
  }

  async counts(): Promise<{ queued: number; surfaced: number; ignored: number }> {
    return counts(await readCache(this.store));
  }
}
