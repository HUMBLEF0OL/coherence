/**
 * First-touch creation of .claude/coherence/ skeleton.
 * Called by SessionStart (M2/M4). FR-INSTALL-2
 */
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { StateStore } from './stateStore.js';
import type { VersionInfo, CoherenceConfig } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

const CURRENT_SCHEMA_VERSION = 1;
const PLUGIN_VERSION = '0.1.0';

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
      mode: 'observe',
    };
    await store.write('config.json', defaultConfig);
  }

  // Create scan-cache reservation dir
  const scanCacheDir = path.join(coherenceDir, 'scan-cache');
  if (!existsSync(scanCacheDir)) {
    mkdirSync(scanCacheDir, { recursive: true });
    // Placeholder for v0.2 trickle-scan
    writeFileSync(path.join(scanCacheDir, '.gitkeep'), '');
  }
}

export function makeStateStore(projectRoot: string): StateStore {
  return new StateStore(getCoherenceDir(projectRoot), getQuarantineDir(projectRoot));
}
