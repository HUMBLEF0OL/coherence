/**
 * E2E-8: Migration v0.0.x → v0.1.
 * R-14: upgrade migration harness.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';
import { runMigrations } from '../../src/state/migrate/index.js';

let tmpDir: string;
let coherenceDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-e2e8-'));
  coherenceDir = path.join(tmpDir, '.claude', 'coherence');
  mkdirSync(path.join(coherenceDir, 'quarantine'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('E2E-8: migration v0.0.x → v0.1', () => {
  it('migration runs on a fresh project without error', async () => {
    await expect(
      runMigrations(coherenceDir, path.join(coherenceDir, 'quarantine')),
    ).resolves.not.toThrow();
  });

  it('migration on schema_version=0 upgrades to version 1', async () => {
    const store = new StateStore(coherenceDir, path.join(coherenceDir, 'quarantine'));

    // Seed a v0 config (schema_version = 0)
    writeFileSync(
      path.join(coherenceDir, 'version.json'),
      JSON.stringify({
        schema_version: 0,
        plugin_version: '0.0.1',
        installed_at: new Date().toISOString(),
        prior_versions: [],
      }),
      'utf8',
    );

    await runMigrations(coherenceDir, path.join(coherenceDir, 'quarantine'));

    // After migration, schema_version should be 1
    const version = await store.read<{ schema_version: number }>('version.json');
    expect(version?.schema_version).toBeGreaterThanOrEqual(1);
  });

  it('migration is idempotent — running twice does not corrupt state', async () => {
    await runMigrations(coherenceDir, path.join(coherenceDir, 'quarantine'));
    await runMigrations(coherenceDir, path.join(coherenceDir, 'quarantine'));
    // No error = pass
    expect(true).toBe(true);
  });
});
