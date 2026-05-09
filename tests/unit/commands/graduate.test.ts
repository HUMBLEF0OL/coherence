/**
 * /coherence:graduate contract tests.
 * Toggles observe ↔ graduated; --revert restores observe.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { StateStore } from '../../../src/state/stateStore.js';
import { runGraduate } from '../../../src/commands/graduate.js';
import type { CoherenceConfig } from '../../../src/types/index.js';

let tmpDir: string;
let store: StateStore;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'coherence-graduate-'));
  store = new StateStore(tmpDir, path.join(tmpDir, 'quarantine'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('/coherence:graduate', () => {
  it('switches observe → graduated', async () => {
    await store.write<CoherenceConfig>('config.json', { mode: 'observe' });
    const result = await runGraduate(store);
    expect(result.previousMode).toBe('observe');
    expect(result.newMode).toBe('graduated');

    const config = await store.read<CoherenceConfig>('config.json');
    expect(config?.mode).toBe('graduated');
  });

  it('--revert switches graduated → observe', async () => {
    await store.write<CoherenceConfig>('config.json', { mode: 'graduated' });
    const result = await runGraduate(store, { revert: true });
    expect(result.previousMode).toBe('graduated');
    expect(result.newMode).toBe('observe');

    const config = await store.read<CoherenceConfig>('config.json');
    expect(config?.mode).toBe('observe');
  });

  it('message includes mode transition', async () => {
    await store.write<CoherenceConfig>('config.json', { mode: 'observe' });
    const result = await runGraduate(store);
    expect(result.message).toContain('graduated');
    expect(result.message).toContain('observe');
  });

  it('defaults to observe when no config exists', async () => {
    const result = await runGraduate(store);
    expect(result.previousMode).toBe('observe');
    expect(result.newMode).toBe('graduated');
  });
});
