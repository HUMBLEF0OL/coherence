/**
 * SG-3 boundary: install-statusline IS allowed to write ~/.claude/settings.json
 * (it is on the allow-list); any other module attempting that write fails
 * the boundary (covered by sg-3-no-out-of-quarantine-write.test.ts).
 *
 * This test verifies the round-trip: install creates a backup and writes a
 * statusLine entry; uninstall restores the backup byte-for-byte.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
  installStatusline,
  InstallStatuslineRefusal,
} from '../../../src/commands/installStatusline.js';
import { uninstallStatusline } from '../../../src/commands/uninstallStatusline.js';

let homeDir: string;
let settingsPath: string;
let scriptPath: string;

beforeEach(() => {
  homeDir = mkdtempSync(path.join(tmpdir(), 'coherence-sl-'));
  mkdirSync(path.join(homeDir, '.claude'), { recursive: true });
  settingsPath = path.join(homeDir, '.claude', 'settings.json');
  scriptPath = path.join(homeDir, 'coherence-statusline.sh');
  writeFileSync(scriptPath, '#!/usr/bin/env bash\n');
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
});

describe('install/uninstall statusline round-trip (FR-STATUSLINE-2..3)', () => {
  it('refuses without confirm=true', () => {
    expect(() =>
      installStatusline({
        confirm: false,
        settingsPath,
        statuslineScriptPath: scriptPath,
      }),
    ).toThrow(InstallStatuslineRefusal);
  });

  it('refuses when statusline script does not exist', () => {
    expect(() =>
      installStatusline({
        confirm: true,
        settingsPath,
        statuslineScriptPath: path.join(homeDir, 'missing.sh'),
      }),
    ).toThrow(InstallStatuslineRefusal);
  });

  it('install creates a backup and writes statusLine entry', () => {
    writeFileSync(settingsPath, JSON.stringify({ existing: true }) + '\n');
    const r = installStatusline({
      confirm: true,
      settingsPath,
      statuslineScriptPath: scriptPath,
    });
    expect(r.installed).toBe(true);
    expect(r.backupPath).toBeTruthy();
    expect(existsSync(r.backupPath!)).toBe(true);

    const after = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(after.existing).toBe(true);
    expect(after.statusLine.command).toBe(scriptPath);
  });

  it('uninstall restores the most recent backup', () => {
    const original = JSON.stringify({ before: 'install' }, null, 2) + '\n';
    writeFileSync(settingsPath, original);
    installStatusline({
      confirm: true,
      settingsPath,
      statuslineScriptPath: scriptPath,
    });
    const r = uninstallStatusline({ settingsPath });
    expect(r.uninstalled).toBe(true);
    const restored = readFileSync(settingsPath, 'utf8');
    expect(restored).toBe(original);
  });

  it('uninstall reports no_backup_found when no prior backup', () => {
    writeFileSync(settingsPath, '{}\n');
    const r = uninstallStatusline({ settingsPath });
    expect(r.uninstalled).toBe(false);
    expect(r.reason).toBe('no_backup_found');
  });
});
