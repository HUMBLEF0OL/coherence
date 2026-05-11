/**
 * /coherence:plan-accept — accept a cross-team plan (M3, DD-099 amended).
 *
 * Usage:
 *   /coherence:plan-accept <branch-sha> <plan-id>
 *
 * Audit-3 B3/B6 fix: wires `acceptPlan` and surfaces typed errors
 * (PlanNotFoundError, MalformedPlanError) as friendly CLI messages.
 */
import type { StateStore } from '../state/stateStore.js';
import {
  acceptPlan,
  PlanNotFoundError,
  MalformedPlanError,
  PlanAlreadyTerminalError,
} from '../state/plans/lifecycle.js';

export interface PlanAcceptArgs {
  store: StateStore;
  projectRoot: string;
  sessionId: string;
  branchSha: string;
  planId: string;
  /** Test injection: override actor identity. */
  actorHash?: string;
}

export interface PlanAcceptResult {
  planId: string;
  branchSha: string;
  filePath: string;
  message: string;
}

export async function runPlanAccept(args: PlanAcceptArgs): Promise<PlanAcceptResult> {
  validateHash(args.branchSha, 12, 'branch-sha');
  validateHash(args.planId, 32, 'plan-id');
  try {
    const r = await acceptPlan({
      store: args.store,
      projectRoot: args.projectRoot,
      sessionId: args.sessionId,
      branchSha: args.branchSha,
      planId: args.planId,
      ...(args.actorHash !== undefined ? { actorHash: args.actorHash } : {}),
    });
    return {
      planId: r.plan.plan_id,
      branchSha: r.plan.branch_sha,
      filePath: r.filePath,
      message: `[coherence] plan-accept: accepted "${r.plan.title}"`,
    };
  } catch (err) {
    if (err instanceof PlanNotFoundError) {
      throw new Error(
        `plan-accept: no plan at ${err.filePath}; check the branch-sha + plan-id.`,
      );
    }
    if (err instanceof MalformedPlanError) {
      throw new Error(
        `plan-accept: plan file is malformed JSON at ${err.filePath}; resolve manually.`,
      );
    }
    if (err instanceof PlanAlreadyTerminalError) {
      throw new Error(
        `plan-accept: plan ${err.planId} is already ${err.finalAction}; no-op.`,
      );
    }
    throw err;
  }
}

export function parsePlanAcceptArgs(raw: string[]): { branchSha: string; planId: string } {
  if (raw.length < 2) {
    throw new Error('plan-accept: usage `/coherence:plan-accept <branch-sha> <plan-id>`');
  }
  return { branchSha: raw[0], planId: raw[1] };
}

function validateHash(value: string, len: number, label: string): void {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${len}}$`).test(value)) {
    throw new Error(`plan-accept: ${label} must be ${len}-hex lowercase, got '${value}'`);
  }
}
