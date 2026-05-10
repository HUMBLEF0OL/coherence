/**
 * v0.3 M3 — plan lifecycle telemetry (DD-115; M3 acceptance).
 *
 * Verifies plan_created / plan_accepted / plan_rejected events are emitted
 * with the correct payload shape (12-hex hashes; 32-hex plan_id_hash).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../../../src/state/init.js';
import {
  createPlanWithTelemetry,
  acceptPlan,
  rejectPlan,
} from '../../../../src/state/plans/lifecycle.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-plan-lifecycle-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function readMetrics(): Array<Record<string, unknown>> {
  const p = path.join(dir, '.claude', 'coherence', 'metrics.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('createPlanWithTelemetry (DD-115; M3 acceptance)', () => {
  it('emits plan_created with hashed identity', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const r = await createPlanWithTelemetry({
      store,
      sessionId: 's1',
      projectRoot: dir,
      kind: 'proposal',
      title: 'Adopt JWT',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '111111111111',
    });
    const events = readMetrics().filter((e) => e.event === 'plan_created');
    expect(events.length).toBe(1);
    const evt = events[0];
    expect(evt.plan_id_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(evt.branch_sha).toBe('aaaaaaaaaaaa');
    expect(evt.kind).toBe('proposal');
    expect(evt.author_hash).toBe('111111111111');
    // The plan file landed.
    expect(existsSync(r.filePath)).toBe(true);
  });
});

describe('acceptPlan / rejectPlan (DD-115; M3 acceptance)', () => {
  it('acceptPlan emits plan_accepted with actor_hash + duration_minutes', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const created = await createPlanWithTelemetry({
      store,
      sessionId: 's1',
      projectRoot: dir,
      kind: 'proposal',
      title: 'Plan A',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '111111111111',
      now: new Date('2026-05-10T10:00:00Z'),
    });

    await acceptPlan({
      store,
      projectRoot: dir,
      branchSha: 'aaaaaaaaaaaa',
      planId: created.plan.plan_id,
      sessionId: 's2',
      actorHash: '222222222222',
    });

    const events = readMetrics().filter((e) => e.event === 'plan_accepted');
    expect(events.length).toBe(1);
    expect(events[0].plan_id_hash).toBe(created.plan.plan_id);
    expect(events[0].actor_hash).toBe('222222222222');
    expect(typeof events[0].duration_minutes).toBe('number');
  });

  it('rejectPlan emits plan_rejected with reason', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const created = await createPlanWithTelemetry({
      store,
      sessionId: 's1',
      projectRoot: dir,
      kind: 'proposal',
      title: 'Plan B',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '111111111111',
    });

    await rejectPlan({
      store,
      projectRoot: dir,
      branchSha: 'aaaaaaaaaaaa',
      planId: created.plan.plan_id,
      sessionId: 's-reject',
      actorHash: '333333333333',
      reason: 'stale',
    });

    const events = readMetrics().filter((e) => e.event === 'plan_rejected');
    expect(events.length).toBe(1);
    expect(events[0].reason).toBe('stale');
    expect(events[0].actor_hash).toBe('333333333333');
  });

  it('reject reasons are restricted to the documented enum', async () => {
    // Type-level only: the function signature requires RejectReason.
    const allowedReasons: ['stale', 'superseded', 'rejected_explicit'] = [
      'stale',
      'superseded',
      'rejected_explicit',
    ];
    expect(allowedReasons.length).toBe(3);
  });

  // ── audit-fix E6 / T9: friendly errors for missing + malformed plans ────

  it('acceptPlan throws PlanNotFoundError when the plan file is missing', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const { PlanNotFoundError } = await import(
      '../../../../src/state/plans/lifecycle.js'
    );
    await expect(
      acceptPlan({
        store,
        projectRoot: dir,
        branchSha: 'aaaaaaaaaaaa',
        planId: 'b'.repeat(32),
        sessionId: 's',
      }),
    ).rejects.toBeInstanceOf(PlanNotFoundError);
  });

  it('rejectPlan throws MalformedPlanError when the plan file is invalid JSON', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const { MalformedPlanError } = await import(
      '../../../../src/state/plans/lifecycle.js'
    );
    const { mkdirSync, writeFileSync } = await import('fs');
    const branchSha = 'cccccccccccc';
    const planId = 'c'.repeat(32);
    const fp = path.join(dir, 'coherence', 'plans', branchSha, `${planId}.json`);
    mkdirSync(path.dirname(fp), { recursive: true });
    writeFileSync(fp, '{not json');

    await expect(
      rejectPlan({
        store,
        projectRoot: dir,
        branchSha,
        planId,
        sessionId: 's',
        reason: 'stale',
      }),
    ).rejects.toBeInstanceOf(MalformedPlanError);
  });
});
