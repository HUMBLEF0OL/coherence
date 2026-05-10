/**
 * v0.3 M3 — cross-team plan writer (DD-099 amended; DD-107; DD-108).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  createTeamPlan,
  writeTeamPlan,
  planFilePath,
  readBranchShaShort,
  type TeamPlan,
} from '../../../../src/state/plans/writer.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-team-plan-w-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createTeamPlan (DD-107 + DD-108)', () => {
  it('writes plan to coherence/plans/<branch-sha>/<plan-id>.json', () => {
    const r = createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Adopt the new auth flow',
      branchSha: 'abcdef012345',
      authorHash: '111111111111',
      now: new Date('2026-05-10T10:00:00Z'),
    });
    expect(r.plan.branch_sha).toBe('abcdef012345');
    expect(r.plan.plan_id).toMatch(/^[0-9a-f]{32}$/);
    expect(r.plan.author_hash).toBe('111111111111');
    expect(r.plan.audit_log?.[0].action).toBe('created');
    expect(existsSync(r.filePath)).toBe(true);
    const back = JSON.parse(readFileSync(r.filePath, 'utf8')) as TeamPlan;
    expect(back).toEqual(r.plan);
  });

  it('plan_id is deterministic for same inputs', () => {
    const a = createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Stable title',
      branchSha: 'abcdef012345',
      authorHash: '111111111111',
      now: new Date('2026-05-10T10:00:00Z'),
    });
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(path.join(tmpdir(), 'coherence-team-plan-w-'));
    const b = createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Stable title',
      branchSha: 'abcdef012345',
      authorHash: '111111111111',
      now: new Date('2026-05-10T10:00:00Z'),
    });
    expect(b.plan.plan_id).toBe(a.plan.plan_id);
  });

  it('plan_id changes when title changes', () => {
    const a = createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'A',
      branchSha: 'abcdef012345',
      authorHash: '111111111111',
      now: new Date('2026-05-10T10:00:00Z'),
    });
    const b = createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'B',
      branchSha: 'abcdef012345',
      authorHash: '111111111111',
      now: new Date('2026-05-10T10:00:00Z'),
    });
    expect(a.plan.plan_id).not.toBe(b.plan.plan_id);
  });

  it('writeTeamPlan replaces an existing file atomically', () => {
    const r = createTeamPlan({
      projectRoot: dir,
      kind: 'proposal',
      title: 'Title',
      branchSha: 'abcdef012345',
      authorHash: '111111111111',
    });
    const updated: TeamPlan = { ...r.plan, body: 'extra body' };
    const fp = writeTeamPlan(dir, updated);
    expect(fp).toBe(planFilePath(dir, 'abcdef012345', r.plan.plan_id));
    const back = JSON.parse(readFileSync(fp, 'utf8')) as TeamPlan;
    expect(back.body).toBe('extra body');
  });

  it('readBranchShaShort returns 12-hex on a real git repo OR a deterministic sentinel', () => {
    const sha = readBranchShaShort(dir);
    expect(sha).toMatch(/^[0-9a-f]{12}$|^unknown00000$/);
  });
});
