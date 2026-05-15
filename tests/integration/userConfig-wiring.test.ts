/**
 * userConfig env-var wiring integration test (C4).
 *
 * Confirms that the install-time userConfig values surfaced as
 * `CLAUDE_PLUGIN_OPTION_*` env vars actually flow through `runFreshInstall`
 * → `initCoherenceDir` → on-disk `graduation.json` + `config.json`. The
 * unit tests on `resolveDefaultMode` / `resolveTelemetryOptIn` only cover
 * the resolver in isolation; this test locks in the end-to-end contract
 * the C4 plan claims.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runFreshInstall } from '../../src/state/firstRun.js';

const MODE_KEY = 'CLAUDE_PLUGIN_OPTION_DEFAULTMODE';
const TEL_KEY = 'CLAUDE_PLUGIN_OPTION_TELEMETRYOPTIN';

describe('C4 — userConfig → on-disk wiring', () => {
  let tmp: string;
  const origMode = process.env[MODE_KEY];
  const origTel = process.env[TEL_KEY];

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'coherence-userConfig-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    if (origMode === undefined) delete process.env[MODE_KEY];
    else process.env[MODE_KEY] = origMode;
    if (origTel === undefined) delete process.env[TEL_KEY];
    else process.env[TEL_KEY] = origTel;
  });

  function readJson<T>(rel: string): T {
    return JSON.parse(
      readFileSync(path.join(tmp, '.claude', 'coherence', rel), 'utf8'),
    ) as T;
  }

  it('defaults to observe + upload-off when no env vars are set', async () => {
    delete process.env[MODE_KEY];
    delete process.env[TEL_KEY];
    await runFreshInstall(tmp, { silent: true });

    const graduation = readJson<{ global_mode: string }>('graduation.json');
    const config = readJson<{ mode: string; telemetry?: { upload_consent: boolean } }>(
      'config.json',
    );
    expect(graduation.global_mode).toBe('observe');
    expect(config.mode).toBe('observe');
    expect(config.telemetry?.upload_consent).toBe(false);
  });

  it('projects userConfig defaultMode=annotate onto v0.2 graduation.global_mode', async () => {
    process.env[MODE_KEY] = 'annotate';
    delete process.env[TEL_KEY];
    await runFreshInstall(tmp, { silent: true });

    const graduation = readJson<{ global_mode: string }>('graduation.json');
    const config = readJson<{ mode: string }>('config.json');
    expect(graduation.global_mode).toBe('annotate');
    // v0.1 mode enum is observe|graduated — annotate projects to 'observe' there.
    expect(config.mode).toBe('observe');
  });

  it('projects userConfig defaultMode=graduated onto v0.1 config.mode', async () => {
    process.env[MODE_KEY] = 'graduated';
    delete process.env[TEL_KEY];
    await runFreshInstall(tmp, { silent: true });

    const graduation = readJson<{ global_mode: string }>('graduation.json');
    const config = readJson<{ mode: string }>('config.json');
    expect(config.mode).toBe('graduated');
    // v0.2 graduation enum is observe|annotate|author — 'graduated' projects
    // back to 'observe' on the v0.2 side; the legacy toggle carries the bit.
    expect(graduation.global_mode).toBe('observe');
  });

  it('honours telemetryOptIn=true by recording upload_consent=true silently', async () => {
    delete process.env[MODE_KEY];
    process.env[TEL_KEY] = 'true';
    await runFreshInstall(tmp, { silent: true });

    const config = readJson<{ telemetry: { upload_consent: boolean; recorded_at: string } }>(
      'config.json',
    );
    expect(config.telemetry.upload_consent).toBe(true);
    expect(config.telemetry.recorded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not re-create state when graduation.json already exists', async () => {
    // First install with defaultMode=author.
    process.env[MODE_KEY] = 'author';
    await runFreshInstall(tmp, { silent: true });
    const first = readJson<{ global_mode: string }>('graduation.json');
    expect(first.global_mode).toBe('author');

    // Second install with a different env var should NOT rewrite the file —
    // init.ts only writes graduation.json when it doesn't already exist.
    process.env[MODE_KEY] = 'annotate';
    await runFreshInstall(tmp, { silent: true });
    const second = readJson<{ global_mode: string }>('graduation.json');
    expect(second.global_mode).toBe('author');
    expect(existsSync(path.join(tmp, '.claude', 'coherence', 'graduation.json'))).toBe(true);
  });
});
