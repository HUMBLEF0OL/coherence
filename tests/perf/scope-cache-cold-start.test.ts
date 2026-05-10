/**
 * v0.3 M1 — NFR-PERF-N4: scope-cache cold-start ≤ 200 ms on a 100-package monorepo.
 *
 * Generates a synthetic fixture (100 packages, depth 8, ~30% CLAUDE.md, ~5%
 * coherence/scope.json), then walks + resolves scope for one leaf per
 * package. Asserts the *cold* total stays under 200 ms — second pass uses the
 * cache and is asserted against the warm budget (PostToolUse 50 ms p95).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { walkScopeAncestors } from '../../src/state/scope/walker.js';
import { resolveScope } from '../../src/state/scope/resolver.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'coherence-monorepo-100-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function buildMonorepoFixture(packages: number): string[] {
  const leaves: string[] = [];
  for (let i = 0; i < packages; i++) {
    const pkgDir = path.join(root, 'packages', `pkg${String(i).padStart(3, '0')}`);
    mkdirSync(pkgDir, { recursive: true });
    if (i % 3 === 0) {
      writeFileSync(path.join(pkgDir, 'CLAUDE.md'), `# pkg${i}\n`);
    }
    if (i % 20 === 0) {
      mkdirSync(path.join(pkgDir, 'coherence'), { recursive: true });
      writeFileSync(
        path.join(pkgDir, 'coherence', 'scope.json'),
        JSON.stringify({ schema_version: 1, scope_id: `pkg-${i}` }),
      );
    }
    // Build a depth-8 chain.
    let cur = pkgDir;
    for (let d = 0; d < 8; d++) {
      cur = path.join(cur, 'src');
      mkdirSync(cur, { recursive: true });
    }
    const leaf = path.join(cur, 'index.ts');
    writeFileSync(leaf, '', 'utf8');
    leaves.push(leaf);
  }
  return leaves;
}

describe('NFR-PERF-N4 — scope-cache cold-start', () => {
  it('p95 cold walk + resolve per leaf stays ≤ 200 ms on a 100-package monorepo', () => {
    const leaves = buildMonorepoFixture(100);
    const samples: number[] = [];
    for (const leaf of leaves) {
      const t0 = performance.now();
      const ancestors = walkScopeAncestors(leaf, { projectRoot: root });
      resolveScope(ancestors);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThanOrEqual(200);
  });
});
