/**
 * G1 + D8 fix coverage: SessionStart migration runs once + concurrent
 * SessionStart events are serialised by the migration lock.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { sessionStartHook } from '../../src/hooks/sessionStart.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-ss-mig-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedV1(): void {
  const cohDir = path.join(dir, '.claude', 'coherence');
  mkdirSync(cohDir, { recursive: true });
  mkdirSync(path.join(cohDir, 'quarantine'), { recursive: true });
  writeFileSync(
    path.join(cohDir, 'version.json'),
    JSON.stringify({
      schema_version: 1,
      plugin_version: '0.1.1',
      installed_at: '2026-04-01T00:00:00.000Z',
      prior_versions: [],
    }),
  );
}

describe('G1: SessionStart migration runs exactly once', () => {
  it('first SessionStart migrates v1→v2; second is a no-op', async () => {
    seedV1();
    await sessionStartHook({ session_id: 's1' }, dir);
    const v = JSON.parse(
      readFileSync(path.join(dir, '.claude', 'coherence', 'version.json'), 'utf8'),
    );
    expect(v.schema_version).toBe(2);
    expect(v.prior_versions).toHaveLength(1);

    await sessionStartHook({ session_id: 's2' }, dir);
    const v2 = JSON.parse(
      readFileSync(path.join(dir, '.claude', 'coherence', 'version.json'), 'utf8'),
    );
    expect(v2.schema_version).toBe(2);
    // No additional prior_versions append on the second invocation.
    expect(v2.prior_versions).toHaveLength(1);
  });

  it('D8: concurrent SessionStart on a v1 install both succeed without state loss', async () => {
    seedV1();
    const [r1, r2] = await Promise.all([
      sessionStartHook({ session_id: 's-a' }, dir),
      sessionStartHook({ session_id: 's-b' }, dir),
    ]);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    const v = JSON.parse(
      readFileSync(path.join(dir, '.claude', 'coherence', 'version.json'), 'utf8'),
    );
    expect(v.schema_version).toBe(2);
    // Prior versions appended exactly once (lock prevented double-append).
    expect(v.prior_versions).toHaveLength(1);
  });
});
