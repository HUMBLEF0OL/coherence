/**
 * v0.3 M4 — first-run telemetry consent (DD-115).
 *
 * Two-tier opt model:
 *   - **Local collection** (opt-OUT, default ON): hashed events written to
 *     `.claude/coherence/metrics.jsonl` on the developer's machine only.
 *   - **Upload** (opt-IN, default OFF): the developer manually invokes
 *     `/coherence:export-metrics` and decides where the redacted JSONL goes;
 *     v0.3 NEVER initiates a network request on its own (DD-117).
 *
 * Persisted to `.claude/coherence/config.json#telemetry`. Non-interactive
 * shells take defaults but flag `non_interactive_default: true` so the next
 * interactive SessionStart re-prompts.
 *
 * Re-prompt trigger: missing `recorded_at` (covers fresh installs +
 * partial/corrupt config files).
 */
import type { StateStore } from './stateStore.js';
import type { CoherenceConfig } from '../types/index.js';
import { nowIsoUtc } from '../util/time.js';

export interface TelemetryConsent {
  /** Hashed local event collection — default true. */
  local_collection: boolean;
  /** User-initiated upload consent — default false (opt-in). */
  upload_consent: boolean;
  /** ISO timestamp of decision. Absent → re-prompt at next SessionStart. */
  recorded_at: string;
  /** Plugin version that wrote the consent. */
  plugin_version: string;
  /**
   * True when the decision was taken from defaults because the shell was
   * non-interactive. The next interactive session re-prompts.
   */
  non_interactive_default?: boolean;
}

export interface ExtendedConfig extends CoherenceConfig {
  telemetry?: TelemetryConsent;
}

export interface TelemetryConsentDecision {
  local_collection: boolean;
  upload_consent: boolean;
}

export interface RecordTelemetryConsentArgs {
  /** Override decision (test injection / non-interactive override). */
  decision?: TelemetryConsentDecision;
  /** Suppresses console output (test runs). */
  silent?: boolean;
  /** Override version string for tests. */
  pluginVersion?: string;
}

const DEFAULT_DECISION: TelemetryConsentDecision = {
  local_collection: true,
  upload_consent: false,
};

const DEFAULT_PLUGIN_VERSION = '0.3.0';

export async function recordTelemetryConsent(
  store: StateStore,
  args: RecordTelemetryConsentArgs = {},
): Promise<TelemetryConsent> {
  const { decision, silent = false, pluginVersion = DEFAULT_PLUGIN_VERSION } = args;
  const config = (await store.read<ExtendedConfig>('config.json')) ?? {
    mode: 'observe',
  };

  // Already recorded — re-prompt only if `recorded_at` is missing/empty.
  if (config.telemetry?.recorded_at) {
    return config.telemetry;
  }

  const interactive = !!process.stdout.isTTY && decision === undefined;
  const chosen: TelemetryConsentDecision = decision ?? (interactive
    ? promptInteractive(silent)
    : DEFAULT_DECISION);

  const persisted: TelemetryConsent = {
    local_collection: chosen.local_collection,
    upload_consent: chosen.upload_consent,
    recorded_at: nowIsoUtc(),
    plugin_version: pluginVersion,
    ...(decision === undefined && !interactive ? { non_interactive_default: true } : {}),
  };

  const updated: ExtendedConfig = {
    ...config,
    telemetry: persisted,
  };
  await store.write('config.json', updated);

  if (!silent) {
    if (decision === undefined && !interactive) {
      console.log(
        '[coherence] telemetry consent — non-interactive shell; using defaults ' +
          '(local: ON, upload: OFF). The next interactive SessionStart will re-prompt.',
      );
    }
  }

  return persisted;
}

/**
 * Interactive prompt placeholder. Actual stdin pumping is left to the host
 * environment — Claude Code's `/coherence:doctor` will surface the prompt as
 * a slash-command output rather than spawning a TTY question. For now this
 * function returns the defaults; the user can override consent via
 * `setTelemetryConsent` (below) at any time.
 */
function promptInteractive(_silent: boolean): TelemetryConsentDecision {
  // M4 placeholder: the slash-command surface owns the interactive flow.
  // Returning defaults here keeps SessionStart non-blocking; the user runs
  // `/coherence:graduate` or `/coherence:status` to surface the prompt.
  return DEFAULT_DECISION;
}

/**
 * Public setter: lets a slash-command (or test) explicitly write a consent
 * decision. Re-call to amend.
 */
export async function setTelemetryConsent(
  store: StateStore,
  decision: TelemetryConsentDecision,
  pluginVersion: string = DEFAULT_PLUGIN_VERSION,
): Promise<TelemetryConsent> {
  const config = (await store.read<ExtendedConfig>('config.json')) ?? { mode: 'observe' };
  const persisted: TelemetryConsent = {
    local_collection: decision.local_collection,
    upload_consent: decision.upload_consent,
    recorded_at: nowIsoUtc(),
    plugin_version: pluginVersion,
  };
  await store.write('config.json', { ...config, telemetry: persisted });
  return persisted;
}

export async function readTelemetryConsent(
  store: StateStore,
): Promise<TelemetryConsent | undefined> {
  const config = await store.read<ExtendedConfig>('config.json');
  return config?.telemetry;
}
