/**
 * v1.0 M1 — team aggregate read + staleness + contested derivation.
 * M-LEDGER-2 staleness + M-LEDGER-4 conflict scenarios.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { computeAggregate, listPruneCandidates, trustDir, activeContributorCount } from '../../src/state/teamAggregate.js';

let tmp: string;

function writeTeamFile(authorHash: string, ageDays: number, scores: Record<string, { score: number; as_of: string }>): string {
  const dir = trustDir(tmp);
  mkdirSync(dir, { recursive: true });
  const synced = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();
  const fp = path.join(dir, `${authorHash}.json`);
  writeFileSync(
    fp,
    JSON.stringify(
      { schema_version: 3, author_hash: authorHash, last_synced_at: synced, scores },
      null,
      2,
    ),
    'utf8',
  );
  return fp;
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'cohrence-ta-'));
});

afterEach(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
});

describe('computeAggregate — staleness (M-LEDGER-2)', () => {
  it('ignores files synced more than 180 days ago', () => {
    writeTeamFile('aaaaaaaaaaaa', 179, { 'a.md#s': { score: 0.9, as_of: '2026-01-01T00:00:00.000Z' } });
    writeTeamFile('bbbbbbbbbbbb', 181, { 'a.md#s': { score: -0.9, as_of: '2026-01-01T00:00:00.000Z' } });
    writeTeamFile('cccccccccccc', 366, { 'a.md#s': { score: 0.5, as_of: '2026-01-01T00:00:00.000Z' } });

    const agg = computeAggregate(tmp);
    const e = agg.get('a.md#s');
    expect(e).toBeDefined();
    // Only the 179-day file is active — aggregate is just 0.9
    expect(e!.aggregate_score).toBeCloseTo(0.9, 5);
    expect(e!.contributing_authors).toBe(1);
  });

  it('listPruneCandidates returns only files older than 365 days', () => {
    const recent = writeTeamFile('aaaaaaaaaaaa', 179, {});
    writeTeamFile('cccccccccccc', 366, {});
    const candidates = listPruneCandidates(tmp);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).not.toBe(recent);
    expect(candidates[0]).toMatch(/cccccccccccc\.json$/);
  });

  it('activeContributorCount filters by 180-day threshold', () => {
    writeTeamFile('aaaaaaaaaaaa', 50, {});
    writeTeamFile('bbbbbbbbbbbb', 179, {});
    writeTeamFile('cccccccccccc', 200, {});
    expect(activeContributorCount(tmp)).toBe(2);
  });
});

describe('computeAggregate — conflict + contested flag (M-LEDGER-4)', () => {
  it('3 contributors with mixed scores → not contested when |aggregate| ≥ 0.2', () => {
    writeTeamFile('aaaaaaaaaaaa', 1, { 'a.md#s': { score: 0.9, as_of: '2026-05-01T00:00:00.000Z' } });
    writeTeamFile('bbbbbbbbbbbb', 1, { 'a.md#s': { score: 0.8, as_of: '2026-05-01T00:00:00.000Z' } });
    writeTeamFile('cccccccccccc', 1, { 'a.md#s': { score: -0.85, as_of: '2026-05-01T00:00:00.000Z' } });
    const agg = computeAggregate(tmp);
    const e = agg.get('a.md#s')!;
    expect(e.aggregate_score).toBeCloseTo((0.9 + 0.8 - 0.85) / 3, 3); // ≈ 0.28
    expect(e.contributing_authors).toBe(3);
    expect(e.contested).toBe(false); // |0.28| >= 0.2
  });

  it('becomes contested when |aggregate| < 0.2 and ≥ 2 contributors', () => {
    writeTeamFile('aaaaaaaaaaaa', 1, { 'a.md#s': { score: 0.0, as_of: '2026-05-01T00:00:00.000Z' } });
    writeTeamFile('bbbbbbbbbbbb', 1, { 'a.md#s': { score: 0.0, as_of: '2026-05-01T00:00:00.000Z' } });
    const agg = computeAggregate(tmp);
    expect(agg.get('a.md#s')!.contested).toBe(true);
  });

  it('single contributor never contested (FR-LEDGER-4 pass-3 ≥ 2 floor)', () => {
    writeTeamFile('aaaaaaaaaaaa', 1, { 'a.md#s': { score: 0.0, as_of: '2026-05-01T00:00:00.000Z' } });
    const agg = computeAggregate(tmp);
    expect(agg.get('a.md#s')!.contested).toBe(false);
  });

  it('freshest_as_of picks the latest contribution date', () => {
    writeTeamFile('aaaaaaaaaaaa', 1, { 'a.md#s': { score: 0.5, as_of: '2026-01-01T00:00:00.000Z' } });
    writeTeamFile('bbbbbbbbbbbb', 1, { 'a.md#s': { score: 0.6, as_of: '2026-04-01T00:00:00.000Z' } });
    const agg = computeAggregate(tmp);
    expect(agg.get('a.md#s')!.freshest_as_of).toBe('2026-04-01T00:00:00.000Z');
  });
});

describe('computeAggregate — edge cases', () => {
  it('returns empty map when coherence/trust/ does not exist', () => {
    expect(computeAggregate(tmp).size).toBe(0);
  });

  it('skips malformed files without throwing', () => {
    const dir = trustDir(tmp);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'malformed.json'), 'not json', 'utf8');
    writeTeamFile('aaaaaaaaaaaa', 1, { 'a.md#s': { score: 0.5, as_of: '2026-05-01T00:00:00.000Z' } });
    const agg = computeAggregate(tmp);
    expect(agg.get('a.md#s')!.contributing_authors).toBe(1);
  });
});

void existsSync;
void unlinkSync;
