/**
 * Migration chain entry point.
 * Runs all pending migrations in order: v0→v1, v1→v2 (future), etc.
 */
import { migrateV0ToV1 } from './v0_to_v1.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

interface VersionFile {
  schema_version?: number;
}

const CURRENT_VERSION = 1;

export interface MigrationResult {
  from: number;
  to: number;
  migrated: boolean;
  error?: string;
}

export async function runMigrations(
  coherenceDir: string,
  quarantineDir: string,
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  const versionPath = path.join(coherenceDir, 'version.json');
  if (!existsSync(versionPath)) return results;

  let schemaVersion = 0;
  try {
    const raw = readFileSync(versionPath, 'utf8');
    const parsed = JSON.parse(raw) as VersionFile;
    schemaVersion = parsed.schema_version ?? 0;
  } catch {
    schemaVersion = 0;
  }

  if (schemaVersion < 1) {
    const result = migrateV0ToV1(coherenceDir, quarantineDir);
    results.push({ from: 0, to: 1, ...result });
  }

  // Future: if (schemaVersion < 2) { migrateV1ToV2(...) }

  return results;
}

export { CURRENT_VERSION };
