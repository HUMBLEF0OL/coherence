/**
 * DD-072 proposal manifest writer.
 *
 * Per-proposal `manifest.json` under
 * `.claude/coherence/proposals/<kind>/<id>/manifest.json`.
 *
 * Proposal IDs are deterministic content-derived UUIDs (DD-072 + OQ-v2-21),
 * computed via `proposalId()` below: a v5-style namespace hash of the signal
 * hash + kind, truncated to a 32-char hex slug suitable for filesystem paths.
 */
import { createHash } from 'crypto';
import { writeProposalArtifact, type ProposalKind } from './quarantine.js';
import { nowIsoUtc } from '../util/time.js';

export const PROPOSAL_SCHEMA_VERSION = 2;
export const PROPOSAL_NAMESPACE = 'coherence.v0.2.proposal';

export type ProposalState =
  | 'queued'
  | 'surfaced'
  | 'ignored'
  | 'accepted'
  | 'rejected'
  | 'reverted'
  | 'expired';

export interface ProposalManifest {
  proposal_id: string;
  kind: ProposalKind;
  signal_hash: string;
  generated_at: string;
  expires_at: string;
  state: ProposalState;
  ignored_count: number;
  schema_version: typeof PROPOSAL_SCHEMA_VERSION;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 3600 * 1000;

/**
 * Compute a deterministic proposal id from kind + signal hash.
 * Uses sha256 of `<namespace>::<kind>::<signal_hash>` truncated to 32 hex chars.
 * Two proposals with the same kind + signal hash produce the same id, which
 * lets the collision pre-check refuse re-enqueues for already-known signals.
 */
export function proposalId(kind: ProposalKind, signalHash: string): string {
  const input = `${PROPOSAL_NAMESPACE}::${kind}::${signalHash}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

/** Compose a manifest record for a brand-new proposal. */
export function newManifest(
  kind: ProposalKind,
  signalHash: string,
  now: Date = new Date(),
): ProposalManifest {
  const generated = now.toISOString();
  const expires = new Date(now.getTime() + FOURTEEN_DAYS_MS).toISOString();
  return {
    proposal_id: proposalId(kind, signalHash),
    kind,
    signal_hash: signalHash,
    generated_at: generated,
    expires_at: expires,
    state: 'queued',
    ignored_count: 0,
    schema_version: PROPOSAL_SCHEMA_VERSION,
  };
}

/** Atomically write a manifest under quarantine. */
export function writeManifest(
  projectRoot: string,
  manifest: ProposalManifest,
): void {
  writeProposalArtifact(
    projectRoot,
    manifest.kind,
    manifest.proposal_id,
    'manifest.json',
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

/** Convenience: build + write in one shot. */
export function emitManifest(
  projectRoot: string,
  kind: ProposalKind,
  signalHash: string,
): ProposalManifest {
  const manifest = newManifest(kind, signalHash);
  writeManifest(projectRoot, manifest);
  return manifest;
}

export { nowIsoUtc };
