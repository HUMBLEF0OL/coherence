/**
 * /coherence:doctor contract tests.
 * Probes capabilities, writes host-capabilities.json, detects version delta.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { runDoctor } from '../../../src/commands/doctor.js';
import type { HostCapabilities } from '../../../src/types/index.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-doctor-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('/coherence:doctor', () => {
  it('writes host-capabilities.json on fresh probe', async () => {
    const result = await runDoctor(store);
    expect(result.fromCache).toBe(false);
    const caps = await store.read<HostCapabilities>('host-capabilities.json');
    expect(caps).not.toBeNull();
    expect(typeof caps!.subagent_attribution).toBe('boolean');
    expect(typeof caps!.frontmatter_preserves_unknown_keys).toBe('boolean');
  });

  it('initialProbe returns from cache on second call', async () => {
    await runDoctor(store, { initialProbe: true });
    const result2 = await runDoctor(store, { initialProbe: true });
    expect(result2.fromCache).toBe(true);
  });

  it('initialProbe detects host version delta and nudges reprobe', async () => {
    await runDoctor(store, { initialProbe: true, hostVersion: '1.0.0' });
    const result = await runDoctor(store, { initialProbe: true, hostVersion: '2.0.0' });
    expect(result.nudgeReprobe).toBe(true);
    expect(result.actions.some((a) => a.includes('version changed'))).toBe(true);
  });

  it('no nudge when host version is same', async () => {
    await runDoctor(store, { initialProbe: true, hostVersion: '1.0.0' });
    const result = await runDoctor(store, { initialProbe: true, hostVersion: '1.0.0' });
    expect(result.nudgeReprobe).toBe(false);
  });

  it('explicit invocation always reprobe (not initial)', async () => {
    await runDoctor(store);
    const result = await runDoctor(store);
    expect(result.fromCache).toBe(false);
    expect(result.actions.some((a) => a.includes('host-capabilities.json'))).toBe(true);
  });
});
