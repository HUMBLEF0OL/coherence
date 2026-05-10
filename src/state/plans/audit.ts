/**
 * v0.3 M3 — `appendPlanAudit()` (round-2 C2 namespacing).
 *
 * Distinct from `appendProposalState()` despite the shared `AuditEntry`
 * shape: a proposal's state-history is FSM-bound (queued → surfaced →
 * accepted), while a plan's audit log is human action history (created /
 * accepted / amended). They share neither lifecycle nor allowable transitions
 * — keep the namespace separate to prevent accidental cross-population.
 */
import type { TeamPlan, TeamPlanAuditEntry } from './writer.js';

export function appendPlanAudit(
  plan: TeamPlan,
  entry: Omit<TeamPlanAuditEntry, 'at'> & { at?: string },
): TeamPlan {
  const at = entry.at ?? new Date().toISOString();
  const auditEntry: TeamPlanAuditEntry = {
    actor_hash: entry.actor_hash,
    action: entry.action,
    at,
    ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
  };
  return {
    ...plan,
    audit_log: [...(plan.audit_log ?? []), auditEntry],
  };
}
