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
}

export interface EnqueueResult {
  manifest: ProposalManifest;
  entry: ProposalCacheEntry;
  /** false if collision pre-check refused (signal already has a non-terminal entry). */
  enqueued: boolean;
  reason?: 'collision';
}

const NON_TERMINAL: ProposalState[] = ['queued', 'surfaced', 'ignored'];

export class ProposalStore {
  constructor(private readonly store: StateStore) {}

  async enqueue(args: EnqueueArgs): Promise<EnqueueResult> {
    const cache = await readCache(this.store);

    // DD-collision pre-check: refuse if any non-terminal entry shares the
    // proposal_id (which is derived from `kind + signal_hash`).
    const manifest = newManifest(args.kind, args.signalHash);
    const collision = cache.entries.find(
      (e) => e.proposal_id === manifest.proposal_id && NON_TERMINAL.includes(e.state),
    );
    if (collision) {
      return { manifest, entry: collision, enqueued: false, reason: 'collision' };
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
    const updated = enqueueEntry(cache, enqueueArg);
    await writeCache(this.store, updated);
    const entry = updated.entries.find((e) => e.proposal_id === manifest.proposal_id)!;

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

  async list(): Promise<ProposalCache> {
    return readCache(this.store);
  }

  async counts(): Promise<{ queued: number; surfaced: number; ignored: number }> {
    return counts(await readCache(this.store));
  }
}
