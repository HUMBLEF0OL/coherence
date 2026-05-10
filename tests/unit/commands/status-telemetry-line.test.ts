/**
 * v0.3 M4 — /coherence:status surfaces a telemetry line.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { initCoherenceDir, makeStateStore, getCoherenceDir } from '../../../src/state/init.js';
import { runStatus } from '../../../src/commands/status.js';
import { setTelemetryConsent } from '../../../src/state/consent.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-status-telemetry-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runStatus telemetry line (DD-115)', () => {
  it('reflects local=on / upload=off when consent recorded', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    await setTelemetryConsent(store, { local_collection: true, upload_consent: false });
    const r = await runStatus(store, getCoherenceDir(dir));
    const line = r.lines.find((l) => l.includes('Telemetry'));
    expect(line).toContain('local=on');
    expect(line).toContain('upload=off');
  });

  it('reflects upload=on when consent grants', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    await setTelemetryConsent(store, { local_collection: true, upload_consent: true });
    const r = await runStatus(store, getCoherenceDir(dir));
    const line = r.lines.find((l) => l.includes('Telemetry'));
    expect(line).toContain('upload=on');
  });

  it('shows "not yet recorded" when consent is absent', async () => {
    await initCoherenceDir(dir);
    const store = makeStateStore(dir);
    const r = await runStatus(store, getCoherenceDir(dir));
    const line = r.lines.find((l) => l.includes('Telemetry'));
    expect(line).toContain('not yet recorded');
  });
});
