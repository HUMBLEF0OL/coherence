/**
 * v0.4 M3 — /coherence:consent (DD-127, FR-CONSENT-1).
 *
 * Read/write telemetry consent without a TTY. Delegates to the existing
 * `setTelemetryConsent` / `readTelemetryConsent` helpers in `state/consent.ts`
 * — those own the canonical `config.json#telemetry` field names.
 */
import { makeStateStore } from '../state/init.js';
import {
  setTelemetryConsent,
  readTelemetryConsent,
  type ExtendedConfig,
} from '../state/consent.js';

export interface ConsentOptions {
  local?: 'on' | 'off';
  upload?: 'on' | 'off';
  reset?: boolean;
}

export async function runConsent(
  projectRoot: string,
  options: ConsentOptions = {},
): Promise<string> {
  const store = makeStateStore(projectRoot);

  if (options.reset) {
    const config = (await store.read<ExtendedConfig>('config.json')) ?? {
      mode: 'observe',
    };
    if (config.telemetry !== undefined) {
      const { telemetry: _drop, ...rest } = config;
      void _drop;
      await store.write('config.json', rest);
    }
    return 'Consent reset to defaults: local=on, upload=off.';
  }

  if (options.local !== undefined || options.upload !== undefined) {
    const existing = await readTelemetryConsent(store);
    await setTelemetryConsent(store, {
      local_collection:
        options.local !== undefined
          ? options.local === 'on'
          : existing?.local_collection ?? true,
      upload_consent:
        options.upload !== undefined
          ? options.upload === 'on'
          : existing?.upload_consent ?? false,
    });
    const updated = await readTelemetryConsent(store);
    return `Consent updated: local=${
      updated?.local_collection !== false ? 'on' : 'off'
    }, upload=${updated?.upload_consent === true ? 'on' : 'off'}.`;
  }

  // Read-only display.
  const tel = await readTelemetryConsent(store);
  const lines = [
    'Consent state:',
    `  local:  ${tel?.local_collection !== false ? 'on' : 'off'}`,
    `  upload: ${tel?.upload_consent === true ? 'on' : 'off'}`,
  ];
  if (tel?.recorded_at) lines.push(`  Last changed: ${tel.recorded_at}`);
  return lines.join('\n');
}
