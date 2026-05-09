/**
 * /coherence:graduate — toggle mode: observe ↔ graduated.
 * --revert restores Observe.
 * FR-COMMANDS-5, DD-021
 */
import type { StateStore } from '../state/stateStore.js';
import type { CoherenceConfig, CoherenceMode, VersionInfo } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

export interface GraduateOptions {
  revert?: boolean;
}

export interface GraduateResult {
  previousMode: CoherenceMode;
  newMode: CoherenceMode;
  message: string;
}

export async function runGraduate(
  store: StateStore,
  opts: GraduateOptions = {},
): Promise<GraduateResult> {
  const config = await store.read<CoherenceConfig>('config.json');
  const previousMode: CoherenceMode = config?.mode ?? 'observe';

  const newMode: CoherenceMode = opts.revert ? 'observe' : 'graduated';

  await store.write<CoherenceConfig>('config.json', {
    ...(config ?? {}),
    mode: newMode,
  });

  // Persist mode change timestamp to version.json
  const version = await store.read<VersionInfo>('version.json');
  if (version) {
    await store.write<VersionInfo>('version.json', {
      ...version,
      upgraded_at: nowIsoUtc(),
    });
  }

  const verb = opts.revert ? 'reverted to' : 'upgraded to';
  const message = `[coherence] graduate: ${verb} ${newMode} mode (was: ${previousMode})`;

  return { previousMode, newMode, message };
}
