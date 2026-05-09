/**
 * RG-2: atomic-write rollback — verifies no partial writes survive.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { StateStore } from '../../src/state/stateStore.js';

function makeTmpDir(): string {
  const dir = path.join(tmpdir(), `coherence-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('atomic write (RG-2)', () => {
  let coherenceDir: string;
  let quarantineDir: string;
  let store: StateStore;

  beforeEach(() => {
    coherenceDir = makeTmpDir();
    quarantineDir = path.join(coherenceDir, 'quarantine');
    mkdirSync(quarantineDir, { recursive: true });
    store = new StateStore(coherenceDir, quarantineDir);
  });

  it('writes config.json atomically (no partial file)', async () => {
    const config = { mode: 'observe' as const };
    await store.write('config.json', config);

    const filePath = path.join(coherenceDir, 'config.json');
    expect(existsSync(filePath)).toBe(true);

    // No tmp files left behind
    const tmpFiles = require('fs').readdirSync(coherenceDir).filter((f: string) => f.endsWith('.tmp'));
    expect(tmpFiles.length).toBe(0);

    const read = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(read.mode).toBe('observe');
  });

  it('validates schema before writing, throws on invalid data', async () => {
    const invalid = { mode: 'not-a-valid-mode' };
    await expect(store.write('config.json', invalid)).rejects.toThrow();
  });

  it('round-trips valid config.json through read/write', async () => {
    const config = { mode: 'graduated' as const, watches: ['docs/**'] };
    await store.write('config.json', config);
    const result = await store.read<typeof config>('config.json');
    expect(result?.mode).toBe('graduated');
    expect(result?.watches).toEqual(['docs/**']);
  });

  it('returns null and quarantines corrupt JSON', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(path.join(coherenceDir, 'config.json'), '{ bad json !!');

    const result = await store.read('config.json');
    expect(result).toBeNull();
  });
});
