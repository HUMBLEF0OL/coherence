/**
 * /coherence:plan-reject — reject a cross-team plan (M3, DD-099 amended).
 *
 * Usage:
 *   /coherence:plan-reject <branch-sha> <plan-id> <reason>
 *
 * `reason` is one of: stale | superseded | rejected_explicit.
 *
 * Audit-3 B3/B6 fix: wires `rejectPlan` and surfaces typed errors as
 * friendly CLI messages.
 */
import type { StateStore } from '../state/stateStore.js';
import {
  rejectPlan,
  PlanNotFoundError,
  MalformedPlanError,
  type RejectReason,
} from '../state/plans/lifecycle.js';

const VALID_REASONS: readonly RejectReason[] = ['stale', 'superseded', 'rejected_explicit'];

export interface PlanRejectArgs {
  store: StateStore;
  projectRoot: string;
  sessionId: string;
  branchSha: string;
  planId: string;
  reason: RejectReason;
  actorHash?: string;
}

export interface PlanRejectResult {
  planId: string;
  branchSha: string;
  filePath: string;
  message: string;
}

export async function runPlanReject(args: PlanRejectArgs): Promise<PlanRejectResult> {
  if (!VALID_REASONS.includes(args.reason)) {
    throw new Error(
      `plan-reject: invalid reason '${String(args.reason)}'; expected ${VALID_REASONS.join('|')}`,
    );
  }
  validateHash(args.branchSha, 12, 'branch-sha');
  validateHash(args.planId, 32, 'plan-id');
  try {
    const r = await rejectPlan({
      store: args.store,
      projectRoot: args.projectRoot,
      sessionId: args.sessionId,
      branchSha: args.branchSha,
      planId: args.planId,
      reason: args.reason,
      ...(args.actorHash !== undefined ? { actorHash: args.actorHash } : {}),
    });
    return {
      planId: r.plan.plan_id,
      branchSha: r.plan.branch_sha,
      filePath: r.filePath,
      message: `[coherence] plan-reject (${args.reason}): rejected "${r.plan.title}"`,
    };
  } catch (err) {
    if (err instanceof PlanNotFoundError) {
      throw new Error(`plan-reject: no plan at ${err.filePath}.`);
    }
    if (err instanceof MalformedPlanError) {
      throw new Error(`plan-reject: plan file is malformed JSON at ${err.filePath}.`);
    }
    throw err;
  }
}

export function parsePlanRejectArgs(
  raw: string[],
): { branchSha: string; planId: string; reason: RejectReason } {
  if (raw.length < 3) {
    throw new Error(
      'plan-reject: usage `/coherence:plan-reject <branch-sha> <plan-id> <stale|superseded|rejected_explicit>`',
    );
  }
  return { branchSha: raw[0], planId: raw[1], reason: raw[2] as RejectReason };
}

function validateHash(value: string, len: number, label: string): void {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${len}}$`).test(value)) {
    throw new Error(`plan-reject: ${label} must be ${len}-hex lowercase, got '${value}'`);
  }
}
