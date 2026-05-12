/**
 * M-LAYOUT-1 — v0.4 DD-122.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { refuseLayout, REFUSE_LAYOUT_MESSAGE } from '../../../src/state/refuseLegacy.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'refuse-layout-'));
});
afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

describe('refuseLayout (M-LAYOUT-1)', () => {
  it('returns null when pluginRoot is empty string', () => {
    expect(refuseLayout('')).toBeNull();
  });

  it('returns null when plugin.json absent at root', () => {
    expect(refuseLayout(tmpDir)).toBeNull();
  });

  it('returns refuse_layout when plugin.json present at root (old v0.3 layout)', () => {
    writeFileSync(path.join(tmpDir, 'plugin.json'), '{}');
    const result = refuseLayout(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('refuse_layout');
    expect(result!.message).toContain(REFUSE_LAYOUT_MESSAGE.slice(0, 20));
  });

  it('returns null when only .claude-plugin/plugin.json present (correct v0.4 layout)', () => {
    mkdirSync(path.join(tmpDir, '.claude-plugin'));
    writeFileSync(path.join(tmpDir, '.claude-plugin', 'plugin.json'), '{}');
    expect(refuseLayout(tmpDir)).toBeNull();
  });
});
