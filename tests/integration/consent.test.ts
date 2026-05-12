/**
 * M-CONSENT-1 — /coherence:consent (v0.4 DD-127).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(path.join(os.tmpdir(), 'consent-test-'));
  mkdirSync(path.join(projectRoot, '.claude', 'coherence', 'quarantine'), {
    recursive: true,
  });
});
afterEach(() => rmSync(projectRoot, { recursive: true, force: true }));

describe('/coherence:consent (M-CONSENT-1)', () => {
  it('shows defaults (local=on, upload=off) on fresh state', async () => {
    const { runConsent } = await import('../../src/commands/consent.js');
    const out = await runConsent(projectRoot);
    expect(out).toContain('local:  on');
    expect(out).toContain('upload: off');
  });

  it('sets local=off and persists it', async () => {
    const { runConsent } = await import('../../src/commands/consent.js');
    await runConsent(projectRoot, { local: 'off' });
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    expect(
      (cfg?.['telemetry'] as Record<string, unknown> | undefined)?.['local_collection'],
    ).toBe(false);
    expect(
      typeof (cfg?.['telemetry'] as Record<string, unknown> | undefined)?.['recorded_at'],
    ).toBe('string');
  });

  it('sets upload=on and persists it', async () => {
    const { runConsent } = await import('../../src/commands/consent.js');
    await runConsent(projectRoot, { upload: 'on' });
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    expect(
      (cfg?.['telemetry'] as Record<string, unknown> | undefined)?.['upload_consent'],
    ).toBe(true);
  });

  it('reset removes the telemetry key entirely', async () => {
    const { runConsent } = await import('../../src/commands/consent.js');
    await runConsent(projectRoot, { local: 'off' });
    await runConsent(projectRoot, { reset: true });
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    expect(cfg?.['telemetry']).toBeUndefined();
  });

  it('read-only call does not write a telemetry block when state is default', async () => {
    const { runConsent } = await import('../../src/commands/consent.js');
    const out = await runConsent(projectRoot);
    expect(out).toContain('Consent state');
    const { makeStateStore } = await import('../../src/state/init.js');
    const store = makeStateStore(projectRoot);
    const cfg = await store.read<Record<string, unknown>>('config.json');
    expect(cfg?.['telemetry']).toBeUndefined();
  });
});
