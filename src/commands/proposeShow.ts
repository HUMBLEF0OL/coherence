/**
 * /coherence:propose-show <id> (M7, FR-PROPOSE-8).
 *
 * Reads the proposal artifact + manifest under quarantine; re-validates the
 * payload at read time (FR-PROPOSE-13 read-side); refuses to render on
 * schema-invalid payloads.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { getProposalDir, type ProposalKind } from '../proposals/quarantine.js';
import { validateManifest } from '../proposals/manifest.js';
import {
  validateAuthorPayload,
} from '../validation/proposalValidator.js';
import { emitMetric } from '../state/metrics.js';
import type { StateStore } from '../state/stateStore.js';
import { ProposalStore } from '../proposals/store.js';

export interface ProposeShowResult {
  found: boolean;
  reason?: 'not_found' | 'manifest_corrupt' | 'artifact_missing';
  artifactPath?: string;
  artifactBody?: string;
  rendered: string;
}

const KIND_DIRS: ProposalKind[] = ['skill', 'slash_command', 'agent', 'annotate'];

export async function runProposeShow(
  store: StateStore,
  projectRoot: string,
  proposalId: string,
  sessionId = 'session',
): Promise<ProposeShowResult> {
  const pstore = new ProposalStore(store);
  const cache = await pstore.list();
  const entry = cache.entries.find((e) => e.proposal_id === proposalId);
  if (!entry) {
    return { found: false, reason: 'not_found', rendered: `[coherence] propose-show: no proposal ${proposalId}` };
  }
  let kind: ProposalKind | null = null;
  for (const k of KIND_DIRS) {
    const dir = getProposalDir(projectRoot, k, proposalId);
    if (existsSync(dir)) {
      kind = k;
      break;
    }
  }
  if (!kind) {
    return {
      found: false,
      reason: 'artifact_missing',
      rendered: `[coherence] propose-show: no artifact directory found for ${proposalId}`,
    };
  }
  const dir = getProposalDir(projectRoot, kind, proposalId);
  const files = readdirSync(dir).filter((f) => f !== 'manifest.json');
  if (files.length === 0) {
    return {
      found: false,
      reason: 'artifact_missing',
      rendered: `[coherence] propose-show: empty artifact dir for ${proposalId}`,
    };
  }
  const artifactPath = path.join(dir, files[0]);
  const artifactBody = readFileSync(artifactPath, 'utf8');

  // G2: read-time manifest validation against proposal.schema.json (DD-087).
  let validationOk = true;
  let manifestReason: string | undefined;
  try {
    const manifestRaw = readFileSync(path.join(dir, 'manifest.json'), 'utf8');
    const m = JSON.parse(manifestRaw) as unknown;
    const r = validateManifest(m);
    if (!r.ok) {
      validationOk = false;
      manifestReason = r.reason;
    }
  } catch (err) {
    validationOk = false;
    manifestReason = err instanceof Error ? err.message : String(err);
  }

  // Re-validate the artifact body at read time. Accept either fully-rendered
  // markdown OR a JSON payload that satisfies the Author payload schema.
  if (validationOk) {
    try {
      const parsed = JSON.parse(artifactBody) as unknown;
      const v = validateAuthorPayload(parsed);
      if (!v.ok) {
        validationOk = false;
        manifestReason = v.reason ?? 'invalid_author_payload';
      }
    } catch {
      // Not JSON; assume rendered markdown — accept.
    }
  }
  if (!validationOk) {
    await emitMetric(store, {
      event: 'proposal_validation_failed',
      session_id: sessionId,
      proposal_id: proposalId,
      reason: manifestReason ?? 'read_time_validation',
    });
    return {
      found: false,
      reason: 'manifest_corrupt',
      rendered: `[coherence] propose-show: ${proposalId} fails read-time validation (${manifestReason ?? 'unknown'}); dropped`,
    };
  }

  await emitMetric(store, {
    event: 'proposal_shown',
    session_id: sessionId,
    proposal_id: proposalId,
    kind,
  });

  const lines = [
    `[coherence] propose-show ${proposalId}`,
    `  kind:  ${kind}`,
    `  state: ${entry.state}`,
    `  signal_hash: ${entry.signal_hash}`,
    `  artifact: ${path.relative(projectRoot, artifactPath)}`,
    '',
    artifactBody,
  ];
  return {
    found: true,
    artifactPath,
    artifactBody,
    rendered: lines.join('\n'),
  };
}
