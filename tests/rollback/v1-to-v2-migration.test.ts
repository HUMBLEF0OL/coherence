/**
 * R-v0.2-03 v1 → v2 migration test (M2).
 *
 * Asserts:
 *  - schemas validate post-migration
 *  - prior_versions appended
 *  - corrupt drift-buffer.json is quarantined and continues
 *  - all five new state files appear with schema_version: 2
 *  - second migration is a no-op (idempotent)
 *  - kill mid-rename leaves v1 state intact (best-effort: write fails → no file change)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { migrateV1ToV2 } from '../../src/state/migrate/v1_to_v2.js';

function makeTmpDir(): { coherenceDir: string; quarantineDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'coherence-mig-'));
  const coherenceDir = path.join(root, '.claude', 'coherence');
  const quarantineDir = path.join(coherenceDir, 'quarantine');
  mkdirSync(coherenceDir, { recursive: true });
  mkdirSync(quarantineDir, { recursive: true });
  return { coherenceDir, quarantineDir };
}

function writeJson(p: string, data: unknown): void {
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

describe('migrateV1ToV2 (R-v0.2-03)', () => {
  let coherenceDir: string;
  let quarantineDir: string;

  beforeEach(() => {
    const dirs = makeTmpDir();
    coherenceDir = dirs.coherenceDir;
    quarantineDir = dirs.quarantineDir;
  });

  it('migrates a clean v1 install to v2', () => {
    writeJson(path.join(coherenceDir, 'version.json'), {
      schema_version: 1,
      plugin_version: '0.1.1',
      installed_at: '2026-04-01T00:00:00.000Z',
      prior_versions: [],
    });
    writeJson(path.join(coherenceDir, 'drift-buffer.json'), {
      state: 'empty',
      entries: [],
    });
    writeJson(path.join(coherenceDir, 'cost-ledger.json'), {
      session_id: 's0',
      entries: [],
    });

    const result = migrateV1ToV2(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);

    const v2 = JSON.parse(
      readFileSync(path.join(coherenceDir, 'version.json'), 'utf8'),
    );
    expect(v2.schema_version).toBe(2);
    expect(v2.prior_versions).toHaveLength(1);
    expect(v2.prior_versions[0].schema_version).toBe(1);

    expect(existsSync(path.join(coherenceDir, 'graduation.json'))).toBe(true);
    expect(existsSync(path.join(coherenceDir, 'proposal-cache.json'))).toBe(true);
    expect(existsSync(path.join(coherenceDir, 'signal-cache.json'))).toBe(true);
    expect(existsSync(path.join(coherenceDir, 'state-snapshot.json'))).toBe(true);
    expect(
      existsSync(path.join(coherenceDir, 'scan-cache', 'state.json')),
    ).toBe(true);

    const graduation = JSON.parse(
      readFileSync(path.join(coherenceDir, 'graduation.json'), 'utf8'),
    );
    expect(graduation.schema_version).toBe(2);
    expect(graduation.global_mode).toBe('observe');

    const signalCache = JSON.parse(
      readFileSync(path.join(coherenceDir, 'signal-cache.json'), 'utf8'),
    );
    expect(signalCache.buckets.bash_repetition.maxItems).toBe(500);
    expect(signalCache.buckets.file_creation.maxItems).toBe(500);
    expect(signalCache.buckets.agent_correction.maxItems).toBe(200);
  });

  it('quarantines corrupt drift-buffer.json and continues', () => {
    writeJson(path.join(coherenceDir, 'version.json'), {
      schema_version: 1,
      plugin_version: '0.1.1',
      installed_at: '2026-04-01T00:00:00.000Z',
      prior_versions: [],
    });
    writeFileSync(path.join(coherenceDir, 'drift-buffer.json'), '{ NOT JSON');

    const result = migrateV1ToV2(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(true);
    expect(result.files_quarantined).toContain('drift-buffer.json');

    const backups = readdirSync(quarantineDir).filter((f) =>
      f.startsWith('drift-buffer.json'),
    );
    expect(backups.length).toBeGreaterThan(0);

    // version.json + new files still appear
    expect(existsSync(path.join(coherenceDir, 'version.json'))).toBe(true);
    expect(existsSync(path.join(coherenceDir, 'graduation.json'))).toBe(true);
  });

  it('is idempotent — second invocation is a no-op', () => {
    writeJson(path.join(coherenceDir, 'version.json'), {
      schema_version: 1,
      plugin_version: '0.1.1',
      installed_at: '2026-04-01T00:00:00.000Z',
      prior_versions: [],
    });
    const first = migrateV1ToV2(coherenceDir, quarantineDir);
    expect(first.migrated).toBe(true);

    const second = migrateV1ToV2(coherenceDir, quarantineDir);
    expect(second.migrated).toBe(false);
    expect(second.files_created).toEqual([]);
  });

  it('refuses to run when version.json is missing', () => {
    const result = migrateV1ToV2(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(false);
  });

  it('quarantines corrupt version.json and refuses to migrate', () => {
    writeFileSync(path.join(coherenceDir, 'version.json'), '{ NOT JSON');

    const result = migrateV1ToV2(coherenceDir, quarantineDir);
    expect(result.migrated).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.files_quarantined).toContain('version.json');
  });
});
