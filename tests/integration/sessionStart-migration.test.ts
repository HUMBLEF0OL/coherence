/**
 * SessionStart × refuseLegacy integration (v0.3 NFR-COMPAT-N4).
 *
 * Originally G1 + D8 verified that SessionStart's migration ran once and was
 * lock-serialised. v0.3 (DD-118) retired the cross-major-version migration
 * chain — pre-v3 state is now refused at SessionStart, never migrated. These
 * cases verify the refusal contract through the actual hook entry point.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
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

function seedPreV3(schemaVersion: number): void {
  const cohDir = path.join(dir, '.claude', 'coherence');
  mkdirSync(cohDir, { recursive: true });
  mkdirSync(path.join(cohDir, 'quarantine'), { recursive: true });
  writeFileSync(
    path.join(cohDir, 'version.json'),
    JSON.stringify({
      schema_version: schemaVersion,
      plugin_version: '0.2.0',
      installed_at: '2026-04-01T00:00:00.000Z',
      prior_versions: [],
    }),
  );
}

describe('SessionStart × refuseLegacy (v0.3 NFR-COMPAT-N4)', () => {
  it('refuses pre-v3 state (schema_version: 1) without engaging degradedMode', async () => {
    seedPreV3(1);
    const r = await sessionStartHook({ session_id: 's1' }, dir);
    expect(r.refusedLegacy).toBe(true);
    // No additional state is laid down on refusal.
    expect(existsSync(path.join(dir, '.claude', 'coherence', 'state-snapshot.json'))).toBe(false);
  });

  it('refuses pre-v3 state (schema_version: 2)', async () => {
    seedPreV3(2);
    const r = await sessionStartHook({ session_id: 's2' }, dir);
    expect(r.refusedLegacy).toBe(true);
  });

  it('fresh project (no version.json) lays down v3 sentinel via firstRun', async () => {
    const r = await sessionStartHook({ session_id: 's3' }, dir);
    expect(r.success).toBe(true);
    expect(r.refusedLegacy).toBeFalsy();
  });
});
