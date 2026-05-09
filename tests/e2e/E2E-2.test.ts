/**
 * E2E-2: Monorepo cross-package coherence.
 * 3 packages, buffer fills from multiple packages, groups by file overlap.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeStub } from './harness/claudeCodeStub.js';

let stub: ClaudeCodeStub;

beforeEach(() => {
  stub = new ClaudeCodeStub();
});

afterEach(() => {
  stub.destroy();
});

function makePackageDoc(pkg: string, id: string): string {
  return [
    `<!-- coherence:section id="${id}" -->`,
    `# ${pkg} API`,
    '',
    `Content for ${pkg}.`,
  ].join('\n');
}

describe('E2E-2: monorepo cross-package', () => {
  it('PostToolUse on 3 package docs creates 3 buffer entries', async () => {
    await stub.sessionStart();

    const pkgs = ['pkgA', 'pkgB', 'pkgC'];
    for (const pkg of pkgs) {
      const filePath = stub.createDocFile(`packages/${pkg}/docs/api.md`, makePackageDoc(pkg, 'intro'));
      await stub.postToolUse(filePath);
    }

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: Array<{ path: string }> }>('drift-buffer.json');
    expect(buf?.entries.length).toBe(3);

    // Each entry from a different package
    const paths = buf!.entries.map((e) => e.path);
    expect(paths.some((p) => p.includes('pkgA'))).toBe(true);
    expect(paths.some((p) => p.includes('pkgB'))).toBe(true);
    expect(paths.some((p) => p.includes('pkgC'))).toBe(true);
  });

  it('grouping separates cross-package entries into different groups', async () => {
    await stub.sessionStart();

    const pkgs = ['pkgA', 'pkgB', 'pkgC'];
    for (const pkg of pkgs) {
      const filePath = stub.createDocFile(`packages/${pkg}/docs/api.md`, makePackageDoc(pkg, 'intro'));
      await stub.postToolUse(filePath);
    }

    const store = await stub.makeStore();
    const buf = await store.read<{ entries: unknown[] }>('drift-buffer.json');

    // Import grouping logic and verify
    const { groupEntries } = await import('../../src/pipeline/grouping.js');
    const entries = buf!.entries as Parameters<typeof groupEntries>[0];
    const groups = groupEntries(entries);

    // Each package file is independent → 3 groups
    expect(groups.length).toBe(3);
  });

  it('Stop with multi-package buffer succeeds', async () => {
    await stub.sessionStart();

    for (const pkg of ['pkgA', 'pkgB']) {
      const filePath = stub.createDocFile(`packages/${pkg}/docs/api.md`, makePackageDoc(pkg, 'intro'));
      await stub.postToolUse(filePath);
    }

    const result = await stub.stop();
    expect(result.success).toBe(true);
  });
});
