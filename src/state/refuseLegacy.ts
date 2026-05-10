/**
 * v0.3 NFR-COMPAT-N4 contract — refuse pre-v3 state on install.
 *
 * Per DD-118 (no legacy version support burden) each major version stands
 * alone: there are no v1→v2 / v2→v3 migrators and no rollback across major
 * version bumps. SessionStart consults `refuseLegacy()` instead of running a
 * migration chain. Three outcomes:
 *
 *   - `fresh`    : `.claude/coherence/version.json` is absent. Caller invokes
 *                  `firstRun.runFreshInstall()` to lay the v3 sentinel.
 *   - `refuse`   : version.json exists with `schema_version < 3`. SessionStart
 *                  emits a one-line message ("cohrence v0.3 does not migrate
 *                  from earlier major versions") and exits cleanly without
 *                  engaging degradedMode.
 *   - `proceed`  : version.json exists with `schema_version === 3`. Normal
 *                  startup continues.
 *
 * Tests: `tests/unit/state/refuse-legacy.test.ts` covers all three.
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export type RefuseLegacyOutcome =
  | { status: 'fresh' }
  | { status: 'proceed'; schemaVersion: 3 }
  | { status: 'refuse'; foundSchemaVersion: number; message: string };

export const REFUSE_LEGACY_MESSAGE =
  'cohrence v0.3 does not migrate from earlier major versions; ' +
  'remove `.claude/coherence/` or run on a fresh project';

interface VersionFile {
  schema_version?: number;
}

export function refuseLegacy(coherenceDir: string): RefuseLegacyOutcome {
  const versionPath = path.join(coherenceDir, 'version.json');
  if (!existsSync(versionPath)) {
    return { status: 'fresh' };
  }

  let parsed: VersionFile;
  try {
    parsed = JSON.parse(readFileSync(versionPath, 'utf8')) as VersionFile;
  } catch {
    // Corrupt version.json — treat as legacy refusal so the user is forced to
    // resolve before continuing.
    return {
      status: 'refuse',
      foundSchemaVersion: -1,
      message: REFUSE_LEGACY_MESSAGE,
    };
  }

  const sv = parsed.schema_version ?? 0;
  if (sv === 3) {
    return { status: 'proceed', schemaVersion: 3 };
  }
  return {
    status: 'refuse',
    foundSchemaVersion: sv,
    message: REFUSE_LEGACY_MESSAGE,
  };
}
