/**
 * userConfig change-detection sync (N4 — C4 follow-up).
 *
 * Verifies that flipping `CLAUDE_PLUGIN_OPTION_*` env vars after install
 * propagates to on-disk state at SessionStart, but only when the env
 * value DIFFERS from the recorded last-seen value. Runtime user overrides
 * (`/coherence:consent --upload off`, `/coherence:graduate ...`) stay
 * untouched because they don't change the env-var signature.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runFreshInstall } from '../../../src/state/firstRun.js';
import { syncUserConfigToState } from '../../../src/state/userConfigSync.js';
import { makeStateStore } from '../../../src/state/init.js';
import { readGraduation } from '../../../src/state/graduation.js';
import { readTelemetryConsent } from '../../../src/state/consent.js';

const MODE_KEY = 'CLAUDE_PLUGIN_OPTION_DEFAULTMODE';
const TEL_KEY = 'CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN';

describe('syncUserConfigToState', () => {
  let tmp: string;
  const origMode = process.env[MODE_KEY];
  const origTel = process.env[TEL_KEY];

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'coherence-userConfigSync-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (origMode === undefined) delete process.env[MODE_KEY];
    else process.env[MODE_KEY] = origMode;
    if (origTel === undefined) delete process.env[TEL_KEY];
    else process.env[TEL_KEY] = origTel;
  });

  it('no-ops when no env vars are set and no recorded sync exists', async () => {
    delete process.env[MODE_KEY];
    delete process.env[TEL_KEY];
    await runFreshInstall(tmp, { silent: true });
    const store = makeStateStore(tmp);

    const result = await syncUserConfigToState(store);
    expect(result.modeChanged).toBe(false);
    expect(result.telemetryChanged).toBe(false);

    const graduation = await readGraduation(store);
    expect(graduation.global_mode).toBe('observe');
  });

  it('propagates a newly-set defaultMode env var after install (no recorded sync)', async () => {
    delete process.env[MODE_KEY];
    delete process.env[TEL_KEY];
    await runFreshInstall(tmp, { silent: true });

    // Now the user flips userConfig in Claude Code settings before the
    // next session — Claude Code emits the new env var.
    process.env[MODE_KEY] = 'annotate';
    const store = makeStateStore(tmp);

    const result = await syncUserConfigToState(store);
    expect(result.modeChanged).toBe(true);

    const graduation = await readGraduation(store);
    expect(graduation.global_mode).toBe('annotate');
  });

  it('no-ops on a repeat sync when env value matches recorded', async () => {
    process.env[MODE_KEY] = 'author';
    await runFreshInstall(tmp, { silent: true });
    const store = makeStateStore(tmp);

    // First sync seeds the userConfigSync record.
    const first = await syncUserConfigToState(store);
    expect(first.modeChanged).toBe(true);

    // Second sync sees the same env — no-op.
    const second = await syncUserConfigToState(store);
    expect(second.modeChanged).toBe(false);
  });

  it('reverts telemetry upload when userConfig flips true → false', async () => {
    process.env[TEL_KEY] = 'true';
    await runFreshInstall(tmp, { silent: true });
    const store = makeStateStore(tmp);

    // Seed the sync record.
    await syncUserConfigToState(store);
    const afterFirst = await readTelemetryConsent(store);
    expect(afterFirst?.upload_consent).toBe(true);

    // User toggles userConfig off in settings.
    process.env[TEL_KEY] = 'false';
    const result = await syncUserConfigToState(store);
    expect(result.telemetryChanged).toBe(true);

    const afterFlip = await readTelemetryConsent(store);
    expect(afterFlip?.upload_consent).toBe(false);
  });

  it('preserves a /coherence:consent CLI override when userConfig env is unchanged', async () => {
    // User installs with userConfig telemetryOptIn=false, then later runs
    // /coherence:consent --upload on (simulated by writing the record
    // directly). The env var hasn't changed (still false), so the sync
    // must leave the CLI decision alone.
    process.env[TEL_KEY] = 'false';
    await runFreshInstall(tmp, { silent: true });
    const store = makeStateStore(tmp);

    // First sync seeds the recorded false value (matches env — no-op).
    await syncUserConfigToState(store);

    // CLI override: user runs /coherence:consent --upload on
    const { setTelemetryConsent } = await import('../../../src/state/consent.js');
    await setTelemetryConsent(store, { local_collection: true, upload_consent: true });
    const afterCli = await readTelemetryConsent(store);
    expect(afterCli?.upload_consent).toBe(true);

    // Next SessionStart — env is still false, recorded sync is false,
    // so we must NOT touch upload_consent.
    const result = await syncUserConfigToState(store);
    expect(result.telemetryChanged).toBe(false);
    const final = await readTelemetryConsent(store);
    expect(final?.upload_consent).toBe(true);
  });

  it('leaves graduation untouched when env mode is unset (no recorded sync to compare against)', async () => {
    // The user has been on observe forever; the userConfigSync block is
    // absent. SessionStart fires with no env var. Nothing should change.
    await runFreshInstall(tmp, { silent: true });
    const store = makeStateStore(tmp);

    // Hand-mutate graduation to author (simulating /coherence:graduate).
    const { writeGraduation } = await import('../../../src/state/graduation.js');
    const before = await readGraduation(store);
    await writeGraduation(store, { ...before, global_mode: 'author' });

    delete process.env[MODE_KEY];
    const result = await syncUserConfigToState(store);
    expect(result.modeChanged).toBe(false);

    const after = await readGraduation(store);
    expect(after.global_mode).toBe('author');
  });
});
