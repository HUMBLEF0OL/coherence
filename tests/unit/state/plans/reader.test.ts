/**
 * v0.3 M3 — cross-team plan reader.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { createTeamPlan } from '../../../../src/state/plans/writer.js';
import {
  listPlansForBranch,
  listAllPlans,
  findStalePlans,
} from '../../../../src/state/plans/reader.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-team-plan-r-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('plan reader', () => {
  it('listPlansForBranch returns plans for a single branch in created_at order', () => {
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'older',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
      now: new Date('2026-05-09T10:00:00Z'),
    });
    createTeamPlan({
      projectRoot: dir,
      kind: 'decision',
      title: 'newer',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000002',
      now: new Date('2026-05-10T10:00:00Z'),
    });
    const list = listPlansForBranch(dir, 'aaaaaaaaaaaa');
    expect(list.length).toBe(2);
    expect(list[0].title).toBe('older');
    expect(list[1].title).toBe('newer');
  });

  it('listAllPlans aggregates across branches', () => {
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 't1',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
    });
    createTeamPlan({
      projectRoot: dir,
      kind: 'directive',
      title: 't2',
      branchSha: 'bbbbbbbbbbbb',
      authorHash: '000000000002',
    });
    const r = listAllPlans(dir);
    expect(r.branches.sort()).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(r.plans.length).toBe(2);
  });

  it('findStalePlans filters by cutoff', () => {
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'old',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
      now: new Date('2026-04-01T10:00:00Z'),
    });
    createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'new',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '000000000001',
      now: new Date('2026-05-09T10:00:00Z'),
    });
    const all = listAllPlans(dir).plans;
    const stale = findStalePlans(all, '2026-05-01T00:00:00Z');
    expect(stale.map((p) => p.title)).toEqual(['old']);
  });

  it('returns empty when coherence/plans/ does not exist', () => {
    expect(listAllPlans(dir).plans).toEqual([]);
    expect(listPlansForBranch(dir, 'aaaaaaaaaaaa')).toEqual([]);
  });
});
