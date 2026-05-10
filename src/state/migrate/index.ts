/**
 * Migration chain entry point.
 *
 * v0.3 (DD-118): each major version stands alone — no cross-major-version
 * migrators. SessionStart now consults `refuseLegacy()` instead of running this
 * chain (NFR-COMPAT-N4). The v0→v1 migrator survives only as historical baseline
 * for tests that exercise the v0.2 substrate; new installs hit the v3 sentinel
 * directly via `firstRun.runFreshInstall()`.
 */
import { migrateV0ToV1 } from './v0_to_v1.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

interface VersionFile {
  schema_version?: number;
}

const CURRENT_VERSION = 3;

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

// eslint-disable-next-line @typescript-eslint/require-await -- async public API; v0.3 retains the chain only as historical baseline.
export async function runMigrations(
  coherenceDir: string,
  quarantineDir: string,
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  const versionPath = path.join(coherenceDir, 'version.json');
  if (!existsSync(versionPath)) return results;

  const schemaVersion = readSchemaVersion(coherenceDir);

  if (schemaVersion < 1) {
    const result = migrateV0ToV1(coherenceDir, quarantineDir);
    results.push({ from: 0, to: 1, ...result });
  }

  // v0.3 DD-118: no v1→v2 / v2→v3 chain. Pre-v3 state is refused at
  // SessionStart (refuseLegacy.ts), not migrated.
  return results;
}

export { CURRENT_VERSION };
