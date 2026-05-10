/**
 * /coherence:propose-revert-acceptance <id> (M7, DD-083, FR-PROPOSE-9).
 *
 * Transitions an `accepted` proposal to `reverted`. Removes the live file
 * (if it still resolves cleanly under the project root). Emits a
 * `[coherence-revert]`-prefixed audit row in `coherence-log.md` so the v0.1
 * `revertDetect.ts` velocity-counter sweep picks the revert up at the next
 * SessionStart.
 *
 * v0.2 (DD-083): also creates a programmatic `[coherence-revert]` commit
 * so the matching DD-082 accept commit lands a paired revert in git
 * history. The previous wireshell delegated this to the user, which made
 * the velocity-counter sweep blind to programmatic reverts.
 */
import { existsSync, unlinkSync } from 'fs';
import path from 'path';
import type { StateStore } from '../state/stateStore.js';
import { ProposalStore } from '../proposals/store.js';
import { emitMetric } from '../state/metrics.js';
import { stageFiles, createCommit } from '../git/adapter.js';

export interface ProposeRevertArgs {
  store: StateStore;
  projectRoot: string;
  proposalId: string;
  sessionId?: string;
  acceptedPath?: string;
}

export interface ProposeRevertResult {
  reverted: boolean;
  reason?: 'not_found' | 'illegal_state' | 'path_escape';
  removed_path?: string;
  rendered: string;
}

export async function runProposeRevertAcceptance(
  args: ProposeRevertArgs,
): Promise<ProposeRevertResult> {
  const pstore = new ProposalStore(args.store);
  const cache = await pstore.list();
  const entry = cache.entries.find((e) => e.proposal_id === args.proposalId);
  if (!entry) {
    return {
      reverted: false,
      reason: 'not_found',
      rendered: `[coherence] propose-revert-acceptance: not found ${args.proposalId}`,
    };
  }
  if (entry.state !== 'accepted') {
    return {
      reverted: false,
      reason: 'illegal_state',
      rendered: `[coherence] propose-revert-acceptance: cannot revert from ${entry.state}`,
    };
  }
  let revertCommitSha: string | null = null;
  if (args.acceptedPath) {
    const rel = path.relative(args.projectRoot, args.acceptedPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return {
        reverted: false,
        reason: 'path_escape',
        rendered: `[coherence] propose-revert-acceptance: path escapes project`,
      };
    }
    if (existsSync(args.acceptedPath)) {
      try {
        unlinkSync(args.acceptedPath);
      } catch {
        /* best-effort */
      }
    }

    // DD-083: pair the structural revert with a `[coherence-revert]` git
    // commit so the v0.1 revertDetect velocity sweep picks it up at the
    // next SessionStart. Best-effort: outside a git repo we still record
    // the structural revert and the audit-log row.
    if (existsSync(path.join(args.projectRoot, '.git'))) {
      try {
        if (stageFiles(args.projectRoot, [rel])) {
          const message = `[coherence-revert] revert proposal ${args.proposalId}`;
          const result = createCommit(args.projectRoot, message, [rel]);
          if (result.ok) revertCommitSha = result.sha;
        }
      } catch {
        /* git revert is best-effort */
      }
    }
  }
  await pstore.transition(args.proposalId, 'reverted', args.sessionId ?? 'session');
  await emitMetric(args.store, {
    event: 'proposal_reverted',
    session_id: args.sessionId ?? 'session',
    proposal_id: args.proposalId,
    ...(revertCommitSha ? { commit_sha: revertCommitSha } : {}),
  });
  await args.store.appendMarkdown(
    'coherence-log.md',
    `[coherence-revert] proposal ${args.proposalId} reverted at ${new Date().toISOString()}`,
  );
  const result: ProposeRevertResult = {
    reverted: true,
    rendered: `[coherence] propose-revert-acceptance: ${args.proposalId} → reverted`,
  };
  if (args.acceptedPath) result.removed_path = args.acceptedPath;
  return result;
}
