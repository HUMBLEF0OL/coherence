/**
 * DD-072 proposal manifest writer.
 *
 * Per-proposal `manifest.json` under
 * `.claude/coherence/proposals/<kind>/<id>/manifest.json`.
 *
 * Proposal IDs are deterministic content-derived RFC-4122 UUID v5 values
 * (DD-072 + OQ-v2-21 §5 default), computed via `proposalId()` below in the
 * `coherence.v0.2.proposal` namespace. The wire form is the 32-character
 * lowercase hex digest (no dashes) for filesystem-path safety and to keep
 * the privacy.md `proposal_id (32-hex)` redaction-matrix entry stable.
 */
import { createHash } from 'crypto';
import { writeProposalArtifact, type ProposalKind } from './quarantine.js';
import { ajv } from '../state/ajvInstance.js';
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
  | 'expired'
  // v0.3 DD-088 amendment: terminal state when a teammate's commit to
  // `coherence/ignore` matches the proposal's anchor.
  | 'ignored_by_team';

export interface ProposalManifest {
  proposal_id: string;
  kind: ProposalKind;
  signal_hash: string;
  generated_at: string;
  expires_at: string;
  state: ProposalState;
  ignored_count: number;
  schema_version: typeof PROPOSAL_SCHEMA_VERSION;
  /**
   * For `kind: 'annotate'`, the project-relative path of the source doc the
   * accepted proposal must overwrite. Required for that kind, ignored
   * otherwise. (D2 fix: annotate accept must land at the source, not at
   * `.claude/annotations/...`.)
   */
  target_path?: string;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 3600 * 1000;

/**
 * RFC-4122 §4.1.1 nil UUID, used as the parent namespace when deriving the
 * coherence proposal namespace UUID from the string `coherence.v0.2.proposal`.
 */
const NIL_NAMESPACE_UUID = '00000000-0000-0000-0000-000000000000';

/** Parse a dashed UUID into a 16-byte Buffer. */
function uuidStringToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/**
 * RFC-4122 §4.3 — version 5 UUID (SHA-1, name-based) generation.
 * Returns the 32-character lowercase hex form (no dashes).
 *
 * Algorithm:
 *   1. digest = SHA1(namespace_bytes || name_utf8)
 *   2. take first 16 bytes
 *   3. set version: byte 6 high nibble = 0x5
 *   4. set variant: byte 8 top two bits = 10 (RFC-4122 variant)
 */
function uuidV5Hex(namespaceUuid: string, name: string): string {
  const ns = uuidStringToBytes(namespaceUuid);
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  const out = Buffer.from(hash.subarray(0, 16));
  out[6] = (out[6] & 0x0f) | 0x50; // version 5
  out[8] = (out[8] & 0x3f) | 0x80; // RFC-4122 variant
  return out.toString('hex');
}

/**
 * Namespace UUID for coherence proposals. Derived once from the nil UUID +
 * the `coherence.v0.2.proposal` string per RFC-4122 §4.3 so the namespace
 * itself is a real UUID v5 rather than a free-form string.
 *
 * Precomputed at module load — the value is constant across processes.
 */
const PROPOSAL_NAMESPACE_UUID: string = ((): string => {
  const hex = uuidV5Hex(NIL_NAMESPACE_UUID, PROPOSAL_NAMESPACE);
  // Format as dashed UUID for the inner uuidV5Hex call.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
})();

/**
 * Compute a deterministic proposal id from kind + signal hash.
 *
 * Returns an RFC-4122 UUID v5 (DD-072, OQ-v2-21 §5 default) under the
 * `coherence.v0.2.proposal` namespace, formatted as a 32-character
 * lowercase hex string (no dashes) for filesystem-path safety.
 *
 * Two proposals with the same kind + signal hash produce the same id,
 * which lets the collision pre-check refuse re-enqueues for already-known
 * signals.
 */
export function proposalId(kind: ProposalKind, signalHash: string): string {
  return uuidV5Hex(PROPOSAL_NAMESPACE_UUID, `${kind}::${signalHash}`);
}

/** Convert a 32-hex proposal id to its dashed RFC-4122 form. */
export function proposalIdDashed(id: string): string {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** Compose a manifest record for a brand-new proposal. */
export function newManifest(
  kind: ProposalKind,
  signalHash: string,
  now: Date = new Date(),
  options: { targetPath?: string } = {},
): ProposalManifest {
  const generated = now.toISOString();
  const expires = new Date(now.getTime() + FOURTEEN_DAYS_MS).toISOString();
  const m: ProposalManifest = {
    proposal_id: proposalId(kind, signalHash),
    kind,
    signal_hash: signalHash,
    generated_at: generated,
    expires_at: expires,
    state: 'queued',
    ignored_count: 0,
    schema_version: PROPOSAL_SCHEMA_VERSION,
  };
  if (options.targetPath) m.target_path = options.targetPath;
  return m;
}

/** Atomically write a manifest under quarantine, validated against DD-087 schema. */
export function writeManifest(
  projectRoot: string,
  manifest: ProposalManifest,
): void {
  // G2: writer-time validation against `proposal.schema.json` (DD-087).
  // Schema may not yet be registered (eg. on a fresh install before
  // stateStore.ensureSchemasLoaded ran). Skip silently in that case —
  // the cache schema (proposal-cache.schema.json) catches structural drift.
  if (ajv.getSchema('proposal.schema.json') !== undefined) {
    if (!ajv.validate('proposal.schema.json', manifest)) {
      throw new Error(
        `writeManifest: manifest fails proposal.schema.json: ${ajv.errorsText()}`,
      );
    }
  }
  writeProposalArtifact(
    projectRoot,
    manifest.kind,
    manifest.proposal_id,
    'manifest.json',
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

/** Read-time validation (FR-PROPOSE-13 read-side). */
export function validateManifest(value: unknown): { ok: boolean; reason?: string } {
  if (ajv.getSchema('proposal.schema.json') === undefined) return { ok: true };
  if (ajv.validate('proposal.schema.json', value)) return { ok: true };
  return { ok: false, reason: ajv.errorsText() };
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
