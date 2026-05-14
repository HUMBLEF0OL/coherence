/**
 * v0.3 M4 — first-run consent persistence + re-prompt on missing recorded_at.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { runFreshInstall } from '../../src/state/firstRun.js';
import { makeStateStore } from '../../src/state/init.js';
import { readTelemetryConsent, setTelemetryConsent } from '../../src/state/consent.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-first-run-consent-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('first-run consent (DD-115)', () => {
  it('non-interactive default: local=ON, upload=OFF, non_interactive_default=true', async () => {
    await runFreshInstall(dir, { silent: true });
    const store = makeStateStore(dir);
    const consent = await readTelemetryConsent(store);
    expect(consent).toBeDefined();
    expect(consent!.local_collection).toBe(true);
    expect(consent!.upload_consent).toBe(false);
    expect(consent!.recorded_at).toMatch(/^\d{4}-/);
    // Vitest runs non-interactive → defaults flagged.
    expect(consent!.non_interactive_default ?? false).toBe(true);
  });

  it('explicit decision overrides defaults and clears non_interactive_default', async () => {
    await runFreshInstall(dir, {
      consent: { local_collection: true, upload_consent: true },
      silent: true,
    });
    const store = makeStateStore(dir);
    const consent = await readTelemetryConsent(store);
    expect(consent!.upload_consent).toBe(true);
    expect(consent!.non_interactive_default).toBeUndefined();
  });

  it('re-prompts at next SessionStart when recorded_at is missing', async () => {
    await runFreshInstall(dir, { silent: true });
    const store = makeStateStore(dir);
    // Simulate config corruption: delete recorded_at.
    const cfgPath = path.join(dir, '.claude', 'coherence', 'config.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as Record<string, unknown>;
    const tele = cfg.telemetry as Record<string, unknown>;
    delete tele.recorded_at;
    cfg.telemetry = tele;
    mkdirSync(path.dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify(cfg));

    // Re-run firstRun: should re-prompt (write a new recorded_at).
    await runFreshInstall(dir, { silent: true });
    const consent = await readTelemetryConsent(store);
    expect(consent!.recorded_at).toMatch(/^\d{4}-/);
  });

  it('idempotent: re-running with consent already recorded does not overwrite recorded_at', async () => {
    await runFreshInstall(dir, {
      consent: { local_collection: true, upload_consent: true },
      silent: true,
    });
    const store = makeStateStore(dir);
    const first = (await readTelemetryConsent(store))!.recorded_at;

    // Wait for clock movement, then re-run.
    await new Promise((r) => setTimeout(r, 5));
    await runFreshInstall(dir, { silent: true });
    const second = (await readTelemetryConsent(store))!.recorded_at;
    expect(second).toBe(first);
  });

  it('setTelemetryConsent updates the persisted decision', async () => {
    await runFreshInstall(dir, { silent: true });
    const store = makeStateStore(dir);
    await setTelemetryConsent(store, { local_collection: false, upload_consent: false });
    const consent = await readTelemetryConsent(store);
    expect(consent!.local_collection).toBe(false);
  });

  // ── audit-fix E1 / T7: BOM-prefixed .gitignore is parsed correctly ──────

  it('idempotent against a UTF-8 BOM-prefixed .gitignore (E1)', async () => {
    // Pre-seed .gitignore WITH a BOM and the per-developer entry already
    // present. firstRun must NOT re-append.
    const bom = '﻿';
    const seeded =
      bom +
      '# Coherence plugin — per-developer state (do not commit)\n' +
      '.claude/coherence/\n';
    writeFileSync(path.join(dir, '.gitignore'), seeded, 'utf8');
    await runFreshInstall(dir, { silent: true });
    const after = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    // NFR-PRIVACY-N5: directory-level ignore covers every per-developer state
    // file under .claude/coherence/ (trust-ledger, signal-cache, scan-cache,
    // proposal-cache, metrics.jsonl, coherence-log.md, etc.). Should be
    // present exactly once after a no-op re-run.
    const dirIgnoreMatches = after.match(/^\.claude\/coherence\/$/gm) ?? [];
    expect(dirIgnoreMatches.length).toBe(1);
  });

  it('writes a directory-level .gitignore line on a fresh project (NFR-PRIVACY-N5)', async () => {
    await runFreshInstall(dir, { silent: true });
    const gi = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    expect(gi).toMatch(/^\.claude\/coherence\/$/m);
    // The narrow single-file ignores from earlier versions must NOT be
    // re-introduced — they let several per-developer files leak through.
    expect(gi).not.toMatch(/^\.claude\/coherence\/signal-cache\.json$/m);
    expect(gi).not.toMatch(/^\.claude\/coherence\/session-map\.json$/m);
  });

  // ── v1.0.1 regression: DEFAULT_PLUGIN_VERSION was hardcoded to '0.4.0' ──
  // (commit 2b1a60a). assertVersionSync didn't catch the embedded constant
  // because it only checked the three top-level version sources. The fresh
  // install must write the SAME plugin_version into both version.json
  // (read from init.ts PLUGIN_VERSION) and config.json#telemetry.
  it('telemetry consent plugin_version matches version.json (regression: 2b1a60a)', async () => {
    await runFreshInstall(dir, { silent: true });
    const store = makeStateStore(dir);
    const versionInfo = await store.read<{ plugin_version: string }>('version.json');
    const consent = await readTelemetryConsent(store);
    expect(versionInfo?.plugin_version).toBeDefined();
    expect(consent?.plugin_version).toBeDefined();
    expect(consent!.plugin_version).toBe(versionInfo!.plugin_version);
  });

  it('telemetry consent plugin_version equals init.ts PLUGIN_VERSION export', async () => {
    // Stronger guard: the consent record must follow the canonical export
    // from init.ts, not a divergent constant defined inside consent.ts.
    const { PLUGIN_VERSION } = await import('../../src/state/init.js');
    await runFreshInstall(dir, { silent: true });
    const store = makeStateStore(dir);
    const consent = await readTelemetryConsent(store);
    expect(consent!.plugin_version).toBe(PLUGIN_VERSION);
  });
});
