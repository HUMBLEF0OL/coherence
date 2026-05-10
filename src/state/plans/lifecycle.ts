/**
 * v0.3 M3 — cross-team plan lifecycle (DD-099 amended; DD-115 telemetry).
 *
 * Wraps the bare writer + audit modules with telemetry emission for the
 * three plan-store events:
 *   - `plan_created`  — when a plan file lands
 *   - `plan_accepted` — when a teammate accepts (audit_log entry + persist)
 *   - `plan_rejected` — when a plan is rejected (audit_log entry + persist)
 *
 * Payloads use 12-hex hashing for identifiers per DD-068. plan_id is already
 * 32-hex SHA-256 (proposal_id wire form).
 *
 * Concurrency: any path that mutates an existing plan goes through
 * `withCacheLock(filePath, 'team-plan-store', fn)` so two SessionStarts
 * landing the same accept don't race. Creation is single-writer because
 * plan_id derives from `branch_sha + author_hash + title + created_at` —
 * two sessions producing the same id wrote the same plan.
 */
import { readFileSync } from 'fs';
import type { StateStore } from '../stateStore.js';
import { emitMetric } from '../metrics.js';
import { withCacheLock } from '../locks.js';
import { getIdentity } from '../identity.js';
import {
  createTeamPlan,
  writeTeamPlan,
  planFilePath,
  type CreateTeamPlanArgs,
  type CreateTeamPlanResult,
  type PlanKind,
  type TeamPlan,
} from './writer.js';
import { appendPlanAudit } from './audit.js';

export interface CreateTeamPlanWithTelemetryArgs extends CreateTeamPlanArgs {
  store: StateStore;
  sessionId: string;
}

export async function createPlanWithTelemetry(
  args: CreateTeamPlanWithTelemetryArgs,
): Promise<CreateTeamPlanResult> {
  const { store, sessionId, ...createArgs } = args;
  const result = createTeamPlan(createArgs);
  try {
    await emitMetric(store, {
      event: 'plan_created',
      session_id: sessionId,
      plan_id_hash: result.plan.plan_id,
      branch_sha: result.plan.branch_sha,
      kind: result.plan.kind,
      author_hash: result.plan.author_hash,
    });
  } catch {
    /* telemetry non-fatal */
  }
  return result;
}

export type RejectReason = 'stale' | 'superseded' | 'rejected_explicit';

export interface AcceptPlanArgs {
  store: StateStore;
  projectRoot: string;
  branchSha: string;
  planId: string;
  sessionId: string;
  /** Override the resolved actor identity (test injection). */
  actorHash?: string;
  /** Optional duration since plan creation (caller computes from audit_log). */
  durationMinutes?: number;
}

export interface AcceptPlanResult {
  plan: TeamPlan;
  filePath: string;
}

export async function acceptPlan(args: AcceptPlanArgs): Promise<AcceptPlanResult> {
  return mutate(args.store, args.projectRoot, args.branchSha, args.planId, async (plan) => {
    const actorHash = args.actorHash ?? getIdentity().hash;
    const updated = appendPlanAudit(plan, { actor_hash: actorHash, action: 'accepted' });
    const filePath = writeTeamPlan(args.projectRoot, updated);
    const durationMinutes =
      args.durationMinutes ??
      computeDurationMinutes(plan.created_at, updated.audit_log?.slice(-1)[0]?.at);
    try {
      await emitMetric(args.store, {
        event: 'plan_accepted',
        session_id: args.sessionId,
        plan_id_hash: updated.plan_id,
        branch_sha: updated.branch_sha,
        kind: updated.kind,
        author_hash: updated.author_hash,
        actor_hash: actorHash,
        duration_minutes: durationMinutes,
      });
    } catch {
      /* telemetry non-fatal */
    }
    return { plan: updated, filePath };
  });
}

export interface RejectPlanArgs extends AcceptPlanArgs {
  reason: RejectReason;
}

export async function rejectPlan(args: RejectPlanArgs): Promise<AcceptPlanResult> {
  return mutate(args.store, args.projectRoot, args.branchSha, args.planId, async (plan) => {
    const actorHash = args.actorHash ?? getIdentity().hash;
    const updated = appendPlanAudit(plan, {
      actor_hash: actorHash,
      action: 'rejected',
      reason: args.reason,
    });
    const filePath = writeTeamPlan(args.projectRoot, updated);
    try {
      await emitMetric(args.store, {
        event: 'plan_rejected',
        session_id: args.sessionId,
        plan_id_hash: updated.plan_id,
        branch_sha: updated.branch_sha,
        kind: updated.kind,
        author_hash: updated.author_hash,
        actor_hash: actorHash,
        reason: args.reason,
      });
    } catch {
      /* telemetry non-fatal */
    }
    return { plan: updated, filePath };
  });
}

async function mutate<T>(
  _store: StateStore,
  projectRoot: string,
  branchSha: string,
  planId: string,
  fn: (plan: TeamPlan) => Promise<T>,
): Promise<T> {
  const filePath = planFilePath(projectRoot, branchSha, planId);
  return withCacheLock(filePath, 'team-plan-store', async () => {
    const plan = JSON.parse(readFileSync(filePath, 'utf8')) as TeamPlan;
    return fn(plan);
  });
}

function computeDurationMinutes(createdAt: string, lastActionAt?: string): number {
  if (!lastActionAt) return 0;
  const dt = new Date(lastActionAt).getTime() - new Date(createdAt).getTime();
  return Math.max(0, Math.round(dt / 60_000));
}

// Re-exports for downstream tests/users.
export { createTeamPlan, writeTeamPlan, planFilePath } from './writer.js';
export { appendPlanAudit } from './audit.js';
export type { TeamPlan, PlanKind, CreateTeamPlanArgs, CreateTeamPlanResult };
