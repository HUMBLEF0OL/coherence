/**
 * NFR-RELIABILITY-7: 11 corruption events → only 10 backups kept
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { quarantineFile } from '../../src/state/quarantine.js';

function makeTmpDir(): string {
  const dir = path.join(tmpdir(), `coherence-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('quarantine retention (NFR-RELIABILITY-7)', () => {
  let baseDir: string;
  let quarantineDir: string;

  beforeEach(() => {
    baseDir = makeTmpDir();
    quarantineDir = path.join(baseDir, 'quarantine');
    mkdirSync(quarantineDir, { recursive: true });
  });

  it('keeps at most 10 backups per file after 11 quarantine events', async () => {
    const filePath = path.join(baseDir, 'config.json');

    for (let i = 0; i < 11; i++) {
      writeFileSync(filePath, `{"iteration": ${i}}`);
      quarantineFile(filePath, quarantineDir);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 5));
    }

    const backups = readdirSync(quarantineDir).filter(
      (f) => f.startsWith('config.json') && f.endsWith('.bak'),
    );
    expect(backups.length).toBeLessThanOrEqual(10);
  });
});
