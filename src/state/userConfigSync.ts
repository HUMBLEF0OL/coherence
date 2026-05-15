/**
 * userConfig → state sync (C4 follow-up for N4).
 *
 * v0.4 ships userConfig as install-time only — `runFreshInstall` reads
 * `CLAUDE_PLUGIN_OPTION_*` env vars and seeds `graduation.json` /
 * `config.json#telemetry`, but subsequent flips in Claude Code's settings
 * never propagate (the consent record short-circuits on `recorded_at`,
 * graduation.json sticks once written).
 *
 * This module adds change-detection sync: on every SessionStart we
 * remember the last-seen env-var values in `config.json#userConfigSync`,
 * and only re-apply when the current env-var value DIFFERS from the
 * recorded one. So:
 *
 *   - userConfig flipped via Claude Code settings → env differs from
 *     recorded → apply new value (+ remember it).
 *   - User runtime overrides (`/coherence:consent --upload off`,
 *     `/coherence:graduate ...`) → env unchanged from recorded → no-op
 *     so the user's CLI decision is preserved.
 *
 * Env vars never seen (undefined) are treated as "don't touch" — Claude
 * Code may or may not emit them depending on whether the user kept the
 * userConfig field. Reverting to defaults requires the user to type
 * the runtime command, same as before.
 */
import type { StateStore } from './stateStore.js';
import type { CoherenceConfig } from '../types/index.js';
import type { TelemetryConsent } from './consent.js';
import type { GraduationFile, V02Mode } from './graduation.js';
import { readGraduation, writeGraduation } from './graduation.js';
import { setTelemetryConsent } from './consent.js';

export interface UserConfigSync {
  /** Env value at last sync; undefined ⇒ never seen. */
  defaultMode?: string;
  telemetryOptIn?: boolean;
}

export interface SyncableConfig extends CoherenceConfig {
  telemetry?: TelemetryConsent;
  userConfigSync?: UserConfigSync;
}

export interface SyncResult {
  modeChanged: boolean;
  telemetryChanged: boolean;
}

function readEnvMode(): string | undefined {
  return process.env['CLAUDE_PLUGIN_OPTION_DEFAULTMODE'];
}

function readEnvTelemetry(): boolean | undefined {
  const env = process.env['CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN'];
  if (env === undefined) return undefined;
  return env === 'true' || env === '1';
}

const V02_MODES: ReadonlySet<V02Mode> = new Set<V02Mode>(['observe', 'annotate', 'author']);

function projectModeToV02(mode: string): V02Mode {
  if (V02_MODES.has(mode as V02Mode)) return mode as V02Mode;
  // 'graduated' is a v0.1-only toggle — keep v0.2 graduation as 'observe'.
  return 'observe';
}

export async function syncUserConfigToState(store: StateStore): Promise<SyncResult> {
  const result: SyncResult = { modeChanged: false, telemetryChanged: false };

  const config = (await store.read<SyncableConfig>('config.json')) ?? { mode: 'observe' };
  const recorded: UserConfigSync = config.userConfigSync ?? {};

  const envMode = readEnvMode();
  const envTel = readEnvTelemetry();

  let nextRecorded: UserConfigSync = { ...recorded };
  let configDirty = false;

  // Mode sync: only apply when env is defined AND differs from recorded.
  if (envMode !== undefined && envMode !== recorded.defaultMode) {
    const graduation = await readGraduation(store);
    const next: GraduationFile = { ...graduation, global_mode: projectModeToV02(envMode) };
    await writeGraduation(store, next);
    nextRecorded.defaultMode = envMode;
    result.modeChanged = true;
    configDirty = true;
  }

  // Telemetry sync: same rule. Apply via setTelemetryConsent so the
  // recorded_at timestamp + plugin_version stamp stay coherent.
  if (envTel !== undefined && envTel !== recorded.telemetryOptIn) {
    await setTelemetryConsent(store, {
      local_collection: config.telemetry?.local_collection ?? true,
      upload_consent: envTel,
    });
    nextRecorded.telemetryOptIn = envTel;
    result.telemetryChanged = true;
    configDirty = true;
  }

  if (configDirty) {
    // Re-read because setTelemetryConsent may have mutated config.json.
    const fresh = (await store.read<SyncableConfig>('config.json')) ?? config;
    await store.write('config.json', { ...fresh, userConfigSync: nextRecorded });
  }

  return result;
}
