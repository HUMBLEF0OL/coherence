/**
 * Schema migration: v1 → v2 (DD-080 single coordinated atomic step).
 *
 * Sub-steps (TS-8 §2.1):
 *   (a) bump version.json#schema_version 1→2, append prior_versions[]
 *   (b) widen drift-buffer.json BufferEntry.source enum (additive — no rewrite)
 *   (c) widen cost-ledger.json CostEntry.stage enum (additive — no rewrite)
 *   (d) create empty graduation.json
 *   (e) create empty proposal-cache.json
 *   (f) create empty signal-cache.json with three buckets
 *   (g) create empty scan-cache/state.json
 *   (h) create empty state-snapshot.json
 *
 * Atomic semantics: every write goes through stateStore (temp+rename) and a
 * corrupt v1 file is quarantined-and-continue (FR-FAILURE-N1, N2).
 */
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import path from 'path';
import { quarantineFile } from '../quarantine.js';
import { lockManager } from '../locks.js';
import { nowIsoUtc } from '../../util/time.js';

export interface V1ToV2Result {
  migrated: boolean;
  error?: string;
  duration_ms: number;
  files_created: string[];
  files_quarantined: string[];
}

interface VersionFile {
  schema_version: number;
  plugin_version: string;
  installed_at: string;
  upgraded_at?: string;
  prior_versions: Array<{ version: string; schema_version: number; at: string }>;
}

const PLUGIN_VERSION_AT_V2 = '0.2.0';

function atomicWriteJson(filePath: string, data: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, filePath);
}

export async function migrateV1ToV2(
  coherenceDir: string,
  quarantineDir: string,
): Promise<V1ToV2Result> {
  const t0 = Date.now();
  const created: string[] = [];
  const quarantined: string[] = [];

  const versionPath = path.join(coherenceDir, 'version.json');
  if (!existsSync(versionPath)) {
    return {
      migrated: false,
      duration_ms: Date.now() - t0,
      files_created: [],
      files_quarantined: [],
    };
  }

  // D8 fix: serialize concurrent migrations on the same coherence dir.
  // The lock target is `<coherenceDir>/migrate-v1-v2` — distinct from
  // version.json's lock so we don't deadlock with stateStore writes.
  const migrateLockPath = path.join(coherenceDir, '.migrate-v1-v2.target');
  const acquired = await lockManager.acquire(migrateLockPath, 'migrate');
  if (!acquired) {
    // Another process already holds the lock — assume it's running the
    // migration and short-circuit with migrated:false (idempotent).
    return {
      migrated: false,
      error: 'migration_lock_unavailable',
      duration_ms: Date.now() - t0,
      files_created: [],
      files_quarantined: [],
    };
  }
  try {
    return await migrateV1ToV2Locked(coherenceDir, quarantineDir, versionPath, t0, created, quarantined);
  } finally {
    lockManager.release(migrateLockPath);
  }
}

async function migrateV1ToV2Locked(
  coherenceDir: string,
  quarantineDir: string,
  versionPath: string,
  t0: number,
  created: string[],
  quarantined: string[],
): Promise<V1ToV2Result> {

  let parsed: VersionFile;
  try {
    const raw = readFileSync(versionPath, 'utf8');
    parsed = JSON.parse(raw) as VersionFile;
  } catch (e) {
    quarantineFile(versionPath, quarantineDir);
    quarantined.push('version.json');
    return {
      migrated: false,
      error: `version.json parse error: ${String(e)}`,
      duration_ms: Date.now() - t0,
      files_created: created,
      files_quarantined: quarantined,
    };
  }

  if (parsed.schema_version >= 2) {
    return {
      migrated: false,
      duration_ms: Date.now() - t0,
      files_created: [],
      files_quarantined: [],
    };
  }
  if (parsed.schema_version !== 1) {
    return {
      migrated: false,
      error: `unexpected schema_version ${parsed.schema_version}; v1→v2 expected schema_version=1`,
      duration_ms: Date.now() - t0,
      files_created: [],
      files_quarantined: [],
    };
  }

  const now = nowIsoUtc();

  // Step (a) — bump version
  const v2Version: VersionFile = {
    ...parsed,
    schema_version: 2,
    upgraded_at: now,
    prior_versions: [
      ...(parsed.prior_versions ?? []),
      {
        version: parsed.plugin_version,
        schema_version: 1,
        at: now,
      },
    ],
    plugin_version: PLUGIN_VERSION_AT_V2,
  };
  try {
    atomicWriteJson(versionPath, v2Version);
  } catch (e) {
    return {
      migrated: false,
      error: `version.json write error: ${String(e)}`,
      duration_ms: Date.now() - t0,
      files_created: created,
      files_quarantined: quarantined,
    };
  }

  // Steps (b)+(c) — widening of v1 enums is additive; no file rewrite required.
  // Validate any existing drift-buffer.json / cost-ledger.json against the new
  // (wider) schema; if a file already on disk fails the new schema, quarantine
  // it (FR-FAILURE-N2). At this writer we only verify they parse as JSON.
  for (const filename of ['drift-buffer.json', 'cost-ledger.json']) {
    const fp = path.join(coherenceDir, filename);
    if (!existsSync(fp)) continue;
    try {
      JSON.parse(readFileSync(fp, 'utf8'));
    } catch {
      quarantineFile(fp, quarantineDir);
      quarantined.push(filename);
    }
  }

  // Step (d) — graduation.json
  const graduationPath = path.join(coherenceDir, 'graduation.json');
  if (!existsSync(graduationPath)) {
    atomicWriteJson(graduationPath, {
      schema_version: 2,
      global_mode: 'observe',
      scopes: [],
    });
    created.push('graduation.json');
  }

  // Step (e) — proposal-cache.json
  const proposalCachePath = path.join(coherenceDir, 'proposal-cache.json');
  if (!existsSync(proposalCachePath)) {
    atomicWriteJson(proposalCachePath, {
      schema_version: 2,
      entries: [],
    });
    created.push('proposal-cache.json');
  }

  // Step (f) — signal-cache.json
  const signalCachePath = path.join(coherenceDir, 'signal-cache.json');
  if (!existsSync(signalCachePath)) {
    atomicWriteJson(signalCachePath, {
      schema_version: 2,
      buckets: {
        bash_repetition: { maxItems: 500, items: [] },
        file_creation: { maxItems: 500, items: [] },
        agent_correction: { maxItems: 200, items: [] },
      },
    });
    created.push('signal-cache.json');
  }

  // Step (g) — scan-cache/state.json
  const scanCacheDir = path.join(coherenceDir, 'scan-cache');
  mkdirSync(scanCacheDir, { recursive: true });
  const scanCachePath = path.join(scanCacheDir, 'state.json');
  if (!existsSync(scanCachePath)) {
    atomicWriteJson(scanCachePath, {
      schema_version: 2,
      last_pass_at: '',
      entries_this_session: 0,
      per_session_cap: 20,
      idle_threshold_ms: 30000,
    });
    created.push('scan-cache/state.json');
  }

  // Step (h) — state-snapshot.json (initial snapshot is bootstrapped at
  // SessionStart in M3; we lay down a minimum stub here so v0.2 readers
  // never see a missing file).
  const snapshotPath = path.join(coherenceDir, 'state-snapshot.json');
  if (!existsSync(snapshotPath)) {
    atomicWriteJson(snapshotPath, {
      schema_version: 2,
      written_at: now,
      buffer_count: 0,
      proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
      mode: 'observe',
      degraded: false,
    });
    created.push('state-snapshot.json');
  }

  return {
    migrated: true,
    duration_ms: Date.now() - t0,
    files_created: created,
    files_quarantined: quarantined,
  };
}
