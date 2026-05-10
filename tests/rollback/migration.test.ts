/**
 * R-14 + E2E-8 harness foundation: migration v0.0.x → v0.1
 * Tests: backup in quarantine, prior_versions appended (DD-064)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { migrateV0ToV1 } from '../../src/state/migrate/v0_to_v1.js';

function makeTmpDir(): string {
  const dir = path.join(tmpdir(), `coherence-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('migration v0 → v1 (R-14)', () => {
  let coherenceDir: string;
  let quarantineDir: string;

  beforeEach(() => {
    coherenceDir = makeTmpDir();
    quarantineDir = path.join(coherenceDir, 'quarantine');
    mkdirSync(quarantineDir, { recursive: true });
  });

  it('migrates v0 state file to v1 schema', async () => {
    const v0 = {
      schema_version: 0,
      plugin_version: '0.0.1',
      installed_at: '2026-01-01T00:00:00.000Z',
    };
    writeFileSync(path.join(coherenceDir, 'version.json'), JSON.stringify(v0));

    const result = migrateV0ToV1(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(true);
    expect(result.error).toBeUndefined();

    const v1 = JSON.parse(readFileSync(path.join(coherenceDir, 'version.json'), 'utf8'));
    expect(v1.schema_version).toBe(1);
    expect(v1.prior_versions).toHaveLength(1);
    expect(v1.prior_versions[0].schema_version).toBe(0);
  });

  it('creates a quarantine backup before migration', () => {
    const v0 = { schema_version: 0, plugin_version: '0.0.1' };
    writeFileSync(path.join(coherenceDir, 'version.json'), JSON.stringify(v0));

    migrateV0ToV1(coherenceDir, quarantineDir);

    const backups = readdirSync(quarantineDir).filter(
      (f) => f.startsWith('version.json') && f.endsWith('.bak'),
    );
    expect(backups.length).toBeGreaterThan(0);
  });

  it('skips migration when schema_version is already 1', () => {
    const v1 = { schema_version: 1, plugin_version: '0.1.0', prior_versions: [] };
    writeFileSync(path.join(coherenceDir, 'version.json'), JSON.stringify(v1));

    const result = migrateV0ToV1(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(false);
  });

  it('returns migrated=false when version.json is missing', () => {
    const result = migrateV0ToV1(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(false);
  });

  it('quarantines corrupt JSON and returns error', () => {
    writeFileSync(path.join(coherenceDir, 'version.json'), '{ invalid json !!');

    const result = migrateV0ToV1(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(false);
    expect(result.error).toBeTruthy();

    // Original file should be gone (quarantined)
    const exists = existsSync(path.join(coherenceDir, 'version.json'));
    expect(exists).toBe(false);
  });
});
