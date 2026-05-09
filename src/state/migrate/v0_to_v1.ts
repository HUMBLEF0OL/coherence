/**
 * Schema migration: v0 → v1
 * On failure: quarantine old file, use fresh defaults, log, continue (FR-FAILURE-2)
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import path from 'path';
import { quarantineFile } from '../quarantine.js';
import { nowIsoUtc } from '../../util/time.js';

interface V0State {
  schema_version?: 0;
  plugin_version?: string;
  installed_at?: string;
  [key: string]: unknown;
}

interface V1VersionInfo {
  schema_version: 1;
  plugin_version: string;
  installed_at: string;
  upgraded_at: string;
  prior_versions: Array<{ version: string; schema_version: number; at: string }>;
}

export interface MigrationStepResult {
  migrated: boolean;
  error?: string;
}

export function migrateV0ToV1(
  coherenceDir: string,
  quarantineDir: string,
): MigrationStepResult {
  const versionPath = path.join(coherenceDir, 'version.json');

  if (!existsSync(versionPath)) {
    return { migrated: false };
  }

  let raw: string;
  try {
    raw = readFileSync(versionPath, 'utf8');
  } catch (e) {
    return { migrated: false, error: String(e) };
  }

  let parsed: V0State;
  try {
    parsed = JSON.parse(raw) as V0State;
  } catch (e) {
    quarantineFile(versionPath, quarantineDir);
    return { migrated: false, error: `JSON parse error: ${String(e)}` };
  }

  if ((parsed.schema_version ?? 0) !== 0) {
    return { migrated: false }; // already at v1+
  }

  // Backup the old file before migration
  quarantineFile(versionPath, quarantineDir);

  const now = nowIsoUtc();
  const v1: V1VersionInfo = {
    schema_version: 1,
    plugin_version: parsed.plugin_version ?? '0.0.x',
    installed_at: parsed.installed_at ?? now,
    upgraded_at: now,
    prior_versions: [
      {
        version: parsed.plugin_version ?? '0.0.x',
        schema_version: 0,
        at: now,
      },
    ],
  };

  try {
    const tmpPath = `${versionPath}.migration.tmp`;
    writeFileSync(tmpPath, JSON.stringify(v1, null, 2) + '\n', 'utf8');
    renameSync(tmpPath, versionPath);
  } catch (e) {
    return { migrated: false, error: `Write error: ${String(e)}` };
  }

  return { migrated: true };
}
