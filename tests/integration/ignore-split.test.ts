/**
 * v0.3 M2 — /coherence:ignore-split idempotent integration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { runIgnoreSplit, formatIgnoreSplit } from '../../src/commands/ignoreSplit.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'coherence-ignore-split-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('/coherence:ignore-split (DD-096)', () => {
  it('creates the empty files + .gitignore line on a fresh repo', () => {
    const r = runIgnoreSplit(dir);
    expect(existsSync(path.join(dir, 'coherence', 'ignore'))).toBe(true);
    expect(existsSync(path.join(dir, 'coherence', 'ignore.local'))).toBe(true);
    const gi = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    expect(gi).toMatch(/coherence\/ignore\.local/);
    expect(gi).toMatch(/# cohrence — personal ignore/);
    expect(r.actions).toContain('Created empty coherence/ignore (committed)');
  });

  it('is idempotent — second run reports no-op', () => {
    runIgnoreSplit(dir);
    const r = runIgnoreSplit(dir);
    expect(r.actions).toEqual(['already split, no-op']);
    // .gitignore not duplicated.
    const gi = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    const matches = gi.match(/coherence\/ignore\.local/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('preserves an existing .gitignore and appends only the missing line', () => {
    writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.env\n');
    runIgnoreSplit(dir);
    const gi = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('node_modules');
    expect(gi).toContain('.env');
    expect(gi).toMatch(/coherence\/ignore\.local/);
  });

  it('formatter output is grep-able', () => {
    const r = runIgnoreSplit(dir);
    const text = formatIgnoreSplit(r);
    expect(text).toContain('[coherence] ignore-split:');
  });

  it('detects an existing entry without comment header (variant tolerance)', () => {
    writeFileSync(path.join(dir, '.gitignore'), 'coherence/ignore.local\n');
    const r = runIgnoreSplit(dir);
    // Files still get created on first run, but the gitignore action is not
    // re-issued.
    expect(r.actions.find((a) => a.includes('Appended'))).toBeUndefined();
    const gi = readFileSync(path.join(dir, '.gitignore'), 'utf8');
    const matches = gi.match(/coherence\/ignore\.local/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
