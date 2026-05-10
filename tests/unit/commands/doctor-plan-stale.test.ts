/**
 * v0.3 M3 — doctor surfaces stale (>7d) cross-team plans.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../../src/state/init.js';
import { runDoctor, STALE_PLAN_THRESHOLD_DAYS } from '../../../src/commands/doctor.js';
import { createTeamPlan } from '../../../src/state/plans/writer.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-doctor-plan-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runDoctor — stale plan check (DD-099 amended)', () => {
  it('flags plans older than the threshold', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);

    const now = new Date('2026-05-10T10:00:00Z');
    const oldDate = new Date(now.getTime() - (STALE_PLAN_THRESHOLD_DAYS + 2) * 24 * 3600 * 1000);
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Old plan',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
      now: oldDate,
    });
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Fresh plan',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
      now,
    });

    const r = await runDoctor(store, { projectRoot: dir, now });
    expect(r.stalePlans?.length).toBe(1);
    expect(r.stalePlans?.[0].ageDays).toBeGreaterThanOrEqual(STALE_PLAN_THRESHOLD_DAYS);
    expect(r.actions.some((a) => a.includes('cross-team plan'))).toBe(true);
  });

  it('does not flag fresh plans', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const now = new Date('2026-05-10T10:00:00Z');
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Fresh',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
      now,
    });
    const r = await runDoctor(store, { projectRoot: dir, now });
    expect(r.stalePlans).toBeUndefined();
  });

  it('does not invoke plan scan when projectRoot is omitted (back-compat)', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const r = await runDoctor(store, {});
    expect(r.stalePlans).toBeUndefined();
  });
});
