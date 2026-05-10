/**
 * Migration chain entry point.
 * Runs all pending migrations in order: v0→v1, v1→v2 (future), etc.
 */
import { migrateV0ToV1 } from './v0_to_v1.js';
import { migrateV1ToV2 } from './v1_to_v2.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

interface VersionFile {
  schema_version?: number;
}

const CURRENT_VERSION = 2;

export interface MigrationResult {
  from: number;
  to: number;
  migrated: boolean;
  error?: string;
  duration_ms?: number;
  files_created?: string[];
  files_quarantined?: string[];
}

function readSchemaVersion(coherenceDir: string): number {
  const versionPath = path.join(coherenceDir, 'version.json');
  if (!existsSync(versionPath)) return 0;
  try {
    const raw = readFileSync(versionPath, 'utf8');
    const parsed = JSON.parse(raw) as VersionFile;
    return parsed.schema_version ?? 0;
  } catch {
    return 0;
  }
}

export async function runMigrations(
  coherenceDir: string,
  quarantineDir: string,
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  const versionPath = path.join(coherenceDir, 'version.json');
  if (!existsSync(versionPath)) return results;

  let schemaVersion = readSchemaVersion(coherenceDir);

  if (schemaVersion < 1) {
    const result = migrateV0ToV1(coherenceDir, quarantineDir);
    results.push({ from: 0, to: 1, ...result });
    schemaVersion = readSchemaVersion(coherenceDir);
  }

  if (schemaVersion < 2) {
    const result = migrateV1ToV2(coherenceDir, quarantineDir);
    results.push({ from: 1, to: 2, ...result });
  }

  return results;
}

export { CURRENT_VERSION };
