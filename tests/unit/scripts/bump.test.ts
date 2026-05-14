import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bumpAllSources } from '../../../scripts/bump.mjs';

describe('bumpAllSources', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'coherence-bump-'));
    writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'coherence', version: '1.0.3' }, null, 2));
    writeFileSync(path.join(tmp, 'package-lock.json'), JSON.stringify({ name: 'coherence', version: '1.0.3', lockfileVersion: 3 }, null, 2));
    writeFileSync(path.join(tmp, 'plugin.json'), JSON.stringify({ name: 'coherence', version: '1.0.3' }, null, 2));
    writeFileSync(path.join(tmp, 'marketplace.json'), JSON.stringify({
      name: 'coherence',
      plugins: [{ name: 'coherence', version: '1.0.3', source: { source: 'url', url: 'x', ref: 'v1.0.3' } }],
    }, null, 2));
    writeFileSync(path.join(tmp, 'init.ts'), `export const PLUGIN_VERSION = '1.0.3';\n`);
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('updates all 7 version sources to the target version', () => {
    bumpAllSources('1.1.0', {
      packageJsonPath: path.join(tmp, 'package.json'),
      packageLockPath: path.join(tmp, 'package-lock.json'),
      pluginJsonPath: path.join(tmp, 'plugin.json'),
      marketplaceJsonPath: path.join(tmp, 'marketplace.json'),
      initTsPath: path.join(tmp, 'init.ts'),
    });

    expect(JSON.parse(readFileSync(path.join(tmp, 'package.json'), 'utf8')).version).toBe('1.1.0');
    expect(JSON.parse(readFileSync(path.join(tmp, 'package-lock.json'), 'utf8')).version).toBe('1.1.0');
    expect(JSON.parse(readFileSync(path.join(tmp, 'plugin.json'), 'utf8')).version).toBe('1.1.0');
    const mk = JSON.parse(readFileSync(path.join(tmp, 'marketplace.json'), 'utf8'));
    expect(mk.plugins[0].version).toBe('1.1.0');
    expect(mk.plugins[0].source.ref).toBe('v1.1.0');
    expect(readFileSync(path.join(tmp, 'init.ts'), 'utf8')).toContain("PLUGIN_VERSION = '1.1.0'");
  });

  it('rejects malformed version strings', () => {
    expect(() => bumpAllSources('not-a-version', {
      packageJsonPath: path.join(tmp, 'package.json'),
      packageLockPath: path.join(tmp, 'package-lock.json'),
      pluginJsonPath: path.join(tmp, 'plugin.json'),
      marketplaceJsonPath: path.join(tmp, 'marketplace.json'),
      initTsPath: path.join(tmp, 'init.ts'),
    })).toThrow(/semver/i);
  });
});
