/**
 * v0.3 audit-3 B3 — plan-create / plan-accept / plan-reject slash commands.
 *
 * Verifies the new commands wire `createPlanWithTelemetry` / `acceptPlan` /
 * `rejectPlan` (which the previous audit found unreachable), and that
 * their CLI arg parsers + error-translation honour the documented surface.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore } from '../../../src/state/init.js';
import {
  runPlanCreate,
  parsePlanCreateArgs,
} from '../../../src/commands/planCreate.js';
import {
  runPlanAccept,
  parsePlanAcceptArgs,
} from '../../../src/commands/planAccept.js';
import {
  runPlanReject,
  parsePlanRejectArgs,
} from '../../../src/commands/planReject.js';

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-plan-cli-'));
  await initCoherenceDir(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runPlanCreate (audit-3 B3)', () => {
  it('lands a plan file and surfaces planId + branchSha', async () => {
    const store = makeStateStore(dir);
    const r = await runPlanCreate({
      store,
      projectRoot: dir,
      sessionId: 's',
      kind: 'proposal',
      title: 'Adopt JWT',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '111111111111',
    });
    expect(r.planId).toMatch(/^[0-9a-f]{32}$/);
    expect(r.branchSha).toBe('aaaaaaaaaaaa');
    expect(existsSync(r.filePath)).toBe(true);
    expect(r.message).toContain('plan-create');
  });

  it('rejects invalid kind', async () => {
    const store = makeStateStore(dir);
    await expect(
      runPlanCreate({
        store,
        projectRoot: dir,
        sessionId: 's',
        // @ts-expect-error testing invalid kind
        kind: 'bogus',
        title: 'x',
      }),
    ).rejects.toThrow(/invalid kind/);
  });

  it('rejects empty/oversize title', async () => {
    const store = makeStateStore(dir);
    await expect(
      runPlanCreate({ store, projectRoot: dir, sessionId: 's', kind: 'proposal', title: '' }),
    ).rejects.toThrow(/title is required/);
    await expect(
      runPlanCreate({
        store,
        projectRoot: dir,
        sessionId: 's',
        kind: 'proposal',
        title: 'x'.repeat(201),
      }),
    ).rejects.toThrow(/200 characters/);
  });

  it('parsePlanCreateArgs parses kind + title + --body', () => {
    expect(parsePlanCreateArgs(['proposal', 'My', 'Title'])).toEqual({
      kind: 'proposal',
      title: 'My Title',
    });
    expect(parsePlanCreateArgs(['decision', 'X', '--body', 'long', 'body'])).toEqual({
      kind: 'decision',
      title: 'X',
      body: 'long body',
    });
    expect(() => parsePlanCreateArgs(['proposal'])).toThrow(/\/coherence:plan create/);
  });
});

describe('runPlanAccept / runPlanReject (audit-3 B3)', () => {
  async function seed(): Promise<{ branchSha: string; planId: string }> {
    const store = makeStateStore(dir);
    const r = await runPlanCreate({
      store,
      projectRoot: dir,
      sessionId: 's',
      kind: 'proposal',
      title: 'Plan',
      branchSha: 'aaaaaaaaaaaa',
      authorHash: '111111111111',
    });
    return { branchSha: r.branchSha, planId: r.planId };
  }

  it('plan-accept appends audit + emits plan_accepted', async () => {
    const { branchSha, planId } = await seed();
    const store = makeStateStore(dir);
    const r = await runPlanAccept({
      store,
      projectRoot: dir,
      sessionId: 's',
      branchSha,
      planId,
      actorHash: '222222222222',
    });
    expect(r.message).toContain('accepted');
    const events = readFileSync(
      path.join(dir, '.claude', 'coherence', 'metrics.jsonl'),
      'utf8',
    )
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { event: string });
    expect(events.some((e) => e.event === 'plan_accepted')).toBe(true);
  });

  it('plan-reject requires a valid reason from the enum', async () => {
    const { branchSha, planId } = await seed();
    const store = makeStateStore(dir);
    await expect(
      runPlanReject({
        store,
        projectRoot: dir,
        sessionId: 's',
        branchSha,
        planId,
        // @ts-expect-error testing invalid reason
        reason: 'whim',
      }),
    ).rejects.toThrow(/invalid reason/);
  });

  it('plan-accept surfaces friendly error for missing plan', async () => {
    const store = makeStateStore(dir);
    await expect(
      runPlanAccept({
        store,
        projectRoot: dir,
        sessionId: 's',
        branchSha: 'aaaaaaaaaaaa',
        planId: 'b'.repeat(32),
      }),
    ).rejects.toThrow(/no plan at/);
  });

  it('plan-accept rejects malformed branch-sha / plan-id', async () => {
    const store = makeStateStore(dir);
    await expect(
      runPlanAccept({ store, projectRoot: dir, sessionId: 's', branchSha: 'ZZZ', planId: 'a'.repeat(32) }),
    ).rejects.toThrow(/branch-sha/);
    await expect(
      runPlanAccept({ store, projectRoot: dir, sessionId: 's', branchSha: 'a'.repeat(12), planId: 'short' }),
    ).rejects.toThrow(/plan-id/);
  });

  it('parsePlanAcceptArgs + parsePlanRejectArgs', () => {
    expect(parsePlanAcceptArgs(['a'.repeat(12), 'b'.repeat(32)])).toEqual({
      branchSha: 'a'.repeat(12),
      planId: 'b'.repeat(32),
    });
    // v1.1.0 C3: usage messages must point at the new subcommand surface
    // (`/coherence:plan accept`), not the removed flat names.
    expect(() => parsePlanAcceptArgs([])).toThrow(/\/coherence:plan accept/);
    expect(parsePlanRejectArgs(['a'.repeat(12), 'b'.repeat(32), 'stale'])).toEqual({
      branchSha: 'a'.repeat(12),
      planId: 'b'.repeat(32),
      reason: 'stale',
    });
    expect(() => parsePlanRejectArgs(['x', 'y'])).toThrow(/\/coherence:plan reject/);
  });
});
