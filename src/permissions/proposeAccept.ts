/**
 * DD-065 cross-the-boundary operator (skeleton).
 *
 * `propose-accept` is the *only* code path with a write capability outside
 * `.claude/coherence/`. The skeleton lands in M1 so the boundary lint and
 * SG-3 fixture have a real symbol to allow-list. Full collision-policy +
 * git commit + state-history transition land in M5/M7.
 *
 * Module-level invocation token: callers must pass the literal sentinel
 * `PROPOSE_ACCEPT_INVOCATION_TOKEN` exported from this module. Any other
 * caller will be refused. This is structural (not cryptographic) — it
 * forces every cross-the-boundary write to flow through the typed
 * `/coherence:propose-accept <id>` command surface.
 */
import { readFileSync, statSync } from 'fs';
import path from 'path';
import { getProposalDir, type ProposalKind } from '../proposals/quarantine.js';

/** E4 fix: bound proposal artifact size on read. */
export const MAX_PROPOSAL_ARTIFACT_BYTES = 256 * 1024;

export const PROPOSE_ACCEPT_INVOCATION_TOKEN: unique symbol = Symbol.for(
  'coherence.propose-accept.invocation',
);

export interface ProposeAcceptArgs {
  token: typeof PROPOSE_ACCEPT_INVOCATION_TOKEN;
  projectRoot: string;
  kind: ProposalKind;
  proposalId: string;
  /** Path within the project (relative). */
  targetPath: string;
  /** Filename of the proposed artifact under quarantine. */
  artifactFilename: string;
  /** When true, skip the existing-file collision check. */
  overwrite?: boolean;
}

export class ProposeAcceptError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'invalid_token'
      | 'name_collision'
      | 'missing_artifact'
      | 'path_escape'
      | 'artifact_too_large',
  ) {
    super(message);
    this.name = 'ProposeAcceptError';
  }
}

/**
 * Skeleton: load the proposal artifact bytes from quarantine.
 * Returns the bytes *without* writing — M5/M7 wire the collision policy and
 * git commit; tests in this milestone assert the boundary refuses non-token
 * callers and refuses to read outside quarantine.
 */
export function loadProposalArtifact(args: ProposeAcceptArgs): string {
  if (args.token !== PROPOSE_ACCEPT_INVOCATION_TOKEN) {
    throw new ProposeAcceptError(
      'propose-accept refused: caller did not pass the invocation token',
      'invalid_token',
    );
  }
  const proposalDir = getProposalDir(args.projectRoot, args.kind, args.proposalId);
  if (
    args.artifactFilename.includes('/') ||
    args.artifactFilename.includes('\\') ||
    args.artifactFilename.includes('..')
  ) {
    throw new ProposeAcceptError(
      `proposal filename '${args.artifactFilename}' must be a leaf`,
      'path_escape',
    );
  }
  const artifactPath = path.resolve(proposalDir, args.artifactFilename);
  const rel = path.relative(proposalDir, artifactPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new ProposeAcceptError(
      `proposal artifact path ${artifactPath} escapes proposal dir`,
      'path_escape',
    );
  }
  try {
    // E4: bound artifact size before reading.
    const stat = statSync(artifactPath);
    if (stat.size > MAX_PROPOSAL_ARTIFACT_BYTES) {
      throw new ProposeAcceptError(
        `proposal artifact ${artifactPath} exceeds ${MAX_PROPOSAL_ARTIFACT_BYTES} bytes (got ${stat.size})`,
        'artifact_too_large',
      );
    }
    return readFileSync(artifactPath, 'utf8');
  } catch (err) {
    if (err instanceof ProposeAcceptError) throw err;
    throw new ProposeAcceptError(
      `proposal artifact missing: ${artifactPath}`,
      'missing_artifact',
    );
  }
}
