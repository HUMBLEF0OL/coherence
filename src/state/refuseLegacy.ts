/**
 * v0.3 NFR-COMPAT-N4 contract — refuse pre-v3 state on install.
 *
 * Per DD-118 (no legacy version support burden) each major version stands
 * alone: there are no v1→v2 / v2→v3 migrators and no rollback across major
 * version bumps. SessionStart consults `refuseLegacy()` instead of running a
 * migration chain.
 *
 * Outcomes:
 *
 *   - `fresh`     : `.claude/coherence/version.json` is absent. Caller invokes
 *                   `firstRun.runFreshInstall()` to lay the v3 sentinel.
 *   - `proceed`   : `schema_version === 3`. Normal startup continues.
 *   - `refuse`    : `schema_version < 3` (legacy install). Operator removes
 *                   `.claude/coherence/` or runs on a fresh project.
 *   - `refuse_future` : `schema_version > 3` (future-major install). Operator
 *                   needs to upgrade the plugin; the running v0.3 binary will
 *                   not touch a state file written by a newer major. Distinct
 *                   message so the operator does not delete state thinking
 *                   it's legacy.
 *
 * `schema_version` coercion: if the field is a JSON string ("3"), it is
 * coerced to integer for comparison. Audit-fix B1 closure (post-M8 audit).
 *
 * Tests: `tests/unit/state/refuse-legacy.test.ts` covers all five outcomes
 * (fresh, proceed, refuse, refuse_future, corrupt).
 */
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export type RefuseLegacyOutcome =
  | { status: 'fresh' }
  | { status: 'proceed'; schemaVersion: 3 }
  | { status: 'refuse'; foundSchemaVersion: number; message: string }
  | { status: 'refuse_future'; foundSchemaVersion: number; message: string }
  | { status: 'refuse_layout'; message: string };  // v0.4 DD-122

export const REFUSE_LEGACY_MESSAGE =
  'cohrence v0.3 does not migrate from earlier major versions; ' +
  'remove `.claude/coherence/` or run on a fresh project';

export const REFUSE_FUTURE_MESSAGE =
  'cohrence found state from a NEWER major version on disk; ' +
  'upgrade the plugin to match — do not delete `.claude/coherence/`';

export const REFUSE_LAYOUT_MESSAGE =
  'cohrence found plugin.json at the plugin root (v0.3 layout); ' +
  're-install via `claude plugin install cohrence` to use the v0.4 layout — ' +
  'do NOT delete `.claude/coherence/` (your per-project state is intact)';

/**
 * Narrow return type for `refuseLayout()` — callers don't need exhaustive
 * narrowing to access `.message`.
 */
export interface RefuseLayoutResult {
  status: 'refuse_layout';
  message: string;
}

interface VersionFile {
  schema_version?: number | string;
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
    // Corrupt version.json — treat as legacy refusal so the user is forced
    // to resolve before continuing. -1 is the sentinel for "could not parse".
    return {
      status: 'refuse',
      foundSchemaVersion: -1,
      message: REFUSE_LEGACY_MESSAGE,
    };
  }

  const sv = coerceSchemaVersion(parsed.schema_version);
  if (sv === 3) {
    return { status: 'proceed', schemaVersion: 3 };
  }
  if (sv > 3) {
    return {
      status: 'refuse_future',
      foundSchemaVersion: sv,
      message: REFUSE_FUTURE_MESSAGE,
    };
  }
  return {
    status: 'refuse',
    foundSchemaVersion: sv,
    message: REFUSE_LEGACY_MESSAGE,
  };
}

function coerceSchemaVersion(raw: number | string | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * v0.4 DD-122: detect old-layout `plugin.json` at the plugin installation
 * root. Returns refuse_layout if found; null if the layout is correct or
 * unknown. Called from SessionStart BEFORE `refuseLegacy`.
 *
 * IMPORTANT: `pluginRoot` is the plugin install dir (CLAUDE_PLUGIN_ROOT),
 * NOT the user's project root.
 */
export function refuseLayout(pluginRoot: string): RefuseLayoutResult | null {
  if (!pluginRoot) return null;
  const oldPath = path.join(pluginRoot, 'plugin.json');
  if (!existsSync(oldPath)) return null;
  return { status: 'refuse_layout', message: REFUSE_LAYOUT_MESSAGE };
}
