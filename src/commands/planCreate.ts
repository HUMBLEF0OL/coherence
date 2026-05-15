/**
 * /coherence:plan create — author a cross-team plan file (M3, DD-099 amended; v1.1.0 C3 subcommand surface).
 *
 * Usage:
 *   /coherence:plan create <kind> <title>          // body via prompt
 *   /coherence:plan create <kind> <title> --body <markdown>
 *
 * `kind` is one of: proposal | decision | directive | alignment | ad_hoc.
 *
 * Audit-3 B3 fix: the lifecycle helper `createPlanWithTelemetry` was
 * previously unreachable from any production caller — this command wires
 * it. Emits `plan_created`.
 */
import type { StateStore } from '../state/stateStore.js';
import {
  createPlanWithTelemetry,
  type PlanKind,
} from '../state/plans/lifecycle.js';

const VALID_KINDS: readonly PlanKind[] = [
  'proposal',
  'decision',
  'directive',
  'alignment',
  'ad_hoc',
];

export interface PlanCreateArgs {
  store: StateStore;
  projectRoot: string;
  sessionId: string;
  kind: PlanKind;
  title: string;
  body?: string;
  /** Test injection: override branchSha. */
  branchSha?: string;
  /** Test injection: override authorHash. */
  authorHash?: string;
  /** Test injection: override now. */
  now?: Date;
}

export interface PlanCreateResult {
  planId: string;
  branchSha: string;
  filePath: string;
  message: string;
}

export async function runPlanCreate(args: PlanCreateArgs): Promise<PlanCreateResult> {
  if (!VALID_KINDS.includes(args.kind)) {
    throw new Error(
      `plan-create: invalid kind '${String(args.kind)}'; expected one of ${VALID_KINDS.join('|')}`,
    );
  }
  if (typeof args.title !== 'string' || args.title.trim().length === 0) {
    throw new Error('plan-create: title is required');
  }
  if (args.title.length > 200) {
    throw new Error('plan-create: title exceeds 200 characters');
  }

  const r = await createPlanWithTelemetry({
    store: args.store,
    sessionId: args.sessionId,
    projectRoot: args.projectRoot,
    kind: args.kind,
    title: args.title,
    ...(args.body !== undefined ? { body: args.body } : {}),
    ...(args.branchSha !== undefined ? { branchSha: args.branchSha } : {}),
    ...(args.authorHash !== undefined ? { authorHash: args.authorHash } : {}),
    ...(args.now !== undefined ? { now: args.now } : {}),
  });

  return {
    planId: r.plan.plan_id,
    branchSha: r.plan.branch_sha,
    filePath: r.filePath,
    message: `[coherence] plan-create: ${r.plan.kind} "${r.plan.title}" → coherence/plans/${r.plan.branch_sha}/${r.plan.plan_id}.json`,
  };
}

/**
 * Parse raw CLI args (the host passes them as a string array). Returns a
 * partial `PlanCreateArgs` the slash-command handler can merge with
 * `{store, projectRoot, sessionId}`. Format:
 *   args[0] = kind
 *   args[1] = title (next non-flag positional)
 *   `--body <md>` (rest of args after --body joined by space)
 */
export function parsePlanCreateArgs(
  raw: string[],
): { kind: PlanKind; title: string; body?: string } {
  if (raw.length < 2) {
    throw new Error('plan create: usage `/coherence:plan create <kind> <title> [--body <text>]`');
  }
  const kind = raw[0] as PlanKind;
  let title = '';
  const bodyParts: string[] = [];
  let inBody = false;
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i];
    if (a === '--body') {
      inBody = true;
      continue;
    }
    if (inBody) bodyParts.push(a);
    else if (title === '') title = a;
    else title += ' ' + a;
  }
  if (bodyParts.length === 0) return { kind, title };
  return { kind, title, body: bodyParts.join(' ') };
}
