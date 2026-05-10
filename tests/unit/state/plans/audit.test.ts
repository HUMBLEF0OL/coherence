/**
 * v0.3 M3 — appendPlanAudit (round-2 C2 namespacing).
 */
import { describe, it, expect } from 'vitest';
import { appendPlanAudit } from '../../../../src/state/plans/audit.js';
import type { TeamPlan } from '../../../../src/state/plans/writer.js';

function basePlan(): TeamPlan {
  return {
    schema_version: 1,
    plan_id: 'a'.repeat(32),
    branch_sha: 'a'.repeat(12),
    kind: 'proposal',
    title: 'Test',
    created_at: '2026-05-10T10:00:00Z',
    author_hash: '000000000001',
    audit_log: [
      { actor_hash: '000000000001', action: 'created', at: '2026-05-10T10:00:00Z' },
    ],
  };
}

describe('appendPlanAudit', () => {
  it('appends without mutating the original', () => {
    const plan = basePlan();
    const updated = appendPlanAudit(plan, {
      actor_hash: '000000000002',
      action: 'accepted',
    });
    expect(plan.audit_log?.length).toBe(1);
    expect(updated.audit_log?.length).toBe(2);
    expect(updated.audit_log?.[1].action).toBe('accepted');
    expect(updated.audit_log?.[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('honours an explicit `at` timestamp', () => {
    const plan = basePlan();
    const updated = appendPlanAudit(plan, {
      actor_hash: '000000000002',
      action: 'amended',
      at: '2026-05-11T00:00:00Z',
    });
    expect(updated.audit_log?.[1].at).toBe('2026-05-11T00:00:00Z');
  });

  it('initialises audit_log when missing', () => {
    const plan = basePlan();
    delete plan.audit_log;
    const updated = appendPlanAudit(plan, {
      actor_hash: '000000000002',
      action: 'accepted',
    });
    expect(updated.audit_log?.length).toBe(1);
  });

  it('preserves AuditEntry shape compatibility (round-2 C2)', () => {
    const plan = basePlan();
    const updated = appendPlanAudit(plan, {
      actor_hash: '000000000002',
      action: 'rejected',
      reason: 'superseded',
    });
    const entry = updated.audit_log![1];
    expect(entry).toMatchObject({
      actor_hash: '000000000002',
      action: 'rejected',
      reason: 'superseded',
    });
  });
});
