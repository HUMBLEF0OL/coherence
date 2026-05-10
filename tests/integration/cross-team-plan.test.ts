/**
 * v0.3 M3 — cross-team plan store under a simulated git merge.
 *
 * Two "developers" each create a plan on their own branch sha. After the
 * merge (i.e. both branch dirs end up in the same checkout), `listAllPlans`
 * sees both. No plan_id collision is possible because plan_ids derive from
 * branch_sha + author_hash + title + created_at.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createTeamPlan } from '../../src/state/plans/writer.js';
import { listAllPlans } from '../../src/state/plans/reader.js';
import { withCacheLock } from '../../src/state/locks.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-cross-team-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cross-team plan store (DD-099 amended; DD-100; DD-108)', () => {
  it('two developers on different branches each persist a plan that survives merge', () => {
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Adopt JWT auth',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
      now: new Date('2026-05-10T10:00:00Z'),
    });
    createTeamPlan({
      projectRoot: dir,
      kind: 'directive',
      title: 'Migrate to pnpm',
      branchSha: 'bbbbbbbbbbbb',
      authorHash: '000000000002',
      now: new Date('2026-05-10T11:00:00Z'),
    });

    const r = listAllPlans(dir);
    expect(r.plans.length).toBe(2);
    expect(new Set(r.plans.map((p) => p.author_hash))).toEqual(
      new Set(['000000000001', '000000000002']),
    );
    // Branch shas differ → no plan_id collision.
    const ids = new Set(r.plans.map((p) => p.plan_id));
    expect(ids.size).toBe(2);
  });

  it('withCacheLock serialises concurrent writers to the same plan path', async () => {
    const planFile = path.join(dir, 'coherence', 'plans', 'aaaaaaaaaaaa', 'shared.json');
    const events: string[] = [];

    await Promise.all([
      withCacheLock(planFile, 'team-plan-store', async () => {
        events.push('A:start');
        await new Promise((resolve) => setTimeout(resolve, 30));
        events.push('A:end');
      }),
      withCacheLock(planFile, 'team-plan-store', async () => {
        events.push('B:start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push('B:end');
      }),
    ]);

    // Whichever ran first must run to completion before the other starts.
    const aStart = events.indexOf('A:start');
    const aEnd = events.indexOf('A:end');
    const bStart = events.indexOf('B:start');
    const bEnd = events.indexOf('B:end');

    const wellOrdered =
      (aEnd < bStart && aStart < aEnd) || (bEnd < aStart && bStart < bEnd);
    expect(wellOrdered).toBe(true);
  });
});
