/**
 * v0.3 audit-4 F — plan-accept / plan-reject idempotency.
 *
 * Accepting (or rejecting) a plan that's already accepted/rejected must
 * raise `PlanAlreadyTerminalError` instead of appending a second audit
 * entry + emitting a duplicate `plan_*` event.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../../../src/state/init.js';
import {
  createPlanWithTelemetry,
  acceptPlan,
  rejectPlan,
  PlanAlreadyTerminalError,
} from '../../../../src/state/plans/lifecycle.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-plan-idem-'));
  await initCoherenceDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function seedPlan(): Promise<{ branchSha: string; planId: string }> {
  const store = makeStateStore(dir);
  const r = await createPlanWithTelemetry({
    store,
    sessionId: 's',
    projectRoot: dir,
    kind: 'proposal',
    title: 'Idem',
    branchSha: 'aaaaaaaaaaaa',
    authorHash: '111111111111',
  });
  return { branchSha: r.plan.branch_sha, planId: r.plan.plan_id };
}

function readMetrics(): Array<{ event: string }> {
  return readFileSync(path.join(dir, '.claude', 'coherence', 'metrics.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { event: string });
}

describe('plan lifecycle idempotency (audit-4 F)', () => {
  it('acceptPlan twice throws PlanAlreadyTerminalError on the second call', async () => {
    const { branchSha, planId } = await seedPlan();
    const store = makeStateStore(dir);
    await acceptPlan({ store, projectRoot: dir, sessionId: 's', branchSha, planId });
    await expect(
      acceptPlan({ store, projectRoot: dir, sessionId: 's', branchSha, planId }),
    ).rejects.toBeInstanceOf(PlanAlreadyTerminalError);

    // Only one plan_accepted event must have been emitted.
    const events = readMetrics().filter((e) => e.event === 'plan_accepted');
    expect(events.length).toBe(1);
  });

  it('rejectPlan after acceptPlan throws PlanAlreadyTerminalError', async () => {
    const { branchSha, planId } = await seedPlan();
    const store = makeStateStore(dir);
    await acceptPlan({ store, projectRoot: dir, sessionId: 's', branchSha, planId });
    await expect(
      rejectPlan({
        store,
        projectRoot: dir,
        sessionId: 's',
        branchSha,
        planId,
        reason: 'stale',
      }),
    ).rejects.toBeInstanceOf(PlanAlreadyTerminalError);
    expect(readMetrics().filter((e) => e.event === 'plan_rejected').length).toBe(0);
  });

  it('acceptPlan after rejectPlan throws PlanAlreadyTerminalError', async () => {
    const { branchSha, planId } = await seedPlan();
    const store = makeStateStore(dir);
    await rejectPlan({
      store,
      projectRoot: dir,
      sessionId: 's',
      branchSha,
      planId,
      reason: 'rejected_explicit',
    });
    await expect(
      acceptPlan({ store, projectRoot: dir, sessionId: 's', branchSha, planId }),
    ).rejects.toBeInstanceOf(PlanAlreadyTerminalError);
    expect(readMetrics().filter((e) => e.event === 'plan_accepted').length).toBe(0);
  });
});
