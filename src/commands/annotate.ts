/**
 * /coherence:annotate <path> (M7).
 *
 * Generates an annotate proposal for an anchor-less doc, regardless of the
 * current graduation mode. Writes the proposal to quarantine via
 * proposalStore.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { ProposalStore } from '../proposals/store.js';
import { proposeAnnotate } from '../proposers/annotateProposer.js';
import { signatureHash } from '../signal/signatureHash.js';
import { emitMetric } from '../state/metrics.js';
import type { HostCapabilities } from '../types/index.js';

export interface AnnotateCmdArgs {
  store: StateStore;
  projectRoot: string;
  docPath: string;
  sessionId?: string;
}

export interface AnnotateCmdResult {
  proposed: boolean;
  reason?: 'doc_missing' | 'already_annotated' | 'no_headings';
  proposal_id?: string;
  rendered: string;
}

export async function runAnnotate(args: AnnotateCmdArgs): Promise<AnnotateCmdResult> {
  const abs = path.resolve(args.projectRoot, args.docPath);
  const rel = path.relative(args.projectRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel) || !existsSync(abs)) {
    return {
      proposed: false,
      reason: 'doc_missing',
      rendered: `[coherence] annotate: doc not found ${args.docPath}`,
    };
  }
  const body = readFileSync(abs, 'utf8');
  const caps = await args.store.read<HostCapabilities>('host-capabilities.json');
  const proposal = proposeAnnotate({
    body,
    basename: path.basename(abs, path.extname(abs)),
    preservesUnknownFrontmatter: caps?.frontmatter_preserves_unknown_keys ?? false,
  });
  if (proposal.status === 'no_proposal') {
    await emitMetric(args.store, {
      event: 'annotate_blocked',
      session_id: args.sessionId ?? 'session',
      reason: proposal.reason,
    });
    const r: AnnotateCmdResult = {
      proposed: false,
      rendered: `[coherence] annotate: ${proposal.reason ?? 'refused'} for ${args.docPath}`,
    };
    if (proposal.reason) {
      r.reason = proposal.reason as Exclude<AnnotateCmdResult['reason'], undefined>;
    }
    return r;
  }
  const pstore = new ProposalStore(args.store);
  const r = await pstore.enqueue({
    projectRoot: args.projectRoot,
    kind: 'annotate',
    signalHash: signatureHash('file_write_path', rel),
    signalKind: 'anchor_less_doc',
    artifact: { filename: 'PROPOSAL.md', content: proposal.body_md },
    sessionId: args.sessionId ?? 'session',
    // D2 fix: record the source doc so propose-accept overwrites it.
    targetPath: rel,
  });
  await emitMetric(args.store, {
    event: 'annotation_proposed',
    session_id: args.sessionId ?? 'session',
    proposal_id: r.manifest.proposal_id,
    doc_path_hash: signatureHash('file_write_path', rel),
  });
  return {
    proposed: r.enqueued,
    proposal_id: r.manifest.proposal_id,
    rendered: r.enqueued
      ? `[coherence] annotate: proposal ${r.manifest.proposal_id} for ${args.docPath}`
      : `[coherence] annotate: collision; proposal ${r.manifest.proposal_id} already exists`,
  };
}
