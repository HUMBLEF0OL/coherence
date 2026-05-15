/**
 * First-touch creation of .claude/coherence/ skeleton.
 * Called by SessionStart (M2/M4). FR-INSTALL-2
 */
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { StateStore } from './stateStore.js';
import type { VersionInfo, CoherenceConfig, CoherenceMode } from '../types/index.js';
import type { V02Mode } from './graduation.js';
import { nowIsoUtc } from '../util/time.js';
import { resolveDefaultMode } from './userConfig.js';

const CURRENT_SCHEMA_VERSION = 3;
export const PLUGIN_VERSION = '1.1.2';

export function getCoherenceDir(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'coherence');
}

export function getQuarantineDir(projectRoot: string): string {
  return path.join(getCoherenceDir(projectRoot), 'quarantine');
}

export async function initCoherenceDir(projectRoot: string): Promise<void> {
  const coherenceDir = getCoherenceDir(projectRoot);
  const quarantineDir = getQuarantineDir(projectRoot);

  mkdirSync(coherenceDir, { recursive: true });
  mkdirSync(quarantineDir, { recursive: true });

  const store = new StateStore(coherenceDir, quarantineDir);

  // Create version.json if missing
  const existing = await store.read<VersionInfo>('version.json');
  if (!existing) {
    const versionInfo: VersionInfo = {
      schema_version: CURRENT_SCHEMA_VERSION,
      plugin_version: PLUGIN_VERSION,
      installed_at: nowIsoUtc(),
      prior_versions: [],
    };
    await store.write('version.json', versionInfo);
  }

  // Create config.json if missing
  const config = await store.read<CoherenceConfig>('config.json');
  if (!config) {
    const defaultConfig: CoherenceConfig = {
      mode: pickV01Mode(),
    };
    await store.write('config.json', defaultConfig);
  }

  // Create scan-cache reservation dir + state.json (v0.2)
  const scanCacheDir = path.join(coherenceDir, 'scan-cache');
  mkdirSync(scanCacheDir, { recursive: true });
  const scanCacheStatePath = path.join(scanCacheDir, 'state.json');
  if (!existsSync(scanCacheStatePath)) {
    // R2 fix: schema requires `last_pass_at` to be a valid date-time.
    // Initialise with the install-time timestamp; trickle treats this as
    // "no scans yet" since `entries_this_session = 0`.
    writeFileSync(
      scanCacheStatePath,
      JSON.stringify(
        {
          schema_version: 2,
          last_pass_at: nowIsoUtc(),
          entries_this_session: 0,
          per_session_cap: 20,
          idle_threshold_ms: 30000,
        },
        null,
        2,
      ) + '\n',
    );
  }

  // Lay down v0.2 state files on fresh installs (M2). v0.3 (DD-118) drops
  // cross-major-version migration: pre-v3 installs are refused at SessionStart
  // by `refuseLegacy()`, never migrated.
  const graduation = await store.read('graduation.json');
  if (!graduation) {
    await store.write('graduation.json', {
      schema_version: 2,
      global_mode: pickV02Mode(),
      scopes: [],
    });
  }

  const proposalCache = await store.read('proposal-cache.json');
  if (!proposalCache) {
    await store.write('proposal-cache.json', {
      schema_version: 2,
      entries: [],
    });
  }

  const signalCache = await store.read('signal-cache.json');
  if (!signalCache) {
    await store.write('signal-cache.json', {
      schema_version: 2,
      buckets: {
        bash_repetition: { maxItems: 500, items: [] },
        file_creation: { maxItems: 500, items: [] },
        agent_correction: { maxItems: 200, items: [] },
      },
    });
  }

  const snapshot = await store.read('state-snapshot.json');
  if (!snapshot) {
    await store.write('state-snapshot.json', {
      schema_version: 2,
      written_at: nowIsoUtc(),
      buffer_count: 0,
      proposal_counts: { queued: 0, surfaced: 0, ignored: 0 },
      mode: 'observe',
      degraded: false,
    });
  }
}

export function makeStateStore(projectRoot: string): StateStore {
  return new StateStore(getCoherenceDir(projectRoot), getQuarantineDir(projectRoot));
}

/**
 * Project userConfig `defaultMode` onto the v0.1 `config.json#mode` enum
 * (observe | graduated). v0.2-only modes (annotate, author) project to
 * 'observe' here — they show up on the v0.2 `graduation.global_mode` side
 * via `pickV02Mode`.
 */
function pickV01Mode(): CoherenceMode {
  const m = resolveDefaultMode();
  return m === 'graduated' ? 'graduated' : 'observe';
}

/**
 * Project userConfig `defaultMode` onto the v0.2 `graduation.global_mode`
 * enum (observe | annotate | author). 'graduated' is a v0.1-only toggle —
 * project it to 'observe' on the v0.2 side; the legacy toggle in
 * `config.json#mode` carries the graduated state.
 */
function pickV02Mode(): V02Mode {
  const m = resolveDefaultMode();
  if (m === 'annotate' || m === 'author') return m;
  return 'observe';
}
